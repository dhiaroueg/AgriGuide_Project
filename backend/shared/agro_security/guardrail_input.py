"""
Module A — Input Prompt Injection & Malicious Context Filter.

Scans every user prompt BEFORE it reaches the LLM, detecting and
classifying:
  1. Prompt injection attacks (system override, delimiter injection,
     role impersonation, encoded payloads)
  2. Agronomic context manipulation (regulatory evasion, banned
     substance requests, quota bypass)
  3. Social engineering attempts (impersonation, authority claims)

Design principles:
  - Defense in depth: this is ONE layer, not the only one. The
    existing grounding defense in synthesis_service.py and the
    deterministic formulas in agro_calc_service.py remain the
    strongest safety guarantees.
  - Minimize false positives: legitimate agronomic questions about
    banned substances (e.g. "why is atrazine banned?") should be
    flagged INFO, not blocked. Only actionable requests for
    dangerous advice are CRITICAL.
  - Fast: regex + keyword matching, no LLM call required.
"""
from __future__ import annotations

import logging
import re
import unicodedata

try:
    from .models import InputFlag, InputGuardrailResult, Severity
    from .banned_substances import (
        BANNED_SUBSTANCE_NAMES,
        SUBSTANCE_ALIASES,
        RESTRICTED_SUBSTANCES,
        normalize_substance,
    )
except ImportError:
    from shared.agro_security.models import InputFlag, InputGuardrailResult, Severity
    from shared.agro_security.banned_substances import (
        BANNED_SUBSTANCE_NAMES,
        SUBSTANCE_ALIASES,
        RESTRICTED_SUBSTANCES,
        normalize_substance,
    )

logger = logging.getLogger("agro_security.input")

# ---------------------------------------------------------------------------
# Pattern definitions
# ---------------------------------------------------------------------------
# Each pattern: (pattern_id, category, severity, regex, message_template)
# Regex flags: IGNORECASE + DOTALL applied globally.

_INJECTION_PATTERNS: list[tuple[str, str, Severity, str, str]] = [
    # ---- System prompt override ----
    (
        "INJ-001", "injection", Severity.CRITICAL,
        r"(?:ignore|oublie|forget|disregard)\s+(?:all\s+)?(?:previous|prior|above|preceding|les|tes|toutes?\s+les)\s+(?:instructions?|rules?|directives?|consignes?|règles?)",
        "Tentative de remplacement des instructions système détectée",
    ),
    (
        "INJ-002", "injection", Severity.CRITICAL,
        r"(?:you\s+are\s+now|tu\s+es\s+maintenant|act\s+as|agis\s+comme|pretend\s+to\s+be|fais\s+semblant)\s+(?:a\s+)?(?:new|different|autre|nouvel)",
        "Tentative d'usurpation d'identité du système détectée",
    ),
    (
        "INJ-003", "injection", Severity.CRITICAL,
        r"(?:system\s*(?:prompt|message)|prompt\s+système)\s*[:=]",
        "Injection de prompt système détectée",
    ),
    (
        "INJ-004", "injection", Severity.WARNING,
        r"(?:developer|admin|root|sudo|maintenance)\s+mode",
        "Tentative d'accès au mode développeur/admin détectée",
    ),

    # ---- Delimiter injection ----
    (
        "INJ-005", "injection", Severity.WARNING,
        r'(?:"""|```|---\s*\n\s*(?:system|assistant)|<\|(?:system|im_start)\|>)',
        "Injection de délimiteurs de prompt détectée",
    ),
    (
        "INJ-006", "injection", Severity.WARNING,
        r"<(?:system|assistant|tool_call|function_call)[^>]*>",
        "Injection de balises XML/rôle détectée",
    ),

    # ---- Role impersonation ----
    (
        "INJ-007", "injection", Severity.WARNING,
        r"(?:en\s+tant\s+qu[e']|as\s+(?:an?\s+)?(?:administrator|administrateur|supervisor|superviseur|root|développeur))",
        "Usurpation de rôle administrateur détectée",
    ),

    # ---- Encoded payloads ----
    (
        "INJ-008", "injection", Severity.WARNING,
        r"(?:base64|atob|btoa)\s*\(",
        "Tentative de charge utile encodée détectée",
    ),

    # ---- Data exfiltration ----
    (
        "INJ-009", "injection", Severity.CRITICAL,
        r"(?:révèle|reveal|show|affiche|dump|print|display)\s+(?:the\s+|le\s+|ton\s+|ta\s+|tes\s+)?(?:system\s+prompt|prompt\s+système|instructions?\s+initiales?|clé\s+api|api\s+key|secret|mot\s+de\s+passe|password)",
        "Tentative d'exfiltration de données sensibles détectée",
    ),
]

