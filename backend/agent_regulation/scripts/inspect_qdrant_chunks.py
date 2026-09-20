import json
import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(CURRENT_DIR))

from dotenv import load_dotenv
load_dotenv(CURRENT_DIR.parent.parent / ".env")

from app.services.retriever_service import hybrid_search, embed_query
from app.services.vectorstore_service import get_vectorstore, get_collection_name

client = get_vectorstore()
coll = get_collection_name()

queries = [
    ("Q02", "taille des haies BCAE 8 période interdiction"),
    ("Q04", "éco-régime pratiques diversification voie des pratiques"),
    ("Q05", "jeune agriculteur DJA montant aide complémentaire"),
    ("Q06", "couverture des sols BCAE 6 période sensible interculture"),
    ("Q07", "taillis courte rotation TCR justificatifs déclaration"),
    ("Q08", "Télépac date limite déclaration PAC"),
    ("Q10", "bandes tampons BCAE 4 cours d eau largeur minimale"),
    ("Q11", "agriculture biologique CAB MAB conversion maintien aide"),
    ("Q12", "sanctions conditionnalité non-respect réduction pénalité"),
    ("Q13", "jachère non productive cultures autorisées valorisation"),
    ("Q14", "zone vulnérable nitrates épandage effluents interdiction"),
    ("Q15", "Registre Parcellaire Graphique RPG contour parcelle Télépac")
]

for q_id, q_text in queries:
    print(f"\n==================== {q_id} : {q_text} ====================")
    try:
        chunks = hybrid_search(q_text, top_k=2)
        if not chunks:
            print("Aucun chunk trouvé.")
        for c in chunks:
            meta = c.metadata
            chunk_id = meta.get("chunk_id", meta.get("source_id", "N/A"))
            title = meta.get("title", "N/A")
            src = meta.get("source", "N/A")
            print(f"[Score: {c.score:.3f}] ChunkID: {chunk_id} | Src: {src} | Title: {title}")
            print(f"Content: {c.text[:250]}...\n")
    except Exception as e:
        print(f"Error: {e}")
