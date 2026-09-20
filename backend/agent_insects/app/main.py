"""
FastAPI application for the AgriGuide Insect Detection Agent (Port 8009).
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="AgriAdvisor — Agent Insectes",
    description="Détection d'insectes et création de cartes d'alerte avec LangGraph",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"service": "insect_detection", "status": "online", "port": 8009}


@app.get("/health")
def health():
    return {"status": "ok", "agent": "insect_detection"}


@app.post("/detect")
def detect_insects(query: str):
    """Detect insects and create alert maps using LangGraph."""
    from app.agent.insect_graph import run_insect_agent
    
    result = run_insect_agent(query)
    
    return {
        "query": query,
        "insect_detected": result.get("insect_detection"),
        "alert_map": result.get("alert_map_data"),
        "severity": result.get("severity_level"),
        "handoff_decision": {
            "action": result.get("next_action"),
            "reason": result.get("handoff_reason"),
            "target": result.get("handoff_to")
        }
    }