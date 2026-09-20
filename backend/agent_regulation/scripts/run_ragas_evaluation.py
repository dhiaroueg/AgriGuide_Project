"""
Evaluation Harness RAGAS pour l'Agent Régulation d'AgriGuide.
Exécute les 4 configurations :
1. Baseline (No RAG / Pure LLM)
2. Dense-Only Retrieval (Qdrant 'text-dense')
3. BM25-Only Retrieval (Qdrant 'text-sparse')
4. Hybrid RRF Retrieval (Production Setup)

Génère les métriques RAGAS : Faithfulness, Answer Relevancy, Context Precision.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

# Insert regulation agent path
CURRENT_DIR = Path(__file__).resolve().parent.parent  # backend/agent_regulation
sys.path.insert(0, str(CURRENT_DIR))

from dotenv import load_dotenv
load_dotenv(CURRENT_DIR.parent.parent / ".env")

from datasets import Dataset
from qdrant_client import models
from langchain_mistralai import ChatMistralAI, MistralAIEmbeddings
from langchain_core.messages import HumanMessage, SystemMessage

from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision
from ragas.llms import LangchainLLMWrapper
from ragas.embeddings import LangchainEmbeddingsWrapper

from app.config.settings import get_settings
from app.services.bm25_service import embed_query_sparse
from app.services.embedding_service import embed_query
from app.services.vectorstore_service import get_collection_name, get_vectorstore
from app.agent.regulation_agent import RegulationAgent, SYSTEM_PROMPT


def load_dataset() -> list[dict]:
    dataset_path = CURRENT_DIR / "data" / "ragas_gold_dataset.json"
    with open(dataset_path, "r", encoding="utf-8") as f:
        return json.load(f)


def retrieve_dense_only(query: str, top_k: int = 5) -> tuple[list[str], list[str]]:
    client = get_vectorstore()
    dense_vec = embed_query(query)
    points = client.query_points(
        collection_name=get_collection_name(),
        query=dense_vec,
        using="text-dense",
        limit=top_k,
        with_payload=True,
    ).points
    texts = [p.payload.get("text", "") for p in points if p.payload]
    doc_ids = [p.payload.get("metadata", {}).get("document_id", "") for p in points if p.payload]
    return texts, doc_ids


def retrieve_bm25_only(query: str, top_k: int = 5) -> tuple[list[str], list[str]]:
    client = get_vectorstore()
    sparse_vec = embed_query_sparse(query)
    if sparse_vec is None:
        return [], []
    points = client.query_points(
        collection_name=get_collection_name(),
        query=sparse_vec,
        using="text-sparse",
        limit=top_k,
        with_payload=True,
    ).points
    texts = [p.payload.get("text", "") for p in points if p.payload]
    doc_ids = [p.payload.get("metadata", {}).get("document_id", "") for p in points if p.payload]
    return texts, doc_ids


def retrieve_hybrid(query: str, top_k: int = 5) -> tuple[list[str], list[str]]:
    from app.services.retriever_service import hybrid_search
    chunks = hybrid_search(query, top_k=top_k)
    texts = [c.text for c in chunks]
    doc_ids = [c.metadata.get("document_id", "") for c in chunks]
    return texts, doc_ids


def generate_answer_with_context(llm: ChatMistralAI, question: str, contexts: list[str]) -> str:
    ctx_text = "\n\n".join(f"[Extrait {i+1}]: {c}" for i, c in enumerate(contexts))
    messages = [
        SystemMessage(content=f"{SYSTEM_PROMPT}\n\nContexte réglementaire certifié :\n{ctx_text}"),
        HumanMessage(content=question),
    ]
    resp = llm.invoke(messages)
    return resp.content


def generate_baseline_no_rag(llm: ChatMistralAI, question: str) -> str:
    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=question),
    ]
    resp = llm.invoke(messages)
    return resp.content


def run_experiment_config(
    name: str,
    questions: list[dict],
    mode: str,
    llm: ChatMistralAI,
) -> dict:
    print(f"\n=======================================================")
    print(f">> EXECUTION DU SCENARIO : {name} ({mode})")
    print(f"=======================================================")
    
    queries = []
    answers = []
    contexts_list = []
    ground_truths = []
    hits = []
    
    for i, item in enumerate(questions, 1):
        q = item["question"]
        gt = item["ground_truth"]
        expected_doc_id = item.get("document_id")
        print(f"[{i}/{len(questions)}] Traitement : {q[:60]}...")
        
        ctx: list[str] = []
        doc_ids: list[str] = []
        ans: str = ""
        
        # Retry with exponential backoff in case of transient DNS / network blip
        for attempt in range(4):
            try:
                if mode == "dense":
                    ctx, doc_ids = retrieve_dense_only(q, top_k=5)
                    ans = generate_answer_with_context(llm, q, ctx)
                elif mode == "bm25":
                    ctx, doc_ids = retrieve_bm25_only(q, top_k=5)
                    ans = generate_answer_with_context(llm, q, ctx)
                elif mode == "hybrid":
                    ctx, doc_ids = retrieve_hybrid(q, top_k=5)
                    ans = generate_answer_with_context(llm, q, ctx)
                else:  # no_rag
                    ctx = ["Aucun contexte documentaire (modele pur)."]
                    doc_ids = []
                    ans = generate_baseline_no_rag(llm, q)
                break
            except Exception as err:
                if attempt == 3:
                    print(f"   [ERR] Echec définitif pour {q[:30]}: {err}")
                    ctx = ctx or ["Contexte indisponible."]
                    ans = ans or "Information indisponible suite à une erreur réseau."
                else:
                    print(f"   [RETRY] Erreur réseau ({err}), nouvel essai dans {(attempt+1)*3}s...")
                    time.sleep((attempt + 1) * 3)
            
        is_hit = expected_doc_id in doc_ids[:5] if expected_doc_id and mode != "no_rag" else False
        hits.append(is_hit)
        
        queries.append(q)
        answers.append(ans)
        contexts_list.append(ctx)
        ground_truths.append(gt)
        time.sleep(1.0)  # Eviter rate limiting API Mistral

    doc_hit_rate = (sum(hits) / len(hits)) if hits else 0.0
    print(f"[{name}] Document Hit@5 Rate: {doc_hit_rate:.2%}")
        
    eval_dataset = Dataset.from_dict({
        "question": queries,
        "answer": answers,
        "contexts": contexts_list,
        "ground_truth": ground_truths,
    })
    
    print(f"\n--- Evaluation des metriques RAGAS pour {name} ---")
    settings = get_settings()
    judge_llm = LangchainLLMWrapper(llm)
    embeddings = LangchainEmbeddingsWrapper(
        MistralAIEmbeddings(api_key=settings.mistral_api_key, model="mistral-embed")
    )
    
    # Configure each metric with Mistral LLM and Embeddings wrapper
    faithfulness_metric = faithfulness
    faithfulness_metric.llm = judge_llm
    
    answer_relevancy_metric = answer_relevancy
    answer_relevancy_metric.llm = judge_llm
    answer_relevancy_metric.embeddings = embeddings
    
    context_precision_metric = context_precision
    context_precision_metric.llm = judge_llm
    
    try:
        metrics = [faithfulness_metric, answer_relevancy_metric]
        if mode != "no_rag":
            metrics.append(context_precision_metric)
            
        scores = evaluate(
            eval_dataset,
            metrics=metrics,
            llm=judge_llm,
            embeddings=embeddings,
        )
        print(f"[OK] RESULTATS {name} :", scores)
        return {"name": name, "mode": mode, "scores": scores, "hit_rate": doc_hit_rate, "dataset": eval_dataset}
    except Exception as e:
        print(f"[WARN] Erreur evaluation RAGAS sur {name} : {e}")
        return {"name": name, "mode": mode, "hit_rate": doc_hit_rate, "error": str(e)}


def main():
    settings = get_settings()
    llm = ChatMistralAI(
        model=settings.mistral_model,
        api_key=settings.mistral_api_key,
        temperature=0.0,
    )
    
    questions = load_dataset()
    print(f"Dataset de test charge : {len(questions)} questions de reference.")
    
    # Run all 4 configurations
    configs = [
        ("1. Baseline Pure LLM", "no_rag"),
        ("2. Dense-Only Retrieval", "dense"),
        ("3. BM25-Only Retrieval", "bm25"),
        ("4. Hybrid RRF (Production)", "hybrid"),
    ]
    
    summary_results = []
    for label, mode in configs:
        res = run_experiment_config(label, questions, mode, llm)
        summary_results.append(res)
        
    # Output final comparison table
    report_file = CURRENT_DIR / "data" / "ragas_benchmark_report.md"
    with open(report_file, "w", encoding="utf-8") as f:
        f.write("# Rapport d'Evaluation RAGAS - Agent Regulation\n\n")
        f.write("| Configuration | Document Hit@5 Rate | Faithfulness (Fidelite) | Answer Relevancy | Context Precision |\n")
        f.write("| :--- | :---: | :---: | :---: | :---: |\n")
        for item in summary_results:
            scores_obj = item.get("scores")
            scores = {}
            if scores_obj is not None:
                if isinstance(scores_obj, dict):
                    scores = scores_obj
                else:
                    for k in ["faithfulness", "answer_relevancy", "context_precision"]:
                        try:
                            val = scores_obj[k]
                            if str(val) != 'nan':
                                scores[k] = val
                        except Exception:
                            pass

            hit_str = f"{float(item.get('hit_rate', 0)):.1%}" if item.get("mode") != "no_rag" else "N/A"
            f_val = scores.get('faithfulness')
            r_val = scores.get('answer_relevancy')
            p_val = scores.get('context_precision')
            
            f_score = f"{float(f_val):.3f}" if f_val is not None and str(f_val) != 'nan' else "N/A"
            r_score = f"{float(r_val):.3f}" if r_val is not None and str(r_val) != 'nan' else "N/A"
            p_score = f"{float(p_val):.3f}" if p_val is not None and str(p_val) != 'nan' else "N/A"
            f.write(f"| **{item['name']}** | **{hit_str}** | {f_score} | {r_score} | {p_score} |\n")
            
    print(f"\n[OK] Evaluation terminee ! Rapport genere dans : {report_file}")


if __name__ == "__main__":
    main()
