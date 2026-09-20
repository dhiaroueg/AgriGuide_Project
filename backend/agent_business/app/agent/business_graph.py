"""
Business Agent - LangGraph Implementation with Dynamic Handoff Capabilities

This agent handles financial scenarios, market analysis, profitability, 
and risk assessment with the ability to dynamically handoff to other agents.
"""
from typing import Any, Literal, TypedDict, Annotated
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage
from langchain_mistralai import ChatMistralAI
from langgraph.graph import END, StateGraph, START
from langgraph.graph.message import add_messages
import operator


class BusinessState(TypedDict):
    """State specific to the business agent."""
    messages: Annotated[list, add_messages]
    business_query: str | None
    market_analysis: dict[str, Any] | None
    financial_scenarios: list[dict[str, Any]] | None
    risk_assessment: dict[str, Any] | None
    profitability_analysis: dict[str, Any] | None
    next_action: Literal["continue", "handoff_agriculture", "handoff_regulation", "complete"]
    handoff_reason: str | None
    handoff_to: str | None


class BusinessAgent:
    """Business specialist with dynamic handoff capabilities."""
    
    def __init__(self, mistral_api_key: str):
        self.llm = ChatMistralAI(
            model="mistral-large-latest",
            api_key=mistral_api_key,
            temperature=0.2
        )
    
    def analyze_business_scenario(self, state: BusinessState) -> BusinessState:
        """Analyze business scenarios, market conditions, and profitability."""
        last_message = state["messages"][-1] if state["messages"] else ""
        query = last_message.content if hasattr(last_message, 'content') else str(last_message)
        
        # Placeholder for actual business analysis using existing business services
        # This would integrate with scenario_generator, market_study, risk_study, scoring
        
        market_analysis = {
            "trend": "Haussier sur blé et colza",
            "price_blei": 242.50,
            "price_colza": 485.50,
            "volatility": "Modérée"
        }
        
        financial_scenarios = [
            {
                "scenario": "Scénario A - Équilibré",
                "crops": ["Blé Tendre (60%)", "Colza d'Hiver (40%)"],
                "estimated_profit": "45 000 €",
                "risk_level": "Faible",
                "score": 89
            },
            {
                "scenario": "Scénario B - Sécuritaire", 
                "crops": ["Blé Tendre (70%)", "Tournesol (30%)"],
                "estimated_profit": "38 000 €",
                "risk_level": "Faible",
                "score": 82
            }
        ]
        
        response = f"""Analyse business terminée :
Marché :
- Tendance : Haussier sur blé et colza
- Prix Blé Euronext : {market_analysis['price_blei']} €/t
- Prix Colza Euronext : {market_analysis['price_colza']} €/t
- Volatilité : {market_analysis['volatility']}

Scénarios financiers :
1. {financial_scenarios[0]['scenario']}
   - Cultures : {', '.join(financial_scenarios[0]['crops'])}
   - Profit estimé : {financial_scenarios[0]['estimated_profit']}
   - Risque : {financial_scenarios[0]['risk_level']}
   - Score IA : {financial_scenarios[0]['score']}/100

2. {financial_scenarios[1]['scenario']}
   - Cultures : {', '.join(financial_scenarios[1]['crops'])}
   - Profit estimé : {financial_scenarios[1]['estimated_profit']}
   - Risque : {financial_scenarios[1]['risk_level']}
   - Score IA : {financial_scenarios[1]['score']}/100"""
        
        return {
            **state,
            "messages": state["messages"] + [AIMessage(content=response)],
            "business_query": query,
            "market_analysis": market_analysis,
            "financial_scenarios": financial_scenarios,
            "next_action": "continue"
        }
    
    def determine_handoff(self, state: BusinessState) -> BusinessState:
        """
        Agent self-selection: determine if handoff to another agent is needed.
        Implements rule-based transitions based on business analysis.
        """
        last_message = state["messages"][-1] if state["messages"] else ""
        message_content = last_message.content if hasattr(last_message, 'content') else str(last_message)
        
        handoff_decision = {
            "next_action": "complete",
            "handoff_reason": None,
            "handoff_to": None
        }
        
        # Check if agriculture handoff is needed (crop-specific financial analysis)
        if any(keyword in message_content.lower() for keyword in ["culture", "rendement", "production", "récolte"]):
            handoff_decision.update({
                "next_action": "handoff_agriculture",
                "handoff_reason": "Business query requires crop-specific production analysis",
                "handoff_to": "agriculture_agent"
            })
        
        # Check if regulation handoff is needed (subsidy eligibility, compliance costs)
        elif any(keyword in message_content.lower() for keyword in ["subvention", "aide", "éligibilité", "norme", "certification"]):
            handoff_decision.update({
                "next_action": "handoff_regulation",
                "handoff_reason": "Business query involves subsidy eligibility or compliance costs",
                "handoff_to": "regulation_agent"
            })
        
        return {**state, **handoff_decision}


def business_analysis_node(state: BusinessState) -> BusinessState:
    """Node for business scenario analysis."""
    agent = BusinessAgent(mistral_api_key="dummy_key")  # Replace with actual key
    return agent.analyze_business_scenario(state)


def handoff_decision_node(state: BusinessState) -> BusinessState:
    """Node that determines if handoff to another agent is needed."""
    agent = BusinessAgent(mistral_api_key="dummy_key")  # Replace with actual key
    return agent.determine_handoff(state)


def build_business_graph() -> StateGraph:
    """
    Build the business agent graph with dynamic handoff capabilities.
    
    This graph implements:
    - Agent self-selection via handoff_decision_node
    - Rule-based transitions for dynamic routing
    - Integration with existing business services
    """
    workflow = StateGraph(BusinessState)
    
    # Add nodes
    workflow.add_node("business_analysis", business_analysis_node)
    workflow.add_node("handoff_decision", handoff_decision_node)
    
    # Define edges
    workflow.add_edge(START, "business_analysis")
    workflow.add_edge("business_analysis", "handoff_decision")
    
    # Conditional routing based on handoff decision
    def route_after_handoff_decision(state: BusinessState) -> str:
        return state["next_action"]
    
    workflow.add_conditional_edges(
        "handoff_decision",
        route_after_handoff_decision,
        {
            "continue": "business_analysis",  # Continue with more analysis
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


# Main business graph instance
business_graph = build_business_graph()


def run_business_agent(initial_message: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    Execute the business agent with dynamic handoff capabilities.
    
    Args:
        initial_message: The user's query related to business/finance
        context: Additional context (budget, terrain info, etc.)
    
    Returns:
        Final state with business analysis results and handoff decisions
    """
    initial_state: BusinessState = {
        "messages": [HumanMessage(content=initial_message)],
        "business_query": None,
        "market_analysis": None,
        "financial_scenarios": None,
        "risk_assessment": None,
        "profitability_analysis": context.get("profitability_analysis") if context else None,
        "next_action": "continue",
        "handoff_reason": None,
        "handoff_to": None
    }
    
    result = business_graph.invoke(initial_state, {"recursion_limit": 5})
    
    return result