"""Evaluate the agriculture report numeric audit with controlled injections."""
import argparse
import json
import random
import re
from dataclasses import dataclass, field

import pandas as pd

_NUMBER_PATTERN = re.compile(
    r"\d+(?:[.,]\d+)?\s*(?:%|°c|mm|kg|ha|g/kg|kg/ha|kg/n|n/ha)?",
    re.IGNORECASE,
)
_TOLERANCE_ABS = 0.05
_TOLERANCE_REL = 0.01


def _parse_number_token(tok: str) -> float | None:
    digits_part = re.match(r"\d+(?:[.,]\d+)?", tok.strip())
    if not digits_part:
        return None
    return float(digits_part.group().replace(",", "."))


def _values_match(a: float, b: float) -> bool:
    if abs(a - b) <= _TOLERANCE_ABS:
        return True
    if b != 0 and abs(a - b) / abs(b) <= _TOLERANCE_REL:
        return True
    return False


def _collect_source_values(synthesis, parcel) -> set[float]:
    values = set()
    searchable_text = json.dumps(synthesis.soil_summary, ensure_ascii=False)
    searchable_text += json.dumps(synthesis.weather_summary, ensure_ascii=False)
    searchable_text += json.dumps(synthesis.weather_stats, ensure_ascii=False)
    searchable_text += json.dumps(synthesis.vegetation_summary, ensure_ascii=False)
    searchable_text += json.dumps(synthesis.dl_observation_summary, ensure_ascii=False)
    searchable_text += json.dumps(synthesis.agro_calc_summary, ensure_ascii=False)
    searchable_text += json.dumps(synthesis.yield_summary, ensure_ascii=False)
    searchable_text += json.dumps(
        [c.model_dump() for c in synthesis.crop_recommendations], ensure_ascii=False
    )
    searchable_text += json.dumps(synthesis.grounded_claims, ensure_ascii=False)
    if synthesis.dl_mismatch_note:
        searchable_text += synthesis.dl_mismatch_note
    if parcel.area_ha is not None:
        searchable_text += json.dumps({"area_ha": parcel.area_ha, "area_m2": parcel.area_m2})

    for match in _NUMBER_PATTERN.finditer(searchable_text):
        val = _parse_number_token(match.group())
        if val is not None:
            values.add(val)
    for rec in synthesis.crop_recommendations:
        values.add(round(rec.suitability_score * 100))
    if synthesis.dl_observation_summary.get("confidence") is not None:
        values.add(round(synthesis.dl_observation_summary["confidence"] * 100))
    return values


def _audit_report_numbers(report_text: str, synthesis, parcel) -> list[str]:
    source_values = _collect_source_values(synthesis, parcel)
    unverified = []
    for match in _NUMBER_PATTERN.finditer(report_text):
        tok = match.group().strip()
        if not any(c.isalpha() or c in "%,." for c in tok):
            continue
        val = _parse_number_token(tok)
        if val is not None and not any(_values_match(val, sv) for sv in source_values):
            unverified.append(tok)
    return sorted(set(unverified))


@dataclass
class CropRec:
    name: str
    suitability_score: float

    def model_dump(self):
        return {"name": self.name, "suitability_score": self.suitability_score}


@dataclass
class Synthesis:
    soil_summary: dict
    weather_summary: dict
    weather_stats: dict
    vegetation_summary: dict
    dl_observation_summary: dict
    agro_calc_summary: dict
    yield_summary: dict
    crop_recommendations: list
    grounded_claims: list
    dl_mismatch_note: str | None = None


@dataclass
class Parcel:
    area_ha: float
    area_m2: float


def frnum(value, decimals=1):
    return f"{value:.{decimals}f}".replace(".", ",")


