"""Import one auditable weekly FranceAgriMer RNM PDF into the local cache.

Set FRANCEAGRIMER_RNM_REPORT_URL to the public PDF URL. The script refuses
anything other than a PDF and preserves the source URL, SHA-256 and import time.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from pypdf import PdfReader

REPO_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(REPO_ROOT / ".env")

URL = os.environ.get("FRANCEAGRIMER_RNM_REPORT_URL", "")
OUT = Path(__file__).resolve().parent.parent / "data" / "franceagrimer_physical_quotes.json"


def parse_prices(text: str) -> dict[str, float]:
    match = re.search(r"CEREALES\s+Sem\s+\d+\s+Sem\s+\d+.*?Source\s*:\s*Les March", text, re.S | re.I)
    if not match:
        raise ValueError("FranceAgriMer cereal table not found in PDF.")
    values = re.findall(r"(?:€|�)/t\s+(?:nc\s+)?([0-9 ]+(?:,[0-9]+)?)", match.group(0))
    if len(values) < 4:
        raise ValueError("FranceAgriMer cereal table has fewer than four prices.")
    convert = lambda v: float(v.replace(" ", "").replace(",", "."))
    # Official table order: wheat, durum wheat, feed barley, maize.
    return {"EBM": convert(values[0]), "EOR": convert(values[2]), "EMA": convert(values[3])}


def parse_publication_date(text: str) -> str:
    match = re.search(r"(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+(\d{1,2})\s+([a-zéû]+)\s+(\d{4})", text, re.I)
    months = {"janvier": 1, "février": 2, "fevrier": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6, "juillet": 7, "août": 8, "aout": 8, "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12, "decembre": 12}
    if not match or match.group(2).lower() not in months:
        raise ValueError("FranceAgriMer publication date not found in PDF.")
    return datetime(int(match.group(3)), months[match.group(2).lower()], int(match.group(1)), tzinfo=timezone.utc).isoformat()


def main() -> None:
    if not URL.startswith("https://"):
        raise ValueError("FRANCEAGRIMER_RNM_REPORT_URL must be an HTTPS URL.")
    with urllib.request.urlopen(URL, timeout=30) as response:
        raw = response.read()
    if not raw.startswith(b"%PDF"):
        raise ValueError("Source is not a PDF; refusing to import it.")
    tmp = OUT.with_suffix(".pdf")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    tmp.write_bytes(raw)
    try:
        text = "\n".join(page.extract_text() or "" for page in PdfReader(str(tmp)).pages)
    finally:
        tmp.unlink(missing_ok=True)
    prices = parse_prices(text)
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "source_name": "FranceAgriMer RNM / Les Marchés",
        "source_url": URL,
        "imported_at": now,
        "observed_at": parse_publication_date(text),
        "report_sha256": hashlib.sha256(raw).hexdigest(),
        "quotes": {symbol: {"price_eur_ton": value, "contract_or_location": "physical weekly quotation"} for symbol, value in prices.items()},
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Imported {len(prices)} FranceAgriMer physical quotes into {OUT}")


if __name__ == "__main__":
    main()
