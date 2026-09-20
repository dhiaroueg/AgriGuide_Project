"""
Insect Agent - LangGraph Implementation for Insect Detection and Alert Mapping

This agent handles insect detection, alert mapping, and dynamic handoffs
to agriculture and regulation agents for treatment recommendations.
"""
from typing import Any, Literal, TypedDict, Annotated
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_mistralai import ChatMistralAI
from langgraph.graph import END, StateGraph, START
from langgraph.graph.message import add_messages
import operator


class InsectState(TypedDict):
    """State specific to the insect agent."""
    messages: Annotated[list, add_messages]
    insect_detection: dict[str, Any] | None
    alert_map_data: dict[str, Any] | None
    severity_level: Literal["low", "moderate", "high", "critical"] | None
    treatment_recommendations: list[dict[str, Any]] | None
    next_action: Literal["continue", "handoff_agriculture", "handoff_regulation", "create_alert_map", "complete"]
    handoff_reason: str | None
    handoff_to: str | None


class InsectAgent:
    """Insect specialist with alert mapping capabilities."""
    
    def __init__(self, mistral_api_key: str):
        self.llm = ChatMistralAI(
            model="mistral-large-latest",
            api_key=mistral_api_key,
            temperature=0.3
        )
    
    def detect_insects(self, state: InsectState) -> InsectState:
        """Detect insects and analyze threat level."""
        last_message = state["messages"][-1] if state["messages"] else ""
        query = last_message.content if hasattr(last_message, 'content') else str(last_message)
        
        # Insect database with severity levels
        insect_database = {
            "Puceron cendré du colza": {
                "culture": "Colza d'Hiver",
                "agent_pathogène": "Brevicoryne brassicae",
                "severity": "moderate",
                "treatment_threshold": "10% de plantes colonisées",
                "recommended_action": "traitement insecticide ou introduction d'auxiliaires"
            },
            "Pyrale du maïs": {
                "culture": "Maïs Grain",
                "agent_pathogène": "Ostrinia nubilalis",
                "severity": "high",
                "treatment_threshold": "5% de plantes attaquées",
                "recommended_action": "traitement insecticide systémique"
            },
            "Rouille brune du blé": {
                "culture": "Blé Tendre",
                "agent_pathogène": "Puccinia triticina",
                "severity": "moderate",
                "treatment_threshold": "10% de surface foliaire atteinte",
                "recommended_action": "traitement fongicide préventif"
            }
        }
        
        # Detect insect from query
        detected_insect = None
        for insect_name, data in insect_database.items():
            if insect_name.lower() in query.lower() or data["agent_pathogène"].lower() in query.lower():
                detected_insect = {insect_name: data}
                break
        
        if detected_insect:
            insect_name = list(detected_insect.keys())[0]
            insect_data = detected_insect[insect_name]
            
            response = f"Détection d'insecte : {insect_name}\n- Culture cible : {insect_data['culture']}\n- Agent pathogène : {insect_data['agent_pathogène']}\n- Sévérité : {insect_data['severity']}\n- Seuil d'intervention : {insect_data['treatment_threshold']}\n- Action recommandée : {insect_data['recommended_action']}"
            
            return {
                **state,
                "messages": state["messages"] + [AIMessage(content=response)],
                "insect_detection": detected_insect,
                "severity_level": insect_data['severity'],
                "next_action": "create_alert_map"
            }
        else:
            return {
                **state,
                "messages": state["messages"] + [AIMessage(content="Aucun insecte détecté dans la requête.")],
                "insect_detection": None,
                "severity_level": None,
                "next_action": "complete"
            }
    
    def create_alert_map(self, state: InsectState) -> InsectState:
        """Create alert map with geographic distribution and severity zones."""
        if not state["insect_detection"]:
            return {**state, "next_action": "complete"}
        
        insect_name = list(state["insect_detection"].keys())[0]
        insect_data = state["insect_detection"][insect_name]
        severity = state["severity_level"]
        
        # Simulate alert map creation
        alert_map_data = {
            "insect": insect_name,
            "culture": insect_data['culture'],
            "severity_zones": {
                "zone_critique": f"0-5% de la surface - {severity} sévérité",
                "zone_alerte": f"5-15% de la surface - surveillance renforcée",
                "zone_surveillance": "15-30% de la surface - monitoring régulier"
            },
            "geographic_distribution": {
                "foci_centres": ["Parcelle Nord", "Zone humide"],
                "propagation_direction": "Nord-Est → Sud-Ouest",
                "risk_spread": "modéré"
            },
            "intervention_priority": self._calculate_priority(severity),
            "map_generated": True,
            "timestamp": "2026-09-01T21:30:00Z"
        }
        
        response = f"""Carte d'alerte générée pour {insect_name} :
🗺️ Zones de sévérité :
- 🔴 Zone critique : {alert_map_data['severity_zones']['zone_critique']}
- 🟡 Zone d'alerte : {alert_map_data['severity_zones']['zone_alerte']}
- 🟢 Zone surveillance : {alert_map_data['severity_zones']['zone_surveillance']}

📍 Distribution géographique :
- Foyers centraux : {', '.join(alert_map_data['geographic_distribution']['foci_centres'])}
- Direction propagation : {alert_map_data['geographic_distribution']['propagation_direction']}
- Risque propagation : {alert_map_data['geographic_distribution']['risk_spread']}

⚡ Priorité d'intervention : {alert_map_data['intervention_priority']}"""
        
        return {
            **state,
            "messages": state["messages"] + [AIMessage(content=response)],
            "alert_map_data": alert_map_data,
            "next_action": "continue"
        }
    
    def _calculate_priority(self, severity: str) -> str:
        """Calculate intervention priority based on severity."""
        priority_map = {
            "low": "Faible - Surveillance dans 3-5 jours",
            "moderate": "Modérée - Intervention recommandée sous 48h",
            "high": "Élevée - Intervention requise sous 24h",
            "critical": "Critique - Intervention immédiate requise"
        }
        return priority_map.get(severity, "Non définie")
    
    def determine_handoff(self, state: InsectState) -> InsectState:
        """
        Agent self-selection: determine if handoff to another agent is needed.
        """
        if not state["insect_detection"]:
            return {**state, "next_action": "complete", "handoff_reason": None, "handoff_to": None}
        
        severity = state["severity_level"]
        handoff_decision = {
            "next_action": "complete",
            "handoff_reason": None,
            "handoff_to": None
        }
        
        # High severity insects require agriculture agent for treatment
        if severity in ["high", "critical"]:
            handoff_decision.update({
                "next_action": "handoff_agriculture",
                "handoff_reason": f"Insecte de sévérité {severity} nécessite recommandations de traitement agricole",
                "handoff_to": "agriculture_agent"
            })
        # Moderate severity might need regulation check for approved treatments
        elif severity == "moderate":
            handoff_decision.update({
                "next_action": "handoff_regulation",
                "handoff_reason": "Vérification réglementaire des traitements approuvés pour cet insecte",
                "handoff_to": "regulation_agent"
            })
        
        return {**state, **handoff_decision}