def make_case(rng: random.Random):
    area_ha = round(rng.uniform(1.5, 12.0), 2)
    ph = round(rng.uniform(5.5, 7.8), 1)
    nitrogen = round(rng.uniform(0.8, 2.5), 1)
    organic_c = round(rng.uniform(8.0, 20.0), 1)
    mean_temp = round(rng.uniform(9.0, 18.0), 1)
    min_temp = round(mean_temp - rng.uniform(5, 12), 1)
    max_temp = round(mean_temp + rng.uniform(8, 16), 1)
    total_precip = round(rng.uniform(150, 550), 1)
    rainy_days = rng.randint(15, 55)
    ndvi = round(rng.uniform(0.3, 0.85), 2)
    crop_name = rng.choice(["blé", "orge", "colza", "maïs", "tournesol"])
    confidence = round(rng.uniform(0.55, 0.95), 2)
    n_dose = round(rng.uniform(80, 200), 1)
    irrigation_need = round(rng.uniform(10, 45), 1)
    irrigation_window = rng.choice([5, 7, 10, 14])
    yield_est = round(rng.uniform(35, 90), 1)
    yield_low = round(yield_est * 0.85, 1)
    yield_high = round(yield_est * 1.15, 1)
    score = round(rng.uniform(0.5, 0.95), 2)
    parcel = Parcel(area_ha, round(area_ha * 10000))
    synthesis = Synthesis(
        {"ph": ph, "nitrogen_g_kg": nitrogen, "organic_carbon_g_kg": organic_c},
        {"source": "open-meteo"},
        {"mean_temp_c": mean_temp, "min_temp_c": min_temp, "max_temp_c": max_temp,
         "total_precip_mm": total_precip, "rainy_days_count": rainy_days},
        {"mean_ndvi": ndvi, "source": "sentinel-hub"},
        {"predicted_class_fr": crop_name, "confidence": confidence, "source": "dl"},
        {"n_dose_kg_ha": n_dose, "irrigation_need_mm": irrigation_need,
         "irrigation_window_days": irrigation_window},
        {"yield_estimate_q_ha": yield_est, "yield_range_low_q_ha": yield_low,
         "yield_range_high_q_ha": yield_high},
        [CropRec(crop_name, score)], [{"claim": "Exemple", "source_chunk_id": "chunk_1"}],
    )
    report = f"""## Parcelle
Cette parcelle couvre {frnum(area_ha, 2)} hectares.
## Sol
- pH : {frnum(ph)}
- Azote : {frnum(nitrogen)} g/kg
- Carbone organique : {frnum(organic_c)} g/kg
## Météo
- Température moyenne : {frnum(mean_temp)}°C
- Température minimale : {frnum(min_temp)}°C
- Température maximale : {frnum(max_temp)}°C
- Précipitations totales : {frnum(total_precip)} mm
- Jours de pluie : {rainy_days}
## Végétation
- NDVI moyen : {frnum(ndvi, 2)}
- Confiance : {round(confidence * 100)}%
## Cultures
- Score : {round(score * 100)}%
## Rendement
- Rendement estimé : {frnum(yield_est)} q/ha ({frnum(yield_low)} - {frnum(yield_high)} q/ha)
## Fertilisation et irrigation
- Dose d'azote : {frnum(n_dose)} kg N/ha
- Besoin d'irrigation ({irrigation_window} jours) : {frnum(irrigation_need)} mm
"""
    return parcel, synthesis, report


def _find_replaceable_matches(report_text):
    return [m for m in _NUMBER_PATTERN.finditer(report_text)
            if any(c.isalpha() or c in "%,." for c in m.group().strip())]


def _replace_number(report_text, match, value):
    token = match.group().strip()
    number = re.match(r"[\d.,]+", token)
    suffix = token[len(number.group()):] if number else ""
    replacement = frnum(value) + suffix
    return report_text[:match.start()] + replacement + report_text[match.end():], replacement.strip()


def inject_existence_errors(report_text, source_values, count, rng, excluded_indices=None):
    """Use fixed offsets, independent of the audit's matching predicate."""
    matches = _find_replaceable_matches(report_text)
    excluded_indices = excluded_indices or set()
    available_indices = [index for index in range(len(matches)) if index not in excluded_indices]
    chosen = sorted(
        (matches[index] for index in rng.sample(available_indices, min(count, len(available_indices)))),
        key=lambda m: m.start(),
        reverse=True,
    )
    injected = []
    for match in chosen:
        current = _parse_number_token(match.group())
        value = round(current + 500 + (len(injected) * 100), 1)
        report_text, replacement = _replace_number(report_text, match, value)
        injected.append(replacement)
    return report_text, injected


def inject_noise(report_text, count, rng):
    """Add plausible display/rounding artifacts without consulting source values.

    One small offset is normally within tolerance; a larger rounding artifact
    should become a false positive. This gives precision a real noise source.
    """
    matches = _find_replaceable_matches(report_text)
    chosen_indices = rng.sample(range(len(matches)), min(count, len(matches)))
    chosen = sorted((matches[index] for index in chosen_indices), key=lambda m: m.start(), reverse=True)
    for index, match in enumerate(chosen):
        current = _parse_number_token(match.group())
        value = round(current + (0.01 if index % 2 == 0 else 0.2), 2)
        report_text, _ = _replace_number(report_text, match, value)
    return report_text, set(chosen_indices)


