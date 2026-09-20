"""
Pydantic schemas for the AgroLLM-Sec safety guardrail system.

These models are used by guardrail_input.py, guardrail_output.py,
and benchmark_runner.py — kept in one place so all three modules
share the same data contracts.
"""
from __future__ import annotations

from enum import Enum
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Severity levels
# ---------------------------------------------------------------------------

class Severity(str, Enum):
    """Severity classification for safety flags and violations."""
    INFO = "info"           # Suspicious but likely benign — logged only
    WARNING = "warning"     # Probable issue — flagged, response may proceed with annotation
    CRITICAL = "critical"   # Clear malicious intent or dangerous advice — blocked


# ---------------------------------------------------------------------------
# Module A — Input Guardrail
# ---------------------------------------------------------------------------

class InputFlag(BaseModel):
    """A single flag raised by the input guardrail."""
    pattern_id: str = Field(..., description="Unique identifier for the detection pattern that fired")
    category: str = Field(..., description="Category: 'injection', 'banned_substance', 'regulatory_evasion', 'social_engineering'")
    severity: Severity
    message: str = Field(..., description="Human-readable explanation of what was detected")
    matched_text: str | None = Field(None, description="The exact substring that triggered the flag")


class InputGuardrailResult(BaseModel):
    """Result of scanning a user input through the input guardrail."""
    is_safe: bool = Field(..., description="True if no CRITICAL flags were raised")
    severity: Severity = Field(Severity.INFO, description="Highest severity among all flags")
    flags: list[InputFlag] = Field(default_factory=list)
    sanitized_input: str | None = Field(None, description="Cleaned input with injection payloads neutralized (None if safe)")
    refusal_message: str | None = Field(None, description="Pre-written safe refusal message if blocked")


# ---------------------------------------------------------------------------
# Module B — Output Guardrail
# ---------------------------------------------------------------------------

class SafetyViolation(BaseModel):
    """A single safety violation detected in an LLM-generated output."""
    violation_type: str = Field(
        ...,
        description=(
            "Type: 'excessive_dose', 'banned_substance', 'wind_ban_spraying', "
            "'irrigation_overestimate', 'numeric_contradiction', 'ungrounded_claim'"
        ),
    )
    severity: Severity
    message: str = Field(..., description="Human-readable description of the violation")
    evidence: str | None = Field(None, description="The text fragment from the LLM output that triggered this")
    expected_value: str | None = Field(None, description="What the deterministic reference says (e.g. '95 kg N/ha')")
    actual_value: str | None = Field(None, description="What the LLM output stated (e.g. '250 kg N/ha')")
    recommendation: str = Field("", description="Suggested corrective action")


class OutputGuardrailResult(BaseModel):
    """Result of validating an LLM-generated output through the output guardrail."""
    is_safe: bool = Field(..., description="True if no CRITICAL violations were found")
    violations: list[SafetyViolation] = Field(default_factory=list)
    annotated_response: str | None = Field(
        None,
        description="Original response with inline warning markers appended (None if fully safe)",
    )
    safety_score: float = Field(
        1.0,
        description="0.0 (completely unsafe) to 1.0 (fully safe) — weighted by violation count and severity",
    )


# ---------------------------------------------------------------------------
# Module C — Benchmark
# ---------------------------------------------------------------------------

class SafetyTestCase(BaseModel):
    """A single test case in the safety benchmark suite."""
    id: str
    category: str = Field(
        ...,
        description=(
            "One of: 'prompt_injection', 'dangerous_agronomic', "
            "'legitimate_edge_case', 'output_safety'"
        ),
    )
    input_text: str = Field(..., description="The user prompt or LLM output to test")
    expected_safe: bool = Field(..., description="True if this input/output should pass the guardrail")
    expected_severity: Severity | None = Field(None, description="Expected severity if flagged")
    description: str = Field("", description="Human-readable explanation of what this test case validates")
    ground_truth_violation_type: str | None = Field(
        None, description="Expected violation type if output_safety category"
    )


class SafetyBenchmarkResult(BaseModel):
    """Aggregate results from a full benchmark run."""
    total_cases: int
    injection_detection_rate: float = Field(..., description="% of injection attempts correctly caught")
    false_positive_rate: float = Field(..., description="% of legitimate queries incorrectly flagged")
    dangerous_advice_block_rate: float = Field(..., description="% of unsafe outputs caught by Module B")
    banned_substance_detection_rate: float = Field(..., description="% of banned substance mentions caught")
    overall_safety_score: float = Field(..., description="Weighted composite score 0-100")
    details: list[dict] = Field(default_factory=list, description="Per-case pass/fail details")


class SafetyAuditReport(BaseModel):
    """Full audit report combining benchmark results and system metadata."""
    benchmark_result: SafetyBenchmarkResult
    timestamp: str
    agriguide_version: str = "1.0.0"
    modules_tested: list[str] = Field(
        default_factory=lambda: ["guardrail_input", "guardrail_output"]
    )
    report_markdown: str = Field("", description="Human-readable markdown report")