def insect_detection_node(state: InsectState) -> InsectState:
    """Node for insect detection and analysis."""
    agent = InsectAgent(mistral_api_key="dummy_key")  # Replace with actual key
    return agent.detect_insects(state)


def alert_map_creation_node(state: InsectState) -> InsectState:
    """Node for alert map creation."""
    agent = InsectAgent(mistral_api_key="dummy_key")  # Replace with actual key
    return agent.create_alert_map(state)


def handoff_decision_node(state: InsectState) -> InsectState:
    """Node that determines if handoff to another agent is needed."""
    agent = InsectAgent(mistral_api_key="dummy_key")  # Replace with actual key
    return agent.determine_handoff(state)


def build_insect_graph() -> StateGraph:
    """
    Build the insect agent graph with alert mapping and dynamic handoffs.
    
    This graph implements:
    - Insect detection and analysis
    - Alert map creation with geographic distribution
    - Severity-based routing to agriculture/regulation agents
    """
    workflow = StateGraph(InsectState)
    
    # Add nodes
    workflow.add_node("insect_detection", insect_detection_node)
    workflow.add_node("alert_map_creation", alert_map_creation_node)
    workflow.add_node("handoff_decision", handoff_decision_node)
    
    # Define edges
    workflow.add_edge(START, "insect_detection")
    workflow.add_edge("insect_detection", "alert_map_creation")
    workflow.add_edge("alert_map_creation", "handoff_decision")
    
    # Conditional routing based on handoff decision
    def route_after_handoff_decision(state: InsectState) -> str:
        return state["next_action"]
    
    workflow.add_conditional_edges(
        "handoff_decision",
        route_after_handoff_decision,
        {
            "continue": "insect_detection",  # Continue with more detection
            "handoff_agriculture": "handoff_agriculture",
            "handoff_regulation": "handoff_regulation",
            "create_alert_map": "alert_map_creation",  # Regenerate map
            "complete": END
        }
    )
    
    # Add placeholder nodes for handoff targets
    workflow.add_node("handoff_agriculture", lambda state: state)
    workflow.add_node("handoff_regulation", lambda state: state)
    
    workflow.add_edge("handoff_agriculture", END)
    workflow.add_edge("handoff_regulation", END)
    
    return workflow.compile()


# Main insect graph instance
insect_graph = build_insect_graph()


def run_insect_agent(initial_message: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    Execute the insect agent with alert mapping and dynamic handoffs.
    
    Args:
        initial_message: The user's query related to insect detection
        context: Additional context (farm location, crop data, etc.)
    
    Returns:
        Final state with insect detection, alert map, and handoff decisions
    """
    initial_state: InsectState = {
        "messages": [HumanMessage(content=initial_message)],
        "insect_detection": None,
        "alert_map_data": None,
        "severity_level": None,
        "treatment_recommendations": context.get("treatment_recommendations") if context else None,
        "next_action": "continue",
        "handoff_reason": None,
        "handoff_to": None
    }
    
    result = insect_graph.invoke(initial_state, {"recursion_limit": 5})
    
    return result