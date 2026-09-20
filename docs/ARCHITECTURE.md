# Architecture technique — AgriAdvisor

## 1. Vue d'ensemble

```
Frontend (React / Lovable)
        │
        ▼
Agent superviseur (LangGraph) — routage selon l'état du farmer
        │
        ├── Agent Régulation   (RAG : pgvector + Code Rural, Cerfa, aides)
        ├── Agent Agriculture  (Sentinel-2, SoilGrids, NASA POWER, RPG → RandomForest)
        ├── Agent Business     (scoring de scénarios + prix RNM/FranceAgriMer)
        └── Agent Monitoring   (cron Celery : alertes, suivi, déclenchement marketplace)
                │
                └── Module Marketplace (CRUD simple, pas de LLM sauf génération de description)
        │
        ▼
Couche de données partagée : PostgreSQL + PostGIS + pgvector, Redis (cache/queue)
```

## 2. State machine du parcours farmer

```
onboarding
   → terrain_selectionne          (terrains + geometry enregistrés)
   → analyse_terminee              (land_profiles + crop_recommendations générés)
   → scenarios_proposes            (business_scenarios générés)
   → decision_confirmee            (farmer_decisions.statut = 'confirmed')
   → suivi_actif                   (agent_monitoring prend le relai en continu)
```

Chaque agent doit vérifier l'état courant avant de répondre (ex: l'agent
Régulation ne propose pas les mêmes actions avant/après `decision_confirmee`).
L'état est stocké sur `farmer_decisions.statut` + déduit de la présence ou
non des lignes dans les tables en amont.

## 3. Détail par agent

### Agent superviseur (orchestrator/)
- Reçoit la requête utilisateur (texte + contexte : terrain_id, état courant).
- Route vers le bon sous-agent via LangGraph.
- Ne fait pas de traitement métier lui-même.

### Agent Régulation (agent_regulation/)
- Pipeline RAG : ingestion périodique du corpus (Code Rural, Cerfa, SRDEA,
  aides FranceAgriMer) → embeddings → `regulation_documents`.
- Réponses toujours sourcées (`sources_citees` dans `regulation_chat_history`).
- Génère/pré-remplit les dossiers administratifs (`dossiers_administratifs`).
- **Important** : toujours inclure un disclaimer ("vérifiez auprès de votre
  chambre d'agriculture").

### Agent Agriculture (agent_agriculture/)
- Réutilise le pipeline existant (FastAPI + appels API externes → LandProfile
  JSON → RandomForest).
- Ajoute le module BSV (Bulletin de Santé du Végétal) pour les risques
  phytosanitaires régionaux, en amont — pas seulement mentionné en Business.
- Écrit dans `land_profiles` et `crop_recommendations`.
- Le frontend enrichit le top 5 cultures avec l'**agent Déchets**
  (`waste_agents`, port 8004) : résidus produits et voies de valorisation.

### Agent Business (agent_business/)
- Le score de matching est une **formule explicite**, pas une estimation LLM :
  `score = w1*profit_normalise + w2*(1 - risque_normalise) + w3*fit_budget`
  (poids w1/w2/w3 à calibrer par l'équipe, documentés dans ce module).
- Le LLM sert à générer le texte explicatif, pas à calculer le score.
- Utilise une source de prix de marché réelle (RNM/FranceAgriMer) plutôt
  qu'une pure estimation LLM.
- Écrit dans `business_scenarios`, puis `farmer_decisions` +
  `decision_allocations` une fois la décision confirmée (human-in-the-loop).

### Agent Déchets / Valorisation (waste_agents/)
- Base de connaissances scientifique (crop → wastes → transformations →
  applications), exposée en lecture seule via `POST /waste/for-crops` et
  `GET /waste/marketplace-suggestions`.
- Branché après les recommandations Agriculture et après confirmation
  Business → préremplit les annonces `dechet` sur la marketplace.
- La recherche autonome (web + papers) reste dans le Streamlit interne ;
  le parcours farmer n'exige pas de clé LLM.

### Agent Monitoring (agent_monitoring/)
- Tâches Celery Beat quotidiennes :
  - Suivi météo/irrigation par culture active → `alerts`.
  - Croisement risques phytosanitaires régionaux → `alerts`.
  - Détection de la fenêtre de récolte (via `decision_allocations.date_maturite_prevue`)
    → déclenche une suggestion de dépôt d'annonce (marketplace).
  - Rappels d'échéances administratives.
- Envoie les notifications via le canal préféré (`notification_preferences`).

### Module Marketplace & Auth (marketplace/ & auth/)
- **Marketplace** : CRUD classique (`annonces`, `dechets_reference`), suggestions de valorisation et de prix.
- **Auth** : Authentification JWT, gestion `users.role` (`farmer` | `acheteur`), profil, équipements et `terrains`.

## 4. Sources de données externes (par agent)

| Agent | Sources |
|---|---|
| Régulation | Code Rural, Cerfa, SRDEA, data.gouv.fr, FranceAgriMer (aides) |
| Agriculture | Sentinel-2, SoilGrids, NASA POWER, Open-Meteo, Open-Elevation, RPG, BSV |
| Business | RNM / FranceAgriMer (prix de marché) |
| Déchets | Base scientifique valorisation, ADEME |
| Monitoring | Open-Meteo (prévisions), BSV régional |

## 5. Stack technique

- **Backend** : FastAPI (un service par agent, ou modules dans un monolithe
  modulaire selon la taille de l'équipe — à trancher ensemble, voir team_guide.md)
- **Orchestration agents** : LangGraph
- **LLM** : Mistral (déjà utilisé dans le projet existant)
- **Base de données** : PostgreSQL + PostGIS (géo) + pgvector (RAG)
- **Cache / jobs async** : Redis + Celery (+ Celery Beat pour les tâches cron)
- **Frontend** : React (généré/itéré via Lovable)
