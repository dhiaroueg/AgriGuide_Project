"""Schémas Pydantic pour les échanges de type question/réponse avec l'agent."""

from typing import Optional
from pydantic import BaseModel, Field


class ChatHistoryMessage(BaseModel):
    """Un message de l'historique de conversation."""
    role: str  # "user" | "bot"
    text: str


class ChatRequest(BaseModel):
    """Question posée par l'utilisateur à l'agent."""

    question: str
    history: list[ChatHistoryMessage] = Field(default_factory=list)
    memories: list[str] = Field(default_factory=list)


class ChatResponse(BaseModel):
    """Réponse reformulée par l'agent."""

    answer: str
