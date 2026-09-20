import json
import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(CURRENT_DIR))

from dotenv import load_dotenv
load_dotenv(CURRENT_DIR.parent.parent / ".env")

from app.services.retriever_service import hybrid_search

dataset_path = CURRENT_DIR / "data" / "ragas_gold_dataset.json"
with open(dataset_path, "r", encoding="utf-8") as f:
    items = json.load(f)

for item in items:
    print(f"\n=======================================================")
    print(f"[{item['id']}] {item['question']}")
    chunks = hybrid_search(item['question'], top_k=3)
    for i, c in enumerate(chunks, start=1):
        meta = c.metadata
        chunk_id = meta.get("chunk_id", meta.get("source_id", "N/A"))
        title = meta.get("title", "N/A")
        src = meta.get("source", "N/A")
        print(f"--- Top {i} [Score: {c.score:.3f}] ---")
        print(f"ChunkID: {chunk_id} | Src: {src} | Title: {title}")
        print(f"Extrait: {c.text[:300]}...\n")
