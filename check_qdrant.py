"""
Verifie la connexion Qdrant Cloud et l'etat de la collection.

Usage:
    python check_qdrant.py

Lit QDRANT_URL, QDRANT_API_KEY et QDRANT_COLLECTION_NAME depuis .env a la racine.
"""
import os
import sys
from pathlib import Path

# Charge le .env racine
_env = Path(__file__).parent / ".env"
if _env.is_file():
    for line in _env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())

QDRANT_URL     = os.environ.get("QDRANT_URL", "")
QDRANT_API_KEY = os.environ.get("QDRANT_API_KEY", "")
COLLECTION     = os.environ.get("QDRANT_COLLECTION_NAME", "")

print("=" * 60)
print("Qdrant connectivity check")
print("=" * 60)
print(f"  URL        : {QDRANT_URL}")
print(f"  Collection : {COLLECTION}")
print(f"  API key    : {'[set]' if QDRANT_API_KEY else '[MISSING]'}")
print()

try:
    from qdrant_client import QdrantClient
except ImportError:
    print("[ERREUR] qdrant-client n'est pas installe.")
    print("  -> pip install qdrant-client")
    sys.exit(1)

try:
    client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY or None)
    collections = client.get_collections().collections
    names = [c.name for c in collections]
    print(f"[OK]  Connexion reussie -- {len(collections)} collection(s) :")
    for n in names:
        marker = " --> " if n == COLLECTION else "     "
        print(f"  {marker}{n}")
except Exception as exc:
    print(f"[ECHEC]  Connexion echouee : {exc}")
    sys.exit(1)

print()
if COLLECTION not in names:
    print(f"[WARN]  La collection '{COLLECTION}' n'existe PAS dans ce cluster.")
    print("        Indexez d'abord le corpus reglementaire.")
    sys.exit(1)

try:
    info = client.get_collection(COLLECTION)
    count = info.points_count
    vectors_cfg = info.config.params.vectors
    print(f"[OK]  Collection '{COLLECTION}' :")
    print(f"      - Points indexes : {count}")
    print(f"      - Config vecteurs : {vectors_cfg}")
    if count == 0:
        print()
        print("[WARN]  La collection est VIDE -- indexez le corpus reglementaire d'abord.")
    else:
        print()
        print("[OK]  Tout est pret. L'agent Regulation peut utiliser cette collection.")
except Exception as exc:
    print(f"[ECHEC]  Impossible de lire les infos de la collection : {exc}")
    sys.exit(1)
