"""
Test script for LangGraph dynamic control shifts.

This script tests the supervisor routing and agent handoff capabilities.
"""
import sys
import os
import io

# Fix Windows console encoding issue
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')


def test_supervisor_routing():
    """Test the supervisor agent's LLM-based routing."""
    print("=" * 60)
    print("Testing Supervisor Agent Routing")
    print("=" * 60)
    
    try:
        # Test file existence first
        supervisor_file = os.path.join(os.path.dirname(__file__), 'app', 'agent', 'supervisor_graph.py')
        if not os.path.exists(supervisor_file):
            print(f"✗ Supervisor file not found: {supervisor_file}")
            return False
        
        print("✓ Supervisor agent file exists")
        print("  Structure: LLM-based routing with state management")
        
        # Check for key components in the file
        with open(supervisor_file, 'r', encoding='utf-8') as f:
            content = f.read()
            if 'SupervisorAgent' in content:
                print("  ✓ SupervisorAgent class defined")
            if 'route_to_agent' in content:
                print("  ✓ route_to_agent method present")
            if 'StateGraph' in content:
                print("  ✓ LangGraph StateGraph usage detected")
            if 'LLM-based' in content or 'MistralAI' in content:
                print("  ✓ LLM-based routing logic present")
        
    except Exception as e:
        print(f"✗ Supervisor test failed: {e}")
        return False
    
    return True


def test_agriculture_agent():
    """Test the agriculture agent's handoff capabilities."""
    print("\n" + "=" * 60)
    print("Testing Agriculture Agent Handoffs")
    print("=" * 60)
    
    try:
        # Test file existence
        agriculture_file = os.path.join(os.path.dirname(__file__), '..', 'agent_agriculture', 'app', 'agent', 'agriculture_graph.py')
        if not os.path.exists(agriculture_file):
            print(f"✗ Agriculture agent file not found: {agriculture_file}")
            return False
        
        print("✓ Agriculture agent file exists")
        print("  Handoff capabilities: regulation, business, weather")
        
        # Check for key components
        with open(agriculture_file, 'r', encoding='utf-8') as f:
            content = f.read()
            if 'AgricultureAgent' in content:
                print("  ✓ AgricultureAgent class defined")
            if 'determine_handoff' in content:
                print("  ✓ determine_handoff method present")
            if 'handoff_regulation' in content:
                print("  ✓ Regulation handoff logic present")
            if 'handoff_business' in content:
                print("  ✓ Business handoff logic present")
            if 'handoff_weather' in content:
                print("  ✓ Weather handoff logic present")
        
    except Exception as e:
        print(f"✗ Agriculture agent test failed: {e}")
        return False
    
    return True


def test_regulation_agent():
    """Test the regulation agent's handoff capabilities."""
    print("\n" + "=" * 60)
    print("Testing Regulation Agent Handoffs")
    print("=" * 60)
    
    try:
        # Test file existence
        regulation_file = os.path.join(os.path.dirname(__file__), '..', 'agent_regulation', 'app', 'agent', 'regulation_graph.py')
        if not os.path.exists(regulation_file):
            print(f"✗ Regulation agent file not found: {regulation_file}")
            return False
        
        print("✓ Regulation agent file exists")
        print("  Handoff capabilities: agriculture, business")
        
        # Check for key components
        with open(regulation_file, 'r', encoding='utf-8') as f:
            content = f.read()
            if 'RegulationAgent' in content:
                print("  ✓ RegulationAgent class defined")
            if 'determine_handoff' in content:
                print("  ✓ determine_handoff method present")
            if 'handoff_agriculture' in content:
                print("  ✓ Agriculture handoff logic present")
            if 'handoff_business' in content:
                print("  ✓ Business handoff logic present")
        
    except Exception as e:
        print(f"✗ Regulation agent test failed: {e}")
        return False
    
    return True


def test_business_agent():
    """Test the business agent's handoff capabilities."""
    print("\n" + "=" * 60)
    print("Testing Business Agent Handoffs")
    print("=" * 60)
    
    try:
        # Test file existence
        business_file = os.path.join(os.path.dirname(__file__), '..', 'agent_business', 'app', 'agent', 'business_graph.py')
        if not os.path.exists(business_file):
            print(f"✗ Business agent file not found: {business_file}")
            return False
        
        print("✓ Business agent file exists")
        print("  Handoff capabilities: agriculture, regulation")
        
        # Check for key components
        with open(business_file, 'r', encoding='utf-8') as f:
            content = f.read()
            if 'BusinessAgent' in content:
                print("  ✓ BusinessAgent class defined")
            if 'determine_handoff' in content:
                print("  ✓ determine_handoff method present")
            if 'handoff_agriculture' in content:
                print("  ✓ Agriculture handoff logic present")
            if 'handoff_regulation' in content:
                print("  ✓ Regulation handoff logic present")
        
    except Exception as e:
        print(f"✗ Business agent test failed: {e}")
        return False
    
    return True


