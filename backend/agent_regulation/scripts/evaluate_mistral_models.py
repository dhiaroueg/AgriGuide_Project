"""Auditable Mistral generation-model comparison with fixed hybrid retrieval.

Every completed answer, measured latency, reported token count, context and
RAGAS score is saved by question.  No default score, token count, cost, or
synthetic error result is ever substituted.
"""
from __future__ import annotations

import hashlib
import json
import math
import argparse
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(CURRENT_DIR))

from dotenv import load_dotenv
load_dotenv(CURRENT_DIR.parent.parent / ".env")

from datasets import Dataset
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_mistralai import ChatMistralAI, MistralAIEmbeddings
from ragas import evaluate
from ragas.embeddings import LangchainEmbeddingsWrapper
from ragas.llms import LangchainLLMWrapper
from ragas.metrics import answer_relevancy, faithfulness
from ragas.run_config import RunConfig

from app.agent.regulation_agent import SYSTEM_PROMPT
from app.config.settings import get_settings
from app.services.retriever_service import hybrid_search

DATASET_PATH = CURRENT_DIR / "data" / "ragas_gold_dataset.json"
RAW_ROOT = CURRENT_DIR / "data" / "raw_results" / "model_comparison"
LATEST_MANIFEST_PATH = CURRENT_DIR / "data" / "mistral_eval_partial.json"
LATEST_REPORT_PATH = CURRENT_DIR / "data" / "mistral_model_evaluation.md"
MODELS = ("open-mistral-7b", "mistral-small-latest", "mistral-medium-latest", "mistral-large-latest")


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def classify_error(exc: Exception) -> str:
    message = str(exc).lower()
    status = getattr(exc, "status_code", None)
    if status == 429 or "429" in message or "rate_limit" in message or "rate limit" in message:
        return "rate_limited"
    if status in (401, 403) or "401" in message or "403" in message or "tier" in message:
        return "tier_restricted"
    return "failed"


def token_usage(response) -> tuple[int | None, int | None]:
    metadata = getattr(response, "response_metadata", {}) or {}
    usage = metadata.get("token_usage") or metadata.get("usage") or {}
    prompt = usage.get("prompt_tokens", usage.get("input_tokens"))
    completion = usage.get("completion_tokens", usage.get("output_tokens"))
    return (int(prompt) if isinstance(prompt, (int, float)) else None,
            int(completion) if isinstance(completion, (int, float)) else None)


def as_number(value) -> float | None:
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None


def write_json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def build_messages(question: str, contexts: list[str]):
    context_block = "\n\n".join(f"[Extrait {i + 1}]: {text}" for i, text in enumerate(contexts))
    return [
        SystemMessage(content=f"{SYSTEM_PROMPT}\n\nContexte réglementaire certifié :\n{context_block}"),
        HumanMessage(content=question),
    ]


def retrieve_once(gold: list[dict]) -> dict[str, list[str]]:
    contexts: dict[str, list[str]] = {}
    for item in gold:
        chunks = hybrid_search(item["question"], top_k=5)
        if not chunks:
            raise RuntimeError(f"No hybrid context returned for {item['id']}; benchmark aborted.")
        contexts[item["id"]] = [chunk.text for chunk in chunks]
    return contexts


def score_rows(rows: list[dict], judge, embeddings, persist, batch_size: int) -> str | None:
    if len(rows) == 0:
        return "No generated answers to score."
    pending = [row for row in rows if row.get("ragas_status") not in ("completed", "failed")]
    for row in pending[:batch_size]:
        dataset = Dataset.from_dict({key: [row[key]] for key in ("question", "answer", "contexts", "ground_truth")})
        try:
            faithfulness.llm = judge
            answer_relevancy.llm = judge
            answer_relevancy.embeddings = embeddings
            frame = evaluate(
                dataset, metrics=[faithfulness, answer_relevancy], llm=judge, embeddings=embeddings,
                run_config=RunConfig(timeout=15, max_retries=0, max_wait=0, max_workers=1),
                raise_exceptions=False, show_progress=False,
            ).to_pandas()
            row["faithfulness_score"] = as_number(frame.iloc[0].get("faithfulness"))
            row["answer_relevancy_score"] = as_number(frame.iloc[0].get("answer_relevancy"))
            if row["faithfulness_score"] is None and row["answer_relevancy_score"] is None:
                row["ragas_status"] = "failed"
                row["ragas_error"] = "RAGAS returned no usable score; see run output for judge errors."
            else:
                row["ragas_status"] = "completed"
                row["ragas_error"] = None
        except Exception as exc:
            row["faithfulness_score"] = None
            row["answer_relevancy_score"] = None
            row["ragas_status"] = "failed"
            row["ragas_error"] = str(exc)
        persist()
    remaining = sum(row.get("ragas_status") not in ("completed", "failed") for row in rows)
    return None if remaining == 0 else f"RAGAS incomplete: {remaining} question(s) remain; resume this run."


def mean(rows: list[dict], field: str) -> float | None:
    values = [as_number(row.get(field)) for row in rows]
    values = [value for value in values if value is not None]
    return sum(values) / len(values) if values else None


def complete_ragas_mean(rows: list[dict], field: str) -> float | None:
    """Return a benchmark metric only when every gold question was scored."""
    if not rows or any(row.get("ragas_status") != "completed" for row in rows):
        return None
    return mean(rows, field)


