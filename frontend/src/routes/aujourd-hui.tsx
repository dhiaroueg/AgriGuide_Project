import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { PageTour } from "@/components/onboarding/PageTour";
import { AlertBanner } from "@/components/AlertBanner";
import { PageHeader } from "@/components/PageHeader";
import { Reveal } from "@/components/motion/Reveal";
import { useCountUp } from "@/components/motion/useCountUp";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import type { LatLng, TerrainOut } from "@/lib/authApi";
import { cultureLabel, loadRealCropRecommendations } from "@/lib/cropRecommendations";
import { equipementLabel } from "@/lib/equipements";
import { loadFarmerDecision } from "@/lib/farmerDecision";
import { fetchLatestFarmerDecision, type FarmerDecisionResponse } from "@/lib/businessApi";
import {
  addSpendEntry,
  loadSpendEntries,
  monthKey,
  monthLabelFr,
  removeSpendEntry,
  type SpendEntry,
} from "@/lib/spendTracking";
import {
  analyzeMonitoringDay,
  MonitoringApiError,
  type AnalyzeResponse,
  type CropAlert,
} from "@/lib/monitoringApi";
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  Cloud,
  CloudSun,
  Droplets,
  LineChart,
  Loader2,
  Plus,
  RefreshCw,
  Sprout,
  Trash2,
  Wallet,
  Wind,
  Recycle,
  Sparkles,
  TrendingUp,
  ShieldAlert,
  ArrowRight,
  Sun,
  MapPin,
  CheckCircle,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/aujourd-hui")({
  head: () => ({
    meta: [
      { title: "Aujourd'hui - AgriMent Command Center" },
      {
        name: "description",
        content:
          "Briefing quotidien de l'agriculteur : météo, budget, allocation des parcelles, alertes et plan d'action.",
      },
      { property: "og:title", content: "Aujourd'hui - AgriMent Command Center" },
      {
        property: "og:description",
        content: "Votre journée de terrain en un coup d'œil.",
      },
    ],
  }),
  component: Page,
});

const CROP_IMAGES: Record<string, string> = {
  tomate: "/img/marketplace/tomate.jpg",
  pomme_de_terre: "/img/marketplace/pomme-de-terre.jpg",
  ble: "/img/marketplace/ble.jpg",
  ble_tendre: "/img/marketplace/ble.jpg",
  colza: "/img/marketplace/colza.jpg",
  tournesol: "/img/marketplace/tournesol.jpg",
  mais: "/img/marketplace/tournesol.jpg",
  orge: "/img/marketplace/ble.jpg",
};

