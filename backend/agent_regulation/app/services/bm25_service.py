"""Service de recherche par mots-clés (BM25).

Fournit la partie "recherche lexicale" du RAG hybride. La collection Qdrant
`agricultural_knowledge` stocke un vecteur épars natif ("text-sparse", modifier
IDF) généré avec le modèle BM25 de fastembed : on réutilise ce même modèle pour
vectoriser les requêtes, afin qu'elles soient comparables aux documents.
"""

from functools import lru_cache
import logging
from typing import Optional
from qdrant_client import models

logger = logging.getLogger(__name__)
BM25_SPARSE_MODEL = "Qdrant/bm25"

try:
    from fastembed import SparseTextEmbedding
    FASTEMBED_AVAILABLE = True
except Exception as e:
    logger.warning(f"fastembed / mmh3 indisponible ({e}). Bascule en recherche dense pure.")
    FASTEMBED_AVAILABLE = False
    SparseTextEmbedding = None


@lru_cache
def get_bm25_model():
    """Retourne le modèle d'embedding épars BM25 (mis en cache) ou None."""
    if not FASTEMBED_AVAILABLE or SparseTextEmbedding is None:
        return None
    try:
        return SparseTextEmbedding(model_name=BM25_SPARSE_MODEL)
    except Exception as e:
        logger.warning(f"Erreur d'initialisation du modèle BM25 ({e}).")
        return None


def embed_query_sparse(text: str) -> Optional[models.SparseVector]:
    """Vectorise une requête utilisateur en un vecteur épars de type BM25 si disponible."""
    model = get_bm25_model()
    if model is None:
        return None
    try:
        embedding = next(model.query_embed(text))
        return models.SparseVector(
            indices=embedding.indices.tolist(),
            values=embedding.values.tolist(),
        )
    except Exception as e:
        logger.warning(f"Erreur lors de l'embedding BM25 ({e}).")
        return None
