"""
FastAPI application for the AgriGuide Multi-Agent Orchestrator (Port 8008).
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.services.pipeline_service import (
    PipelineQueryRequest,
    PipelineExecutionResponse,
    execute_pipeline,
)

app = FastAPI(
    title="AgriGuide Multi-Agent Orchestrator",
    description="Superviseur et pipeline décisionnel complet pour l'exploitation agricole.",
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
    return {"service": "orchestrator", "status": "online", "port": 8008}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/orchestrate/pipeline", response_model=PipelineExecutionResponse)
def run_pipeline(req: PipelineQueryRequest):
    """Execute the multi-agent decision pipeline using LangGraph dynamic control shifts."""
    from app.services.pipeline_service import execute_langgraph_pipeline, execute_pipeline
    # For now, use the legacy pipeline until LangGraph imports are properly configured
    return execute_pipeline(req)


@app.post("/orchestrate/pipeline/legacy", response_model=PipelineExecutionResponse)
def run_legacy_pipeline(req: PipelineQueryRequest):
    """Execute the legacy sequential pipeline (for comparison/fallback)."""
    from app.services.pipeline_service import execute_pipeline
    return execute_pipeline(req)