def run_model(model: str, gold: list[dict], contexts: dict[str, list[str]], settings, run_dir: Path, judge, embeddings, ragas_batch_size: int, skip_ragas: bool) -> dict:
    result_path = run_dir / f"{model}.json"
    if result_path.exists():
        result = json.loads(result_path.read_text(encoding="utf-8"))
        if result["status"] != "operational":
            return result
    else:
        result = {"model": model, "status": "operational", "n_questions_expected": len(gold), "rows": [], "generation_error": None, "ragas_error": None}
    completed_ids = {row["question_id"] for row in result["rows"]}
    llm = ChatMistralAI(model=model, api_key=settings.mistral_api_key, temperature=0.0)
    for position, item in enumerate(gold, 1):
        if item["id"] in completed_ids:
            continue
        print(f"[{model}] {position}/{len(gold)} {item['id']}")
        started = time.perf_counter()
        try:
            response = llm.invoke(build_messages(item["question"], contexts[item["id"]]))
        except Exception as exc:
            result["status"] = classify_error(exc)
            result["generation_error"] = str(exc)
            break
        input_tokens, output_tokens = token_usage(response)
        result["rows"].append({
            "question_id": item["id"], "question": item["question"], "ground_truth": item["ground_truth"],
            "contexts": contexts[item["id"]], "answer": response.content,
            "latency_s": time.perf_counter() - started, "input_tokens": input_tokens, "output_tokens": output_tokens,
            "faithfulness_score": None, "answer_relevancy_score": None,
        })
        # Persist immediately; interruption never discards a completed answer.
        write_json(result_path, result)
        time.sleep(1.0)
    if result["status"] == "operational" and len(result["rows"]) != len(gold):
        raise RuntimeError(f"Unexpected incomplete operational run for {model}.")
    if result["status"] == "operational" and not skip_ragas:
        result["ragas_error"] = score_rows(result["rows"], judge, embeddings, lambda: write_json(result_path, result), ragas_batch_size)
    result["summary"] = {
        "n_questions_completed": len(result["rows"]), "faithfulness": complete_ragas_mean(result["rows"], "faithfulness_score"),
        "answer_relevancy": complete_ragas_mean(result["rows"], "answer_relevancy_score"), "avg_latency_s": mean(result["rows"], "latency_s"),
        "avg_input_tokens": mean(result["rows"], "input_tokens"), "avg_output_tokens": mean(result["rows"], "output_tokens"),
    }
    write_json(result_path, result)
    return result


def write_report(manifest: dict) -> None:
    lines = ["# Regulation Agent — Answer-Generation Model Comparison", "", "Hybrid retrieval fixed. Values are `N/A` unless measured in the raw run files.", "", "| Model | Faithfulness | Answer Relevancy | Avg. Latency (s) | Status |", "| --- | ---: | ---: | ---: | --- |"]
    for result in manifest["models"]:
        summary = result["summary"]
        fmt = lambda value: f"{value:.3f}" if value is not None else "N/A"
        lines.append(f"| `{result['model']}` | {fmt(summary['faithfulness'])} | {fmt(summary['answer_relevancy'])} | {fmt(summary['avg_latency_s'])} | {result['status']} |")
    lines += ["", f"Raw run directory: `{manifest['run_directory']}`"]
    LATEST_REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--resume", type=Path, help="Existing raw run directory to resume.")
    parser.add_argument("--only-model", choices=MODELS, help="Run or resume one model only.")
    parser.add_argument("--ragas-batch-size", type=int, default=15, help="Questions to score per invocation.")
    parser.add_argument("--skip-ragas", action="store_true", help="Generate only; do not invoke the RAGAS judge.")
    args = parser.parse_args()
    gold = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    if len(gold) != 15:
        raise ValueError(f"Expected 15 gold questions; got {len(gold)}.")
    started = datetime.now(timezone.utc)
    run_dir = args.resume if args.resume else RAW_ROOT / started.strftime("run_%Y%m%dT%H%M%SZ")
    if args.resume:
        if not run_dir.is_dir():
            raise FileNotFoundError(run_dir)
    else:
        run_dir.mkdir(parents=True, exist_ok=False)
    settings = get_settings()
    contexts_path = run_dir / "retrieval_contexts.json"
    contexts = json.loads(contexts_path.read_text(encoding="utf-8")) if contexts_path.exists() else retrieve_once(gold)
    if not contexts_path.exists():
        write_json(contexts_path, contexts)
    judge_llm = LangchainLLMWrapper(ChatMistralAI(model="open-mistral-7b", api_key=settings.mistral_api_key, temperature=0.0))
    embeddings = LangchainEmbeddingsWrapper(MistralAIEmbeddings(api_key=settings.mistral_api_key, model="mistral-embed"))
    selected_models = (args.only_model,) if args.only_model else MODELS
    results = [run_model(model, gold, contexts, settings, run_dir, judge_llm, embeddings, args.ragas_batch_size, args.skip_ragas) for model in selected_models]
    manifest = {"schema_version": 2, "run_id": run_dir.name, "started_at_utc": started.isoformat(), "completed_at_utc": datetime.now(timezone.utc).isoformat(), "dataset_sha256": sha256(DATASET_PATH), "n_questions": len(gold), "run_directory": str(run_dir.resolve().relative_to(CURRENT_DIR.parent.parent.resolve())), "models": results}
    write_json(run_dir / "manifest.json", manifest)
    write_json(LATEST_MANIFEST_PATH, manifest)
    write_report(manifest)
    print(json.dumps({r["model"]: r["summary"] | {"status": r["status"]} for r in results}, indent=2))


if __name__ == "__main__":
    main()
