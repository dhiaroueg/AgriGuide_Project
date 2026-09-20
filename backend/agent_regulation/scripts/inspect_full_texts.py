import json
import sys
from pathlib import Path

CURRENT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(CURRENT_DIR))

from dotenv import load_dotenv
load_dotenv(CURRENT_DIR.parent.parent / ".env")

from app.services.retriever_service import hybrid_search

questions = [
    ("Q02", "taille des haies BCAE 8 période interdiction"),
    ("Q04", "diversification non-labour éco-régime pratiques gestion agro-écologique D614-111"),
    ("Q05", "montant forfaitaire aide complémentaire revenu jeunes agriculteurs 2024 D614-105"),
    ("Q06", "BCAE 6 couverture des sols nitrates D614-50"),
    ("Q07", "taillis courte rotation TCR D615-12-2 essences"),
    ("Q08", "campagne PAC telepac date limite 15 mai"),
    ("Q10", "largeur bandes tampons BCAE 4 D614-48"),
    ("Q11", "aide conversion maintien agriculture biologique CAB MAB duree"),
    ("Q12", "conditionnalite aides sanctions non-respect reduction financiere D341-6-7 D614-61"),
    ("Q13", "jachères valorisation cultures autorisées D614-6"),
    ("Q14", "zones vulnérables nitrates stockage effluents élevage 1er septembre 2023"),
    ("Q15", "Télépac RPG Registre Parcellaire Graphique points de contrôle")
]

for q_id, q_text in questions:
    print(f"\n==================== {q_id} ====================")
    chunks = hybrid_search(q_text, top_k=1)
    if chunks:
        c = chunks[0]
        meta = c.metadata
        print(f"Title: {meta.get('title')}")
        print(f"Source: {meta.get('source')}")
        print(f"Full text:\n{c.text}\n")
