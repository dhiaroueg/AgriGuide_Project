"""
EU-banned and restricted agrochemical reference database.

Sources:
  - EU Regulation (EC) No 1107/2009 — Plant Protection Products
  - EU Commission Implementing Regulations (non-renewal / withdrawal decisions)
  - French arrêté du 12 septembre 2006 — Conditions d'utilisation des produits
    phytopharmaceutiques (wind speed thresholds for spraying)

This module is used by both:
  - guardrail_input.py  (Module A): to detect user requests for banned substances
  - guardrail_output.py (Module B): to catch LLM recommendations of banned substances

Every entry is a real, documented regulatory prohibition — not speculative.
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Banned active substances (EU-wide withdrawal / non-renewal)
# ---------------------------------------------------------------------------
# Lowercase, accent-stripped for case-insensitive matching.
# Each entry: (substance_name, regulation_reference, reason)

BANNED_SUBSTANCES: list[tuple[str, str, str]] = [
    # --- Herbicides ---
    ("paraquat", "EU 2007/404/EC", "Acute toxicity, Parkinson's disease link"),
    ("atrazine", "EU 2004/248/EC", "Groundwater contamination, endocrine disruption"),
    ("simazine", "EU 2004/247/EC", "Groundwater contamination"),
    ("alachlore", "EU 2006/966/EC", "Carcinogenic potential, groundwater"),
    ("diuron", "EU 2008/91/EC (restricted)", "Aquatic toxicity, groundwater contamination"),
    ("trifluraline", "EU 2010/355/EC", "Persistent organic pollutant"),

    # --- Insecticides ---
    ("chlorpyrifos", "EU 2020/18", "Neurodevelopmental toxicity"),
    ("chlorpyrifos-methyl", "EU 2020/17", "Neurodevelopmental toxicity"),
    ("imidaclopride", "EU 2018/784 (outdoor ban)", "Bee colony collapse, pollinator toxicity"),
    ("clothianidine", "EU 2018/785 (outdoor ban)", "Bee colony collapse, pollinator toxicity"),
    ("thiaclopride", "EU 2020/23", "Endocrine disruption, reproductive toxicity"),
    ("thiamethoxame", "EU 2018/783 (outdoor ban)", "Bee colony collapse, pollinator toxicity"),
    ("fipronil", "EU 2013/477", "Bee toxicity, environmental persistence"),
    ("dimethoate", "EU 2019/1090", "Acute toxicity, operator risk"),
    ("methidathion", "EU 2004 withdrawal", "High acute toxicity"),

    # --- Fungicides ---
    ("mancozebe", "EU 2021/2081", "Endocrine disruption, reproductive toxicity"),
    ("chlorothalonil", "EU 2019/677", "Groundwater contamination, carcinogenic"),
    ("thiram", "EU 2018/1501", "Endocrine disruption"),
    ("epoxiconazole", "EU 2021/820", "Endocrine disruption, reproductive toxicity"),

    # --- Fumigants ---
    ("methyl bromide", "Montreal Protocol / EU 2008", "Ozone depletion"),

    # --- Growth regulators ---
    ("daminozide", "EU 2008 (food use ban)", "Carcinogenic metabolite UDMH"),
]

# Flat set for fast lookup — lowercase only
BANNED_SUBSTANCE_NAMES: set[str] = {s[0] for s in BANNED_SUBSTANCES}

# Additional aliases / trade names that map to banned substances
SUBSTANCE_ALIASES: dict[str, str] = {
    "gramoxone": "paraquat",
    "roundup": "glyphosate",  # Not banned but heavily restricted — flagged as WARNING not CRITICAL
    "gesaprim": "atrazine",
    "lorsban": "chlorpyrifos",
    "gaucho": "imidaclopride",
    "poncho": "clothianidine",
    "cruiser": "thiamethoxame",
    "regent": "fipronil",
    "dithane": "mancozebe",
    "bravo": "chlorothalonil",
    "daconil": "chlorothalonil",
}

# Substances not banned but under heavy restriction — flagged as WARNING
RESTRICTED_SUBSTANCES: set[str] = {
    "glyphosate",       # EU re-approved 2023 but increasingly restricted nationally
    "metaldehyde",      # Banned in some member states (UK, FR restrictions)
    "neonicotinoides",  # Generic class reference
    "sdhi",             # SDHI fungicides — under scientific review
}


# ---------------------------------------------------------------------------
# Dangerous tank-mix combinations
# ---------------------------------------------------------------------------
# Known hazardous combinations — mixing these creates toxic fumes,
# phytotoxicity, or amplified environmental damage.
# Each entry: (substance_a, substance_b, hazard_description)

DANGEROUS_TANK_MIXES: list[tuple[str, str, str]] = [
    ("soufre", "huile minerale", "Phytotoxicité sévère — brûlures foliaires"),
    ("cuivre", "soufre", "Phytotoxicité en conditions chaudes (> 25°C)"),
    ("sulfate de cuivre", "chaux vive", "Bouillie bordelaise mal dosée — phytotoxicité"),
    ("herbicide hormonal", "fongicide", "Antagonisme d'efficacité et dérive accrue"),
]


# ---------------------------------------------------------------------------
# Spraying wind-speed thresholds (French regulation)
# ---------------------------------------------------------------------------
# French arrêté du 12 septembre 2006, art. 2 — interdit l'application
# de produits phytopharmaceutiques lorsque la vitesse du vent dépasse
# 19 km/h (force 3 Beaufort).

WIND_BAN_THRESHOLD_KMH: float = 19.0
WIND_BAN_REGULATION: str = "Arrêté du 12 septembre 2006, art. 2"


# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------

def normalize_substance(name: str) -> str:
    """Lowercase, strip accents (basic), collapse whitespace."""
    import unicodedata
    nfkd = unicodedata.normalize("NFKD", name.lower().strip())
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def is_banned(substance: str) -> tuple[bool, str | None, str | None]:
    """Check if a substance is banned. Returns (is_banned, regulation, reason)."""
    norm = normalize_substance(substance)

    # Check aliases first
    if norm in SUBSTANCE_ALIASES:
        resolved = SUBSTANCE_ALIASES[norm]
        norm = resolved

    for name, reg, reason in BANNED_SUBSTANCES:
        if normalize_substance(name) == norm:
            return True, reg, reason

    return False, None, None


def is_restricted(substance: str) -> bool:
    """Check if a substance is under heavy restriction (WARNING level)."""
    norm = normalize_substance(substance)
    if norm in SUBSTANCE_ALIASES:
        norm = SUBSTANCE_ALIASES[norm]
    return norm in {normalize_substance(s) for s in RESTRICTED_SUBSTANCES}


def lookup_substance(name: str) -> dict:
    """Full lookup returning ban/restriction status and details."""
    banned, reg, reason = is_banned(name)
    restricted = is_restricted(name)
    return {
        "substance": name,
        "normalized": normalize_substance(name),
        "is_banned": banned,
        "is_restricted": restricted,
        "regulation": reg,
        "reason": reason,
        "severity": "critical" if banned else ("warning" if restricted else "safe"),
    }