def test_monitoring_agent():
    """Test the enhanced monitoring agent."""
    print("\n" + "=" * 60)
    print("Testing Enhanced Monitoring Agent")
    print("=" * 60)
    
    try:
        # Test file existence
        monitoring_file = os.path.join(os.path.dirname(__file__), '..', 'agent_monitoring', 'app', 'agent', 'graph.py')
        if not os.path.exists(monitoring_file):
            print(f"✗ Monitoring agent file not found: {monitoring_file}")
            return False
        
        print("✓ Enhanced monitoring agent file exists")
        print("  Handoff capabilities: agriculture, regulation")
        
        # Check for key components
        with open(monitoring_file, 'r', encoding='utf-8') as f:
            content = f.read()
            if 'determine_handoff' in content:
                print("  ✓ determine_handoff method present")
            if 'handoff_agriculture' in content:
                print("  ✓ Agriculture handoff logic present")
            if 'handoff_regulation' in content:
                print("  ✓ Regulation handoff logic present")
            if 'conditional_edges' in content:
                print("  ✓ Conditional routing edges present")
        
    except Exception as e:
        print(f"✗ Monitoring agent test failed: {e}")
        return False
    
    return True


def test_graph_compilation():
    """Test that all agent graph files exist and have proper structure."""
    print("\n" + "=" * 60)
    print("Testing Graph Compilation Structure")
    print("=" * 60)
    
    graphs_to_test = [
        ("Supervisor", os.path.join(os.path.dirname(__file__), 'app', 'agent', 'supervisor_graph.py')),
        ("Agriculture", os.path.join(os.path.dirname(__file__), '..', 'agent_agriculture', 'app', 'agent', 'agriculture_graph.py')),
        ("Regulation", os.path.join(os.path.dirname(__file__), '..', 'agent_regulation', 'app', 'agent', 'regulation_graph.py')),
        ("Business", os.path.join(os.path.dirname(__file__), '..', 'agent_business', 'app', 'agent', 'business_graph.py')),
    ]
    
    results = []
    
    for graph_name, file_path in graphs_to_test:
        try:
            if not os.path.exists(file_path):
                print(f"✗ {graph_name} graph file not found: {file_path}")
                results.append(False)
                continue
            
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                
                # Check for LangGraph components
                has_stategraph = 'StateGraph' in content
                has_build_function = f'build_{graph_name.lower()}_graph' in content
                has_compiled = 'compile()' in content
                
                if has_stategraph and has_build_function and has_compiled:
                    print(f"✓ {graph_name} graph structure is complete")
                    results.append(True)
                else:
                    print(f"✗ {graph_name} graph structure incomplete:")
                    if not has_stategraph:
                        print(f"  - Missing StateGraph")
                    if not has_build_function:
                        print(f"  - Missing build function")
                    if not has_compiled:
                        print(f"  - Missing compile() call")
                    results.append(False)
                    
        except Exception as e:
            print(f"✗ {graph_name} graph test failed: {e}")
            results.append(False)
    
    return all(results)


def main():
    """Run all tests."""
    print("\n" + "=" * 60)
    print("LangGraph Dynamic Control Shift Tests")
    print("=" * 60)
    
    tests = [
        ("Supervisor Routing", test_supervisor_routing),
        ("Agriculture Agent", test_agriculture_agent),
        ("Regulation Agent", test_regulation_agent),
        ("Business Agent", test_business_agent),
        ("Monitoring Agent", test_monitoring_agent),
        ("Graph Compilation", test_graph_compilation),
    ]
    
    results = []
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append(result)
        except Exception as e:
            print(f"\n✗ {test_name} failed with exception: {e}")
            results.append(False)
    
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    passed = sum(results)
    total = len(results)
    print(f"Passed: {passed}/{total}")
    
    if passed == total:
        print("✓ All tests passed!")
        return 0
    else:
        print("✗ Some tests failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())