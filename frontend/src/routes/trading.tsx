import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { Reveal } from "@/components/motion/Reveal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  LineChart,
  ShieldCheck,
  Zap,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Sparkles,
  BarChart3,
  Loader2,
  Coins,
  Warehouse,
  Scale,
  Percent,
  HelpCircle,
  Lightbulb,
} from "lucide-react";
import {
  fetchMarketTickers,
  fetchCommodityChart,
  fetchMarketAlerts,
  evaluateStrategy,
  type CommodityTicker,
  type StrategyEvaluationRequest,
} from "@/lib/tradingApi";

export const Route = createFileRoute("/trading")({
  head: () => ({
    meta: [
      { title: "Bourse Agricole & Vente à Terme - AgriGuide" },
      {
        name: "description",
        content:
          "Prix du marché Euronext / MATIF simplifiés, calcul de rentabilité et conseils de vente pour les agriculteurs.",
      },
    ],
  }),
  component: Page,
});

function TrendBadge({ trend }: { trend: "bullish" | "neutral" | "bearish" }) {
  if (trend === "bullish") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2.5 py-0.5 text-xs font-bold">
        <ArrowUpRight className="w-3.5 h-3.5" /> En Hausse ↗
      </span>
    );
  }
  if (trend === "bearish") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-400 px-2.5 py-0.5 text-xs font-bold">
        <ArrowDownRight className="w-3.5 h-3.5" /> En Baisse ↘
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 px-2.5 py-0.5 text-xs font-bold">
      <Minus className="w-3.5 h-3.5" /> Stable →
    </span>
  );
}

