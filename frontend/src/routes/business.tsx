import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { AlertBanner } from "@/components/AlertBanner";
import { PageHeader } from "@/components/PageHeader";
import { Reveal } from "@/components/motion/Reveal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  LineChart,
  Check,
  CheckCircle2,
  TrendingUp,
  MapPin,
  Ruler,
  Loader2,
  Info,
  Quote,
  Store,
  Leaf,
  ArrowRight,
  Calculator,
  CircleAlert,
  Database,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  fetchBusinessScenarios,
  confirmFarmerDecision,
  BusinessApiError,
  type BusinessAdvisorResponse,
  type BusinessScenario,
  type DetailCalculMetrique,
  type FarmerDecisionResponse,
  type FarmerDecisionRequest,
} from "@/lib/businessApi";
import {
  getLatestAnalyzedTerrainId,
  loadRealCropRecommendations,
  loadLatestCropRecommendations,
  cultureLabel,
} from "@/lib/cropRecommendations";
import { saveFarmerDecision } from "@/lib/farmerDecision";
import { useAuth } from "@/lib/auth-context";
import { MarketplaceWasteSuggestions } from "@/components/CropWasteValorization";
import { PageTour } from "@/components/onboarding/PageTour";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/business")({
  head: () => ({
    meta: [
      { title: "Conseiller Financier - AgriMent" },
      {
        name: "description",
        content:
          "Simulez votre budget et comparez trois scénarios de cultures adaptés à votre exploitation.",
      },
      { property: "og:title", content: "Conseiller Financier - AgriMent" },
      {
        property: "og:description",
        content: "Comparez trois scénarios pour tirer le meilleur de votre budget.",
      },
    ],
  }),
  component: Page,
});

const FALLBACK_SUPERFICIE_HA = 10;