function normalizeCropKey(culture: string): string {
  return culture
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function cropImage(culture: string): string {
  const key = normalizeCropKey(culture);
  return CROP_IMAGES[key] ?? CROP_IMAGES[culture] ?? "/img/marketplace/ble.jpg";
}

function terrainCentroid(points: LatLng[]): { lat: number; lon: number } | null {
  if (!points.length) return null;
  const lat = points.reduce((s, p) => s + p[0], 0) / points.length;
  const lon = points.reduce((s, p) => s + p[1], 0) / points.length;
  return { lat, lon };
}

function mapWaterSensitivity(niveau: unknown): string | undefined {
  if (typeof niveau !== "string") return undefined;
  const n = niveau.toLowerCase();
  if (n === "eleve" || n === "élevé" || n === "high") return "high";
  if (n === "modere" || n === "modéré" || n === "moderate") return "moderate";
  if (n === "faible" || n === "low") return "low";
  return undefined;
}

function formatEuro(n: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDayLabel(d = new Date()) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function campaignMonthKeys(decision: FarmerDecisionResponse): string[] {
  let start = new Date(decision.created_at);
  if (Number.isNaN(start.getTime())) {
    const now = new Date();
    start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  }
  const keys: string[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  for (let i = 0; i < 6; i++) {
    keys.push(monthKey(cur.toISOString().slice(0, 10)));
    cur.setMonth(cur.getMonth() + 1);
  }
  return keys;
}

const costChartConfig = {
  prevu: { label: "Prévu", color: "hsl(var(--primary))" },
  reel: { label: "Réel", color: "hsl(var(--harvest))" },
} satisfies ChartConfig;

function AllocationSummaryCard({
  totalHa,
  culturesCount,
  terrainName,
}: {
  totalHa: number;
  culturesCount: number;
  terrainName?: string;
}) {
  const [countRef, animatedHa] = useCountUp<HTMLSpanElement>(totalHa, { duration: 1000, decimals: 1 });
  return (
    <Reveal from="left" delay={60} className="h-full">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-6 shadow-sm ring-1 ring-emerald-500/20 flex flex-col justify-between">
        <div className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full bg-emerald-500/10 blur-2xl" />
        <div>
          <div className="flex items-center justify-between">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-500">
              <Sprout className="h-5 w-5" />
            </span>
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold text-emerald-500">
              Campagne Active
            </span>
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Surface Totale Allouée
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <span ref={countRef} className="font-display text-4xl font-extrabold tracking-tight text-foreground">
                {animatedHa.toFixed(1)}
              </span>
              <span className="text-sm font-semibold text-muted-foreground">ha</span>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-border/40 flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-emerald-500" />
            {terrainName || "Terrain de démonstration"}
          </span>
          <span className="font-semibold text-foreground">{culturesCount} culture{culturesCount > 1 ? "s" : ""}</span>
        </div>
      </div>
    </Reveal>
  );
}

function CostVsPlannedChart({
  decision,
  spends,
}: {
  decision: FarmerDecisionResponse;
  spends: SpendEntry[];
}) {
  const months = useMemo(() => campaignMonthKeys(decision), [decision]);
  const plannedPerMonth = (decision.cout_final ?? 0) / 6;

  const spentByMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of spends) {
      const key = monthKey(entry.date);
      map.set(key, (map.get(key) ?? 0) + entry.amount);
    }
    return map;
  }, [spends]);

  const chartData = months.map((key) => ({
    mois: monthLabelFr(key),
    prevu: Math.round(plannedPerMonth),
    reel: Math.round(spentByMonth.get(key) ?? 0),
  }));

  return (
    <Reveal delay={120} className="h-full">
      <div className="flex h-full flex-col overflow-hidden rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border/80 md:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
              <Wallet className="h-4 w-4" />
            </span>
            <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">
              Coût réel vs. prévu
            </h2>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">Suivi Budgétaire</span>
        </div>

        <ChartContainer config={costChartConfig} className="mt-4 aspect-[5/3] w-full min-h-0 flex-1">
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="rgba(120, 120, 120, 0.15)" />
            <XAxis dataKey="mois" tickLine={false} axisLine={false} tickMargin={6} fontSize={11} />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={36}
              fontSize={11}
              tickFormatter={(v) => String(Math.round(Number(v)))}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value, name) => (
                    <span className="font-medium">
                      {formatEuro(Number(value))}{" "}
                      <span className="text-muted-foreground">
                        {name === "prevu" ? "prévu" : "réel"}
                      </span>
                    </span>
                  )}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent className="pt-1" />} />
            <Bar dataKey="prevu" fill="var(--color-prevu)" radius={[6, 6, 0, 0]} maxBarSize={20} />
            <Bar dataKey="reel" fill="var(--color-reel)" radius={[6, 6, 0, 0]} maxBarSize={20} />
          </BarChart>
        </ChartContainer>
      </div>
    </Reveal>
  );
}

