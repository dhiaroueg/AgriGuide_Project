from typing import Any, Optional, TypedDict, Literal, Annotated
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from app.models.schemas import AnalyzeRequest, AnalyzeResponse, AnalysisResult, WeatherSummary
from app.services.mistral_service import run_mistral_analysis
from app.services.weather_service import fetch_weather_summary


class AgentState(TypedDict):
    request: AnalyzeRequest
    weather_data: Optional[WeatherSummary]
    analysis: Optional[AnalysisResult]
    error: Optional[str]
    messages: Annotated[list, add_messages]
    next_action: Literal["continue", "handoff_agriculture", "handoff_regulation", "complete"]
    handoff_reason: Optional[str]
    handoff_to: Optional[str]


def fetch_weather_node(state: AgentState) -> AgentState:
    if state.get("error"):
        return state
    req = state["request"]
    weather = fetch_weather_summary(
        latitude=req.location.latitude,
        longitude=req.location.longitude,
        location_label=req.location.label,
    )
    
    # Add weather analysis message
    weather_message = f"""Analyse météo pour {req.location.label} :
- Température actuelle : {weather.temperature_2m}°C
- Conditions : {weather.weather_label}
- Précipitations : {weather.precipitation} mm
- Humidité : {weather.relative_humidity_2m}%
- Vitesse du vent : {weather.wind_speed_10m} m/s"""
    
    messages = state.get("messages", [])
    messages.append(AIMessage(content=weather_message))
    
    return {**state, "weather_data": weather, "messages": messages}


def mistral_reasoning_node(state: AgentState) -> AgentState:
    if state.get("error"):
        return state
    req = state["request"]
    weather = state["weather_data"]
    if weather is None:
        return {**state, "error": "Données météo manquantes."}
    try:
        analysis = run_mistral_analysis(req, weather)
        
        # Add analysis message
        analysis_message = f"""Analyse de monitoring pour {req.farmer_name} :
- Cultures surveillées : {', '.join(req.crops)}
- Alertes actives : {len(analysis.alerts) if analysis.alerts else 0}
- Recommandations : {len(analysis.recommendations) if analysis.recommendations else 0}
- Statut global : {analysis.overall_status}"""
        
        messages = state.get("messages", [])
        messages.append(AIMessage(content=analysis_message))
        
        return {**state, "analysis": analysis, "messages": messages}
    except Exception as exc:  # noqa: BLE001 — surface as agent error
        return {**state, "error": f"Analyse Mistral échouée: {exc}"}


def determine_handoff(state: AgentState) -> AgentState:
    """
    Agent self-selection: determine if handoff to another agent is needed.
    Implements rule-based transitions based on monitoring analysis.
    """
    messages = state.get("messages", [])
    last_message = messages[-1] if messages else None
    message_content = last_message.content if hasattr(last_message, 'content') else str(last_message) if last_message else ""
    
    handoff_decision = {
        "next_action": "complete",
        "handoff_reason": None,
        "handoff_to": None
    }
    
    # Check if agriculture handoff is needed (crop health, treatment recommendations)
    if any(keyword in message_content.lower() for keyword in ["culture", "traitement", "maladie", "ravageur", "santé"]):
        handoff_decision.update({
            "next_action": "handoff_agriculture",
            "handoff_reason": "Monitoring alert requires crop-specific treatment or health analysis",
            "handoff_to": "agriculture_agent"
        })
    
    # Check if regulation handoff is needed (compliance issues, reporting requirements)
    elif any(keyword in message_content.lower() for keyword in ["conformité", "déclaration", "norme", "réglementation"]):
        handoff_decision.update({
            "next_action": "handoff_regulation",
            "handoff_reason": "Monitoring involves compliance or regulatory reporting",
            "handoff_to": "regulation_agent"
        })
    
    return {**state, **handoff_decision}


def build_monitoring_graph():
    """
    Build the monitoring agent graph with dynamic handoff capabilities.
    
    This graph implements:
    - Agent self-selection via determine_handoff
    - Rule-based transitions for dynamic routing
    - Integration with existing monitoring services
    """
    workflow = StateGraph(AgentState)
    workflow.add_node("fetch_weather", fetch_weather_node)
    workflow.add_node("mistral_reasoning", mistral_reasoning_node)
    workflow.add_node("handoff_decision", determine_handoff)
    
    workflow.add_edge(START, "fetch_weather")
    workflow.add_edge("fetch_weather", "mistral_reasoning")
    workflow.add_edge("mistral_reasoning", "handoff_decision")
    
    # Conditional routing based on handoff decision
    def route_after_handoff_decision(state: AgentState) -> str:
        return state.get("next_action", "complete")
    
    workflow.add_conditional_edges(
        "handoff_decision",
        route_after_handoff_decision,
        {
            "continue": "fetch_weather",  # Continue monitoring
            "handoff_agriculture": "handoff_agriculture",
            "handoff_regulation": "handoff_regulation",
            "complete": END
        }
    )
    
    # Add placeholder nodes for handoff targets
    workflow.add_node("handoff_agriculture", lambda state: state)
    workflow.add_node("handoff_regulation", lambda state: state)
    
    workflow.add_edge("handoff_agriculture", END)
    workflow.add_edge("handoff_regulation", END)
    
    return workflow.compile()


monitoring_agent = build_monitoring_graph()


def run_analysis(request: AnalyzeRequest) -> AnalyzeResponse:
    initial: AgentState = {
        "request": request,
        "weather_data": None,
        "analysis": None,
        "error": None,
    }
    result: dict[str, Any] = monitoring_agent.invoke(initial)
    if result.get("error"):
        raise RuntimeError(result["error"])

    weather: WeatherSummary = result["weather_data"]
    analysis: AnalysisResult = result["analysis"]
    return AnalyzeResponse(
        farmer_name=request.farmer_name,
        location=request.location.label,
        terrain_id=request.terrain_id,
        crops=request.crops,
        weather_summary=weather,
        analysis=analysis,
    )
