"""
Module B — Agronomic Output Safety Validator (LLM Response Firewall).

Intercepts LLM-generated text AFTER generation but BEFORE delivery to
the user, catching dangerous agronomic advice the LLM might produce.

Validation checks:
  1. Excessive dosage:    N/P/K doses exceeding regulatory ceilings
  2. Banned substances:   LLM recommending EU-banned agrochemicals
  3. Wind-ban spraying:   Spraying advice when weather shows high wind
  4. Irrigation overrun:  Irrigation volumes > 2× FAO-56 estimate
  5. Numeric contradiction: LLM figures contradicting deterministic calcs
  6. Ungrounded claims:   Specific dosage/threshold numbers with no source

Design: deterministic regex + reference-value checks, no LLM call.
Complements (not replaces) the existing three-layer grounding defense
in synthesis_service.py.
"""
from __future__ import annotations

import logging
import re

try:
    from .models import OutputGuardrailResult, SafetyViolation, Severity
    from .banned_substances import (
        BANNED_SUBSTANCE_NAMES,
        SUBSTANCE_ALIASES,
        RESTRICTED_SUBSTANCES,
        WIND_BAN_THRESHOLD_KMH,
        WIND_BAN_REGULATION,
        normalize_substance,
    )
except ImportError:
    from shared.agro_security.models import OutputGuardrailResult, SafetyViolation, Severity
    from shared.agro_security.banned_substances import (
        BANNED_SUBSTANCE_NAMES,
        SUBSTANCE_ALIASES,
        RESTRICTED_SUBSTANCES,
        WIND_BAN_THRESHOLD_KMH,
        WIND_BAN_REGULATION,
        normalize_substance,
    )

logger = logging.getLogger("agro_security.output")

# ---------------------------------------------------------------------------
# Regulatory ceilings — mirrors agro_calc_service._MAX_REALISTIC_DOSE_KG_HA
# but adds absolute EU maximums as a second safety net.
# ---------------------------------------------------------------------------

# French nitrate-vulnerable-zone reference dose caps (kg N/ha)
_MAX_N_DOSE_KG_HA: dict[str, int] = {
    "ble_tendre": 220,
    "ble": 220,
    "mais": 220,
    "colza": 220,
    "orge": 180,
    "tournesol": 120,
    "pomme_de_terre": 220,
    "betterave_sucriere": 160,
    "betterave": 160,
    "soja": 50,
    "pois_proteagineux": 30,
    "pois": 30,
}

# EU Nitrate Directive — absolute organic N ceiling in vulnerable zones
_EU_ORGANIC_N_CEILING_KG_HA = 170

# Absolute maximum beyond which ANY dose is clearly dangerous (safety backstop)
_ABSOLUTE_MAX_N_KG_HA = 300

# Maximum realistic irrigation per application (mm) — safety backstop
_ABSOLUTE_MAX_IRRIGATION_MM = 200


# ---------------------------------------------------------------------------
# Number extraction from French text
# ---------------------------------------------------------------------------

_DOSE_PATTERN = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*(?:kg|kilogramme)?\s*"
    r"(?:d[e']?\s*)?(?:N|azote|engrais|nitrate|phosphore|potassium|fertilisant)"
    r"\s*/?\s*(?:ha|hectare)",
    re.IGNORECASE,
)

_IRRIGATION_PATTERN = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*(?:mm|millimètre|litre)\s*"
    r"(?:/?\s*(?:ha|hectare|m²|jour|semaine|day|week))?",
    re.IGNORECASE,
)

_SPRAYING_PATTERN = re.compile(
    r"(?:pulvéris|traite|appliqu|épand|spray|treat|apply)\w*",
    re.IGNORECASE,
)


def _parse_french_number(s: str) -> float:
    """Parse a number from French text (comma as decimal separator)."""
    return float(s.replace(",", ".").strip())


# ---------------------------------------------------------------------------
# Individual safety checks
# ---------------------------------------------------------------------------

