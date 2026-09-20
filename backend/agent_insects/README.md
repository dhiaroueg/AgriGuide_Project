# Agent Insectes - Détection et Cartes d'Alerte

## Vue d'ensemble

Agent spécialisé dans la détection d'insectes, l'analyse de sévérité, et la création de cartes d'alerte géographiques avec LangGraph et handoffs dynamiques.

## Fonctionnalités

### 🔍 Détection d'Insectes
- Base de données d'insectes avec sévérité et seuils d'intervention
- Détection automatique à partir des requêtes utilisateur
- Analyse des menaces pour différentes cultures

### 🗺️ Création de Cartes d'Alerte
- Zones de sévérité géographiques (critique, alerte, surveillance)
- Distribution spatiale des foyers d'infection
- Direction et risque de propagation
- Priorité d'intervention calculée

### 🔄 Handoffs Dynamiques
- **High/Critical severity** → Agent Agriculture (traitements)
- **Moderate severity** → Agent Regulation (conformité)
- **Low severity** → Surveillance continue

## Insectes Supportés

### Échantillons de Démonstration
1. **Puceron cendré du colza** (Brevicoryne brassicae)
   - Culture: Colza d'Hiver
   - Sévérité: Modérée
   - Seuil: 10% de plantes colonisées

2. **Pyrale du maïs** (Ostrinia nubilalis)
   - Culture: Maïs Grain
   - Sévérité: Élevée
   - Seuil: 5% de plantes attaquées

3. **Rouille brune du blé** (Puccinia triticina)
   - Culture: Blé Tendre
   - Sévérité: Modérée
   - Seuil: 10% de surface foliaire atteinte

## Architecture LangGraph

```
START → insect_detection → alert_map_creation → handoff_decision → [conditional routing]
                                                                    ↓
                                                        handoff_agriculture → END
                                                        handoff_regulation → END
                                                        complete → END
```

## API Endpoints

### POST /detect
Détection d'insectes et génération de carte d'alerte.

**Request:**
```json
{
  "query": "Détection de puceron cendré du colza sur ma parcelle"
}
```

**Response:**
```json
{
  "query": "Détection de puceron cendré du colza sur ma parcelle",
  "insect_detected": {
    "Puceron cendré du colza": {
      "culture": "Colza d'Hiver",
      "agent_pathogène": "Brevicoryne brassicae",
      "severity": "moderate"
    }
  },
  "alert_map": {
    "severity_zones": {...},
    "geographic_distribution": {...},
    "intervention_priority": "Modérée - Intervention recommandée sous 48h"
  },
  "handoff_decision": {
    "action": "handoff_regulation",
    "reason": "Vérification réglementaire des traitements approuvés",
    "target": "regulation_agent"
  }
}
```

## Intégration avec le Système

### Integration avec Monitoring Agent
Le monitoring agent peut handoff vers l'agent insectes lors de la détection d'alertes :

```python
# Dans monitoring agent
if "insecte" in alert_type or "ravageur" in alert_type:
    return {
        "next_action": "handoff_insect",
        "handoff_to": "insect_agent",
        "handoff_reason": "Alerte insecte détectée, nécessite analyse spécialisée"
    }
```

### Integration avec Supervisor
Ajouter l'agent insectes au routing du supervisor :

```python
available_agents = [
    "agriculture_agent", 
    "regulation_agent", 
    "business_agent",
    "monitoring_agent",
    "weather_agent",
    "insect_agent",  # Nouvel agent
    "human_validation",
    "end"
]
```

## Installation

```bash
cd backend/agent_insects
pip install -r requirements.txt
```

## Démarrage

```bash
uvicorn app.main:app --reload --port 8009
```

## Tests

```python
from app.agent.insect_graph import run_insect_agent

# Test détection puceron
result = run_insect_agent("Puceron cendré du colza détecté")
print(f"Insecte détecté: {result['insect_detection']}")
print(f"Carte d'alerte: {result['alert_map_data']}")

# Test sévérité élevée
result = run_insect_agent("Pyrale du maïs avec forte infestation")
print(f"Handoff vers: {result['handoff_to']}")
```

## Bénéfices

✅ **Détection automatisée** des insectes et ravageurs
✅ **Cartes d'alerte géographiques** avec zones de sévérité
✅ **Handoffs intelligents** vers les bons spécialistes
✅ **Priorité d'intervention** calculée automatiquement
✅ **Intégration parfaite** avec l'architecture LangGraph existante