"""
Test script for the insect agent with alert mapping.
"""
import sys
import os
import io

# Fix Windows console encoding issue
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

def test_insect_detection():
    """Test insect detection and alert mapping."""
    print("=" * 60)
    print("Testing Insect Agent - Alert Mapping")
    print("=" * 60)
    
    try:
        from app.agent.insect_graph import run_insect_agent
        
        # Test 1: Puceron cendré du colza
        print("\nTest 1: Puceron cendré du colza")
        result = run_insect_agent("Détection de puceron cendré du colza sur ma parcelle")
        print(f"Insecte détecté: {result.get('insect_detection')}")
        print(f"Sévérité: {result.get('severity_level')}")
        print(f"Carte d'alerte générée: {result.get('alert_map_data') is not None}")
        print(f"Handoff décision: {result.get('next_action')} -> {result.get('handoff_to')}")
        
        # Test 2: Pyrale du maïs (high severity)
        print("\nTest 2: Pyrale du maïs")
        result = run_insect_agent("Pyrale du maïs détectée avec forte infestation")
        print(f"Insecte détecté: {result.get('insect_detection')}")
        print(f"Sévérité: {result.get('severity_level')}")
        print(f"Handoff vers: {result.get('handoff_to')}")
        print(f"Raison: {result.get('handoff_reason')}")
        
        # Test 3: Rouille brune du blé
        print("\nTest 3: Rouille brune du blé")
        result = run_insect_agent("Rouille brune du blé sur les feuilles")
        print(f"Insecte détecté: {result.get('insect_detection')}")
        print(f"Carte d'alerte: {result.get('alert_map_data')}")
        
        print("\n✓ All insect agent tests passed!")
        return True
        
    except Exception as e:
        print(f"\n✗ Insect agent test failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_insect_detection()
    sys.exit(0 if success else 1)