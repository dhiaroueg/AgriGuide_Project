"""Service de recherche web (Tavily) pour les aides financières et réglementations
agricoles récentes, non couvertes par la base réglementaire locale (Qdrant).

Combine une recherche générale et une recherche restreinte à une liste de
domaines officiels connus, afin de privilégier ces sources sans exclure
d'autres résultats pertinents (ex. sites des Régions, non énumérables
exhaustivement).
"""

from functools import lru_cache
from urllib.parse import urlparse

from app.config.settings import get_settings
from app.schemas.web_search import WebSearchResponse, WebSearchResult

# NOTE: TavilyClient is intentionally NOT imported at module level.
# tavily → tiktoken → _tiktoken.pyd, which may be blocked by Windows
# Application Control policies. The client is imported lazily inside
# get_web_search_client() so the DLL is only touched when the feature
# is actually used (requires WEB_SEARCH_API_KEY to be set).

OFFICIAL_DOMAINS = [
    "agriculture.gouv.fr",
    "legifrance.gouv.fr",
    "franceagrimer.fr",
    "asp-public.fr",
    "service-public.fr",
    "europa.eu",
    "ec.europa.eu",
]

GENERAL_MAX_RESULTS = 6
OFFICIAL_MAX_RESULTS = 5
TOTAL_MAX_RESULTS = 5


@lru_cache
def get_web_search_client():
    """Retourne un client Tavily (mis en cache) pour effectuer les recherches web."""
    from tavily import TavilyClient  # lazy import — avoids loading tiktoken DLL at startup
    settings = get_settings()
    return TavilyClient(api_key=settings.web_search_api_key)


def _domain_of(url: str) -> str:
    """Extrait le nom de domaine (sans "www.") d'une URL."""
    return urlparse(url).netloc.removeprefix("www.")


def is_official_source(domain: str) -> bool:
    """Indique si un domaine est considéré comme une source officielle."""
    if domain.endswith(".gouv.fr") or domain.endswith(".europa.eu"):
        return True
    return any(domain == d or domain.endswith(f".{d}") for d in OFFICIAL_DOMAINS)


def _to_result(raw: dict) -> WebSearchResult:
    domain = _domain_of(raw.get("url", ""))
    return WebSearchResult(
        title=raw.get("title", ""),
        url=raw.get("url", ""),
        source=domain,
        snippet=raw.get("content", ""),
        published_date=raw.get("published_date") or None,
    )


def search_agricultural_web(query: str) -> WebSearchResponse:
    """Recherche sur le web des informations récentes (aides, procédures, réglementation).

    Effectue deux recherches complémentaires :
    - une recherche générale, pour ne rien manquer (ex. sites régionaux) ;
    - une recherche restreinte aux domaines officiels connus (`OFFICIAL_DOMAINS`),
      pour garantir leur présence dans les résultats.

    Les résultats sont dédupliqués par URL puis triés en mettant en avant les
    sources officielles.
    """
    client = get_web_search_client()

    general = client.search(query, max_results=GENERAL_MAX_RESULTS, search_depth="basic").get("results", [])
    official = client.search(
        query,
        max_results=OFFICIAL_MAX_RESULTS,
        search_depth="basic",
        include_domains=OFFICIAL_DOMAINS,
    ).get("results", [])

    seen_urls: set[str] = set()
    merged: list[WebSearchResult] = []
    for raw in official + general:
        url = raw.get("url", "")
        if not url or url in seen_urls:
            continue
        seen_urls.add(url)
        merged.append(_to_result(raw))

    merged.sort(key=lambda r: not is_official_source(r.source))
    return WebSearchResponse(query=query, results=merged[:TOTAL_MAX_RESULTS])
