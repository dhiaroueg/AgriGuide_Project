"""
Agriculture Agent - LangGraph Implementation with Dynamic Handoff Capabilities

This agent handles soil analysis, crop recommendations, agronomy, satellite data,
and terrain analysis with the ability to dynamically handoff to other agents.
"""
from typing import Any, Literal, TypedDict, Annotated
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage
from langchain_mistralai import ChatMistralAI
from langgraph.graph import END, StateGraph, START
from langgraph.graph.message import add_messages
import operator


class AgricultureState(TypedDict):
    """State specific to the agriculture agent."""
    messages: Annotated[list, add_messages]
    soil_analysis: dict[str, Any] | None
    crop_recommendations: list[dict[str, Any]] | None
    satellite_data: dict[str, Any] | None
    weather_context: dict[str, Any] | None
    next_action: Literal["continue", "handoff_regulation", "handoff_business", "handoff_weather", "complete"]
    handoff_reason: str | None
    handoff_to: str | None


class AgricultureAgent:
    """Agriculture specialist with dynamic handoff capabilities."""
    
    def __init__(self, mistral_api_key: str):
        self.llm = ChatMistralAI(
            model="mistral-large-latest",
            api_key=mistral_api_key,
            temperature=0.3
        )
    
    def analyze_soil_and_crops(self, state: AgricultureState) -> AgricultureState:
        """Analyze soil conditions and recommend crops."""
        # Placeholder for actual soil analysis logic
        # This would integrate with existing soil_service, satellite_service, etc.
        
        last_message = state["messages"][-1] if state["messages"] else ""
        
        # Simulate soil analysis
        soil_analysis = {
            "texture": "Limono-argileux",
            "ph": 6.8,
            "organic_matter": "2.1%",
            "nutrient_levels": {"N": "Moyen", "P": "Élevé", "K": "Moyen"}
        }
        
        # Simulate crop recommendations
        crop_recommendations = [
            {"crop": "Blé Tendre", "suitability": 0.92, "yield_estimate": "7.8 t/ha"},
            {"crop": "Colza d'Hiver", "suitability": 0.88, "yield_estimate": "3.6 t/ha"},
            {"crop": "Orge", "suitability": 0.85, "yield_estimate": "6.5 t/ha"}
        ]
        
        response = f"""Analyse pédologique terminée :
- Texture du sol : {soil_analysis['texture']}
- pH : {soil_analysis['ph']}
- Matière organique : {soil_analysis['organic_matter']}

Recommandations de cultures :
1. Blé Tendre (compatibilité : {crop_recommendations[0]['suitability']}) - Rendement estimé : {crop_recommendations[0]['yield_estimate']}
2. Colza d'Hiver (compatibilité : {crop_recommendations[1]['suitability']}) - Rendement estimé : {crop_recommendations[1]['yield_estimate']}
3. Orge (compatibilité : {crop_recommendations[2]['suitability']}) - Rendement estimé : {crop_recommendations[2]['yield_estimate']}"""
        
        return {
            **state,
            "messages": state["messages"] + [AIMessage(content=response)],
            "soil_analysis": soil_analysis,
            "crop_recommendations": crop_recommendations,
            "next_action": "continue"
        }
    
    def determine_handoff(self, state: AgricultureState) -> AgricultureState:
        """
        Agent self-selection: determine if handoff to another agent is needed.
        Implements rule-based transitions based on analysis results.
        """
        last_message = state["messages"][-1] if state["messages"] else ""
        message_content = last_message.content if hasattr(last_message, 'content') else str(last_message)
        
        # Rule-based handoff logic
        handoff_decision = {
            "next_action": "complete",
            "handoff_reason": None,
            "handoff_to": None
        }
        
        # Check if regulation handoff is needed (mentions of subsidies, compliance, etc.)
        if any(keyword in message_content.lower() for keyword in ["subvention", "aide", "pac", "réglement", "norme", "certification"]):
            handoff_decision.update({
                "next_action": "handoff_regulation",
                "handoff_reason": "User asked about subsidies or regulatory compliance",
                "handoff_to": "regulation_agent"
            })
        
        # Check if business handoff is needed (mentions of profitability, market, costs)
        elif any(keyword in message_content.lower() for keyword in ["rentabilité", "profit", "coût", "marché", "prix", "revenu"]):
            handoff_decision.update({
                "next_action": "handoff_business", 
                "handoff_reason": "User asked about financial aspects or market analysis",
                "handoff_to": "business_agent"
            })
        
        # Check if weather handoff is needed (mentions of weather, climate, forecasts)
        elif any(keyword in message_content.lower() for keyword in ["météo", "climat", "prévision", "pluie", "température"]):
            handoff_decision.update({
                "next_action": "handoff_weather",
                "handoff_reason": "User asked about weather or climate conditions",
                "handoff_to": "weather_agent"
            })
        
        return {**state, **handoff_decision}


