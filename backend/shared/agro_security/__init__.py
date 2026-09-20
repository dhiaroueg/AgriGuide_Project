"""
AgroLLM-Sec — Agro-Security & LLM Safety Guardrails for AgriGuide.

Three-module safety framework:
  - guardrail_input:  Input prompt injection & malicious context filter
  - guardrail_output: Agronomic output safety validator (LLM response firewall)
  - benchmark_runner: Automated safety & robustness benchmark suite

Designed to complement AgriGuide's existing safety architecture:
  - Deterministic agro-calc formulas (COMIFER / FAO-56) in agro_calc_service.py
  - Three-layer grounding defense in synthesis_service.py
  - Regulatory dose caps (_MAX_REALISTIC_DOSE_KG_HA)
  - RAGAS faithfulness benchmarks
"""

try:
    from .guardrail_input import scan_input
    from .guardrail_output import validate_output
    from .models import (
        InputGuardrailResult,
        OutputGuardrailResult,
        SafetyViolation,
        Severity,
    )
except ImportError:
    from shared.agro_security.guardrail_input import scan_input
    from shared.agro_security.guardrail_output import validate_output
    from shared.agro_security.models import (
        InputGuardrailResult,
        OutputGuardrailResult,
        SafetyViolation,
        Severity,
    )
