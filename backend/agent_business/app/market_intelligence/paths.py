"""Resolve shared market data directories (Agreste CSVs + FranceAgriMer PDFs)."""

from __future__ import annotations

import os
from pathlib import Path

# backend/agent_business/app/market_intelligence/paths.py → repo root = parents[4]
def _repo_root_or_workdir() -> Path:
    """Find the repository root without assuming a fixed parent depth.

    In Docker this module lives below /app, where parents[4] does not exist.
    Mounted MARKET_DATA_DIR values remain the primary source of market data.
    """
    module_path = Path(__file__).resolve()
    for parent in module_path.parents:
        if (parent / "data").is_dir() and (parent / "backend").is_dir():
            return parent
    return Path.cwd()


_REPO_ROOT = _repo_root_or_workdir()
_DEFAULT_DATA = _REPO_ROOT / "data"


def resolve_market_data_dir() -> Path | None:
    """
    Folder containing FDS_IPPAP_*.csv and/or FranceAgriMer_*.pdf.

    Priority:
      1. MARKET_DATA_DIR
      2. AGRESTE_DATA_DIR (docker-compose historically)
      3. repo ./data
      4. /data/agreste (docker mount)
    """
    candidates: list[Path] = []
    for env_key in ("MARKET_DATA_DIR", "AGRESTE_DATA_DIR", "FRANCEAGRIMER_PDF_DIR"):
        raw = os.environ.get(env_key)
        if raw:
            candidates.append(Path(raw))
    candidates.extend([_DEFAULT_DATA, Path("/data/agreste"), Path("/data/market")])

    seen: set[Path] = set()
    for d in candidates:
        try:
            resolved = d.resolve()
        except OSError:
            resolved = d
        if resolved in seen:
            continue
        seen.add(resolved)
        if not resolved.exists() or not resolved.is_dir():
            continue
        has_csv = any(resolved.glob("FDS_IPPAP_*.csv")) or any(resolved.glob("*.csv"))
        has_pdf = any(resolved.glob("*.pdf"))
        if has_csv or has_pdf:
            return resolved
    return None


def list_ippap_csvs(data_dir: Path | None = None) -> list[Path]:
    root = data_dir or resolve_market_data_dir()
    if root is None:
        return []
    files = sorted(root.glob("FDS_IPPAP_*.csv"))
    return files or sorted(root.glob("*.csv"))


def list_market_pdfs(data_dir: Path | None = None) -> list[Path]:
    root = data_dir or resolve_market_data_dir()
    if root is None:
        return []
    return sorted(root.glob("*.pdf"))