def soil_analysis_node(state: AgricultureState) -> AgricultureState:
    """Node for soil analysis and crop recommendations."""
    # Initialize with actual API key from config
    agent = AgricultureAgent(mistral_api_key="dummy_key")  # Replace with actual key
    return agent.analyze_soil_and_crops(state)


def handoff_decision_node(state: AgricultureState) -> AgricultureState:
    """Node that determines if handoff to another agent is needed."""
    agent = AgricultureAgent(mistral_api_key="dummy_key")  # Replace with actual key
    return agent.determine_handoff(state)


def build_agriculture_graph() -> StateGraph:
    """
    Build the agriculture agent graph with dynamic handoff capabilities.
    
    This graph implements:
    - Agent self-selection via handoff_decision_node
    - Rule-based transitions for dynamic routing
    - Integration with existing agriculture services
    """
    workflow = StateGraph(AgricultureState)
    
    # Add nodes
    workflow.add_node("soil_analysis", soil_analysis_node)
    workflow.add_node("handoff_decision", handoff_decision_node)
    
    # Define edges
    workflow.add_edge(START, "soil_analysis")
    workflow.add_edge("soil_analysis", "handoff_decision")
    
    # Conditional routing based on handoff decision
    def route_after_handoff_decision(state: AgricultureState) -> str:
        return state["next_action"]
    
    workflow.add_conditional_edges(
        "handoff_decision",
        route_after_handoff_decision,
        {
            "continue": "soil_analysis",  # Continue with more analysis
            "handoff_regulation": "handoff_regulation",
            "handoff_business": "handoff_business", 
            "handoff_weather": "handoff_weather",
            "complete": END
        }
    )
    
    # Add placeholder nodes for handoff targets (these would connect to supervisor)
    workflow.add_node("handoff_regulation", lambda state: state)
    workflow.add_node("handoff_business", lambda state: state)
    workflow.add_node("handoff_weather", lambda state: state)
    
    workflow.add_edge("handoff_regulation", END)
    workflow.add_edge("handoff_business", END)
    workflow.add_edge("handoff_weather", END)
    
    return workflow.compile()


# Main agriculture graph instance
agriculture_graph = build_agriculture_graph()


def run_agriculture_agent(initial_message: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    Execute the agriculture agent with dynamic handoff capabilities.
    
    Args:
        initial_message: The user's query related to agriculture
        context: Additional context (terrain info, coordinates, etc.)
    
    Returns:
        Final state with analysis results and handoff decisions
    """
    initial_state: AgricultureState = {
        "messages": [HumanMessage(content=initial_message)],
        "soil_analysis": None,
        "crop_recommendations": None,
        "satellite_data": context.get("satellite_data") if context else None,
        "weather_context": context.get("weather_context") if context else None,
        "next_action": "continue",
        "handoff_reason": None,
        "handoff_to": None
    }
    
    result = agriculture_graph.invoke(initial_state, {"recursion_limit": 5})
    
    return result