/** Le farmer plante dans ~2 semaines par défaut ; ajustable plus tard depuis l'onboarding. */
function datePlantationPrevue(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

type RiskLevel = "Faible" | "Modéré" | "Élevé";

function riskLevel(risqueScoreNormalise: number): RiskLevel {
  if (risqueScoreNormalise <= 0.3) return "Faible";
  if (risqueScoreNormalise <= 0.55) return "Modéré";
  return "Élevé";
}

const riskColor: Record<RiskLevel, string> = {
  Faible: "bg-harvest/15 text-harvest border-harvest/30",
  Modéré: "bg-waste/20 text-waste-foreground border-waste/40",
  Élevé: "bg-destructive/10 text-destructive border-destructive/30",
};

function parseBudgetInput(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

const AGRI_ERROR_KEY = "NEED_AGRI_ANALYSIS";

function Page() {
  const [budgetText, setBudgetText] = useState("");
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [report, setReport] = useState<BusinessAdvisorResponse | null>(null);

  const [selected, setSelected] = useState<BusinessScenario | null>(null);
  const [decision, setDecision] = useState<FarmerDecisionResponse | null>(null);
  const [detailScenario, setDetailScenario] = useState<BusinessScenario | null>(null);

  const { user, token } = useAuth();
  const terrains = useMemo(() => user?.terrains ?? [], [user]);
  const [selectedTerrainIds, setSelectedTerrainIds] = useState<string[]>([]);

  useEffect(() => {
    if (!terrains.length) {
      setSelectedTerrainIds([]);
      return;
    }
    setSelectedTerrainIds((current) => {
      const stillValid = current.filter((id) => terrains.some((t) => t.id === id));
      if (stillValid.length > 0) return stillValid;
      const analyzed = getLatestAnalyzedTerrainId();
      if (analyzed && terrains.some((t) => t.id === analyzed)) return [analyzed];
      return [terrains[0].id];
    });
  }, [terrains]);

  const selectedTerrains = useMemo(
    () => terrains.filter((t) => selectedTerrainIds.includes(t.id)),
    [terrains, selectedTerrainIds],
  );
  const ha = selectedTerrains.reduce((sum, t) => sum + (t.superficie_ha ?? 0), 0);
  const superficieDisponibleHa = ha >= 0.1 ? Math.round(ha * 100) / 100 : FALLBACK_SUPERFICIE_HA;

  // Primary terrain for persistence: prefer Agriculture-analyzed parcel among selection.
  const terrainId = useMemo(() => {
    const analyzed = getLatestAnalyzedTerrainId();
    if (analyzed && selectedTerrainIds.includes(analyzed)) return analyzed;
    for (const id of selectedTerrainIds) {
      if ((loadRealCropRecommendations(id) ?? []).length > 0) return id;
    }
    return selectedTerrainIds[0] ?? "fallback-sans-terrain";
  }, [selectedTerrainIds]);
  const terrainIdsKey = selectedTerrainIds.slice().sort().join(",");

  const cropRecommendations = useMemo(() => {
    // 1. Cherche une analyse pour chaque terrain sélectionné
    for (const id of selectedTerrainIds) {
      const recs = loadRealCropRecommendations(id);
      if (recs && recs.length > 0) return recs;
    }
    // 2. Fallback : charge la toute dernière analyse disponible (utile si
    //    terrain_id ne correspond pas exactement ou en mode SKIP_AUTH).
    return loadLatestCropRecommendations() ?? [];
  }, [selectedTerrainIds, terrainId]);

  function toggleTerrain(id: string) {
    setSelectedTerrainIds((current) => {
      if (current.includes(id)) {
        if (current.length === 1) return current;
        return current.filter((value) => value !== id);
      }
      return [...current, id];
    });
  }

  const decisionMutation = useMutation({
    mutationFn: (request: FarmerDecisionRequest) => {
      if (!token) throw new Error("Authentification requise.");
      return confirmFarmerDecision(request, token);
    },
    onSuccess: (data, variables) => {
      setDecision(data);
      saveFarmerDecision(data);
      const chosen = report?.scenarios.find(
        (s) => s.culture === variables.allocations[0]?.culture,
      );
      if (chosen) setSelected(chosen);
    },
  });

  const scenariosMutation = useMutation({
    mutationFn: (budget: number) => {
      if (!token) throw new Error("Authentification requise.");
      return fetchBusinessScenarios({
        terrain_id: terrainId,
        terrain_ids: selectedTerrainIds,
        superficie_disponible_ha: superficieDisponibleHa,
        budget_input: budget,
        date_plantation_prevue: datePlantationPrevue(),
        crop_recommendations: cropRecommendations,
        nb_scenarios: 3,
      }, token);
    },
    onSuccess: (data) => {
      setReport(data);
      setSelected(null);
      setDecision(null);
      decisionMutation.reset();
    },
  });

  useEffect(() => {
    setReport(null);
    setSelected(null);
    setDecision(null);
    decisionMutation.reset();
    scenariosMutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrainIdsKey]);

  function generateReport() {
    if (selectedTerrainIds.length === 0) {
      setBudgetError("Sélectionnez au moins un terrain.");
      return;
    }
    if (cropRecommendations.length === 0) {
      setBudgetError(AGRI_ERROR_KEY);
      return;
    }
    const budget = parseBudgetInput(budgetText);
    if (budget == null) {
      setBudgetError("Indiquez un budget valide en euros (ex. : 25000).");
      return;
    }
    setBudgetError(null);
    scenariosMutation.mutate(budget);
  }

  function chooseScenario(scenario: BusinessScenario) {
    decisionMutation.mutate({
      terrain_id: terrainId,
      terrain_ids: selectedTerrainIds,
      superficie_disponible_ha: superficieDisponibleHa,
      allocations: [
        {
          scenario_id: scenario.id!,
          culture: scenario.culture,
          hectares_alloues: scenario.superficie_conseillee_ha,
        },
      ],
    });
  }

  function reset() {
    setSelected(null);
    setDecision(null);
    decisionMutation.reset();
  }

  if (selected && decision) {
    const risk = riskLevel(selected.risque_score);
    const allocation = decision.allocations[0];
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-harvest/20 text-harvest flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <h1 className="mt-6 font-display text-3xl md:text-4xl font-semibold">
            Scénario confirmé
          </h1>
          <p className="mt-2 text-muted-foreground">
            Voici la répartition de vos hectares pour <b>{cultureLabel(selected.culture)}</b>.
          </p>
        </div>

        <div className="card-soft p-6 mt-8 max-w-2xl mx-auto">
          <div className="text-sm text-muted-foreground">
            Répartition confirmée (agent_business)
          </div>
          <div className="mt-4">
            <div className="flex justify-between text-sm font-medium">
              <span>{cultureLabel(selected.culture)}</span>
              <span className="text-muted-foreground">{allocation.hectares_alloues} ha</span>
            </div>
            <div className="mt-1 h-3 rounded-full bg-secondary overflow-hidden">
              <div className="h-full bg-gradient-hero" style={{ width: "100%" }} />
            </div>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-secondary/60 p-4">
              <div className="text-xs text-muted-foreground">Coût final</div>
              <div className="font-display text-2xl font-semibold">
                {allocation.cout_alloue.toLocaleString("fr-FR")} €
              </div>
            </div>
            <div className="rounded-2xl bg-secondary/60 p-4">
              <div className="text-xs text-muted-foreground">Récolte estimée</div>
              <div className="font-display text-2xl font-semibold">
                {new Date(allocation.date_maturite_prevue).toLocaleDateString("fr-FR")}
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between">
            <Badge className={`border ${riskColor[risk]}`}>Risque {risk}</Badge>
            <span className="text-xs text-muted-foreground">
              Décision #{decision.decision_id.slice(0, 8)}
            </span>
          </div>
        </div>

        <MarketplaceWasteSuggestions culture={selected.culture} />

        <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
          <Button variant="outline" onClick={reset} className="rounded-xl">
            Choisir un autre scénario
          </Button>
          <Button asChild className="rounded-xl">
            <Link to="/marketplace/nouveau" search={{ kind: "dechet", culture: selected.culture }}>
              <Store className="h-4 w-4 mr-2" />
              Aller à la marketplace
            </Link>
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        icon={LineChart}
        tone="earth"
        title="Conseiller Financier"
        subtitle="Comparez des scénarios adaptés à votre parcelle avant d’engager votre budget."
        className="mb-7"
      />

      <Reveal from="up" className="border-y border-border/70 py-5" data-tour="biz-budget">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(19rem,0.9fr)] lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <WalletCards className="h-4 w-4" />
              </span>
              Préparer votre étude
            </div>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Indiquez l’enveloppe disponible pour la campagne. AgriMent comparera les cultures
              issues de votre analyse de parcelle, puis détaillera les hypothèses derrière chaque chiffre.
            </p>
          </div>
          <div>
            <label htmlFor="budget-input" className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Budget de départ
            </label>
            <div className="mt-2 flex gap-2">
            <div className="relative flex-1">
              <Input
                id="budget-input"
                type="text"
                inputMode="decimal"
                value={budgetText}
                onChange={(e) => {
                  setBudgetText(e.target.value);
                  setBudgetError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    generateReport();
                  }
                }}
                placeholder="Ex. : 25 000"
                aria-label="Budget en euros"
                className="h-12 rounded-xl pr-10 text-base font-display font-semibold"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                €
              </span>
              {budgetError && budgetError !== AGRI_ERROR_KEY && (
                <p className="mt-1.5 text-xs text-destructive">{budgetError}</p>
              )}
              {budgetError === AGRI_ERROR_KEY && (
                <div className="mt-2 flex items-start gap-3 border-l-2 border-harvest bg-harvest/10 px-3 py-2.5 text-sm">
                  <Leaf className="h-4 w-4 mt-0.5 shrink-0 text-harvest" />
                  <span className="flex-1 text-harvest-foreground">
                    Analysez d'abord ce terrain dans le{" "}
                    <strong>Conseiller Agriculture</strong> pour obtenir de vraies recommandations.
                  </span>
                  <Button asChild size="sm" className="shrink-0 rounded-lg h-8 gap-1.5">
                    <Link to="/agriculture">
                      Analyser
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              )}
            </div>
            <Button
              type="button"
              className="h-12 shrink-0 rounded-xl"
              disabled={scenariosMutation.isPending}
              onClick={generateReport}
              data-tour="biz-generate"
            >
              {scenariosMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <LineChart className="h-4 w-4 mr-2" />
              )}
              Comparer les scénarios
            </Button>
            </div>
          </div>
        </div>
      </Reveal>

      <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,0.72fr)]">
        <Reveal from="up" delay={80} className="border border-border/80 bg-card p-5 md:p-6">
          <div data-tour="biz-terrains">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Parcelles retenues</p>
              <h2 className="mt-1 font-display text-xl font-bold tracking-tight">Votre périmètre de campagne</h2>
            </div>
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
              <Ruler className="h-4 w-4" /> {ha.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ha
            </span>
          </div>
          {terrains.length > 0 ? (
            <>
              <p className="mt-2 text-xs text-muted-foreground">
                Sélectionnez une ou plusieurs parcelles
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {terrains.map((t) => {
                  const checked = selectedTerrainIds.includes(t.id);
                  const isPrimary = t.id === terrainId;
                  return (
                    <label
                      key={t.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 border px-3 py-3 text-sm transition",
                        checked ? "border-primary/40 bg-primary/5" : "border-border bg-background hover:border-primary/25",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleTerrain(t.id)}
                        className="border-primary/40 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {t.nom ?? "Terrain"}
                          {isPrimary ? " · analyse Agri" : ""}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t.superficie_ha.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} ha
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 text-primary" /> {selectedTerrains.length} parcelle
                  {selectedTerrains.length > 1 ? "s" : ""}
              </div>
              {cropRecommendations.length > 0 ? (
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-primary">
                  <ShieldCheck className="h-3.5 w-3.5" /> Analyse Agriculture disponible
                  ({cropRecommendations.length} culture
                  {cropRecommendations.length > 1 ? "s" : ""}).
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Aucune analyse Agriculture pour les terrains sélectionnés.
                  </p>
                  <Button
                    asChild
                    size="sm"
                    variant="secondary"
                    className="w-full rounded-xl h-9 gap-2"
                  >
                    <Link to="/agriculture">
                      <Leaf className="h-3.5 w-3.5" />
                      Analyser dans le Conseiller Agriculture
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Aucun terrain déclaré ({FALLBACK_SUPERFICIE_HA} ha utilisés par défaut). Ajoutez vos
              parcelles depuis votre profil pour un calcul basé sur votre superficie réelle.
            </p>
          )}
          </div>
        </Reveal>

        <Reveal from="up" delay={150} className="border border-amber-200 bg-amber-50/70 p-5 text-amber-950">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <p className="font-display text-lg font-bold tracking-tight">Ce que le rapport peut décider</p>
              <p className="mt-1.5 text-sm leading-relaxed text-amber-900/80">
                Les scénarios sont des estimations pour comparer des options, pas un devis ni une garantie de revenu.
              </p>
              <div className="mt-4 space-y-2 text-xs leading-relaxed text-amber-900/75">
                <p className="flex gap-2"><Database className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Tendances IPPAP et rendements historiques lorsqu’ils sont disponibles.</p>
                <p className="flex gap-2"><Calculator className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Prix absolus et certains coûts peuvent provenir de barèmes de référence.</p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
      <Reveal as="h2" className="font-display text-2xl font-semibold mt-10 mb-2">
        Comparaison des scénarios
      </Reveal>

      {scenariosMutation.isError && (
        <AlertBanner tone="danger" title="Agent Financier injoignable">
          {scenariosMutation.error instanceof BusinessApiError
            ? scenariosMutation.error.message
            : "Une erreur inattendue est survenue."}
        </AlertBanner>
      )}

      {decisionMutation.isError && (
        <div className="mt-4">
          <AlertBanner tone="danger" title="La confirmation a échoué">
            {decisionMutation.error instanceof BusinessApiError
              ? decisionMutation.error.message
              : "Une erreur inattendue est survenue."}
          </AlertBanner>
        </div>
      )}

      {!report && !scenariosMutation.isPending && !scenariosMutation.isError && (
        <div className="mt-5 grid gap-4 border-t border-border pt-6 md:grid-cols-3">
          <EmptyStep icon={WalletCards} number="1" title="Budget" body="Indiquez l’enveloppe réellement disponible pour la campagne." />
          <EmptyStep icon={MapPin} number="2" title="Parcelles" body="Choisissez les surfaces que vous souhaitez comparer." />
          <EmptyStep icon={LineChart} number="3" title="Scénarios" body="Comparez bénéfice estimé, risque et qualité des données." />
        </div>
      )}

      {scenariosMutation.isPending && (
        <div className="grid gap-5 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card-soft p-6 space-y-4">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
              <Skeleton className="h-12 w-full mt-6" />
            </div>
          ))}
        </div>
      )}

      {report && !scenariosMutation.isPending && (
        <>
          <div className="border-y border-border/70 py-5 mb-5">
            <div className="text-sm font-medium">Synthèse de comparaison</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
              <div className="border-l-2 border-primary/60 pl-3">
                <div className="text-xs text-muted-foreground">Budget analysé</div>
                <div className="font-display text-xl font-semibold">
                  {report.budget_input.toLocaleString("fr-FR")} €
                </div>
              </div>
              <div className="border-l-2 border-signal/70 pl-3">
                <div className="text-xs text-muted-foreground">Meilleur profit estimé</div>
                <div className="font-display text-xl font-semibold text-primary">
                  {Math.max(...report.scenarios.map((s) => s.profit_estime)).toLocaleString(
                    "fr-FR",
                  )}{" "}
                  €
                </div>
              </div>
              <div className="border-l-2 border-border pl-3">
                <div className="text-xs text-muted-foreground">Culture recommandée</div>
                <div className="font-display text-xl font-semibold">
                  {cultureLabel(report.scenarios[0]?.culture ?? "-")}
                </div>
              </div>
            </div>
          </div>

        <div className="grid gap-5 md:grid-cols-3">
          {report.scenarios.map((s, i) => {
            const risk = riskLevel(s.risque_score);
            const isBestScore = i === 0;
            const isChoosingThis =
              decisionMutation.isPending &&
              decisionMutation.variables?.allocations[0]?.culture === s.culture;
            return (
              <Reveal key={s.culture} from="up" delay={i * 120} className="border border-border bg-card p-5 flex flex-col">
                <div className="flex items-center justify-between">
                  <div className="font-display text-xl font-semibold">
                    {cultureLabel(s.culture)}
                  </div>
                  <Badge className={`border ${riskColor[risk]}`}>Risque {risk}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">{s.risque_description}</p>

                <div className="mt-5 space-y-3 text-sm">
                  <Row label="Score de matching" value={`${s.matching_score.toFixed(1)} / 100`} />
                  <Row
                    label="Compatibilité Agriculture"
                    value={`${s.score_compatibilite.toFixed(1)} / 100`}
                  />
                  <Row label="Surface conseillée" value={`${s.superficie_conseillee_ha} ha`} />
                  <Row
                    label="Rendement estimé"
                    value={`${s.quantite_par_ha.toLocaleString("fr-FR")} kg/ha`}
                  />
                  <Row
                    label="Récolte estimée"
                    value={new Date(s.etude_marche.date_recolte_estimee).toLocaleDateString(
                      "fr-FR",
                    )}
                  />
                  <Row
                    label="Revenu brut"
                    value={`${s.indicateurs_financiers.revenu_brut_estime_eur.toLocaleString("fr-FR")} €`}
                  />
                  <Row
                    label="Coût total"
                    value={`${s.indicateurs_financiers.cout_total_estime_eur.toLocaleString("fr-FR")} €`}
                  />
                  <Row
                    label="Profit estimé"
                    value={`${s.profit_estime.toLocaleString("fr-FR")} €`}
                    accent
                  />
                  <Row
                    label="Marge / ROI"
                    value={`${s.indicateurs_financiers.profit_margin_pct.toFixed(1)} % / ${s.indicateurs_financiers.roi_pct.toFixed(1)} %`}
                  />
                  <Row
                    label="Écart au budget"
                    value={`${s.indicateurs_financiers.budget_gap_eur.toLocaleString("fr-FR")} €`}
                  />
                  <Row
                    label="Confiance données"
                    value={`${s.confiance_donnees.niveau} (${Math.round(s.confiance_donnees.score * 100)} %)`}
                  />
                </div>

                <div className="mt-3 text-xs text-muted-foreground">
                  <span className="font-medium">Solution au risque :</span> {s.solution_risque}
                </div>

                <div className="mt-4 border-l-2 border-primary/40 pl-3 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">Fiabilité {Math.round(s.confiance_donnees.score * 100)} %</span>
                  <span className="block mt-1">{s.confiance_donnees.raisons[0]}</span>
                </div>

                <div className="mt-auto pt-6 space-y-2">
                  <Button
                    className="w-full rounded-xl h-12"
                    disabled={decisionMutation.isPending}
                    onClick={() => chooseScenario(s)}
                  >
                    {isChoosingThis ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-2" />
                    )}
                    Choisir ce scénario
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full rounded-xl h-10"
                    onClick={() => setDetailScenario(s)}
                  >
                    <Info className="h-4 w-4 mr-2" /> Détails du calcul
                  </Button>
                </div>
                {isBestScore && (
                  <div className="mt-3 flex items-center gap-1 text-xs font-semibold text-primary justify-center">
                    <TrendingUp className="h-3 w-3" /> Recommandé pour vous
                  </div>
                )}
              </Reveal>
            );
          })}
        </div>
        <div className="mt-4 flex justify-end">
          <img
            src="/LABEL_AI%20GENERATED_black%20transparent.png"
            alt="Contenu généré par IA"
            className="h-16 w-auto"
          />
        </div>
        </>
      )}

      <Dialog open={!!detailScenario} onOpenChange={(open) => !open && setDetailScenario(null)}>
        <DialogContent className="rounded-3xl max-w-2xl max-h-[85vh] overflow-y-auto">
          {detailScenario && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display text-2xl">
                  Comment ces chiffres ont été calculés - {cultureLabel(detailScenario.culture)}
                </DialogTitle>
                <DialogDescription>
                  Calcul déterministe fait par l'agent Business (formule explicite, pas une
                  estimation du LLM).
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <DetailSection
                  title="Score de matching"
                  detail={detailScenario.detail_calcul.score_matching}
                />
                <DetailSection
                  title="Surface conseillée"
                  detail={detailScenario.detail_calcul.surface_conseillee}
                />
                <DetailSection
                  title="Rendement estimé"
                  detail={detailScenario.detail_calcul.rendement_estime}
                />
                <DetailSection
                  title="Récolte estimée"
                  detail={detailScenario.detail_calcul.recolte_estimee}
                />
                <DetailSection
                  title="Profit estimé"
                  detail={detailScenario.detail_calcul.profit_estime}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <PageTour tourId="business" />
    </AppShell>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-none">
      <span className="text-muted-foreground">{label}</span>
      <span className={accent ? "font-display text-lg font-semibold text-primary" : "font-medium"}>
        {value}
      </span>
    </div>
  );
}

