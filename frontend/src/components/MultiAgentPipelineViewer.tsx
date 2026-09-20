import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  executeMultiAgentPipeline,
  type PipelineStepResult,
} from "@/lib/orchestratorApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Sprout,
  Sun,
  Scale,
  Coins,
  TrendingUp,
  BrainCircuit,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Loader2,
  Activity,
  Layers,
  ExternalLink,
  MapPin,
  UserCheck,
  Cpu,
} from "lucide-react";

type AgentMeta = {
  route: string;
  pageName: string;
  icon: React.ElementType;
};

const AGENT_META: Record<string, AgentMeta> = {
  agent_router: {
    route: "/aujourd-hui",
    pageName: "Agent Router (LLM & DAG)",
    icon: Search,
  },
  input_analyzer: {
    route: "/aujourd-hui",
    pageName: "Agent Router (LLM & DAG)",
    icon: Search,
  },
  agent_agronomy: {
    route: "/agriculture",
    pageName: "Conseiller Agronomique",
    icon: Sprout,
  },
  agent_weather: {
    route: "/weather",
    pageName: "Météo & Climat",
    icon: Sun,
  },
  agent_regulation: {
    route: "/regulation",
    pageName: "Réglementation & PAC",
    icon: Scale,
  },
  agent_business: {
    route: "/business",
    pageName: "Conseiller Financier",
    icon: Coins,
  },
  agent_trading: {
    route: "/trading",
    pageName: "Agent Trading",
    icon: TrendingUp,
  },
  decision_engine: {
    route: "/business",
    pageName: "Moteur d'Assolement",
    icon: BrainCircuit,
  },
  validation_node: {
    route: "/aujourd-hui",
    pageName: "Synthèse & Validation (HITL)",
    icon: ShieldCheck,
  },
};

const PARCELS = [
  { id: "PARCEL_01", label: "Ferme des Prés (20 ha - Limono-argileux - Eure)", name: "Ferme des Prés (20 ha)" },
  { id: "PARCEL_02", label: "Parcelle Nord (50 ha - Silico-calcaire - Normandie)", name: "Parcelle Nord (50 ha)" },
  { id: "PARCEL_03", label: "Plaine de Beauce (35 ha - Sol Profond - Beauce)", name: "Plaine de Beauce (35 ha)" },
];

const SUGGESTIONS = [
  "Que planter avec 30 000 € sur 20 ha ?",
  "Quelle culture pour 50 ha avec 60k€ en Normandie ?",
  "Arbitrage Blé vs Colza pour 15 ha budget 20k€",
];