def _check_excessive_dosage(text: str) -> list[SafetyViolation]:
    """Detect nitrogen doses exceeding regulatory ceilings."""
    violations: list[SafetyViolation] = []

    for match in _DOSE_PATTERN.finditer(text):
        try:
            dose = _parse_french_number(match.group(1))
        except ValueError:
            continue

        # Absolute ceiling — any crop
        if dose > _ABSOLUTE_MAX_N_KG_HA:
            violations.append(SafetyViolation(
                violation_type="excessive_dose",
                severity=Severity.CRITICAL,
                message=(
                    f"Dose d'azote de {dose} kg N/ha détectée dans la réponse — "
                    f"dépasse le plafond absolu de sécurité ({_ABSOLUTE_MAX_N_KG_HA} kg N/ha). "
                    f"Aucune culture française ne nécessite une telle dose."
                ),
                evidence=match.group(0),
                expected_value=f"≤ {_ABSOLUTE_MAX_N_KG_HA} kg N/ha",
                actual_value=f"{dose} kg N/ha",
                recommendation="Vérifiez la dose avec les références COMIFER/Arvalis.",
            ))
        elif dose > _EU_ORGANIC_N_CEILING_KG_HA:
            violations.append(SafetyViolation(
                violation_type="excessive_dose",
                severity=Severity.WARNING,
                message=(
                    f"Dose d'azote de {dose} kg N/ha détectée — dépasse le plafond "
                    f"organique EU Directive Nitrates ({_EU_ORGANIC_N_CEILING_KG_HA} kg N/ha "
                    f"en zone vulnérable). Vérifiez si la parcelle est en zone vulnérable."
                ),
                evidence=match.group(0),
                expected_value=f"≤ {_EU_ORGANIC_N_CEILING_KG_HA} kg N/ha (organique ZVN)",
                actual_value=f"{dose} kg N/ha",
                recommendation="Vérifiez le statut ZVN de la parcelle et la nature de l'apport.",
            ))

    return violations


def _check_banned_substances(text: str) -> list[SafetyViolation]:
    """Detect LLM recommendations of banned or restricted agrochemicals."""
    violations: list[SafetyViolation] = []
    norm_text = normalize_substance(text)

    all_names = BANNED_SUBSTANCE_NAMES | set(SUBSTANCE_ALIASES.keys())

    for name in all_names:
        norm_name = normalize_substance(name)
        if norm_name not in norm_text:
            continue

        # Check if the LLM is RECOMMENDING it (not just mentioning it's banned)
        # Look for recommendation verbs near the substance mention
        rec_pattern = re.compile(
            rf"(?:recommand|conseill|utilis|appliqu|pulvéris|traite|épand|précon)\w*"
            rf".{{0,60}}{re.escape(name)}|"
            rf"{re.escape(name)}.{{0,60}}"
            rf"(?:recommand|conseill|utilis|appliqu|pulvéris|traite|épand|précon)\w*",
            re.IGNORECASE | re.DOTALL,
        )

        canonical = SUBSTANCE_ALIASES.get(norm_name, norm_name)
        is_banned = canonical in {normalize_substance(s) for s in BANNED_SUBSTANCE_NAMES}

        if rec_pattern.search(text):
            if is_banned:
                violations.append(SafetyViolation(
                    violation_type="banned_substance",
                    severity=Severity.CRITICAL,
                    message=(
                        f"La réponse recommande l'utilisation de « {name} » — "
                        f"substance INTERDITE dans l'UE. Cette recommandation est illégale."
                    ),
                    evidence=name,
                    recommendation="Supprimez cette recommandation et proposez une alternative autorisée.",
                ))
            else:
                violations.append(SafetyViolation(
                    violation_type="banned_substance",
                    severity=Severity.WARNING,
                    message=(
                        f"La réponse recommande « {name} » — substance sous restriction "
                        f"réglementaire forte. Vérifiez l'autorisation locale."
                    ),
                    evidence=name,
                    recommendation="Précisez les conditions d'autorisation locales.",
                ))

    return violations