_AGRONOMIC_MANIPULATION_PATTERNS: list[tuple[str, str, Severity, str, str]] = [
    # ---- Regulatory evasion ----
    (
        "AGR-001", "regulatory_evasion", Severity.CRITICAL,
        r"(?:ignore|contourne|bypass|dépasse|outrepasse|skip)\s+(?:la\s+|le\s+|les\s+)?(?:limite|plafond|seuil|dose\s+max|réglementation|directive\s+nitrate|zone\s+vulnérable)",
        "Tentative de contournement de plafond réglementaire détectée",
    ),
    (
        "AGR-002", "regulatory_evasion", Severity.CRITICAL,
        r"(?:déclare|declare)\s+(?:moins|less|fewer|une?\s+plus\s+petite)\s+(?:surface|superficie|hectare|parcelle)",
        "Tentative de fraude déclarative (surface) détectée",
    ),
    (
        "AGR-003", "regulatory_evasion", Severity.WARNING,
        r"(?:comment\s+)?(?:éviter|avoid|contourner|bypass)\s+(?:le\s+|la\s+|les\s+)?(?:contrôle|inspection|amende|sanction|pac|bcae)",
        "Question sur le contournement de contrôles réglementaires détectée",
    ),

    # ---- Dangerous dosage requests ----
    (
        "AGR-004", "dangerous_agronomic", Severity.WARNING,
        r"(?:augmente|double|triple|increase|maximize|maximise)\s+(?:la\s+)?(?:dose|quantité|apport)\s+(?:d[e']?\s*)?(?:azote|engrais|fertilisant|pesticide|herbicide|fongicide)",
        "Demande d'augmentation excessive de dose détectée",
    ),
    (
        "AGR-005", "dangerous_agronomic", Severity.WARNING,
        r"(?:\d{3,})\s*(?:kg|kilogramme)\s*(?:d[e']?\s*)?(?:N|azote|engrais)\s*/?\s*(?:ha|hectare)",
        "Dose d'azote potentiellement excessive mentionnée (> 100 kg N/ha)",
    ),
]

_SOCIAL_ENGINEERING_PATTERNS: list[tuple[str, str, Severity, str, str]] = [
    (
        "SOC-001", "social_engineering", Severity.WARNING,
        r"(?:je\s+suis|i\s+am)\s+(?:un\s+|le\s+|l[e']\s*)?(?:administrateur|admin|développeur|developer|ingénieur\s+système|responsable\s+sécurité)",
        "Déclaration non vérifiable d'autorité administrative",
    ),
    (
        "SOC-002", "social_engineering", Severity.INFO,
        r"(?:c[']est\s+)?(?:urgent|une?\s+urgence|emergency|critical|life\s+or\s+death|vie\s+ou\s+mort)",
        "Tentative de pression par urgence détectée",
    ),
]

ALL_PATTERNS = _INJECTION_PATTERNS + _AGRONOMIC_MANIPULATION_PATTERNS + _SOCIAL_ENGINEERING_PATTERNS


# ---------------------------------------------------------------------------
# Banned substance detection in user input
# ---------------------------------------------------------------------------

def _check_banned_substances(text: str) -> list[InputFlag]:
    """Detect mentions of banned or restricted agrochemicals in user input.

    IMPORTANT: asking ABOUT a banned substance (educational) is INFO;
    asking to USE or APPLY one is CRITICAL.
    """
    flags: list[InputFlag] = []
    norm_text = normalize_substance(text)
    words = set(re.findall(r"[a-z\-]+", norm_text))

    # Check direct substance names and aliases
    all_names = BANNED_SUBSTANCE_NAMES | set(SUBSTANCE_ALIASES.keys())

    for name in all_names:
        norm_name = normalize_substance(name)
        if norm_name in norm_text:
            # Determine if the user is asking ABOUT it (educational) or
            # asking to USE it (actionable dangerous request)
            use_patterns = re.compile(
                r"(?:utilise|appliqu|pulvéris|traite|dose|mélange|épand|spray|apply|use|mix|spread)\w*",
                re.IGNORECASE,
            )
            is_actionable = bool(use_patterns.search(text))

            # Resolve to canonical name if alias
            canonical = SUBSTANCE_ALIASES.get(norm_name, norm_name)
            is_banned = canonical in {normalize_substance(s) for s in BANNED_SUBSTANCE_NAMES}
            is_restricted = canonical in {normalize_substance(s) for s in RESTRICTED_SUBSTANCES}

            if is_actionable and is_banned:
                severity = Severity.CRITICAL
                msg = (
                    f"Demande d'utilisation de « {name} » détectée — substance INTERDITE dans l'UE. "
                    f"L'application de cette substance est illégale."
                )
            elif is_actionable and is_restricted:
                severity = Severity.WARNING
                msg = (
                    f"Demande d'utilisation de « {name} » détectée — substance sous restriction "
                    f"réglementaire forte. Vérifiez l'autorisation locale avant tout usage."
                )
            elif is_banned:
                severity = Severity.INFO
                msg = (
                    f"Mention de « {name} » détectée — substance interdite dans l'UE. "
                    f"Question informative autorisée."
                )
            else:
                severity = Severity.INFO
                msg = f"Mention de « {name} » détectée — substance sous restriction."

            flags.append(InputFlag(
                pattern_id=f"SUB-{'BAN' if is_banned else 'RES'}-{canonical[:6].upper()}",
                category="banned_substance",
                severity=severity,
                message=msg,
                matched_text=name,
            ))

    return flags


