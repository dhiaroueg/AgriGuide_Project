# LangGraph Dynamic Control Shift Architecture

## Overview

The AgriGuide multi-agent system now implements **dynamic control shifts** using LangGraph, replacing the previous static sequential pipeline with intelligent agent routing and handoff mechanisms.

## Architecture Components

### 1. Supervisor Agent (`backend/orchestrator/app/agent/supervisor_graph.py`)

**Role**: Central coordinator that manages dynamic control shifts between specialized agents.

**Key Features**:
- **LLM-Based Selection**: Uses Mistral LLM to analyze conversation context and determine which agent should handle the next turn
- **State-Aware Routing**: Considers farmer state (onboarding, terrain_selectionne, analyse_terminee, etc.) in routing decisions
- **Human-in-the-Loop Integration**: Can route to human validation when clarification or confirmation is needed

**Routing Logic**:
```python
def route_to_agent(state: SupervisorState) -> SupervisorState:
    # Analyzes:
    # - User's current question/intent
    # - Conversation history and context  
    # - Current farmer state
    # - Results from previous agent interactions
    
    # Routes to: agriculture_agent, regulation_agent, business_agent, 
    # monitoring_agent, weather_agent, human_validation, or end
```

### 2. Agriculture Agent (`backend/agent_agriculture/app/agent/agriculture_graph.py`)

**Role**: Handles soil analysis, crop recommendations, agronomy, satellite data, and terrain analysis.

**Dynamic Handoff Capabilities**:
- **Agent Self-Selection**: Can request handoff to other agents based on analysis results
- **Rule-Based Transitions**: 
  - → `regulation_agent` when user asks about subsidies, compliance, certifications
  - → `business_agent` when user asks about profitability, market, costs
  - → `weather_agent` when user asks about weather, climate, forecasts

**Graph Structure**:
```
START → soil_analysis → handoff_decision → [conditional routing]
                                              ↓
                                  continue → soil_analysis (loop)
                                  handoff_regulation → END
                                  handoff_business → END  
                                  handoff_weather → END
                                  complete → END
```

### 3. Regulation Agent (`backend/agent_regulation/app/agent/regulation_graph.py`)

**Role**: Handles legal regulations, PAC subsidies, administrative documents, and compliance.

**Dynamic Handoff Capabilities**:
- **Agent Self-Selection**: Can request handoff based on regulation analysis
- **Rule-Based Transitions**:
  - → `agriculture_agent` for crop-specific regulations, soil requirements
  - → `business_agent` for subsidy amounts, financial implications

**Graph Structure**:
```
START → regulation_search → handoff_decision → [conditional routing]
                                                ↓
                                    continue → regulation_search (loop)
                                    handoff_agriculture → END
                                    handoff_business → END
                                    complete → END
```

### 4. Business Agent (`backend/agent_business/app/agent/business_graph.py`)

**Role**: Handles financial scenarios, market analysis, profitability, and risk assessment.

**Dynamic Handoff Capabilities**:
- **Agent Self-Selection**: Can request handoff based on business analysis
- **Rule-Based Transitions**:
  - → `agriculture_agent` for crop-specific financial analysis
  - → `regulation_agent` for subsidy eligibility, compliance costs

**Graph Structure**:
```
START → business_analysis → handoff_decision → [conditional routing]
                                              ↓
                                  continue → business_analysis (loop)
                                  handoff_agriculture → END
                                  handoff_regulation → END
                                  complete → END
```

### 5. Monitoring Agent (`backend/agent_monitoring/app/agent/graph.py`)

**Role**: Handles daily monitoring, alerts, weather tracking, and harvest timing.

**Enhanced with Dynamic Handoffs**:
- **Agent Self-Selection**: Can request handoff based on monitoring alerts
- **Rule-Based Transitions**:
  - → `agriculture_agent` for crop health, treatment recommendations
  - → `regulation_agent` for compliance issues, reporting requirements

**Graph Structure**:
```
START → fetch_weather → mistral_reasoning → handoff_decision → [conditional routing]
                                                                    ↓
                                                        continue → fetch_weather (loop)
                                                        handoff_agriculture → END
                                                        handoff_regulation → END
                                                        complete → END
```

## Control Shift Mechanisms

### 1. LLM-Based Selection (Supervisor)

The supervisor uses a Mistral LLM to dynamically select the next agent based on conversation context:

```python
system_prompt = """You are the supervisor of a multi-agent agricultural advisory system.
Your role is to route the conversation to the most appropriate specialized agent based on:
1. User's current question/intent
2. Conversation history and context
3. Current farmer state
4. Results from previous agent interactions"""
```

**Example**:
- User: "Quelles sont les aides disponibles pour le blé ?" 
- Supervisor routes to: `regulation_agent` (subsidy question)

### 2. Agent Self-Selection / Handoff

Each agent can dynamically request a handoff to another specialist:

```python
def determine_handoff(self, state: AgricultureState) -> AgricultureState:
    # Rule-based handoff logic
    if "subvention" in message_content.lower():
        return {
            "next_action": "handoff_regulation",
            "handoff_reason": "User asked about subsidies",
            "handoff_to": "regulation_agent"
        }
```

**Example**:
- Agriculture agent detects subsidy question
- Self-selects handoff to: `regulation_agent`

### 3. Rule-Based Transitions

Conditional logic determines routing based on keywords and context:

```python
# Agriculture agent rules
if any(keyword in message for keyword in ["subvention", "aide", "pac"]):
    → regulation_agent
elif any(keyword in message for keyword in ["rentabilité", "profit", "coût"]):
    → business_agent
```