function EmptyStep({
  icon: Icon,
  number,
  title,
  body,
}: {
  icon: typeof LineChart;
  number: string;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 border-l-2 border-border pl-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <p className="font-mono text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">{number}</p>
        <h3 className="mt-0.5 text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

/** Convertit une clé snake_case renvoyée par le backend en libellé lisible ("cout_total_eur_par_ha" -> "Cout total eur par ha"). */
function labelizeKey(key: string): string {
  const label = key.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatDetailValue(value: unknown): string {
  if (typeof value === "number") {
    return value.toLocaleString("fr-FR", { maximumFractionDigits: 4 });
  }
  if (typeof value === "string" && ISO_DATE_RE.test(value)) {
    return new Date(value).toLocaleDateString("fr-FR");
  }
  return String(value);
}

function DetailSection({ title, detail }: { title: string; detail: DetailCalculMetrique }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <div className="font-display text-lg font-semibold">{title}</div>
      <p className="mt-1 text-sm text-muted-foreground italic">{detail.formule}</p>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {Object.entries(detail.valeurs).map(([key, value]) => (
          <div
            key={key}
            className="flex items-center justify-between gap-2 border-b border-border/60 pb-1"
          >
            <span className="text-muted-foreground">{labelizeKey(key)}</span>
            <span className="font-medium text-right">{formatDetailValue(value)}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-1">
        {detail.sources.map((source) => (
          <div key={source} className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Quote className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{source}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
