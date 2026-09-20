import json
import sys
import time
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(CURRENT_DIR))

from dotenv import load_dotenv
load_dotenv(CURRENT_DIR.parent.parent / ".env")

from app.config.settings import get_settings
from app.services.embedding_service import embed_query
from app.services.bm25_service import embed_query_sparse
from app.services.vectorstore_service import get_vectorstore, get_collection_name
from app.services.retriever_service import hybrid_search
from langchain_mistralai import ChatMistralAI
from langchain_core.messages import SystemMessage, HumanMessage
from app.agent.regulation_agent import SYSTEM_PROMPT

settings = get_settings()
client = get_vectorstore()
coll = get_collection_name()

dataset_path = CURRENT_DIR / "data" / "ragas_gold_dataset.json"
with open(dataset_path, "r", encoding="utf-8") as f:
    questions = json.load(f)

llm = ChatMistralAI(
    model=settings.mistral_model,
    api_key=settings.mistral_api_key,
    temperature=0.0
)

modes = ["no_rag", "dense", "bm25", "hybrid"]
results = {}

for mode in modes:
    print(f"\n==================== MODE: {mode} ====================")
    hits = {1: [], 3: [], 5: [], 10: []}
    latencies_retrieval = []
    latencies_gen = []
    latencies_e2e = []
    runs_data = []

    for i, item in enumerate(questions, 1):
        q = item["question"]
        gt = item["ground_truth"]
        expected_doc_id = item.get("document_id")
        
        t0 = time.perf_counter()
        doc_ids = []
        texts = []

        if mode == "dense":
            vec = embed_query(q)
            pts = client.query_points(collection_name=coll, query=vec, using="text-dense", limit=10, with_payload=True).points
            texts = [p.payload.get("text", "") for p in pts if p.payload]
            doc_ids = [p.payload.get("metadata", {}).get("document_id", "") for p in pts if p.payload]
        elif mode == "bm25":
            s_vec = embed_query_sparse(q)
            if s_vec is not None:
                pts = client.query_points(collection_name=coll, query=s_vec, using="text-sparse", limit=10, with_payload=True).points
                texts = [p.payload.get("text", "") for p in pts if p.payload]
                doc_ids = [p.payload.get("metadata", {}).get("document_id", "") for p in pts if p.payload]
        elif mode == "hybrid":
            chunks = hybrid_search(q, top_k=10)
            texts = [c.text for c in chunks]
            doc_ids = [c.metadata.get("document_id", "") for c in chunks]
        else:
            texts = ["Aucun contexte documentaire (modele pur)."]
            doc_ids = []

        t_ret = time.perf_counter() - t0

        t1 = time.perf_counter()
        if mode == "no_rag":
            msgs = [SystemMessage(content=SYSTEM_PROMPT), HumanMessage(content=q)]
        else:
            ctx_text = "\n\n".join(f"[Extrait {idx+1}]: {t}" for idx, t in enumerate(texts[:5]))
            msgs = [
                SystemMessage(content=f"{SYSTEM_PROMPT}\n\nContexte réglementaire certifié :\n{ctx_text}"),
                HumanMessage(content=q),
            ]
        resp = llm.invoke(msgs)
        ans = resp.content
        t_gen = time.perf_counter() - t1
        t_e2e = t_ret + t_gen

        latencies_retrieval.append(t_ret)
        latencies_gen.append(t_gen)
        latencies_e2e.append(t_e2e)

        for k in [1, 3, 5, 10]:
            is_hit = (expected_doc_id in doc_ids[:k]) if (expected_doc_id and mode != "no_rag") else False
            hits[k].append(1 if is_hit else 0)

        runs_data.append({
            "id": item["id"],
            "question": q,
            "ground_truth": gt,
            "expected_doc_id": expected_doc_id,
            "retrieved_doc_ids": doc_ids,
            "contexts": texts[:5],
            "answer": ans,
            "latencies": {"retrieval_s": round(t_ret, 3), "gen_s": round(t_gen, 3), "e2e_s": round(t_e2e, 3)}
        })
        print(f"[{i}/15] {mode} - E2E: {t_e2e:.2f}s (Ret: {t_ret:.2f}s, Gen: {t_gen:.2f}s)")
        time.sleep(0.5)

    hit_rates = {f"Hit@{k}": round(sum(hits[k]) / len(hits[k]), 4) for k in [1, 3, 5, 10]}
    avg_ret = round(sum(latencies_retrieval) / len(latencies_retrieval), 3)
    avg_gen = round(sum(latencies_gen) / len(latencies_gen), 3)
    avg_e2e = round(sum(latencies_e2e) / len(latencies_e2e), 3)

    results[mode] = {
        "hit_rates": hit_rates,
        "latencies": {"avg_retrieval_s": avg_ret, "avg_gen_s": avg_gen, "avg_e2e_s": avg_e2e},
        "runs": runs_data
    }

output_file = CURRENT_DIR / "data" / "rigorous_benchmark_data.json"
with open(output_file, "w", encoding="utf-8") as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print("\n[OK] Benchmark d'extration et latence terminé ! Fichier généré :", output_file)