export function MultiAgentPipelineViewer() {
  const [query, setQuery] = useState("Que planter avec 30 000 € sur 20 ha ?");
  const [parcelList, setParcelList] = useState(PARCELS);
  const [selectedParcel, setSelectedParcel] = useState(PARCELS[0]);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("SCENARIO_A");
  const [humanApproved, setHumanApproved] = useState<boolean>(true);
  const [selectedStep, setSelectedStep] = useState<PipelineStepResult | null>(null);

  // Custom parcel drawer state
  const [showCustomForm, setShowCustomForm] = useState<boolean>(false);
  const [customParcelName, setCustomParcelName] = useState("Parcelle du Moulin (28 ha)");
  const [customCoords, setCustomCoords] = useState("45.8321° N, 1.2543° E");
  const [customSoil, setCustomSoil] = useState("Argilo-calcaire réchauffant");
  const [customRegion, setCustomRegion] = useState("Occitanie (Région Sud)");

  const {
    data: pipelineData,
    mutate: runPipeline,
    isPending,
  } = useMutation({
    mutationFn: executeMultiAgentPipeline,
    onSuccess: (data) => {
      setSelectedStep(data.steps[0]);
    },
  });

  useEffect(() => {
    if (!pipelineData) {
      runPipeline({ query, parcel_name: selectedParcel.name, selected_scenario_id: selectedScenarioId });
    }
  }, []);

  const handleLaunch = () => {
    runPipeline({ query, parcel_name: selectedParcel.name, selected_scenario_id: selectedScenarioId });
  };

  const handleParcelSelect = (parcelObj: typeof PARCELS[0]) => {
    setSelectedParcel(parcelObj);
    runPipeline({
      query,
      parcel_name: parcelObj.name,
      selected_scenario_id: selectedScenarioId,
      custom_coords: (parcelObj as any).custom_coords,
      custom_soil_type: (parcelObj as any).custom_soil_type,
      custom_region: (parcelObj as any).custom_region,
    });
  };

  const handleAddCustomParcel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customParcelName.trim()) return;

    const newParcel = {
      id: `PARCEL_CUSTOM_${Date.now()}`,
      label: `${customParcelName} - ${customSoil} - GPS: ${customCoords}`,
      name: customParcelName,
      custom_coords: customCoords,
      custom_soil_type: customSoil,
      custom_region: customRegion,
    };

    setParcelList((prev) => [newParcel, ...prev]);
    setSelectedParcel(newParcel);
    setShowCustomForm(false);

    runPipeline({
      query,
      parcel_name: newParcel.name,
      selected_scenario_id: selectedScenarioId,
      custom_coords: customCoords,
      custom_soil_type: customSoil,
      custom_region: customRegion,
    });
  };

  return (
    <div className="rounded-3xl border border-border/80 bg-card p-6 md:p-8 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/50 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-bold uppercase tracking-wider">
              <Cpu className="w-3.5 h-3.5" />
              Generative AI Router & Dynamic Agent DAG
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-400 text-xs font-bold uppercase tracking-wider">
              <UserCheck className="w-3.5 h-3.5" />
              Human-in-the-Loop (HITL) Active
            </span>
          </div>

          <h2 className="text-2xl font-display font-bold text-foreground">
            Pipeline Multi-Agents & Contrôle Agriculteur (HITL)
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Orchestration Generative AI : Le Router LLM sélectionne les agents requis, l'agriculteur (Humain dans la Boucle) choisit la parcelle et valide le scénario final.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-accent/30 px-3.5 py-2.5 rounded-2xl border border-border/50">
          <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />
          <span>Orchestrateur LangGraph</span>
        </div>
      </div>

      {/* Human-in-the-Loop (HITL) Parcel & Intent Bar */}
      <div className="p-4 rounded-2xl bg-accent/30 border border-border/60 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <MapPin className="w-4 h-4 text-emerald-600" />
            <span>Sélection du Terrain par l'Agriculteur (Human-in-the-Loop) :</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCustomForm(!showCustomForm)}
              className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600 hover:text-white transition"
            >
              {showCustomForm ? "Masquer le Formulaire" : "+ Saisir ma Parcelle (GPS & Sol)"}
            </button>

            <Link
              to="/agriculture"
              className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-blue-600/15 text-blue-700 dark:text-blue-300 border border-blue-500/30 hover:bg-blue-600 hover:text-white transition inline-flex items-center gap-1"
            >
              <span>🗺️ Ouvrir la Carte (Agent Agronomique)</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Custom Parcel Creator Form */}
        {showCustomForm && (
          <form onSubmit={handleAddCustomParcel} className="p-3.5 rounded-xl bg-background border border-emerald-500/30 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Ajouter un Terrain Personnalisé
              </span>
              <span className="text-[10px] text-muted-foreground">Lie le point GPS au Router LLM & Agent Agronomie</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div>
                <label className="text-[10px] font-bold text-muted-foreground block mb-1">Nom & Surface</label>
                <Input
                  value={customParcelName}
                  onChange={(e) => setCustomParcelName(e.target.value)}
                  placeholder="ex: Champ du Moulin (25 ha)"
                  className="h-8 text-xs bg-accent/20"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-muted-foreground block mb-1">Coordonnées GPS (Lat / Lon)</label>
                <Input
                  value={customCoords}
                  onChange={(e) => setCustomCoords(e.target.value)}
                  placeholder="ex: 48.8566° N, 2.3522° E"
                  className="h-8 text-xs font-mono bg-accent/20"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-muted-foreground block mb-1">Texture du Sol</label>
                <Input
                  value={customSoil}
                  onChange={(e) => setCustomSoil(e.target.value)}
                  placeholder="ex: Argilo-calcaire profond"
                  className="h-8 text-xs bg-accent/20"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-muted-foreground block mb-1">Région / Territoire</label>
                <Input
                  value={customRegion}
                  onChange={(e) => setCustomRegion(e.target.value)}
                  placeholder="ex: Occitanie (31)"
                  className="h-8 text-xs bg-accent/20"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button type="submit" size="sm" className="h-8 px-4 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg">
                Valider la Parcelle et Recalculer l'IA
              </Button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {parcelList.map((p) => {
            const isSelected = selectedParcel.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => handleParcelSelect(p)}
                className={`px-3 py-2.5 rounded-xl border text-left text-xs font-medium transition duration-200 ${isSelected
                    ? "bg-emerald-600 text-white border-emerald-600 font-bold shadow-sm"
                    : "bg-background hover:bg-accent border-border/60 text-foreground"
                  }`}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate">{p.label}</span>
                  {isSelected && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Query Input & Fast Suggestions */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Posez votre question (ex: Que planter avec 30k€ sur 20 ha ?)"
              className="pl-10 h-11 bg-background text-sm rounded-xl"
              onKeyDown={(e) => e.key === "Enter" && handleLaunch()}
            />
          </div>
          <Button
            onClick={handleLaunch}
            disabled={isPending || !query.trim()}
            className="h-11 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl gap-2 shrink-0 shadow-sm"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Consulter l'IA & Routage
          </Button>
        </div>

        {/* Suggestions chips */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-[11px] font-semibold text-muted-foreground">Suggestions rapides :</span>
          {SUGGESTIONS.map((sug, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setQuery(sug);
                runPipeline({ query: sug, parcel_name: selectedParcel.name, selected_scenario_id: selectedScenarioId });
              }}
              className="text-[11px] px-2.5 py-1 rounded-lg bg-accent/40 hover:bg-accent border border-border/50 text-foreground transition"
            >
              {sug}
            </button>
          ))}
        </div>
      </div>

      {/* Pipeline Tree / Steps Visualizer */}
      {pipelineData && (
        <div className="space-y-6 pt-4 border-t border-border/40">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" />
              Parcours d'Exécution Multi-Agents Generative AI ({pipelineData.execution_time_total_ms} ms)
            </h3>

            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20 flex items-center gap-1">
                <UserCheck className="w-3 h-3" /> Human-in-the-Loop Validé
              </span>
              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> 8 Nœuds Synchronisés
              </span>
            </div>
          </div>

          {/* Horizontal Stepper Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
            {pipelineData.steps.map((step, idx) => {
              const meta = AGENT_META[step.step_id] || {
                route: "/dashboard",
                pageName: "Agent",
                icon: Activity,
              };
              const Icon = meta.icon;
              const isSelected = selectedStep?.step_id === step.step_id;

              return (
                <button
                  key={step.step_id}
                  type="button"
                  onClick={() => setSelectedStep(step)}
                  className={`p-3 rounded-2xl border text-left transition duration-200 flex flex-col justify-between space-y-2 ${isSelected
                      ? "bg-emerald-600 text-white border-emerald-600 shadow-md scale-[1.02]"
                      : "bg-background/80 hover:border-emerald-500/40 border-border/70 text-card-foreground"
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <div className={`p-1.5 rounded-lg ${isSelected ? "bg-white/20 text-white" : "bg-emerald-500/10 text-emerald-600"}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className={`text-[10px] font-mono font-bold ${isSelected ? "text-white/80" : "text-muted-foreground"}`}>
                      0{idx + 1}
                    </span>
                  </div>

                  <div>
                    <p className={`text-[11px] font-bold line-clamp-1 ${isSelected ? "text-white" : "text-foreground"}`}>
                      {step.agent_name.replace(/\(.*?\)/, "").trim()}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span className={`text-[9px] font-mono font-bold uppercase ${isSelected ? "text-white/80" : "text-emerald-600 dark:text-emerald-400"}`}>
                        COMPLÉTÉ
                      </span>
                      <span className={`text-[9px] ${isSelected ? "text-white/70" : "text-muted-foreground"}`}>
                        {step.duration_ms} ms
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Step Detail Card */}
          {selectedStep && (
            <div className="p-5 rounded-2xl bg-accent/20 border border-border/60 text-xs space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-foreground text-sm">
                    {selectedStep.agent_name.replace(/\(.*?\)/, "").trim()}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-500/15 text-emerald-600 border border-emerald-500/20">
                    COMPLÉTÉ ({selectedStep.duration_ms} ms)
                  </span>
                </div>

                {AGENT_META[selectedStep.step_id] && (
                  <Link
                    to={AGENT_META[selectedStep.step_id].route}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition shrink-0"
                  >
                    <span>Ouvrir la page {AGENT_META[selectedStep.step_id].pageName}</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>

              <p className="text-muted-foreground text-xs leading-relaxed font-medium">
                {selectedStep.summary}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-1">
                {Object.entries(selectedStep.details).map(([key, val]) => (
                  <div key={key} className="p-3 rounded-xl bg-background border border-border/40">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block mb-0.5">{key}</span>
                    <span className="font-semibold text-foreground break-words">
                      {Array.isArray(val) ? val.join(", ") : String(val)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}