### 4. Human-in-the-Loop Handoff

Direct routing to human validation when needed:

```python
if requires_clarification or needs_confirmation:
    → human_validation
```

## Integration with Existing Services

### Agriculture Agent Integration

The new LangGraph agriculture agent is designed to integrate with existing services:

```python
# Existing services to integrate:
from app.services import (
    parcel_service,
    soil_service, 
    weather_service,
    satellite_service,
    ml_service,
    rag_service
)
```

### Regulation Agent Integration

The LangGraph regulation agent wraps the existing `RegulationAgent`:

```python
# Existing regulation agent
from app.agent.regulation_agent import RegulationAgent

# New LangGraph wrapper adds handoff capabilities
class RegulationGraphAgent:
    def __init__(self):
        self.legacy_agent = RegulationAgent()
        # Add handoff logic around legacy agent
```

### Business Agent Integration

The LangGraph business agent integrates with existing business services:

```python
# Existing services to integrate:
from app.services import (
    scenario_generator,
    market_study,
    risk_study,
    scoring
)
```

## API Changes

### New Endpoint

The main orchestrator endpoint now uses LangGraph routing:

```python
@app.post("/orchestrate/pipeline", response_model=PipelineExecutionResponse)
def run_pipeline(req: PipelineQueryRequest):
    """Execute using LangGraph dynamic control shifts"""
    return execute_langgraph_pipeline(req)
```

### Legacy Endpoint

The old sequential pipeline is still available for comparison:

```python
@app.post("/orchestrate/pipeline/legacy", response_model=PipelineExecutionResponse)
def run_legacy_pipeline(req: PipelineQueryRequest):
    """Execute the legacy sequential pipeline"""
    return execute_pipeline(req)
```

## Testing the Dynamic Control Shifts

### Test Script

Create a test script to verify dynamic routing:

```python
from backend.orchestrator.app.agent.supervisor_graph import run_supervisor_pipeline

# Test 1: Agriculture query
result = run_supervisor_pipeline(
    initial_message="Quel type de blé planter sur mon terrain ?",
    farmer_state={"intent": "crop_recommendation"}
)
print(f"Routed to: {result['next_agent']}")

# Test 2: Regulation query  
result = run_supervisor_pipeline(
    initial_message="Quelles aides PAC pour le colza ?",
    farmer_state={"intent": "subsidy_inquiry"}
)
print(f"Routed to: {result['next_agent']}")

# Test 3: Business query
result = run_supervisor_pipeline(
    initial_message="Est-ce rentable de cultiver du tournesol ?",
    farmer_state={"intent": "profitability_analysis"}
)
print(f"Routed to: {result['next_agent']}")
```

## Benefits of Dynamic Control Shifts

1. **Intelligent Routing**: LLM-based selection understands context better than fixed rules
2. **Flexibility**: Agents can self-select and handoff based on their analysis
3. **Efficiency**: Only relevant agents are invoked, reducing unnecessary processing
4. **Scalability**: Easy to add new agents without changing routing logic
5. **User Experience**: More natural conversation flow with appropriate specialist selection

## Migration Path

### Phase 1: Core Implementation ✅
- [x] Supervisor agent with LLM routing
- [x] Agriculture agent with handoffs
- [x] Regulation agent with handoffs  
- [x] Business agent with handoffs
- [x] Enhanced monitoring agent

### Phase 2: Integration (Next Steps)
- [ ] Connect LangGraph agents to existing service implementations
- [ ] Add proper API key configuration
- [ ] Implement actual service calls in agent nodes
- [ ] Add error handling and fallback logic

### Phase 3: Testing & Optimization
- [ ] End-to-end testing of dynamic routing
- [ ] Performance optimization
- [ ] Fine-tune LLM routing prompts
- [ ] Add monitoring and logging for routing decisions

### Phase 4: Deployment
- [ ] Update frontend to use new endpoint
- [ ] Deploy to staging environment
- [ ] Monitor routing effectiveness
- [ ] Gradual rollout to production

## Configuration

### Environment Variables

Add to `.env`:

```bash
# Mistral API key for LLM-based routing
MISTRAL_API_KEY=your_mistral_api_key

# Optional: Override default routing model
SUPERVISOR_MODEL=mistral-small-latest
AGENT_MODEL=mistral-large-latest
```

### Agent Configuration

Each agent can be configured independently:

```python
# In supervisor_graph.py
supervisor = SupervisorAgent(
    mistral_api_key=settings.mistral_api_key,
    model=settings.supervisor_model
)
```

## Troubleshooting

### Issue: LangGraph import errors

**Solution**: Ensure all dependencies are installed:
```bash
pip install langgraph langchain-mistralai langchain-core
```

### Issue: Fallback to legacy pipeline

**Solution**: Check if `LANGGRAPH_AVAILABLE` is True in logs, verify imports are working

### Issue: Incorrect routing decisions

**Solution**: Fine-tune the supervisor system prompt and rule-based transition keywords

## Future Enhancements

1. **Multi-Agent Collaboration**: Enable multiple agents to work on the same query simultaneously
2. **Learning from Routing**: Track routing decisions to improve LLM selection over time
3. **Context-Aware Routing**: Use conversation embeddings for better context understanding
4. **Agent Capabilities Registry**: Dynamic discovery of agent capabilities for routing
5. **Performance Monitoring**: Track routing effectiveness and agent performance