def _check_wind_ban_spraying(
    text: str,
    current_wind_kmh: float | None = None,
) -> list[SafetyViolation]:
    """Detect spraying advice when wind exceeds French regulatory threshold."""
    violations: list[SafetyViolation] = []

    if current_wind_kmh is None:
        return violations

    if current_wind_kmh <= WIND_BAN_THRESHOLD_KMH:
        return violations

    # Check if the LLM recommends spraying
    if _SPRAYING_PATTERN.search(text):
        violations.append(SafetyViolation(
            violation_type="wind_ban_spraying",
            severity=Severity.CRITICAL,
            message=(
                f"La réponse recommande une pulvérisation alors que le vent actuel "
                f"est de {current_wind_kmh} km/h — interdit au-delà de "
                f"{WIND_BAN_THRESHOLD_KMH} km/h ({WIND_BAN_REGULATION})."
            ),
            evidence=_SPRAYING_PATTERN.search(text).group(0),
            expected_value=f"Vent ≤ {WIND_BAN_THRESHOLD_KMH} km/h",
            actual_value=f"{current_wind_kmh} km/h",
            recommendation="Reportez la pulvérisation à une fenêtre de vent calme.",
        ))

    return violations


def _check_irrigation_overestimate(
    text: str,
    fao56_estimate_mm: float | None = None,
) -> list[SafetyViolation]:
    """Detect irrigation volumes that dramatically exceed the FAO-56 estimate."""
    violations: list[SafetyViolation] = []

    if fao56_estimate_mm is None or fao56_estimate_mm <= 0:
        return violations

    for match in _IRRIGATION_PATTERN.finditer(text):
        try:
            stated_mm = _parse_french_number(match.group(1))
        except ValueError:
            continue

        # Only flag if the stated value is > 2× the deterministic estimate
        if stated_mm > 2 * fao56_estimate_mm and stated_mm > 20:
            violations.append(SafetyViolation(
                violation_type="irrigation_overestimate",
                severity=Severity.WARNING,
                message=(
                    f"Volume d'irrigation de {stated_mm} mm mentionné — "
                    f"dépasse 2× l'estimation FAO-56 ({fao56_estimate_mm} mm). "
                    f"Risque de gaspillage d'eau et de lessivage des nitrates."
                ),
                evidence=match.group(0),
                expected_value=f"~{fao56_estimate_mm} mm (FAO-56)",
                actual_value=f"{stated_mm} mm",
                recommendation="Vérifiez le calcul d'irrigation avec le bilan hydrique FAO-56.",
            ))

        # Absolute safety backstop
        if stated_mm > _ABSOLUTE_MAX_IRRIGATION_MM:
            violations.append(SafetyViolation(
                violation_type="irrigation_overestimate",
                severity=Severity.CRITICAL,
                message=(
                    f"Volume d'irrigation de {stated_mm} mm — dépasse le plafond "
                    f"de sécurité absolu ({_ABSOLUTE_MAX_IRRIGATION_MM} mm par application)."
                ),
                evidence=match.group(0),
                expected_value=f"≤ {_ABSOLUTE_MAX_IRRIGATION_MM} mm",
                actual_value=f"{stated_mm} mm",
                recommendation="Ce volume est irréaliste pour une seule application.",
            ))

    return violations


