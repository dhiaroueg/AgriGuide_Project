"""
Regulation Agent - LangGraph Implementation with Dynamic Handoff Capabilities

This agent handles legal regulations, PAC subsidies, administrative documents,
and compliance with the ability to dynamically handoff to other agents.
"""
from typing import Any, Literal, TypedDict, Annotated
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, ToolMessage
from langchain_mistralai import ChatMistralAI
from langgraph.graph import END, StateGraph, START
from langgraph.graph.message import add_messages
import operator


class RegulationState(TypedDict):
    """State specific to the regulation agent."""
    messages: Annotated[list, add_messages]
    regulation_query: str | None
    rag_results: list[dict[str, Any]] | None
    subsidy_results: list[dict[str, Any]] | None
    web_search_results: list[dict[str, Any]] | None
    compliance_status: dict[str, Any] | None
    next_action: Literal["continue", "handoff_agriculture", "handoff_business", "complete"]
    handoff_reason: str | None
    handoff_to: str | None


class RegulationAgent:
    """Regulation specialist with dynamic handoff capabilities."""
    
    def __init__(self, mistral_api_key: str, model: str = "open-mistral-7b"):
        self.llm = ChatMistralAI(
            model=model,
            api_key=mistral_api_key,
            temperature=0
        )
    
    def search_regulation(self, state: RegulationState) -> RegulationState:
        """Search for relevant regulations using RAG."""
        last_message = state["messages"][-1] if state["messages"] else ""
        query = last_message.content if hasattr(last_message, 'content') else str(last_message)
        
        # Placeholder for actual RAG search using existing regulation_agent tools
        # This would integrate with existing rag_tool, subsidy_tool, web_search_tool
        
        rag_results = [
            {
                "source": "Code Rural",
                "content": "BCAE 7 - Rotation des cultures : Les exploitants doivent maintenir une diversification des cultures sur leur exploitation.",
                "certified_by": "Legifrance"
            },
            {
                "source": "Arrêté PAC 2026", 
                "content": "Éco-Régime Niveau 2 : Aides supplémentaires pour les pratiques respectueuses de l'environnement.",
                "certified_by": "Ministère de l'Agriculture"
            }
        ]
        
        response = f"""Recherche réglementaire terminée :
- BCAE 7 (Rotation des cultures) : Les exploitants doivent maintenir une diversification des cultures sur leur exploitation. (Source : Legifrance)
- Éco-Régime Niveau 2 : Aides supplémentaires pour les pratiques respectueuses de l'environnement. (Source : Ministère de l'Agriculture)

Cette information est certifiée par : Legifrance, Ministère de l'Agriculture."""
        
        return {
            **state,
            "messages": state["messages"] + [AIMessage(content=response)],
            "regulation_query": query,
            "rag_results": rag_results,
            "next_action": "continue"
        }
    
    def determine_handoff(self, state: RegulationState) -> RegulationState:
        """
        Agent self-selection: determine if handoff to another agent is needed.
        Implements rule-based transitions based on regulation analysis.
        """
        last_message = state["messages"][-1] if state["messages"] else ""
        message_content = last_message.content if hasattr(last_message, 'content') else str(last_message)
        
        handoff_decision = {
            "next_action": "complete",
            "handoff_reason": None,
            "handoff_to": None
        }
        
        # Check if agriculture handoff is needed (crop-specific regulations, soil requirements)
        if any(keyword in message_content.lower() for keyword in ["culture", "semence", "rotation", "sol", "terre"]):
            handoff_decision.update({
                "next_action": "handoff_agriculture",
                "handoff_reason": "Regulation query involves crop-specific requirements or soil management",
                "handoff_to": "agriculture_agent"
            })
        
        # Check if business handoff is needed (subsidy amounts, financial implications)
        elif any(keyword in message_content.lower() for keyword in ["subvention", "aide financière", "montant", "éligibilité économique"]):
            handoff_decision.update({
                "next_action": "handoff_business",
                "handoff_reason": "Regulation query involves financial subsidies or economic eligibility",
                "handoff_to": "business_agent"
            })
        
        return {**state, **handoff_decision}


def regulation_search_node(state: RegulationState) -> RegulationState:
    """Node for regulation search and RAG."""
    agent = RegulationAgent(mistral_api_key="dummy_key")  # Replace with actual key
    return agent.search_regulation(state)


def handoff_decision_node(state: RegulationState) -> RegulationState:
    """Node that determines if handoff to another agent is needed."""
    agent = RegulationAgent(mistral_api_key="dummy_key")  # Replace with actual key
    return agent.determine_handoff(state)


def build_regulation_graph() -> StateGraph:
    """
    Build the regulation agent graph with dynamic handoff capabilities.
    
    This graph implements:
    - Agent self-selection via handoff_decision_node
    - Rule-based transitions for dynamic routing
    - Integration with existing regulation RAG tools
    """
    workflow = StateGraph(RegulationState)
    
    # Add nodes
    workflow.add_node("regulation_search", regulation_search_node)
    workflow.add_node("handoff_decision", handoff_decision_node)
    
    # Define edges
    workflow.add_edge(START, "regulation_search")
    workflow.add_edge("regulation_search", "handoff_decision")
    
    # Conditional routing based on handoff decision
    def route_after_handoff_decision(state: RegulationState) -> str:
        return state["next_action"]
    
    workflow.add_conditional_edges(
        "handoff_decision",
        route_after_handoff_decision,
        {
            "continue": "regulation_search",  # Continue with more research
            "handoff_agriculture": "handoff_agriculture",
            "handoff_business": "handoff_business",
            "complete": END
        }
    )
    
    # Add placeholder nodes for handoff targets
    workflow.add_node("handoff_agriculture", lambda state: state)
    workflow.add_node("handoff_business", lambda state: state)
    
    workflow.add_edge("handoff_agriculture", END)
    workflow.add_edge("handoff_business", END)
    
    return workflow.compile()


# Main regulation graph instance
regulation_graph = build_regulation_graph()


def run_regulation_agent(initial_message: str, context: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    Execute the regulation agent with dynamic handoff capabilities.
    
    Args:
        initial_message: The user's query related to regulations
        context: Additional context (location, farm details, etc.)
    
    Returns:
        Final state with regulation results and handoff decisions
    """
    initial_state: RegulationState = {
        "messages": [HumanMessage(content=initial_message)],
        "regulation_query": None,
        "rag_results": None,
        "subsidy_results": None,
        "web_search_results": None,
        "compliance_status": context.get("compliance_status") if context else None,
        "next_action": "continue",
        "handoff_reason": None,
        "handoff_to": None
    }
    
    result = regulation_graph.invoke(initial_state, {"recursion_limit": 5})
    
    return result