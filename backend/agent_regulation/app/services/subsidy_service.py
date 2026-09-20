"""Service de recherche et d'extraction structurée des aides financières agricoles.

Ne crée ni nouveau moteur de recherche ni nouvelle base vectorielle : réutilise
le service de recherche web existant (`web_search_service`, Tavily) pour trouver
des pages pertinentes, filtre celles qui ressemblent réellement à une aide, puis
utilise un LLM Mistral (sortie structurée) pour extraire et normaliser les
informations de chaque aide identifiée.

Priorise les dispositifs 2026 actuellement ouverts (requêtes ciblées, tri des
candidats avant extraction) et exclut les aides dont la date limite est déjà
passée ou explicitement close (voir `_filter_and_rank_open_subsidies`).
"""

import re
from datetime import date
from functools import lru_cache
from urllib.parse import urlparse

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_mistralai import ChatMistralAI
from pydantic import BaseModel

from app.config.settings import get_settings
from app.schemas.subsidy import SubsidyInfo, SubsidySearchResponse
from app.schemas.web_search import WebSearchResult
from app.services.web_search_service import is_official_source, search_agricultural_web

SUBSIDY_KEYWORDS = [
    "aide",
    "subvention",
    "appel à projets",
    "appel a projet",
    "dispositif",
    "financement",
    "dotation",
    "dja",
    "feader",
    "pac",
    "soutien financier",
]

# Requêtes ciblées sur la campagne 2026 en cours, pour éviter de faire remonter
# en priorité des dispositifs anciens déjà clos.
QUERY_TEMPLATES = [
    "aides agricoles 2026 {question}",
    "appels à projets agricoles 2026 {question}",
    "aides agriculture 2026 date limite {question}",
    "aides FranceAgriMer 2026 {question}",
    "aides ministère agriculture 2026 {question}",
    "aides régionales agricoles 2026 {question}",
]

# Nombre max de candidats (après dédoublonnage/tri) envoyés au LLM d'extraction,
# pour garder un prompt raisonnable malgré le nombre de requêtes ci-dessus.
MAX_CANDIDATES_FOR_EXTRACTION = 20

EXTRACTION_SYSTEM_PROMPT = (
    "Tu extrais des informations sur des aides financières agricoles (subventions, "
    "appels à projets, dispositifs de soutien) à partir de résultats de recherche "
    "web fournis ci-dessous. Pour chaque aide clairement identifiable, renseigne les "
    "champs demandés en te basant UNIQUEMENT sur le texte fourni — n'invente rien. "
    "Si une information n'est pas présente dans le texte, laisse le champ vide "
    "(null). Si un extrait ne décrit pas une aide financière réelle et concrète "
    "(ex. simple actualité, article générique sans dispositif précis), ignore-le "
    "complètement. Pour chaque aide retenue, reprends exactement l'URL source "
    "(`source_url`) et le nom de domaine (`source_officielle`) de l'extrait dont "
    "elle provient.\n\n"
    "PRIORITÉ 2026 ET SOURCES OFFICIELLES : privilégie les dispositifs actuellement "
    "ouverts ou récemment annoncés pour la campagne 2026 (agriculture.gouv.fr, "
    "franceagrimer.fr, sites DRAAF, sites officiels des Régions, autres sites "
    "administratifs officiels en priorité). Si un extrait décrit clairement une "
    "campagne ancienne et close (années antérieures à 2025, mention explicite de "
    "clôture) sans indication qu'elle a été reconduite en 2026, ignore-le "
    "complètement plutôt que de le remonter comme une aide disponible.\n\n"
    "DATES ET STATUT : renseigne `date_ouverture` et `date_limite` UNIQUEMENT si "
    "elles sont explicitement écrites dans le texte fourni (jamais de date déduite "
    "ou estimée) — sinon laisse le champ à null. Renseigne `statut` avec 'ouvert' "
    "ou 'fermé' UNIQUEMENT si le texte l'indique explicitement (ex. 'clôturé', "
    "'candidatures ouvertes jusqu'au...', 'dispositif clos') ; sinon laisse `statut` "
    "à null plutôt que de deviner.\n\n"
    "CHAMP `region` : indique UNIQUEMENT la zone géographique concernée par "
    "l'aide, sous une forme courte (ex. 'Occitanie', 'Nouvelle-Aquitaine', "
    "'Île-de-France', 'France', 'Union européenne', ou plusieurs zones séparées "
    "par une virgule). Ne mets JAMAIS dans `region` une description, une "
    "condition d'éligibilité ou toute autre phrase — ces informations vont "
    "dans `conditions_eligibilite`, `beneficiaires` ou `objectif`, jamais dans "
    "`region`. Si la zone géographique n'est pas clairement identifiable, "
    "laisse `region` à null plutôt que d'y mettre du texte approximatif."
)