def inject_semantic_errors(report_text, source_values, count, rng):
    matches = sorted(rng.sample(_find_replaceable_matches(report_text),
                                min(count, len(_find_replaceable_matches(report_text)))),
                     key=lambda m: m.start(), reverse=True)
    injected = []
    for match in matches:
        current = _parse_number_token(match.group())
        candidates = [value for value in source_values if not _values_match(value, current)]
        if candidates:
            value = rng.choice(candidates)
            report_text, replacement = _replace_number(report_text, match, value)
            injected.append(replacement)
    return report_text, injected


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--n-cases", type=int, default=10)
    parser.add_argument("--existence-errors-per-case", type=int, default=3)
    parser.add_argument("--semantic-errors-per-case", type=int, default=2)
    parser.add_argument("--noise-per-case", type=int, default=2)
    parser.add_argument("--out", default="audit_eval_results.csv")
    args = parser.parse_args()
    rng = random.Random(args.seed)
    baseline_flags = 0
    exist_tp = exist_injected = exist_flags = 0
    noise_false_positives = 0
    noise_injected = 0
    existence_injected_cases = 0
    overlap_count = 0
    semantic_tp = semantic_injected = 0

    for _ in range(args.n_cases):
        parcel, synthesis, clean = make_case(rng)
        source_values = _collect_source_values(synthesis, parcel)
        baseline_flags += len(_audit_report_numbers(clean, synthesis, parcel))
        noisy, noise_indices = inject_noise(clean, args.noise_per_case, rng)
        noise_injected += len(noise_indices)
        noise_flags = _audit_report_numbers(noisy, synthesis, parcel)
        noise_false_positives += len(noise_flags)
        corrupted, injected = inject_existence_errors(
            noisy, source_values, args.existence_errors_per_case, rng, noise_indices
        )
        if len(injected) == args.existence_errors_per_case:
            existence_injected_cases += 1
        flags = _audit_report_numbers(corrupted, synthesis, parcel)
        exist_injected += len(injected)
        exist_flags += len(flags)
        exist_tp += sum(token in flags for token in injected)
        corrupted, injected = inject_semantic_errors(clean, source_values, args.semantic_errors_per_case, rng)
        flags = _audit_report_numbers(corrupted, synthesis, parcel)
        semantic_injected += len(injected)
        semantic_tp += sum(token in flags for token in injected)

    recall = exist_tp / exist_injected if exist_injected else float("nan")
    precision = exist_tp / exist_flags if exist_flags else float("nan")
    noisy_precision = exist_tp / (exist_tp + noise_false_positives) if exist_tp else float("nan")
    semantic_recall = semantic_tp / semantic_injected if semantic_injected else float("nan")
    print(f"Cases: {args.n_cases} (seed={args.seed})")
    print(f"Baseline false positives: {baseline_flags} ({baseline_flags / args.n_cases:.2f} per report)")
    print(f"Existence injection: injected={exist_injected} caught={exist_tp} total_flags={exist_flags}")
    print(f"  Recall={recall:.3f} Precision={precision:.3f}")
    print(f"Noise false positives: {noise_false_positives} across {args.n_cases} reports")
    print(f"Noise injected: {noise_injected}; existence/noise overlaps: {overlap_count}")
    print(f"Cases with full disjoint injection counts: {existence_injected_cases}/{args.n_cases}")
    print(f"  Precision with injected noise={noisy_precision:.3f}")
    print(f"Semantic mismatch: injected={semantic_injected} caught={semantic_tp}")
    print(f"  Recall={semantic_recall:.3f}")
    pd.DataFrame([
        {"Metric": "Recall (existence-based injected errors caught)", "Value": round(recall, 3)},
        {"Metric": "Precision (flagged figures that were genuinely injected)", "Value": round(precision, 3)},
        {"Metric": "Noise false positives (plausible rounding artifacts)", "Value": noise_false_positives},
        {"Metric": "Noise figures injected", "Value": noise_injected},
        {"Metric": "Existence/noise position overlaps", "Value": overlap_count},
        {"Metric": "Precision with plausible noise", "Value": round(noisy_precision, 3)},
        {"Metric": "Baseline false-positive rate (per clean report)", "Value": round(baseline_flags / args.n_cases, 3)},
        {"Metric": "Recall on semantic-mismatch errors (documented limitation)", "Value": round(semantic_recall, 3)},
    ]).to_csv(args.out, index=False)
    print(f"Saved to {args.out}")


if __name__ == "__main__":
    main()
