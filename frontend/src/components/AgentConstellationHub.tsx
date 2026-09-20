import { useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { VoiceInputButton } from "@/components/chat/VoiceInputButton";
import { Button } from "@/components/ui/button";
import {
  Map,
  MessageSquareText,
  Camera,
  LayoutDashboard,
  FileText,
  CloudSun,
  TrendingUp,
  Store,
  ArrowRight,
  Bot,
  CornerDownLeft,
  Activity,
  Zap,
  MessageCircle,
  Share2,
} from "lucide-react";

export type AgentNode = {
  id: string;
  label: string;
  sublabel: string;
  category: string;
  route: string;
  icon: React.ElementType;
  angle: number; // in degrees for radial layout
  keywords: string[];
  sampleQuestions: string[];
};

export type AgentDialogueMessage = {
  agentId: string;
  agentLabel: string;
  targetAgentLabel?: string;
  icon: React.ElementType;
  route: string;
  category: string;
  message: string;
  badge?: string;
};

export type ClusterResolution = {
  primaryAgentId: string;
  relatedAgentIds: string[];
  intentTitle: string;
  dialogue: AgentDialogueMessage[];
  finalRecommendation: string;
  actionLabel: string;
  actionRoute: string;
};

export const AGENT_NODES: AgentNode[] = [
  {
    id: "mapping",
    label: "Cartographie & SIG",
    sublabel: "Parcelles, NDVI & Sol",
    category: "Agronomie",
    route: "/agriculture",
    icon: Map,
    angle: 270, // Top
    keywords: ["parcelle", "carte", "sol", "terrain", "hectare", "ha", "gps", "semis", "rendement", "assolement", "culture", "blé", "colza", "tournesol", "maïs", "planter", "plan"],
    sampleQuestions: ["Que planter sur 20 ha de sol limoneux ?", "Analyser ma parcelle Ferme des Prés"],
  },
  {
    id: "virtual_chat",
    label: "Expert Ag Copilote",
    sublabel: "Conseils en direct",
    category: "Général",
    route: "/aujourd-hui",
    icon: MessageSquareText,
    angle: 315, // Top-Right
    keywords: ["conseil", "aide", "comment", "pourquoi", "quand", "expert", "synthèse", "briefing"],
    sampleQuestions: ["Quel est mon briefing du jour ?", "Conseils pour les travaux de la semaine"],
  },
  {
    id: "identification",
    label: "Diagnostic & Scanner",
    sublabel: "Maladies & Ravageurs",
    category: "Santé Végétale",
    route: "/diagnostic",
    icon: Camera,
    angle: 0, // Right
    keywords: ["maladie", "feuille", "scanner", "ravageur", "photo", "champignon", "rouille", "septoriose", "puceron", "diagnostic", "tache", "jaune"],
    sampleQuestions: ["Identifier une tache jaune sur mes feuilles de blé", "Diagnostic maladie sur colza"],
  },
  {
    id: "dashboards",
    label: "Finances & Marge",
    sublabel: "Scénarios & Rentabilité",
    category: "Business",
    route: "/business",
    icon: LayoutDashboard,
    angle: 45, // Bottom-Right
    keywords: ["budget", "argent", "cout", "coût", "euro", "€", "marge", "rentable", "rentabilité", "charge", "trésorerie", "chiffrer", "bénéfice"],
    sampleQuestions: ["Rentabilité avec 30 000 € de budget ?", "Calculer la marge nette sur 50 ha"],
  },
  {
    id: "documentation",
    label: "Réglementation & PAC",
    sublabel: "Aides, BCAE & Éco-Régimes",
    category: "Juridique",
    route: "/regulation",
    icon: FileText,
    angle: 90, // Bottom
    keywords: ["pac", "aide", "réglementation", "loi", "norme", "bcae", "éco-régime", "subvention", "nitrate", "znt", "hve", "bio", "déclaration"],
    sampleQuestions: ["Suis-je éligible aux aides PAC Éco-Régime ?", "Plafond d'azote en zone vulnérable"],
  },
  {
    id: "weather",
    label: "Météo & Climat",
    sublabel: "Prévisions & Risque Gel",
    category: "Climat",
    route: "/weather",
    icon: CloudSun,
    angle: 135, // Bottom-Left
    keywords: ["météo", "pluie", "gel", "température", "vent", "climat", "sécheresse", "irrigation", "canicule", "orage", "eau"],
    sampleQuestions: ["Risque de gel cette semaine ?", "Prévisions de pluie pour mes semis"],
  },
  {
    id: "trading",
    label: "Trading & Marchés",
    sublabel: "Cotations Euronext Live",
    category: "Marchés",
    route: "/trading",
    icon: TrendingUp,
    angle: 180, // Left
    keywords: ["trading", "prix", "cours", "euronext", "marché", "vente", "vendre", "cotation", "tonne", "tendance", "contrat", "matif"],
    sampleQuestions: ["Cours du blé sur Euronext ?", "Quand vendre ma récolte de colza ?"],
  },
  {
    id: "assets",
    label: "Matériel & Annonces",
    sublabel: "Achats, Ventes & Location",
    category: "Exploitation",
    route: "/marketplace",
    icon: Store,
    angle: 225, // Top-Left
    keywords: ["matériel", "tracteur", "machine", "achat", "vendre", "location", "annonce", "marketplace", "outil", "semoir", "benne"],
    sampleQuestions: ["Trouver un semoir ou tracteur en location", "Publier une annonce de vente de paille"],
  },
];

function resolveAgentCollaboration(query: string): ClusterResolution {
  const q = query.toLowerCase().trim();

  // Cluster 1: Maladie & Diagnostic (Identification ⇄ Météo ⇄ Cartographie)
  if (q.includes("maladie") || q.includes("feuille") || q.includes("tache") || q.includes("rouille") || q.includes("champignon") || q.includes("scanner") || q.includes("diagnostic")) {
    return {
      primaryAgentId: "identification",
      relatedAgentIds: ["identification", "weather", "mapping"],
      intentTitle: "Diagnostic Phytosanitaire & Alerte Fongique",
      dialogue: [
        {
          agentId: "identification",
          agentLabel: "Agent Diagnostic Santé",
          targetAgentLabel: "Agent Météo",
          icon: Camera,
          route: "/agriculture",
          category: "Santé Végétale",
          message: "Détection de symptômes fongiques (suspicion rouille brune / septoriose sur céréales). Météo, quelles ont été l'humidité et les températures de la semaine ?",
          badge: "Étape 1 : Diagnostic IA",
        },
        {
          agentId: "weather",
          agentLabel: "Agent Météo",
          targetAgentLabel: "Cartographie SIG",
          icon: CloudSun,
          route: "/weather",
          category: "Climat",
          message: "Humidité relative supérieure à 82% et températures douces (15-18°C) sur votre parcelle. Conditions très favorables à la sporulation. Risque élevé confirmé.",
          badge: "Étape 2 : Confirmation Climat",
        },
        {
          agentId: "mapping",
          agentLabel: "Cartographie & SIG",
          targetAgentLabel: "Agriculteur",
          icon: Map,
          route: "/agriculture",
          category: "Agronomie",
          message: "Parcelle 'Ferme des Prés' ciblée (stade 2 nœuds). Seuil d'intervention Arvalis atteint. Déclenchement d'un traitement préventif biocontrôle conseillé sous 48h.",
          badge: "Étape 3 : Prescription Parcelle",
        },
      ],
      finalRecommendation: "L'équipe d'agents (Diagnostic + Météo + SIG) recommande une application fongicide ciblée sur les parcelles sensibles avant les pluies du week-end.",
      actionLabel: "Ouvrir l'Agent Diagnostic & Scanner",
      actionRoute: "/diagnostic",
    };
  }

  // Cluster 2: Trading / Cours / Vente (Trading ⇄ Finances ⇄ Copilote)
  if (q.includes("cours") || q.includes("trading") || q.includes("prix") || q.includes("euronext") || q.includes("vendre") || q.includes("vente") || q.includes("matif")) {
    return {
      primaryAgentId: "trading",
      relatedAgentIds: ["trading", "dashboards", "virtual_chat"],
      intentTitle: "Arbitrage Marché & Stratégie de Couverture",
      dialogue: [
        {
          agentId: "trading",
          agentLabel: "Agent Trading Euronext",
          targetAgentLabel: "Finances & Marge",
          icon: TrendingUp,
          route: "/trading",
          category: "Marchés",
          message: "Cotations Euronext en direct : Blé Meunier à 242.50 €/t (tendance haussière), Colza à 485.50 €/t. Finances, quel est notre seuil de rentabilité ?",
          badge: "Étape 1 : Cotations Live",
        },
        {
          agentId: "dashboards",
          agentLabel: "Finances & Marge",
          targetAgentLabel: "Expert Copilote",
          icon: LayoutDashboard,
          route: "/business",
          category: "Business",
          message: "Notre coût de revient est établi à 175 €/t sur le blé. Au cours actuel de 242.50 €/t, la marge nette d'exploitation atteint +28.5%.",
          badge: "Étape 2 : Calcul de Marge",
        },
        {
          agentId: "virtual_chat",
          agentLabel: "Expert Ag Copilote",
          targetAgentLabel: "Agriculteur",
          icon: MessageSquareText,
          route: "/trading",
          category: "Conseil",
          message: "Recommandation stratégique : Verrouiller un contrat à terme sur 40% de la récolte dès maintenant pour sécuriser le bénéfice sans spéculation excessive.",
          badge: "Étape 3 : Décision de Vente",
        },
      ],
      finalRecommendation: "Opportunité de marché validée : Les agents Trading et Finances conseillent de contractualiser 40% des volumes estimés.",
      actionLabel: "Accéder au Terminal Trading",
      actionRoute: "/trading",
    };
  }

  // Cluster 3: Matériel / Equipement (Marketplace ⇄ Finances ⇄ Copilote)
  if (q.includes("matériel") || q.includes("tracteur") || q.includes("machine") || q.includes("location") || q.includes("annonce") || q.includes("semoir")) {
    return {
      primaryAgentId: "assets",
      relatedAgentIds: ["assets", "dashboards", "virtual_chat"],
      intentTitle: "Optimisation du Parc Matériel & Entraide",
      dialogue: [
        {
          agentId: "assets",
          agentLabel: "Marketplace Agricole",
          targetAgentLabel: "Finances & Marge",
          icon: Store,
          route: "/marketplace",
          category: "Exploitation",
          message: "3 semoirs de précision et 2 tracteurs disponibles en location partagée dans un rayon de 15 km auprès d'agriculteurs voisins.",
          badge: "Étape 1 : Inventaire Matériel",
        },
        {
          agentId: "dashboards",
          agentLabel: "Finances & Marge",
          targetAgentLabel: "Expert Copilote",
          icon: LayoutDashboard,
          route: "/business",
          category: "Business",
          message: "L'option de location partagée réduit les charges de mécanisation de 35% par rapport à l'investissement neuf sur cette campagne.",
          badge: "Étape 2 : Économie de Charges",
        },
        {
          agentId: "virtual_chat",
          agentLabel: "Expert Ag Copilote",
          targetAgentLabel: "Agriculteur",
          icon: MessageSquareText,
          route: "/marketplace",
          category: "Conseil",
          message: "Mise en relation directe prête à être initiée avec les propriétaires d'engins vérifiés sur la plateforme.",
          badge: "Étape 3 : Mise en Relation",
        },
      ],
      finalRecommendation: "Solution d'équipement validée : Économisez 35% sur vos charges de semis via la location de matériel partagé.",
      actionLabel: "Voir les Annonces Disponibles",
      actionRoute: "/marketplace",
    };
  }

  // Cluster 4: Météo & Risques Purs (Météo ⇄ Cartographie ⇄ Réglementation)
  if (q.includes("météo") || q.includes("gel") || q.includes("pluie") || q.includes("climat") || q.includes("sécheresse") || q.includes("irrigation") || q.includes("vent")) {
    return {
      primaryAgentId: "weather",
      relatedAgentIds: ["weather", "mapping", "documentation"],
      intentTitle: "Veille Agrométéorologique & Risques Climatiques",
      dialogue: [
        {
          agentId: "weather",
          agentLabel: "Agent Météo",
          targetAgentLabel: "Cartographie SIG",
          icon: CloudSun,
          route: "/weather",
          category: "Climat",
          message: "Température actuelle 16°C, vent 14 km/h. Prévision d'un pic de fraîcheur nocturne à +2°C sans gel critique (<5%). Pluie de 12 mm attendue jeudi.",
          badge: "Étape 1 : Prévision Radar",
        },
        {
          agentId: "mapping",
          agentLabel: "Cartographie & SIG",
          targetAgentLabel: "Réglementation",
          icon: Map,
          route: "/agriculture",
          category: "Agronomie",
          message: "La réserve utile en eau du sol (160 mm) absorbera parfaitement ces précipitations sans risque d'asphyxie racinaire sur vos céréales.",
          badge: "Étape 2 : Impact Sols",
        },
        {
          agentId: "documentation",
          agentLabel: "Réglementation PAC",
          targetAgentLabel: "Agriculteur",
          icon: FileText,
          route: "/regulation",
          category: "Juridique",
          message: "Conditions de vent < 19 km/h conformes pour les applications phytosanitaires dans le respect des ZNT (Zones Non Traitées).",
          badge: "Étape 3 : Fenêtre Réglementaire",
        },
      ],
      finalRecommendation: "Feu vert agrométéorologique : conditions favorables pour vos travaux de sol et de fertilisation avant jeudi.",
      actionLabel: "Ouvrir le Radar Météo Détaillé",
      actionRoute: "/weather",
    };
  }

  // Cluster 5 (Default): Assolement / Choix de cultures / Budget (Agronomie ⇄ Météo ⇄ Réglementation ⇄ Finances)
  return {
    primaryAgentId: "mapping",
    relatedAgentIds: ["mapping", "weather", "documentation", "dashboards"],
    intentTitle: "Optimisation d'Assolement & Concertation Multi-Agents",
    dialogue: [
      {
        agentId: "mapping",
        agentLabel: "Cartographie & SIG",
        targetAgentLabel: "Agent Météo",
        icon: Map,
        route: "/agriculture",
        category: "Agronomie",
        message: "Parcelle de 20 ha (sol limono-argileux profond) : potentiel agronomique de 7.8 t/ha en Blé Tendre et 3.6 t/ha en Colza. Météo, peux-tu valider le contexte climatique ?",
        badge: "1. Analyse Pédologique",
      },
      {
        agentId: "weather",
        agentLabel: "Agent Météo",
        targetAgentLabel: "Réglementation PAC",
        icon: CloudSun,
        route: "/weather",
        category: "Climat",
        message: "Climat tempéré validé : 680 mm de précipitations annuelles, risque de gel faible (<5%). Pas de stress hydrique précoce. Réglementation, les aides PAC s'appliquent ?",
        badge: "2. Validation Climat",
      },
      {
        agentId: "documentation",
        agentLabel: "Réglementation PAC",
        targetAgentLabel: "Finances & Marge",
        icon: FileText,
        route: "/regulation",
        category: "Juridique",
        message: "Rotation Blé/Colza conforme BCAE 7. Éligible aux aides directes Éco-Régime Niveau 2 (+2 200 € pour 20 ha). Finances, intègre les aides dans ton calcul.",
        badge: "3. Conformité PAC",
      },
      {
        agentId: "dashboards",
        agentLabel: "Finances & Marge",
        targetAgentLabel: "Agriculteur",
        icon: LayoutDashboard,
        route: "/business",
        category: "Business",
        message: "Charges calculées à 19 600 € (couvertes par votre budget de 30 000 €). Bénéfice net prévisionnel : +18 280 €. Scénario rentable et sécurisé !",
        badge: "4. Bilan Financier",
      },
    ],
    finalRecommendation: "Concertation validée à 100% : Le Blé Tendre et le Colza d'Hiver maximisent votre marge tout en garantissant la conformité PAC.",
    actionLabel: "Ouvrir l'Analyse Complète sur la Carte",
    actionRoute: "/agriculture",
  };
}

export function AgentConstellationHub() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const firstName = user?.nom?.split(" ")[0] ?? "Agriculteur";

  const [query, setQuery] = useState("Que planter avec 30 000 € sur 20 ha ?");

  // Resolve the active collaboration cluster based on the user question
  const cluster = useMemo(() => {
    return resolveAgentCollaboration(query);
  }, [query]);

  const activeNodeIds = cluster.relatedAgentIds;
  const primaryAgent = AGENT_NODES.find((n) => n.id === cluster.primaryAgentId) || AGENT_NODES[0];

  const handleAsk = (userQuery: string) => {
    if (!userQuery.trim()) return;
    setQuery(userQuery);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleAsk(query);
  };

  const handleVoiceTranscript = (text: string) => {
    setQuery(text);
  };

  const handleNodeClick = (node: AgentNode) => {
    setQuery(node.sampleQuestions[0]);
  };

  const handleDirectRedirect = () => {
    navigate({ to: cluster.actionRoute as any });
  };

  const currentHour = new Date().getHours();
  const greeting = currentHour >= 18 || currentHour < 5 ? "Bonsoir" : "Bonjour";

  return (
    <div className="relative w-full rounded-3xl border border-border/80 bg-card/75 backdrop-blur-xl p-5 sm:p-8 shadow-sm transition-colors duration-300">
      {/* Ambient background */}
      <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-primary/5 rounded-3xl pointer-events-none" />

      {/* Top Header Badge Row */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 border-b border-border/60 pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold uppercase tracking-wider font-mono">
            <Zap className="w-3.5 h-3.5 text-primary animate-pulse" />
            Réseau Multi-Agents Concerté
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/40 text-accent-foreground border border-border/60 text-xs font-mono">
            <Share2 className="w-3 h-3 text-primary" />
            {activeNodeIds.length} Agents en Dialogue Actif
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
          <Activity className="w-4 h-4 text-primary" />
          <span>Collaboration Ciblée par Intention</span>
        </div>
      </div>

      {/* Constellation Radial Container */}
      <div className="relative min-h-[460px] sm:min-h-[520px] flex items-center justify-center py-4 my-2">
        {/* Decorative concentric orbits */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-40 dark:opacity-20" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50%" cy="50%" r="42%" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="text-primary/40" />
          <circle cx="50%" cy="50%" r="28%" fill="none" stroke="currentColor" strokeWidth="1" className="text-primary/20" />
        </svg>

        {/* 8 Radial Agent Nodes */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {AGENT_NODES.map((node) => {
            const rad = (node.angle * Math.PI) / 180;
            const distance = 42;
            const x = Math.cos(rad) * distance;
            const y = Math.sin(rad) * distance;
            const isCollaborating = activeNodeIds.includes(node.id);
            const isPrimary = cluster.primaryAgentId === node.id;
            const Icon = node.icon;

            return (
              <div
                key={node.id}
                style={{
                  transform: `translate(${x}vw, ${y}vh)`,
                  left: "50%",
                  top: "50%",
                  position: "absolute",
                }}
                className="pointer-events-auto -translate-x-1/2 -translate-y-1/2"
              >
                {/* Active laser ray: only illuminates for collaborating agents! */}
                <div
                  className={`absolute top-1/2 left-1/2 h-[2px] origin-left transition-all duration-500 pointer-events-none ${
                    isCollaborating
                      ? isPrimary
                        ? "bg-gradient-to-r from-primary to-transparent opacity-100 shadow-[0_0_10px_var(--primary)] h-[3px]"
                        : "bg-gradient-to-r from-primary/70 to-transparent opacity-80 shadow-[0_0_6px_var(--primary)]"
                      : "bg-border/40 opacity-20"
                  }`}
                  style={{
                    transform: `rotate(${node.angle + 180}deg)`,
                    width: "110px",
                  }}
                />

                {/* Node Button Card */}
                <button
                  type="button"
                  onClick={() => handleNodeClick(node)}
                  className={`group relative flex flex-col items-center gap-1.5 p-2 rounded-2xl transition-all duration-300 ${
                    isCollaborating
                      ? isPrimary
                        ? "scale-115"
                        : "scale-105"
                      : "opacity-45 hover:opacity-80 scale-95"
                  }`}
                >
                  {/* Outer circle icon container */}
                  <div
                    className={`w-12 h-12 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center transition-all duration-300 shadow-sm ${
                      isPrimary
                        ? "bg-primary text-primary-foreground border-2 border-primary shadow-lg ring-4 ring-primary/25 scale-105"
                        : isCollaborating
                        ? "bg-primary/20 border-2 border-primary/60 text-primary shadow-md ring-2 ring-primary/15"
                        : "bg-card/90 border border-border/80 text-muted-foreground group-hover:border-primary/50 group-hover:bg-accent/40"
                    }`}
                  >
                    <Icon className="w-5 h-5 sm:w-7 sm:h-7 transition-transform duration-300 group-hover:scale-110" />
                  </div>

                  {/* Node label badge */}
                  <div className="flex flex-col items-center text-center max-w-[90px] sm:max-w-[110px]">
                    <span
                      className={`text-[10px] sm:text-xs font-bold leading-tight px-2 py-0.5 rounded-lg transition line-clamp-1 ${
                        isPrimary
                          ? "bg-primary text-primary-foreground font-extrabold shadow-sm"
                          : isCollaborating
                          ? "bg-primary/15 text-primary border border-primary/30"
                          : "text-muted-foreground group-hover:text-foreground"
                      }`}
                    >
                      {node.label}
                    </span>
                  </div>
                </button>
              </div>
            );
          })}
        </div>

        {/* Central Orchestrator Prompt Box */}
        <div className="relative z-20 w-full max-w-lg bg-card/95 backdrop-blur-md rounded-3xl border border-border/90 p-5 sm:p-7 shadow-lg text-center space-y-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-display font-bold text-foreground tracking-tight">
              {greeting}, {firstName} !
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Posez votre question : seuls les agents concernés se concertent et échangent entre eux.
            </p>
          </div>

          {/* Central Search Form */}
          <form onSubmit={handleSubmit} className="relative">
            <div className="flex items-center gap-2 bg-background border-2 border-border/80 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 rounded-2xl p-2 transition shadow-inner">
              <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 text-primary">
                <Bot className="w-4 h-4" />
              </div>

              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ex: Que planter sur 20 ha avec 30 000 € ?"
                className="w-full bg-transparent text-xs sm:text-sm text-foreground placeholder:text-muted-foreground focus:outline-none px-2 font-medium"
              />

              <VoiceInputButton
                onTranscript={handleVoiceTranscript}
                size="sm"
                className="border-border/60 bg-accent/30 text-foreground hover:bg-accent/60"
              />

              <button
                type="submit"
                className="w-9 h-9 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold flex items-center justify-center shrink-0 transition duration-200 shadow-md hover:scale-105"
                title="Lancer la concertation des agents"
              >
                <CornerDownLeft className="w-4 h-4" />
              </button>
            </div>
          </form>

          {/* Quick chips suggestions */}
          <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Thèmes :</span>
            {[
              "Que planter avec 30k€ sur 20 ha ?",
              "Risque gel météo sur parcelles",
              "Cours du blé Euronext & Vente",
              "Diagnostic taches sur feuilles",
              "Louer un semoir ou tracteur",
            ].map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setQuery(chip);
                  handleAsk(chip);
                }}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-accent/40 hover:bg-accent border border-border/60 text-foreground transition"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Inter-Agent Dialogue & Collaboration Section */}
      <div className="relative z-10 mt-6 pt-6 border-t border-border/60 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Dialogue Concerté entre Agents Référents ({activeNodeIds.length} Agents mobilisés)
            </h3>
          </div>
          <span className="text-[11px] font-mono text-primary font-bold">
            {cluster.intentTitle}
          </span>
        </div>

        {/* Structured Inter-Agent Conversation Speech Bubbles */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {cluster.dialogue.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="p-4 rounded-2xl bg-accent/25 border border-border/70 shadow-sm flex flex-col justify-between space-y-2.5 hover:border-primary/40 transition"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-foreground block leading-tight">
                        {item.agentLabel}
                      </span>
                      {item.targetAgentLabel && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          ↳ s'adresse à <strong className="text-foreground/80">{item.targetAgentLabel}</strong>
                        </span>
                      )}
                    </div>
                  </div>

                  {item.badge && (
                    <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-md bg-background border border-border/60 text-muted-foreground">
                      {item.badge}
                    </span>
                  )}
                </div>

                <p className="text-xs text-foreground/90 leading-relaxed font-medium bg-background/60 p-2.5 rounded-xl border border-border/40">
                  "{item.message}"
                </p>
              </div>
            );
          })}
        </div>

        {/* Synthesized Recommendation & Direct Action Card */}
        <div className="p-4 sm:p-5 rounded-2xl bg-primary/10 border border-primary/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary font-mono block">
              Synthèse d'Action Collaborative
            </span>
            <p className="text-xs sm:text-sm font-semibold text-foreground">
              {cluster.finalRecommendation}
            </p>
          </div>

          <Button
            type="button"
            onClick={handleDirectRedirect}
            className="h-10 px-5 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl gap-2 transition duration-200 shadow-sm shrink-0"
          >
            <span>{cluster.actionLabel}</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
