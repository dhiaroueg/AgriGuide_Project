"""Run the production retrieval variants and persist an auditable result.

This benchmark deliberately measures retrieval only.  It does not generate
answers or fabricate RAGAS/human-judge scores: those require separately
captured, per-question inputs and outputs.
"""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(CURRENT_DIR))

from dotenv import load_dotenv

load_dotenv(CURRENT_DIR.parent.parent / ".env")

from app.services.bm25_service import embed_query_sparse
from app.services.embedding_service import embed_query
from app.services.retriever_service import hybrid_search
from app.services.vectorstore_service import get_collection_name, get_vectorstore

DATASET_PATH = CURRENT_DIR / "data" / "ragas_gold_dataset.json"
OUTPUT_DIR = CURRENT_DIR / "data" / "raw_results"
TOP_K = 10
MODES = ("dense", "bm25", "hybrid")


def sha256_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git_revision() -> str | None:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=CURRENT_DIR.parent.parent, text=True
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def require_sparse_vector(question: str):
    vector = embed_query_sparse(question)
    if vector is None:
        raise RuntimeError(
            "Sparse BM25 embedding unavailable; refusing to substitute dense retrieval."
        )
    return vector


def retrieve(mode: str, question: str) -> list[dict]:
    client = get_vectorstore()
    collection = get_collection_name()
    if mode == "dense":
        points = client.query_points(
            collection_name=collection,
            query=embed_query(question),
            using="text-dense",
            limit=TOP_K,
            with_payload=True,
        ).points
        return [
            {
                "point_id": str(point.id),
                "document_id": point.payload.get("metadata", {}).get("document_id", ""),
                "chunk_text": point.payload.get("text", ""),
                "score": point.score,
            }
            for point in points
            if point.payload is not None
        ]
    if mode == "bm25":
        points = client.query_points(
            collection_name=collection,
            query=require_sparse_vector(question),
            using="text-sparse",
            limit=TOP_K,
            with_payload=True,
        ).points
        return [
            {
                "point_id": str(point.id),
                "document_id": point.payload.get("metadata", {}).get("document_id", ""),
                "chunk_text": point.payload.get("text", ""),
                "score": point.score,
            }
            for point in points
            if point.payload is not None
        ]
    if mode == "hybrid":
        return [
            {
                "point_id": None,
                "document_id": chunk.metadata.get("document_id", ""),
                "chunk_text": chunk.text,
                "score": chunk.score,
            }
            for chunk in hybrid_search(question, top_k=TOP_K)
        ]
    raise ValueError(f"Unknown mode: {mode}")


def main() -> None:
    if not DATASET_PATH.exists():
        raise FileNotFoundError(DATASET_PATH)
    questions = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    if len(questions) != 15:
        raise ValueError(f"Expected exactly 15 gold questions, got {len(questions)}")

    client = get_vectorstore()
    collection = get_collection_name()
    collection_info = client.get_collection(collection)
    started_at = datetime.now(timezone.utc)
    run_id = started_at.strftime("retrieval_%Y%m%dT%H%M%SZ")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    all_outputs: list[Path] = []
    for mode in MODES:
        rows = []
        for item in questions:
            started = time.perf_counter()
            retrieved = retrieve(mode, item["question"])
            latency = time.perf_counter() - started
            doc_ids = [row["document_id"] for row in retrieved]
            hit_at_k = {
                str(k): item["document_id"] in doc_ids[:k] for k in (1, 3, 5, 10)
            }
            rows.append(
                {
                    "question_id": item["id"],
                    "question": item["question"],
                    "expected_document_id": item["document_id"],
                    "retrieval_latency_s": latency,
                    "retrieved": retrieved,
                    "hit_at_k": hit_at_k,
                }
            )
            print(f"{mode} {item['id']}: Hit@5={hit_at_k['5']} ({latency:.3f}s)")

        payload = {
            "schema_version": 1,
            "run_id": run_id,
            "started_at_utc": started_at.isoformat(),
            "completed_at_utc": datetime.now(timezone.utc).isoformat(),
            "mode": mode,
            "top_k": TOP_K,
            "n_questions": len(rows),
            "dataset_path": str(DATASET_PATH.relative_to(CURRENT_DIR.parent.parent)),
            "dataset_sha256": sha256_file(DATASET_PATH),
            "git_revision": git_revision(),
            "collection": collection,
            "collection_config": collection_info.model_dump(mode="json"),
            "rows": rows,
        }
        output = OUTPUT_DIR / f"{run_id}_{mode}.json"
        output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        all_outputs.append(output)

    summary = {
        path.stem.rsplit("_", 1)[-1]: {
            f"Hit@{k}": sum(row["hit_at_k"][str(k)] for row in json.loads(path.read_text(encoding="utf-8"))["rows"]) / len(questions)
            for k in (1, 3, 5, 10)
        }
        for path in all_outputs
    }
    summary_path = OUTPUT_DIR / f"{run_id}_summary.json"
    summary_path.write_text(
        json.dumps({"run_id": run_id, "source_files": [p.name for p in all_outputs], "metrics": summary}, indent=2),
        encoding="utf-8",
    )
    print(f"Raw results: {OUTPUT_DIR}")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