class _ExtractionOutput(BaseModel):
    """Sortie structurée intermédiaire du LLM d'extraction."""

    subsidies: list[SubsidyInfo]


def _looks_like_subsidy(text: str) -> bool:
    """Filtre heuristique : le texte évoque-t-il une aide/subvention agricole ?"""
    lowered = text.lower()
    return any(keyword in lowered for keyword in SUBSIDY_KEYWORDS)


def _mentions_2026(text: str) -> bool:
    return "2026" in text


def _rank_candidates(candidates: list[WebSearchResult]) -> list[WebSearchResult]:
    """Trie les candidats avant extraction : sources officielles d'abord, puis
    celles qui mentionnent explicitement 2026 (proxy de fraîcheur — le champ
    `published_date` de Tavily est rarement renseigné pour les pages gouv.fr)."""

    def sort_key(c: WebSearchResult) -> tuple[int, int]:
        official = 0 if is_official_source(c.source) else 1
        recent = 0 if _mentions_2026(f"{c.title} {c.snippet}") else 1
        return (official, recent)

    return sorted(candidates, key=sort_key)


def _collect_candidate_results(question: str) -> list[WebSearchResult]:
    """Interroge le service web existant avec plusieurs formulations de requête
    ciblées 2026, déduplique par URL, ne garde que les résultats qui ressemblent
    à une aide, puis trie (officiel/2026 en premier) et plafonne le nombre de
    candidats transmis au LLM d'extraction."""
    seen_urls: set[str] = set()
    candidates: list[WebSearchResult] = []
    for template in QUERY_TEMPLATES:
        query = template.format(question=question)
        response = search_agricultural_web(query)
        for result in response.results:
            if result.url in seen_urls:
                continue
            if not _looks_like_subsidy(f"{result.title} {result.snippet}"):
                continue
            seen_urls.add(result.url)
            candidates.append(result)

    ranked = _rank_candidates(candidates)
    return ranked[:MAX_CANDIDATES_FOR_EXTRACTION]


@lru_cache
def _get_extraction_llm():
    """Retourne le LLM d'extraction structurée (mis en cache)."""
    settings = get_settings()
    llm = ChatMistralAI(model=settings.mistral_model, mistral_api_key=settings.mistral_api_key, temperature=0)
    return llm.with_structured_output(_ExtractionOutput)


def _apply_official_flag(subsidies: list[SubsidyInfo]) -> None:
    """Recalcule `is_official` à partir du domaine réel de `source_url` (ne fait

    pas confiance au jugement du LLM sur ce point).
    """
    for subsidy in subsidies:
        domain = urlparse(subsidy.source_url).netloc.removeprefix("www.")
        subsidy.is_official = is_official_source(domain) if domain else False


# ---------------------------------------------------------------------------
# Filtre temporel post-extraction : exclut les aides expirées/closes, priorise
# celles dont l'échéance encore valide est la plus proche.
# ---------------------------------------------------------------------------

_CLOSED_KEYWORDS = (
    "clos",
    "clôturé",
    "cloturé",
    "clôture",
    "terminé",
    "expiré",
    "candidatures closes",
    "dispositif fermé",
)

_MONTHS_FR = {
    "janvier": 1,
    "février": 2,
    "fevrier": 2,
    "mars": 3,
    "avril": 4,
    "mai": 5,
    "juin": 6,
    "juillet": 7,
    "août": 8,
    "aout": 8,
    "septembre": 9,
    "octobre": 10,
    "novembre": 11,
    "décembre": 12,
    "decembre": 12,
}

