#!/usr/bin/env python3
"""Start every AgriGuide backend agent with the shared project venv.

Usage (from repo root, after setup):

    python scripts/run_backend.py
    python scripts/run_backend.py --with-db
    python scripts/run_backend.py --only auth,business

Ctrl+C stops all agents.
"""
from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

# name, working directory (relative to ROOT), ASGI app, port
SERVICES: list[tuple[str, str, str, int]] = [
    ("regulation", "backend/agent_regulation", "app.main:app", 8005),
    ("agriculture", "backend/agent_agriculture", "app.main:app", 8002),
    ("business", "backend/agent_business", "app.main:app", 8000),
    ("waste", "backend/waste_agents", "api.main:app", 8004),
    ("monitoring", "backend/agent_monitoring", "app.main:app", 8003),
    ("auth", "backend/auth", "app.main:app", 8001),
    ("weather", "backend/agent_weather", "app.main:app", 8006),
    ("trading", "backend/agent_trading", "app.main:app", 8007),
    ("insects", "backend/agent_insects", "app.main:app", 8009),
    ("orchestrator", "backend/orchestrator", "app.main:app", 8008),
]


def _venv_python() -> Path:
    if os.name == "nt":
        return ROOT / ".venv" / "Scripts" / "python.exe"
    return ROOT / ".venv" / "bin" / "python"


def _load_dotenv() -> dict[str, str]:
    env = os.environ.copy()
    dotenv_path = ROOT / ".env"
    if not dotenv_path.is_file():
        return env
    for raw in dotenv_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        env.setdefault(key, value)
    return env


def _local_database_url(env: dict[str, str]) -> dict[str, str]:
    """Rewrite Docker hostname `db` → localhost:5434 for host-run uvicorn."""
    url = env.get("DATABASE_URL", "")
    if "@db:" in url or "@db/" in url:
        env["DATABASE_URL"] = (
            "postgresql://agriadvisor:changeme@localhost:5434/agriadvisor"
        )
    env.setdefault(
        "DATABASE_URL",
        "postgresql://agriadvisor:changeme@localhost:5434/agriadvisor",
    )
    return env


def _ensure_db() -> None:
    print("--> docker compose up -d db")
    subprocess.run(
        ["docker", "compose", "up", "-d", "db"],
        cwd=ROOT,
        check=False,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Run AgriGuide backend agents")
    parser.add_argument(
        "--with-db",
        action="store_true",
        help="Start PostgreSQL via docker compose before agents",
    )
    parser.add_argument(
        "--only",
        type=str,
        default="",
        help="Comma-separated service names (default: all)",
    )
    parser.add_argument(
        "--no-reload",
        action="store_true",
        help="Disable uvicorn --reload",
    )
    args = parser.parse_args()

    py = _venv_python()
    if not py.is_file():
        print(
            "Shared venv not found. From the repo root run:\n"
            "  python -m venv .venv\n"
            "  .\\.venv\\Scripts\\python.exe -m pip install -r requirements.txt\n"
            "  # optional ML: .\\.venv\\Scripts\\python.exe -m pip install -r requirements-ml.txt",
            file=sys.stderr,
        )
        return 1

    selected = {s.strip().lower() for s in args.only.split(",") if s.strip()}
    services = [
        s for s in SERVICES if not selected or s[0] in selected
    ]
    if not services:
        print(f"No matching services. Choose from: {', '.join(n for n, *_ in SERVICES)}")
        return 1

    if args.with_db:
        _ensure_db()
        time.sleep(2)

    env = _local_database_url(_load_dotenv())
    procs: list[subprocess.Popen] = []

    def stop(_signum=None, _frame=None) -> None:
        for proc in procs:
            if proc.poll() is None:
                proc.terminate()
        for proc in procs:
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()

    signal.signal(signal.SIGINT, stop)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, stop)

    print("AgriGuide backend")
    for name, rel_dir, app, port in services:
        cwd = ROOT / rel_dir
        cmd = [
            str(py),
            "-m",
            "uvicorn",
            app,
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ]
        if not args.no_reload:
            cmd.append("--reload")
        print(f"  • {name:<12} http://127.0.0.1:{port}  ({rel_dir})")
        procs.append(
            subprocess.Popen(
                cmd,
                cwd=cwd,
                env=env,
            )
        )

    print("\nCtrl+C to stop all agents.\n")
    try:
        while True:
            alive = [p for p in procs if p.poll() is None]
            if not alive:
                break
            time.sleep(0.5)
    except KeyboardInterrupt:
        stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