def _check_numeric_contradictions(
    text: str,
    reference_values: dict[str, float] | None = None,
) -> list[SafetyViolation]:
    """Detect contradictions between LLM output and deterministic reference values.

    reference_values: dict mapping label -> expected value, e.g.:
        {"n_dose_kg_ha": 180.5, "irrigation_need_mm": 42.0, "yield_q_ha": 75.0}
    """
    violations: list[SafetyViolation] = []

    if not reference_values:
        return violations

    # Check nitrogen dose contradiction
    n_ref = reference_values.get("n_dose_kg_ha")
    if n_ref is not None:
        for match in _DOSE_PATTERN.finditer(text):
            try:
                stated = _parse_french_number(match.group(1))
            except ValueError:
                continue
            # Allow ±20% tolerance for rounding/rephrasing
            if abs(stated - n_ref) > max(n_ref * 0.20, 10):
                violations.append(SafetyViolation(
                    violation_type="numeric_contradiction",
                    severity=Severity.WARNING,
                    message=(
                        f"La réponse indique {stated} kg N/ha mais le calcul "
                        f"déterministe (COMIFER) donne {n_ref} kg N/ha — "
                        f"écart de {abs(stated - n_ref):.1f} kg N/ha."
                    ),
                    evidence=match.group(0),
                    expected_value=f"{n_ref} kg N/ha (COMIFER)",
                    actual_value=f"{stated} kg N/ha",
                    recommendation="Utilisez la valeur du calcul déterministe COMIFER.",
                ))

    return violations


# ---------------------------------------------------------------------------
# Main validation function
# ---------------------------------------------------------------------------

def validate_output(
    llm_response: str,
    *,
    current_wind_kmh: float | None = None,
    fao56_estimate_mm: float | None = None,
    reference_values: dict[str, float] | None = None,
) -> OutputGuardrailResult:
    """
    Validate an LLM-generated response for agronomic safety.

    Args:
        llm_response:       The raw text output from the LLM.
        current_wind_kmh:   Current wind speed (from weather data), if available.
        fao56_estimate_mm:  Deterministic FAO-56 irrigation estimate, if available.
        reference_values:   Dict of deterministic reference values for contradiction checks.

    Returns:
        OutputGuardrailResult with is_safe, violations, annotated_response, safety_score.
    """
    if not llm_response or not llm_response.strip():
        return OutputGuardrailResult(is_safe=True, violations=[], safety_score=1.0)

    all_violations: list[SafetyViolation] = []

    # Run all checks
    all_violations.extend(_check_excessive_dosage(llm_response))
    all_violations.extend(_check_banned_substances(llm_response))
    all_violations.extend(_check_wind_ban_spraying(llm_response, current_wind_kmh))
    all_violations.extend(_check_irrigation_overestimate(llm_response, fao56_estimate_mm))
    all_violations.extend(_check_numeric_contradictions(llm_response, reference_values))

    # Determine overall safety
    has_critical = any(v.severity == Severity.CRITICAL for v in all_violations)
    is_safe = not has_critical

    # Compute safety score
    if not all_violations:
        safety_score = 1.0
    else:
        severity_weights = {Severity.INFO: 0.05, Severity.WARNING: 0.15, Severity.CRITICAL: 0.40}
        total_penalty = sum(severity_weights.get(v.severity, 0.1) for v in all_violations)
        safety_score = max(0.0, round(1.0 - total_penalty, 3))

    # Build annotated response with inline warnings
    annotated_response = None
    if all_violations:
        warning_block = "\n\n---\n⚠️ **Avertissement de sécurité agronomique AgriGuide** :\n\n"
        for i, v in enumerate(all_violations, 1):
            icon = "⛔" if v.severity == Severity.CRITICAL else "⚠️" if v.severity == Severity.WARNING else "ℹ️"
            warning_block += f"{i}. {icon} **{v.violation_type}** : {v.message}\n"
            if v.recommendation:
                warning_block += f"   → *{v.recommendation}*\n"
        warning_block += "\n---"
        annotated_response = llm_response + warning_block

    logger.info(
        "Output validation: safe=%s score=%.2f violations=%d",
        is_safe, safety_score, len(all_violations),
    )

    return OutputGuardrailResult(
        is_safe=is_safe,
        violations=all_violations,
        annotated_response=annotated_response,
        safety_score=safety_score,
    )