_DATE_PATTERNS = (
    re.compile(r"(\d{4})-(\d{2})-(\d{2})"),  # 2026-07-31
    re.compile(r"(\d{1,2})/(\d{1,2})/(\d{4})"),  # 31/07/2026
    re.compile(r"(\d{1,2})-(\d{1,2})-(\d{4})"),  # 31-07-2026
)
_DATE_TEXT_PATTERN = re.compile(r"(\d{1,2})\s+(" + "|".join(_MONTHS_FR) + r")\s+(\d{4})", re.IGNORECASE)


def _parse_subsidy_date(text: str | None) -> date | None:
    """Extrait une date à partir d'un texte libre (`SubsidyInfo.date_limite` /
    `date_ouverture`) — même logique best-effort que
    `subsidy_sync_service._parse_date`, dupliquée ici pour garder Tool #3
    autonome (ne dépend pas du service de synchronisation). Ne devine jamais :
    retourne None si aucun format connu n'est trouvé.
    """
    if not text:
        return None

    match = _DATE_PATTERNS[0].search(text)
    if match:
        year, month, day = match.groups()
        return _safe_date(int(year), int(month), int(day))

    for pattern in _DATE_PATTERNS[1:]:
        match = pattern.search(text)
        if match:
            day, month, year = match.groups()
            return _safe_date(int(year), int(month), int(day))

    match = _DATE_TEXT_PATTERN.search(text)
    if match:
        day, month_name, year = match.groups()
        month = _MONTHS_FR.get(month_name.lower())
        if month:
            return _safe_date(int(year), month, int(day))

    return None


def _safe_date(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _is_expired_or_closed(subsidy: SubsidyInfo, today: date) -> bool:
    """Une aide est exclue si sa date limite (parsable) est déjà passée, ou si
    le texte extrait indique explicitement une clôture."""
    end = _parse_subsidy_date(subsidy.date_limite)
    if end is not None and end < today:
        return True

    combined = f"{subsidy.date_limite or ''} {subsidy.statut or ''}".lower()
    return any(keyword in combined for keyword in _CLOSED_KEYWORDS)


def _filter_and_rank_open_subsidies(subsidies: list[SubsidyInfo]) -> list[SubsidyInfo]:
    """Retire les aides expirées/closes, puis trie les aides restantes par
    échéance la plus proche en premier — les aides sans date limite
    identifiable (voir `SubsidyInfo.date_limite = None`) sont conservées mais
    reléguées en fin de liste, jamais présentées comme ayant une échéance
    certaine."""
    today = date.today()
    open_subsidies = [s for s in subsidies if not _is_expired_or_closed(s, today)]

    def sort_key(s: SubsidyInfo) -> tuple[int, date]:
        end = _parse_subsidy_date(s.date_limite)
        if end is not None:
            return (0, end)
        return (1, date.max)

    open_subsidies.sort(key=sort_key)
    return open_subsidies


def search_subsidies(question: str) -> SubsidySearchResponse:
    """Recherche des aides financières agricoles pertinentes pour la question posée.

    Construit plusieurs requêtes web ciblées sur la campagne 2026, filtre les
    résultats qui ressemblent réellement à une aide, utilise un LLM pour
    extraire et structurer les informations de chaque aide identifiée, puis
    exclut les aides expirées/closes et trie les aides restantes par échéance
    la plus proche.
    """
    candidates = _collect_candidate_results(question)
    if not candidates:
        return SubsidySearchResponse(query=question, subsidies=[])

    sources_text = "\n\n".join(
        f"URL: {c.url}\nDomaine: {c.source}\nTitre: {c.title}\nContenu: {c.snippet}" for c in candidates
    )

    extractor = _get_extraction_llm()
    messages = [
        SystemMessage(content=EXTRACTION_SYSTEM_PROMPT),
        HumanMessage(content=f"Question de l'utilisateur : {question}\n\nRésultats web :\n\n{sources_text}"),
    ]
    output: _ExtractionOutput = extractor.invoke(messages)
    _apply_official_flag(output.subsidies)
    open_subsidies = _filter_and_rank_open_subsidies(output.subsidies)
    return SubsidySearchResponse(query=question, subsidies=open_subsidies)
