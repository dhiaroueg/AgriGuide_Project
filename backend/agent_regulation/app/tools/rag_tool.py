"""Outil de RAG hybride pour répondre aux questions de réglementation agricole.

Combine une recherche sémantique par embeddings (Mistral + Qdrant) et une
recherche par mots-clés (BM25) via le retriever hybride, et retourne les
passages réglementaires pertinents formatés pour l'agent.
"""

import time

from langchain_core.tools import tool

from app.services.retriever_service import hybrid_search


def _format_chunks(chunks) -> str:
    if not chunks:
        return "Aucun passage réglementaire pertinent n'a été trouvé."

    blocks = []
    for i, chunk in enumerate(chunks, start=1):
        meta = chunk.metadata
        reference = f"{meta.get('title', 'Source inconnue')} (art. {meta.get('article_number', '?')})"
        certifying_body = meta.get("source") or "source officielle"
        source_url = meta.get("source_url")
        url_line = f"\nURL : {source_url}" if source_url else ""
        blocks.append(f"[R{i}] Certifié par : {certifying_body} — {reference}{url_line}\n{chunk.text}")
    return "\n\n".join(blocks)


@tool
def recherche_reglementation_agricole(question: str) -> str:
    """Recherche des passages de réglementation agricole (PAC, aides, procédures)
    pertinents pour répondre à la question posée, en combinant recherche
    sémantique et recherche par mots-clés sur la base réglementaire.
    """
    start = time.perf_counter()
    try:
        chunks = hybrid_search(question, top_k=5)
        result = _format_chunks(chunks)
    except Exception as exc:
        result = f"Base réglementaire temporairement indisponible ({exc}). Réponds à partir de tes connaissances générales en droit agricole français, en signalant clairement que tu n'as pas pu consulter la base réglementaire locale."
    print(f"[PERF] RAG: {time.perf_counter() - start:.2f}s")
    return result
