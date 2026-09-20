export type TourStep = {
  title: string;
  body: string;
  /** Matches [data-tour="…"] on the page. Omit for a centered welcome card. */
  target?: string;
};

export type PageTourId =
  | "dashboard"
  | "agriculture"
  | "regulation"
  | "business"
  | "aujourd-hui"
  | "weather"
  | "marketplace";

const STORAGE_KEY = "agriguide.tours.completed";

export function isTourCompleted(tourId: PageTourId): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const list = JSON.parse(raw) as string[];
    return Array.isArray(list) && list.includes(tourId);
  } catch {
    return false;
  }
}

export function markTourCompleted(tourId: PageTourId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (!list.includes(tourId)) {
      list.push(tourId);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  } catch {
    /* ignore */
  }
}

export function resetTour(tourId: PageTourId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const list = (JSON.parse(raw) as string[]).filter((id) => id !== tourId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export const PAGE_TOURS: Record<PageTourId, TourStep[]> = {
  dashboard: [
    {
      title: "Bienvenue sur AgriMent !",
      body: "Voici votre tableau de bord. En un coup d'œil : météo live, alertes et accès rapide à tous vos conseillers.",
    },
    {
      title: "Météo de la parcelle",
      body: "Consultez la température, l'humidité et les risques (gel, vent) pour votre terrain en direct.",
      target: "dash-weather",
    },
    {
      title: "Briefing du jour",
      body: "Ouvrez le briefing quotidien pour la météo, les tâches terrain et les alertes cultures.",
      target: "dash-briefing",
    },
    {
      title: "Accès rapide",
      body: "Accédez en un clic à l'Agriculture, la Réglementation, le Financier et le suivi du jour.",
      target: "dash-actions",
    },
  ],
  agriculture: [
    {
      title: "Conseiller Agricole",
      body: "Analysez votre parcelle : sol, satellite NDVI et top 5 des cultures adaptées à votre terrain.",
    },
    {
      title: "Carte & parcelle",
      body: "Cliquez sur la carte pour sélectionner une parcelle cadastrale, ou choisissez un terrain enregistré.",
      target: "agri-map",
    },
    {
      title: "Lancer l'analyse",
      body: "Une fois la parcelle sélectionnée, cliquez ici pour obtenir sol, végétation et recommandations de cultures.",
      target: "agri-analyze",
    },
    {
      title: "Assistant chat",
      body: "Posez vos questions à l'agent IA — il connaît votre parcelle et votre profil agricole.",
      target: "agri-chat-fab",
    },
  ],
  regulation: [
    {
      title: "Conseiller Réglementaire",
      body: "Posez vos questions sur les aides PAC, la réglementation et les démarches administratives agricoles.",
    },
    {
      title: "Posez votre question",
      body: "Écrivez ou dictez votre question. L'agent s'appuie sur des sources officielles et votre mémoire personnelle.",
      target: "reg-chat-input",
    },
    {
      title: "Suggestions rapides",
      body: "Cliquez sur une suggestion pour démarrer — aides PAC, labels, réglementation environnementale…",
      target: "reg-suggestions",
    },
    {
      title: "Mémoire & aides",
      body: "Enregistrez vos notes persistantes et consultez les aides PAC disponibles dans le panneau de droite.",
      target: "reg-sidebar",
    },
  ],
  business: [
    {
      title: "Conseiller Financier",
      body: "Simulez votre budget de campagne et comparez 3 scénarios de cultures pour maximiser votre rentabilité.",
    },
    {
      title: "Votre budget",
      body: "Indiquez le budget disponible pour la campagne (semences, intrants, main-d'œuvre…).",
      target: "biz-budget",
    },
    {
      title: "Vos terrains",
      body: "Sélectionnez les parcelles à inclure dans le calcul — la superficie est prise en compte automatiquement.",
      target: "biz-terrains",
    },
    {
      title: "Générer les scénarios",
      body: "Lancez l'analyse pour obtenir 3 scénarios comparés : rentabilité, risque et allocation des cultures.",
      target: "biz-generate",
    },
  ],
  "aujourd-hui": [
    {
      title: "Aujourd'hui",
      body: "Votre briefing quotidien : météo, irrigation, alertes cultures et plan de tâches pour la journée.",
    },
    {
      title: "Suivi de campagne",
      body: "Suivez vos dépenses et visualisez la répartition des coûts par poste sur la campagne en cours.",
      target: "today-campaign",
    },
    {
      title: "Briefing agriculteur",
      body: "Météo du jour, conseils d'irrigation et alertes sur vos cultures — généré par l'agent Monitoring.",
      target: "today-briefing",
    },
    {
      title: "Plan du jour",
      body: "Cochez les tâches au fur et à mesure — semis, traitements, irrigation, récolte…",
      target: "today-tasks",
    },
  ],
  weather: [
    {
      title: "Météo · Dashboard",
      body: "Prévisions complètes pour votre parcelle : conditions actuelles, sol, ensoleillement et tendances.",
    },
    {
      title: "Localisation",
      body: "Choisissez une parcelle enregistrée (même liste que le Conseiller Agricole) — la météo se charge au centre du terrain. Option « Autre lieu » pour une ville.",
      target: "weather-location",
    },
    {
      title: "Champs météo",
      body: "Explorez 4 vues : conditions actuelles, atmosphère, sol et rayonnement solaire.",
      target: "weather-fields",
    },
    {
      title: "Prévisions & tendances",
      body: "Consultez les prévisions 24 h / 15 jours, les graphiques de tendances et le calendrier mensuel.",
      target: "weather-forecast",
    },
  ],
  marketplace: [
    {
      title: "Marketplace",
      body: "Achetez, vendez ou valorisez vos récoltes et déchets agricoles entre exploitants.",
    },
    {
      title: "Déposer une annonce",
      body: "Publiez une récolte ou un déchet à vendre — l'IA peut pré-remplir les champs pour vous.",
      target: "market-new",
    },
    {
      title: "Parcourir & filtrer",
      body: "Filtrez par type (récoltes / déchets), région et prix pour trouver ce dont vous avez besoin.",
      target: "market-browse",
    },
    {
      title: "Mes annonces",
      body: "Gérez vos annonces publiées, marquez-les comme réservées ou consultez les détails.",
      target: "market-tabs",
    },
  ],
};