# ---------------------------------------------------------------------------
# Unicode homoglyph detection
# ---------------------------------------------------------------------------

def _detect_homoglyph_evasion(text: str) -> InputFlag | None:
    """Detect Unicode homoglyph substitution used to evade keyword filters."""
    # Check for mixed scripts (Latin + Cyrillic, etc.) in the same word
    for word in text.split():
        scripts = set()
        for char in word:
            if char.isalpha():
                try:
                    script = unicodedata.name(char, "").split()[0]
                    scripts.add(script)
                except (ValueError, IndexError):
                    pass
        if len(scripts) > 1 and "LATIN" in scripts:
            return InputFlag(
                pattern_id="INJ-010",
                category="injection",
                severity=Severity.WARNING,
                message="Substitution d'homoglyphes Unicode détectée (scripts mixtes dans un même mot)",
                matched_text=word,
            )
    return None


# ---------------------------------------------------------------------------
# Main scan function
# ---------------------------------------------------------------------------

def scan_input(user_input: str) -> InputGuardrailResult:
    """
    Scan a user input string for injection attacks, banned substance
    requests, regulatory evasion, and social engineering.

    Returns an InputGuardrailResult indicating whether the input is
    safe to pass to the LLM, along with any flags raised.

    This function is designed to be fast (regex only, no LLM call)
    and to minimize false positives on legitimate agricultural queries.
    """
    if not user_input or not user_input.strip():
        return InputGuardrailResult(is_safe=True, severity=Severity.INFO)

    flags: list[InputFlag] = []

    # 1. Pattern-based detection
    for pattern_id, category, severity, regex, message in ALL_PATTERNS:
        match = re.search(regex, user_input, re.IGNORECASE | re.DOTALL)
        if match:
            flags.append(InputFlag(
                pattern_id=pattern_id,
                category=category,
                severity=severity,
                message=message,
                matched_text=match.group(0),
            ))

    # 2. Banned substance detection
    flags.extend(_check_banned_substances(user_input))

    # 3. Homoglyph evasion detection
    homoglyph = _detect_homoglyph_evasion(user_input)
    if homoglyph:
        flags.append(homoglyph)

    # 4. Determine overall result
    if not flags:
        return InputGuardrailResult(is_safe=True, severity=Severity.INFO)

    severities = [f.severity for f in flags]
    max_severity = max(severities, key=lambda s: list(Severity).index(s))
    is_safe = max_severity != Severity.CRITICAL

    refusal_message = None
    if not is_safe:
        critical_flags = [f for f in flags if f.severity == Severity.CRITICAL]
        reasons = "; ".join(f.message for f in critical_flags[:3])
        refusal_message = (
            "⛔ Votre demande a été bloquée par le système de sécurité agronomique AgriGuide.\n\n"
            f"**Raison** : {reasons}\n\n"
            "Cette plateforme ne peut pas fournir de conseils sur l'utilisation de substances "
            "interdites, le contournement de réglementations agricoles, ou toute action pouvant "
            "mettre en danger la santé humaine, animale ou l'environnement.\n\n"
            "Si vous pensez que cette détection est une erreur, reformulez votre question "
            "de manière informative (ex. : « Pourquoi l'atrazine est-elle interdite ? » "
            "au lieu de « Comment utiliser l'atrazine ? »)."
        )

    logger.info(
        "Input scan: safe=%s severity=%s flags=%d input_preview='%s'",
        is_safe, max_severity.value, len(flags), user_input[:80],
    )

    return InputGuardrailResult(
        is_safe=is_safe,
        severity=max_severity,
        flags=flags,
        refusal_message=refusal_message,
    )