function Page() {
  const [selectedSymbol, setSelectedSymbol] = useState("EBM");
  const [volumeTons, setVolumeTons] = useState(500);
  const [alreadyCommittedTons, setAlreadyCommittedTons] = useState(150);
  const [breakEvenCost, setBreakEvenCost] = useState(180);
  const [storageCapacity, setStorageCapacity] = useState(200);
  const [targetMarginPct, setTargetMarginPct] = useState(20);

  // Queries
  const { data: tickers, isLoading: tickersLoading } = useQuery({
    queryKey: ["trading-tickers"],
    queryFn: fetchMarketTickers,
    refetchInterval: 15000,
  });

  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ["trading-chart", selectedSymbol],
    queryFn: () => fetchCommodityChart(selectedSymbol, 30),
  });

  const { data: alerts } = useQuery({
    queryKey: ["trading-alerts"],
    queryFn: fetchMarketAlerts,
  });

  // Strategy Mutation
  const {
    data: strategyData,
    mutate: calculateStrategy,
    isPending: strategyPending,
  } = useMutation({
    mutationFn: (req: StrategyEvaluationRequest) => evaluateStrategy(req),
  });

  const handleSimulateStrategy = (symbol = selectedSymbol) => {
    calculateStrategy({
      commodity_symbol: symbol,
      total_harvest_tons: volumeTons,
      already_committed_tons: alreadyCommittedTons,
      break_even_cost_eur_ton: breakEvenCost,
      storage_capacity_tons: storageCapacity,
      target_margin_pct: targetMarginPct,
    });
  };

  // Run automatically on mount or when crop changes
  useEffect(() => {
    handleSimulateStrategy(selectedSymbol);
  }, [selectedSymbol]);

  const selectedTicker = tickers?.find((t) => t.symbol === selectedSymbol) ?? tickers?.[0];
  const currentPrice = selectedTicker?.price_eur_ton ?? (strategyData?.recommended_target_price_eur_ton || 240);
  const targetPrice = Math.round(breakEvenCost * (1 + targetMarginPct / 100));
  const currentMarginEur = Math.round(currentPrice - breakEvenCost);
  const remainingTons = Math.max(0, volumeTons - alreadyCommittedTons);

  return (
    <AppShell>
      <PageHeader
        icon={TrendingUp}
        title="Bourse Agricole & Décision de Vente"
        subtitle="Suivez les prix du marché (Euronext / MATIF) et découvrez le meilleur moment pour vendre votre récolte."
      />

      {/* 1. SELECTION DU PRODUIT & PRIX EN DIRECT */}
      <div className="mt-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-600" />
            1. Choisissez votre culture pour voir le prix du jour :
          </h2>
          <span className="text-[11px] text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full">
            Mis à jour en direct (Euronext / MATIF)
          </span>
        </div>

        {tickersLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {tickers?.map((t) => {
              const isSelected = t.symbol === selectedSymbol;
              const isPositive = t.change_daily_eur >= 0;
              return (
                <button
                  key={t.symbol}
                  onClick={() => setSelectedSymbol(t.symbol)}
                  type="button"
                  className={`p-3 rounded-2xl text-left transition duration-200 border shadow-sm flex flex-col justify-between cursor-pointer ${
                    isSelected
                      ? "bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-500/40 shadow-emerald-500/20"
                      : "bg-card hover:border-emerald-500/40 border-border/70 text-card-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md ${
                        isSelected ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {t.name.split(" ")[0]}
                    </span>
                    <span
                      className={`text-xs font-bold ${
                        isSelected
                          ? "text-white"
                          : isPositive
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {isPositive ? "+" : ""}
                      {t.change_daily_pct}%
                    </span>
                  </div>

                  <div className="mt-2">
                    <p className={`text-xs font-medium truncate ${isSelected ? "text-white/80" : "text-muted-foreground"}`}>
                      {t.name}
                    </p>
                    <p className="text-lg font-black tracking-tight mt-0.5">
                      {t.price_eur_ton.toFixed(0)} <span className="text-xs font-normal">€ / tonne</span>
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. RECAP VISUEL DU PRIX & TENDANCE (Simple pour agriculteur) */}
      <Reveal delay={80} className="mt-6">
        <div className="rounded-3xl bg-card p-5 md:p-6 border border-border/80 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
            <div>
              <div className="flex items-center gap-3">
                <h3 className="text-xl font-extrabold text-foreground">
                  {selectedTicker?.name || "Blé Tendre Euronext"}
                </h3>
                {selectedTicker && <TrendBadge trend={selectedTicker.trend} />}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Évolution du prix de marché sur les 30 derniers jours
              </p>
            </div>

            {/* Repères simples pour l'agriculteur */}
            <div className="flex items-center gap-2 text-xs">
              <div className="px-3 py-2 rounded-xl bg-accent/40 border border-border/50 text-center">
                <span className="text-muted-foreground block text-[10px] font-semibold uppercase">Prix le plus bas de l'année</span>
                <span className="font-bold text-foreground">{selectedTicker?.low_52w_eur || 208} €/t</span>
              </div>
              <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
                <span className="text-emerald-700 dark:text-emerald-400 block text-[10px] font-semibold uppercase">Prix le plus haut de l'année</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">{selectedTicker?.high_52w_eur || 268} €/t</span>
              </div>
            </div>
          </div>

          {/* Graphique clair */}
          {chartLoading ? (
            <Skeleton className="h-56 w-full rounded-2xl" />
          ) : chartData ? (
            <div className="h-56 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData.history}>
                  <defs>
                    <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(120, 120, 120, 0.12)" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis domain={["dataMin - 5", "dataMax + 5"]} tickLine={false} axisLine={false} fontSize={11} unit=" €" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(15, 23, 42, 0.95)",
                      borderRadius: "12px",
                      borderColor: "rgba(255, 255, 255, 0.1)",
                      color: "#fff",
                      fontSize: "12px",
                    }}
                    formatter={(val: number) => [`${val} €/tonne`, "Prix marché"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="price_eur_ton"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#priceGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </div>
      </Reveal>

      {/* 3. SIMULATEUR DE VENTE SIMPLE & CONSEIL AUTOMATIQUE */}
      <Reveal delay={120} className="mt-8">
        <div className="rounded-3xl bg-card p-5 md:p-6 border border-border/80 shadow-sm space-y-6">
          <div className="flex items-center gap-3 border-b border-border/40 pb-4">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-foreground">
                2. Mes chiffres & Conseil de Vente Personnalisé
              </h3>
              <p className="text-xs text-muted-foreground">
                Indiquez vos volumes pour savoir s'il faut vendre maintenant, stocker au hangar ou attendre.
              </p>
            </div>
          </div>

          {/* Formulaire simplifié */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 rounded-2xl bg-accent/30 border border-border/50">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-primary" />
                Récolte totale prévue (tonnes)
              </label>
              <Input
                type="number"
                value={volumeTons}
                onChange={(e) => setVolumeTons(Number(e.target.value))}
                className="h-9 bg-background"
                placeholder="Ex: 500"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Déjà vendu / sous contrat (tonnes)
              </label>
              <Input
                type="number"
                value={alreadyCommittedTons}
                onChange={(e) => setAlreadyCommittedTons(Number(e.target.value))}
                className="h-9 bg-background"
                placeholder="Ex: 150"
              />
              <p className="text-[10px] text-muted-foreground">
                Reste à vendre : <strong className="text-foreground">{remainingTons} tonnes</strong>
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-amber-500" />
                  Mon coût de revient (€ / tonne)
                </span>
                <span className="text-[9px] text-muted-foreground bg-muted px-1.5 rounded">Ce que ça vous a coûté</span>
              </label>
              <Input
                type="number"
                value={breakEvenCost}
                onChange={(e) => setBreakEvenCost(Number(e.target.value))}
                className="h-9 bg-background border-emerald-500/30"
                placeholder="Ex: 180"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Warehouse className="w-3.5 h-3.5 text-blue-500" />
                Capacité de stockage disponible (tonnes)
              </label>
              <Input
                type="number"
                value={storageCapacity}
                onChange={(e) => setStorageCapacity(Number(e.target.value))}
                className="h-9 bg-background"
                placeholder="Ex: 200"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <Percent className="w-3.5 h-3.5 text-primary" />
                Bénéfice souhaité (marge en %)
              </label>
              <Input
                type="number"
                value={targetMarginPct}
                onChange={(e) => setTargetMarginPct(Number(e.target.value))}
                className="h-9 bg-background"
                placeholder="Ex: 20"
              />
              <p className="text-[10px] text-muted-foreground">
                Prix visé : <strong className="text-emerald-600 dark:text-emerald-400">{targetPrice} €/t</strong>
              </p>
            </div>

            <div className="flex items-end">
              <Button
                onClick={() => handleSimulateStrategy()}
                disabled={strategyPending}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9 gap-1.5 font-bold shadow-md cursor-pointer"
              >
                {strategyPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Recalculer le conseil IA
              </Button>
            </div>
          </div>

          {/* RÉSULTAT CONSEIL TRÈS CLAIR */}
          {strategyData && (
            <div className="space-y-4 pt-2">
              <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-background to-card border-2 border-emerald-500/30 shadow-md">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-black uppercase text-white shadow-sm ${
                        strategyData.action === "SELL" ? "bg-emerald-600" :
                        strategyData.action === "HOLD" ? "bg-amber-500" :
                        strategyData.action === "STORE" ? "bg-blue-600" : "bg-purple-600"
                      }`}>
                        Recommandation : {strategyData.action_label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        (Indice de confiance : <strong>{strategyData.confidence_score_pct}%</strong>)
                      </span>
                    </div>
                    <h4 className="text-lg font-black text-foreground">
                      {strategyData.headline}
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Prix du marché actuel : <strong className="text-foreground">{currentPrice} €/t</strong> | Votre marge estimée :{" "}
                      <strong className={currentMarginEur >= 0 ? "text-emerald-600" : "text-rose-600"}>
                        {currentMarginEur > 0 ? `+${currentMarginEur}` : currentMarginEur} € / tonne
                      </strong>
                    </p>
                  </div>

                  {strategyData.recommended_volume_tons > 0 && (
                    <div className="shrink-0 bg-emerald-600/10 border border-emerald-500/30 p-3 rounded-2xl text-center min-w-[150px]">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground">Volume à engager</p>
                      <p className="text-2xl font-black text-emerald-700 dark:text-emerald-400">
                        {strategyData.recommended_volume_tons} t
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* 2 Colonnes d'explications simples */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3 p-4 rounded-2xl bg-card border border-border/70">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Lightbulb className="w-4 h-4 text-amber-500" />
                    Pourquoi ce conseil ?
                  </h5>
                  <ul className="space-y-2">
                    {strategyData.rationale.map((r, i) => (
                      <li key={i} className="text-xs text-foreground flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-3 p-4 rounded-2xl bg-card border border-border/70">
                  <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-primary" />
                    Que faire concrètement (Vos étapes) :
                  </h5>
                  <ul className="space-y-2">
                    {strategyData.step_by_step_plan.map((step, i) => (
                      <li key={i} className="text-xs text-foreground flex items-start gap-2">
                        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/15 text-primary text-[10px] font-black shrink-0">
                          {i + 1}
                        </span>
                        <span className="leading-relaxed">{step.replace(/^\d+\.\s*/, "")}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>
      </Reveal>

      {/* 4. SIGNAUX MARCHÉ EN TEMPS RÉEL */}
      {alerts && alerts.length > 0 && (
        <div className="mt-8 space-y-3">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            Alertes et Opportunités Commerciales du Moment
          </h3>

          <div className="grid gap-3">
            {alerts.map((a) => (
              <div
                key={a.alert_id}
                className="p-4 rounded-2xl bg-card border border-border/80 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="space-y-1 max-w-2xl">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-amber-500/15 text-amber-600">
                      {a.symbol}
                    </span>
                    <h4 className="text-sm font-bold text-foreground">{a.title}</h4>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{a.message}</p>
                </div>

                <div className="sm:text-right shrink-0">
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 block mb-0.5">
                    Action conseillée :
                  </span>
                  <p className="text-xs font-bold text-foreground bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/20 max-w-xs">
                    {a.action_recommended}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}
