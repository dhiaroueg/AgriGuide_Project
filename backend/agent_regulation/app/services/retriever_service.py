"""Retriever d'ensemble combinant recherche sémantique (dense) et BM25 (épars).

Interroge la collection Qdrant avec les deux vecteurs nommés de chaque point
("text-dense" pour le sens, "text-sparse" pour les mots-clés) et fusionne les
deux classements côté serveur via Reciprocal Rank Fusion (RRF).
"""

from dataclasses import dataclass

from qdrant_client import models

from app.services.bm25_service import embed_query_sparse
from app.services.embedding_service import embed_query
from app.services.vectorstore_service import get_collection_name, get_vectorstore

DENSE_VECTOR_NAME = "text-dense"
SPARSE_VECTOR_NAME = "text-sparse"
DEFAULT_PREFETCH_LIMIT = 20


@dataclass
class RetrievedChunk:
    """Un passage réglementaire retrouvé, avec son score et ses métadonnées."""

    text: str
    score: float
    metadata: dict


def hybrid_search(query: str, top_k: int = 5) -> list[RetrievedChunk]:
    """Recherche hybride (dense + BM25) sur la base réglementaire Qdrant.

    Récupère `DEFAULT_PREFETCH_LIMIT` candidats sur chaque canal (sémantique et
    lexical), puis fusionne les deux classements avec RRF pour ne garder que
    les `top_k` passages les plus pertinents.
    """
    client = get_vectorstore()
    dense_vector = embed_query(query)
    sparse_vector = embed_query_sparse(query)

    if sparse_vector is not None:
        results = client.query_points(
            collection_name=get_collection_name(),
            prefetch=[
                models.Prefetch(query=dense_vector, using=DENSE_VECTOR_NAME, limit=DEFAULT_PREFETCH_LIMIT),
                models.Prefetch(query=sparse_vector, using=SPARSE_VECTOR_NAME, limit=DEFAULT_PREFETCH_LIMIT),
            ],
            query=models.FusionQuery(fusion=models.Fusion.RRF),
            limit=top_k,
            with_payload=True,
        ).points
    else:
        results = client.query_points(
            collection_name=get_collection_name(),
            query=dense_vector,
            using=DENSE_VECTOR_NAME,
            limit=top_k,
            with_payload=True,
        ).points

    chunks = [
        RetrievedChunk(
            text=point.payload.get("text", ""),
            score=point.score,
            metadata=point.payload.get("metadata", {}),
        )
        for point in results
    ]
    return _deduplicate(chunks)


def _deduplicate(chunks: list[RetrievedChunk]) -> list[RetrievedChunk]:
    """Retire les chunks quasi identiques (même texte, aux espaces près), en
    conservant l'ordre de pertinence (RRF) et le premier (donc le mieux classé)
    de chaque groupe de doublons.
    """
    seen_texts: set[str] = set()
    deduplicated: list[RetrievedChunk] = []
    for chunk in chunks:
        normalized = " ".join(chunk.text.split())
        if normalized in seen_texts:
            continue
        seen_texts.add(normalized)
        deduplicated.append(chunk)
    return deduplicated