function SpendInputCard({
  spends,
  onAddSpend,
  onRemoveSpend,
}: {
  spends: SpendEntry[];
  onAddSpend: (input: { amount: number; date: string; label: string }) => void;
  onRemoveSpend: (id: string) => void;
}) {
  const [amountText, setAmountText] = useState("");
  const [labelText, setLabelText] = useState("");
  const [dateText, setDateText] = useState(todayIso);
  const [formError, setFormError] = useState<string | null>(null);

  function submitSpend(e: FormEvent) {
    e.preventDefault();
    const amount = Number(amountText.replace(",", ".").replace(/\s/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Indiquez un montant valide en euros.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
      setFormError("Indiquez une date valide.");
      return;
    }
    setFormError(null);
    onAddSpend({ amount, date: dateText, label: labelText || "Achat intrant / équipement" });
    setAmountText("");
    setLabelText("");
    setDateText(todayIso());
  }

  return (
    <Reveal delay={180} className="mt-4">
      <div className="overflow-hidden rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border/80">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-foreground flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-500" />
            Saisir une dépense réelle
          </p>
          <span className="text-xs text-muted-foreground">Registre Financier</span>
        </div>

        <form onSubmit={submitSpend} className="grid gap-3 sm:grid-cols-[1fr_1.2fr_auto_auto]">
          <div className="relative">
            <Input
              type="text"
              inputMode="decimal"
              value={amountText}
              onChange={(e) => {
                setAmountText(e.target.value);
                setFormError(null);
              }}
              placeholder="Montant (ex: 150)"
              aria-label="Montant dépensé"
              className="h-10 rounded-xl pr-8 bg-background"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-semibold">
              €
            </span>
          </div>
          <Input
            type="text"
            value={labelText}
            onChange={(e) => setLabelText(e.target.value)}
            placeholder="Libellé (engrais, irrigation, semences…)"
            aria-label="Libellé de la dépense"
            className="h-10 rounded-xl bg-background"
          />
          <Input
            type="date"
            value={dateText}
            onChange={(e) => setDateText(e.target.value)}
            aria-label="Date de la dépense"
            className="h-10 rounded-xl bg-background text-xs"
          />
          <Button type="submit" className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-xs font-semibold">
            <Plus className="h-4 w-4" />
            Ajouter
          </Button>
        </form>
        {formError && <p className="mt-2 text-xs text-destructive">{formError}</p>}

        {spends.length > 0 && (
          <ul className="mt-4 max-h-36 space-y-2 overflow-y-auto">
            {spends.slice(0, 6).map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-xl bg-accent/30 border border-border/50 px-3.5 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-foreground">{entry.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(entry.date).toLocaleDateString("fr-FR")}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-display font-bold text-foreground">{formatEuro(entry.amount)}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveSpend(entry.id)}
                    className="rounded-lg p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Supprimer la dépense"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Reveal>
  );
}

function HectareBar({ ratio }: { ratio: number }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-emerald-500/10">
      <div
        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-[width] duration-1000 ease-out"
        style={{ width: ready ? `${Math.round(Math.min(ratio, 1) * 100)}%` : "0%" }}
      />
    </div>
  );
}

function riskLabel(risk: string) {
  if (risk === "high") return "Élevé";
  if (risk === "medium") return "Moyen";
  return "Faible";
}

function Page() {
  const { user, token } = useAuth();
  const terrain: TerrainOut | undefined = user?.terrains[0];
  const localDecision = useMemo(
    () => (terrain ? loadFarmerDecision(terrain.id) : null),
    [terrain],
  );
  const persistedDecision = useQuery({
    queryKey: ["business-decision", terrain?.id],
    queryFn: async () => {
      try {
        if (!token) return localDecision;
        return await fetchLatestFarmerDecision(terrain!.id, token);
      } catch {
        return localDecision;
      }
    },
    enabled: Boolean(terrain),
  });
  const decision = persistedDecision.data ?? localDecision;
  const cropRecs = useMemo(
    () => (terrain ? loadRealCropRecommendations(terrain.id) : null),
    [terrain],
  );

  const [briefing, setBriefing] = useState<AnalyzeResponse | null>(null);
  const [done, setDone] = useState<Record<number, boolean>>({});
  const [spends, setSpends] = useState<SpendEntry[]>([]);

  useEffect(() => {
    if (!decision?.decision_id) {
      setSpends([]);
      return;
    }
    setSpends(loadSpendEntries(decision.decision_id));
  }, [decision?.decision_id]);

  const analyzeMutation = useMutation({
    mutationFn: analyzeMonitoringDay,
    onSuccess: (data) => {
      setBriefing(data);
      setDone({});
    },
  });

  const totalHa = decision?.superficie_totale_allouee_ha ?? 0;
  const allocations = decision?.allocations ?? [];

  useEffect(() => {
    if (!user || !terrain || !decision) return;
    const centroid = terrainCentroid(terrain.points);
    if (!centroid) return;

    const waterByCrop = new Map(
      (cropRecs ?? []).map((c) => [
        c.culture,
        mapWaterSensitivity(c.besoins_irrigation?.niveau),
      ]),
    );

    analyzeMutation.mutate({
      farmer_name: user.nom,
      terrain_id: terrain.id,
      location: {
        latitude: centroid.lat,
        longitude: centroid.lon,
        label: terrain.region ?? terrain.nom ?? undefined,
      },
      crops: decision.allocations.map((a) => ({
        crop_name: a.culture,
        hectares: a.hectares_alloues,
        water_sensitivity: waterByCrop.get(a.culture) ?? undefined,
      })),
      hardware_inventory: (user.equipements ?? []).map(equipementLabel),
    });
  }, [user?.id, terrain?.id, decision?.decision_id]);

  const tasks = briefing?.analysis.tasks ?? [];
  const cropAlerts: CropAlert[] = briefing?.analysis.crop_alerts ?? [];
  const weather = briefing?.weather_summary;
  const doneCount = Object.values(done).filter(Boolean).length;
  const dayLabel = formatDayLabel();

  if (!user) {
    return (
      <AppShell>
        <PageHeader icon={CalendarDays} title="Aujourd'hui" subtitle="Connexion requise" />
      </AppShell>
    );
  }

  if (!terrain) {
    return (
      <AppShell>
        <PageHeader icon={CalendarDays} title="Aujourd'hui" subtitle={dayLabel} />
        <div className="mt-6">
          <AlertBanner
            tone="info"
            title="Aucun terrain déclaré"
            action={
              <Button asChild size="sm" variant="outline">
                <Link to="/profil">Profil</Link>
              </Button>
            }
          >
            Ajoutez un terrain dans votre profil pour lancer le briefing quotidien.
          </AlertBanner>
        </div>
      </AppShell>
    );
  }

  if (!decision) {
    return (
      <AppShell>
        <PageHeader icon={CalendarDays} title="Aujourd'hui" subtitle={dayLabel} />
        <div className="mt-6">
          <AlertBanner
            tone="info"
            title="Aucune culture confirmée"
            action={
              <Button asChild size="sm" variant="outline">
                <Link to="/business">Financier</Link>
              </Button>
            }
          >
            Confirmez un scénario dans le conseiller Financier pour activer le suivi
            quotidien (météo, irrigation, tâches).
          </AlertBanner>
        </div>
      </AppShell>
    );
  }

  const toggle = (i: number) => setDone((prev) => ({ ...prev, [i]: !prev[i] }));

  return (
    <AppShell>
      {/* Top Banner Command Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-emerald-900/90 via-slate-900 to-emerald-950 p-6 md:p-8 text-white shadow-xl border border-emerald-800/40">
        <div className="pointer-events-none absolute -right-10 -top-10 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/30">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Briefing du matin live
              </span>
              <span className="text-xs text-slate-300 capitalize">{dayLabel}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Bonjour, {user.nom} 👋
            </h1>
            <p className="text-xs md:text-sm text-slate-300 max-w-xl leading-relaxed">
              Tableau de bord quotidien de votre parcelle <strong className="text-white">{terrain.nom || "Principale"}</strong>. Suivez les recommandations IA, la météo et le plan de travail du jour.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={analyzeMutation.isPending}
              onClick={() => {
                const centroid = terrainCentroid(terrain.points);
                if (!centroid) return;
                analyzeMutation.mutate({
                  farmer_name: user.nom,
                  terrain_id: terrain.id,
                  location: {
                    latitude: centroid.lat,
                    longitude: centroid.lon,
                    label: terrain.region ?? terrain.nom ?? undefined,
                  },
                  crops: decision.allocations.map((a) => ({
                    crop_name: a.culture,
                    hectares: a.hectares_alloues,
                  })),
                  hardware_inventory: (user.equipements ?? []).map(equipementLabel),
                });
              }}
              className="bg-white/10 hover:bg-white/20 border-white/20 text-white gap-2 h-10 px-4 rounded-xl text-xs backdrop-blur-md"
            >
              {analyzeMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
              ) : (
                <RefreshCw className="h-4 w-4 text-emerald-400" />
              )}
              Actualiser
            </Button>
          </div>
        </div>
      </div>

      {analyzeMutation.isError && (
        <div className="mt-4">
          <AlertBanner tone="danger" title="Briefing indisponible">
            {analyzeMutation.error instanceof MonitoringApiError
              ? analyzeMutation.error.message
              : "Une erreur est survenue lors de la génération du briefing."}
          </AlertBanner>
        </div>
      )}

      {/* Top Metrics Cards Grid */}
      <div className="mt-6 grid gap-4 md:grid-cols-2 md:items-stretch" data-tour="today-campaign">
        <AllocationSummaryCard
          totalHa={totalHa}
          culturesCount={allocations.length}
          terrainName={terrain.nom ?? undefined}
        />
        <CostVsPlannedChart decision={decision} spends={spends} />
      </div>

      {/* Spend Form */}
      <SpendInputCard
        spends={spends}
        onAddSpend={(input) => {
          setSpends(addSpendEntry(decision.decision_id, input));
        }}
        onRemoveSpend={(id) => {
          setSpends(removeSpendEntry(decision.decision_id, id));
        }}
      />

      {/* Crop Allocations Visualizer */}
      <Reveal delay={120} className="mt-6">
        <div className="overflow-hidden rounded-3xl bg-card p-5 md:p-6 shadow-sm ring-1 ring-border/80">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600">
                <Sprout className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
                  Allocation des cultures
                </h2>
                <p className="text-xs text-muted-foreground">
                  {totalHa.toFixed(1)} ha répartis sur {allocations.length} culture
                  {allocations.length > 1 ? "s" : ""}
                  {terrain.nom ? ` · ${terrain.nom}` : ""}
                </p>
              </div>
            </div>
            {totalHa > 0 && (
              <div className="flex h-3 w-full max-w-[12rem] overflow-hidden rounded-full sm:w-48 ring-1 ring-border/50">
                {allocations.map((a) => (
                  <span
                    key={`${a.scenario_id}-${a.culture}`}
                    className="h-full first:rounded-l-full last:rounded-r-full"
                    style={{
                      width: `${(a.hectares_alloues / totalHa) * 100}%`,
                      backgroundImage: `url(${cropImage(a.culture)})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }}
                    title={`${cultureLabel(a.culture)} ${a.hectares_alloues} ha`}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 space-y-4">
            {allocations.map((a, i) => (
              <Reveal key={`${a.scenario_id}-${a.culture}`} from="left" delay={160 + i * 100}>
                <div className="group flex items-center gap-3 md:gap-4 p-3 rounded-2xl bg-accent/20 border border-border/40 hover:border-emerald-500/30 transition duration-300">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl ring-1 ring-border/70 shadow-sm transition duration-500 group-hover:scale-105 md:h-14 md:w-14">
                    <img
                      src={cropImage(a.culture)}
                      alt={cultureLabel(a.culture)}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="font-bold text-foreground text-sm">{cultureLabel(a.culture)}</span>
                      <span className="text-xs font-semibold tabular-nums text-emerald-600 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
                        {a.hectares_alloues} ha
                      </span>
                    </div>
                    <HectareBar ratio={a.hectares_alloues / Math.max(totalHa, 0.01)} />
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </Reveal>

      {/* Marketplace Waste Valorization CTA Banner */}
      {allocations[0] && (
        <Reveal delay={160} className="mt-6">
          <Link
            to="/marketplace/nouveau"
            search={{ kind: "dechet", culture: allocations[0].culture }}
            className="group flex items-start gap-4 rounded-3xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent p-5 transition hover:border-emerald-500/50 hover:shadow-md"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
              <Recycle className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-display text-lg font-bold text-foreground flex items-center gap-2">
                Valorisez les déchets de {cultureLabel(allocations[0].culture)}
                <ArrowRight className="w-4 h-4 text-emerald-600 group-hover:translate-x-1 transition duration-300" />
              </div>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Après la récolte (prévue le{" "}
                <strong className="text-foreground">
                  {new Date(allocations[0].date_maturite_prevue).toLocaleDateString("fr-FR")}
                </strong>
                ), déposez paille, balles et autres résidus sur la marketplace pour générer un revenu complémentaire.
              </p>
            </div>
          </Link>
        </Reveal>
      )}

      {/* AI Farmer Briefing Card */}
      <Reveal delay={80} className="mt-6" threshold={0.05}>
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-900/10 via-card to-card p-5 md:p-6 ring-1 ring-emerald-500/20 shadow-sm" data-tour="today-briefing">
          <div className="relative flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600">
                <Bell className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
                  Briefing Agriculteur
                </h2>
                <p className="text-xs font-semibold capitalize text-muted-foreground">{dayLabel}</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-600 border border-emerald-500/20">
              <Zap className="h-3.5 w-3.5 text-emerald-500" />
              Recommandation Quotidienne
            </span>
          </div>

          {analyzeMutation.isPending && !briefing ? (
            <div className="relative mt-5 space-y-3">
              <Skeleton className="h-28 w-full rounded-2xl" />
              <Skeleton className="h-20 w-full rounded-2xl" />
            </div>
          ) : (
            <>
              {briefing?.analysis.has_alert && briefing.analysis.alert_message && (
                <div className="relative mt-5">
                  <AlertBanner tone="warning" title="Alerte météo">
                    {briefing.analysis.alert_message}
                  </AlertBanner>
                </div>
              )}

              {/* Weather Summary Bar */}
              <div className="relative mt-5 rounded-2xl bg-accent/30 p-4 border border-border/50">
                <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
                  <CloudSun className="h-4 w-4 text-amber-500" />
                  Météo du jour
                  {weather?.location_label ? (
                    <span className="text-xs font-medium text-muted-foreground">
                      · {weather.location_label}
                    </span>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    {
                      icon: CloudSun,
                      label:
                        weather?.today_max_temp_c != null && weather?.today_min_temp_c != null
                          ? `${Math.round(weather.today_max_temp_c)}° / ${Math.round(weather.today_min_temp_c)}°`
                          : "—",
                      hint: "Max / min",
                    },
                    {
                      icon: Cloud,
                      label: weather?.conditions_label ?? weather?.note ?? "—",
                      hint: "Conditions",
                    },
                    {
                      icon: Droplets,
                      label:
                        weather?.precipitation_sum_mm != null
                          ? `${weather.precipitation_sum_mm} mm`
                          : "—",
                      hint: "Précipitations",
                    },
                    {
                      icon: Wind,
                      label:
                        weather?.max_wind_speed_kmh != null
                          ? `${Math.round(weather.max_wind_speed_kmh)} km/h`
                          : "—",
                      hint: "Vent",
                    },
                  ].map(({ icon: Icon, label, hint }) => (
                    <div
                      key={hint}
                      className="flex items-start gap-2.5 rounded-xl bg-card p-3 border border-border/50 shadow-sm"
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          {hint}
                        </p>
                        <p className="text-xs font-bold text-foreground">
                          {label}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Irrigation Advice */}
              <div className="relative mt-4 flex gap-3.5 rounded-2xl bg-blue-500/10 p-4 border border-blue-500/20">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500 text-white shadow-sm">
                  <Droplets className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="font-bold text-sm text-foreground">Gestion de l&apos;irrigation</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {briefing?.analysis.daily_advice ??
                      "Calcul du conseil personnalisé en cours…"}
                  </p>
                  {briefing?.analysis.water_saving_technique ? (
                    <p className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400">
                      💡 {briefing.analysis.water_saving_technique}
                    </p>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>
      </Reveal>

      {/* Crop Vigilance Section */}
      {cropAlerts.length > 0 && (
        <div className="mt-8">
          <Reveal className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
              Vigilance cultures
            </h2>
          </Reveal>
          <div className="grid gap-3">
            {cropAlerts.map((alert, i) => (
              <Reveal key={`${alert.crop}-${i}`} from="up" delay={i * 100}>
                <div className="group flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border/80 shadow-sm transition-all duration-300 hover:border-amber-500/40 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl ring-1 ring-border/60 transition duration-500 group-hover:scale-105">
                      <img
                        src={cropImage(alert.crop)}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-sm text-foreground">{cultureLabel(alert.crop)}</span>
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide",
                            alert.risk === "high"
                              ? "bg-destructive/15 text-destructive border border-destructive/20"
                              : alert.risk === "medium"
                                ? "bg-amber-500/15 text-amber-600 border border-amber-500/20"
                                : "bg-emerald-500/15 text-emerald-600 border border-emerald-500/20",
                          )}
                        >
                          {riskLabel(alert.risk)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {alert.message}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 sm:max-w-[16rem] sm:text-right">
                    → {alert.action}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      )}

      {/* Plan du jour (Checklist Tasks) */}
      {tasks.length > 0 && (
        <Reveal delay={100} className="mt-8">
          <div className="overflow-hidden rounded-3xl bg-card p-5 md:p-6 shadow-sm ring-1 ring-border/80" data-tour="today-tasks">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-display text-xl font-bold tracking-tight text-foreground">
                    Plan du jour
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {doneCount}/{tasks.length} tâche{tasks.length > 1 ? "s" : ""} terminée{doneCount > 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Progress value={(doneCount / tasks.length) * 100} className="h-2 w-28 sm:w-36 bg-emerald-500/10" />
                <span className="text-xs font-bold text-emerald-600">
                  {Math.round((doneCount / tasks.length) * 100)}%
                </span>
              </div>
            </div>

            <ul className="mt-5 space-y-2.5">
              {tasks.map((task, i) => {
                const checked = Boolean(done[i]);
                return (
                  <li key={`${task}-${i}`}>
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-all duration-300 shadow-sm",
                        checked
                          ? "border-emerald-500/30 bg-emerald-500/5 opacity-80"
                          : "border-border/80 bg-background hover:border-emerald-500/40 hover:bg-accent/30",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all duration-300",
                          checked
                            ? "scale-105 border-emerald-600 bg-emerald-600 text-white"
                            : "border-slate-300 dark:border-slate-700 bg-card",
                        )}
                      >
                        {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                      </span>
                      <span
                        className={cn(
                          "text-xs md:text-sm font-semibold leading-relaxed transition-colors",
                          checked
                            ? "text-muted-foreground line-through"
                            : "text-foreground",
                        )}
                      >
                        {task}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </Reveal>
      )}
      <PageTour tourId="aujourd-hui" />
    </AppShell>
  );
}
