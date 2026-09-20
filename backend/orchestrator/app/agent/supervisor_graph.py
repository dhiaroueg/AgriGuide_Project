"""
Supervisor Agent - Dynamic Control Shift Manager for AgriGuide Multi-Agent System

This supervisor implements LLM-based routing to dynamically shift control between
specialized agents based on conversation context, user intent, and intermediate results.

Architecture:
- LLM-based Selection: Uses Mistral LLM to determine which agent's expertise is needed next
- Agent Self-Selection: Agents can request handoffs to other specialized agents
- Rule-Based Transitions: Conditional logic for state-based routing
- Human-in-the-Loop: Direct handoff to human when clarification/validation needed
"""
from typing import Any, Literal, TypedDict, Annotated
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_mistralai import ChatMistralAI
from langgraph.graph import END, StateGraph, START
from langgraph.graph.message import add_messages
import operator


class SupervisorState(TypedDict):
    """Shared state across all agents in the multi-agent system."""
    messages: Annotated[list, add_messages]
    next_agent: Literal[
        "agriculture_agent",
        "regulation_agent", 
        "business_agent", 
        "monitoring_agent",
        "weather_agent",
        "insect_agent",
        "human_validation",
        "end"
    ]
    user_id: str | None
    terrain_id: str | None
    farmer_state: dict[str, Any]  # Current state in farmer journey
    context: dict[str, Any]  # Shared context between agents
    handoff_reason: str | None  # Reason for control shift


class SupervisorAgent:
    """Main supervisor that manages dynamic control shifts between agents."""
    
    def __init__(self, mistral_api_key: str):
        self.routing_llm = ChatMistralAI(
            model="mistral-small-latest",
            api_key=mistral_api_key,
            temperature=0
        )
    
    def route_to_agent(self, state: SupervisorState) -> SupervisorState:
        """
        LLM-based agent selection: analyzes conversation context and determines
        which specialized agent should handle the next turn.
        """
        system_prompt = """You are the supervisor of a multi-agent agricultural advisory system.
Your role is to route the conversation to the most appropriate specialized agent based on:
1. User's current question/intent
2. Conversation history and context
3. Current farmer state (onboarding, terrain_selectionne, analyse_terminee, etc.)
4. Results from previous agent interactions

Available agents:
- agriculture_agent: Soil analysis, crop recommendations, agronomy, satellite data, terrain analysis
- regulation_agent: Legal regulations, PAC subsidies, administrative documents, compliance
- business_agent: Financial scenarios, market analysis, profitability, risk assessment
- monitoring_agent: Daily monitoring, alerts, weather tracking, harvest timing
- weather_agent: Weather forecasts, climate data, meteorological analysis
- insect_agent: Insect detection, alert mapping, pest analysis, treatment recommendations
- human_validation: When user confirmation/clarification is needed
- end: When the query is fully resolved

Respond with ONLY the agent name (e.g., "agriculture_agent")."""

        last_message = state["messages"][-1] if state["messages"] else ""
        
        # Include farmer state in routing decision
        state_info = f"Farmer State: {state['farmer_state']}"
        context_info = f"Context: {state['context']}"
        
        routing_prompt = f"{system_prompt}\n\n{state_info}\n{context_info}\n\nLast message: {last_message.content if hasattr(last_message, 'content') else last_message}"
        
        response = self.routing_llm.invoke([
            SystemMessage(content=system_prompt),
            HumanMessage(content=f"Current context: {state_info}\nContext: {context_info}\nLast message: {last_message.content if hasattr(last_message, 'content') else last_message}")
        ])
        
        selected_agent = response.content.strip().lower()
        
        # Validate and default to agriculture_agent if invalid
        valid_agents = [
            "agriculture_agent", "regulation_agent", "business_agent", 
            "monitoring_agent", "weather_agent", "insect_agent", "human_validation", "end"
        ]
        
        if selected_agent not in valid_agents:
            selected_agent = "agriculture_agent"  # Default fallback
        
        return {
            **state,
            "next_agent": selected_agent,
            "handoff_reason": f"LLM-based routing selected {selected_agent} based on conversation context"
        }


def supervisor_routing_node(state: SupervisorState) -> SupervisorState:
    """Node that executes the supervisor routing logic."""
    # This would be initialized with actual API key from config
    supervisor = SupervisorAgent(mistral_api_key="dummy_key")  # Replace with actual key
    return supervisor.route_to_agent(state)


def build_supervisor_graph() -> StateGraph:
    """
    Build the supervisor graph that manages dynamic control shifts.
    
    This graph implements:
    - LLM-based selection via the supervisor_routing_node
    - Conditional edges for dynamic routing
    - Human-in-the-loop handoff capability
    """
    workflow = StateGraph(SupervisorState)
    
    # Add supervisor routing node
    workflow.add_node("supervisor", supervisor_routing_node)
    
    # Add placeholder nodes for each agent (to be connected to actual agent graphs)
    workflow.add_node("agriculture_agent", lambda state: state)
    workflow.add_node("regulation_agent", lambda state: state)
    workflow.add_node("business_agent", lambda state: state)
    workflow.add_node("monitoring_agent", lambda state: state)
    workflow.add_node("weather_agent", lambda state: state)
    workflow.add_node("insect_agent", lambda state: state)
    workflow.add_node("human_validation", lambda state: state)
    
    # Start with supervisor routing
    workflow.add_edge(START, "supervisor")
    
    # Conditional routing from supervisor to selected agent
    def route_from_supervisor(state: SupervisorState) -> str:
        return state["next_agent"]
    
    workflow.add_conditional_edges(
        "supervisor",
        route_from_supervisor,
        {
            "agriculture_agent": "agriculture_agent",
            "regulation_agent": "regulation_agent", 
            "business_agent": "business_agent",
            "monitoring_agent": "monitoring_agent",
            "weather_agent": "weather_agent",
            "insect_agent": "insect_agent",
            "human_validation": "human_validation",
            "end": END
        }
    )
    
    # After each agent completes, return to supervisor for next routing decision
    for agent_name in ["agriculture_agent", "regulation_agent", "business_agent", 
                       "monitoring_agent", "weather_agent", "insect_agent", "human_validation"]:
        workflow.add_edge(agent_name, "supervisor")
    
    return workflow.compile()


# Main supervisor graph instance
supervisor_graph = build_supervisor_graph()


def run_supervisor_pipeline(
    initial_message: str,
    user_id: str | None = None,
    terrain_id: str | None = None,
    farmer_state: dict[str, Any] | None = None
) -> dict[str, Any]:
    """
    Execute the supervisor pipeline with dynamic control shifts.
    
    Args:
        initial_message: The user's initial query
        user_id: Optional user identifier
        terrain_id: Optional terrain identifier for context
        farmer_state: Current state in the farmer journey
    
    Returns:
        Final state with all agent responses and routing decisions
    """
    initial_state: SupervisorState = {
        "messages": [HumanMessage(content=initial_message)],
        "next_agent": "agriculture_agent",  # Default starting agent
        "user_id": user_id,
        "terrain_id": terrain_id,
        "farmer_state": farmer_state or {},
        "context": {},
        "handoff_reason": None
    }
    
    # Run the graph with a reasonable limit to prevent infinite loops
    result = supervisor_graph.invoke(initial_state, {"recursion_limit": 10})
    
    return result