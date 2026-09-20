import { useState, useEffect, useRef } from "react";
import {
  SatelliteIndexType,
  SatelliteTimelineResponse,
} from "@/lib/agricultureApi";
import {
  Layers,
  Play,
  Pause,
  Droplets,
  Sprout,
  Eye,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Info,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SatelliteTimelineControlProps {
  data: SatelliteTimelineResponse | null;
  isLoading: boolean;
  activeType: SatelliteIndexType;
  selectedMonthIndex: number;
  isComparePriorYear: boolean;
  onTypeChange: (type: SatelliteIndexType) => void;
  onMonthIndexChange: (index: number) => void;
  onCompareToggle: (compare: boolean) => void;
  onClose?: () => void;
}

export function SatelliteTimelineControl({
  data,
  isLoading,
  activeType,
  selectedMonthIndex,
  isComparePriorYear,
  onTypeChange,
  onMonthIndexChange,
  onCompareToggle,
  onClose,
}: SatelliteTimelineControlProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const timeline = data?.timeline ?? [];
  const activePoint = timeline[selectedMonthIndex] ?? timeline[timeline.length - 1];
  const stats = data?.stats;

  // Auto-play animation loop across the 12-month season
  useEffect(() => {
    if (isPlaying && timeline.length > 0) {
      playTimerRef.current = setInterval(() => {
        onMonthIndexChange(
          selectedMonthIndex >= timeline.length - 1 ? 0 : selectedMonthIndex + 1
        );
      }, 1200);
    } else if (playTimerRef.current) {
      clearInterval(playTimerRef.current);
    }
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current);
    };
  }, [isPlaying, selectedMonthIndex, timeline.length, onMonthIndexChange]);

  const deltaPct = data?.delta_pct;
  const isPositiveDelta = (deltaPct ?? 0) >= 0;

  return (
    <div className="surface-glass rounded-2xl border border-primary/25 p-4 sm:p-5 shadow-soft backdrop-blur-xl bg-card/95 text-card-foreground transition-all duration-300">
      {/* Top Header: Title & Badges */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-bold tracking-tight text-foreground flex items-center gap-1.5">
                <Layers className="h-4 w-4 text-primary" />
                Imagerie Satellite Multi-Temporelle
              </h3>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-primary uppercase tracking-wider">
                Sentinel-2 · 10m
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Suivi dynamique du couvert végétal et détection du stress hydrique
            </p>
          </div>
        </div>

        {onClose && (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 rounded-lg px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            Fermer l'overlay
          </Button>
        )}
      </div>

      {/* Index Selector Tabs & Year Comparison Toggle */}
      <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3">
        {/* Index Segmented Control */}
        <div className="inline-flex rounded-xl bg-muted/80 p-1 border border-border/50">
          <button
            type="button"
            onClick={() => onTypeChange("ndvi")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200",
              activeType === "ndvi"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Sprout className="h-3.5 w-3.5" />
            NDVI (Biomasse)
          </button>
          <button
            type="button"
            onClick={() => onTypeChange("ndwi")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200",
              activeType === "ndwi"
                ? "bg-sky-600 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Droplets className="h-3.5 w-3.5" />
            NDWI (Stress Eau)
          </button>
          <button
            type="button"
            onClick={() => onTypeChange("rgb")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200",
              activeType === "rgb"
                ? "bg-emerald-800 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Eye className="h-3.5 w-3.5" />
            Couleur Réelle
          </button>
        </div>

        {/* N vs N-1 Comparison Toggle */}
        <button
          type="button"
          onClick={() => onCompareToggle(!isComparePriorYear)}
          className={cn(
            "inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all",
            isComparePriorYear
              ? "border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold"
              : "border-border/70 bg-card/60 text-muted-foreground hover:bg-secondary"
          )}
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          <span>Comparer vs Année N-1</span>
          {isComparePriorYear && deltaPct !== undefined && deltaPct !== null && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.2 text-[11px] font-mono",
                isPositiveDelta
                  ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300"
                  : "bg-rose-500/20 text-rose-600 dark:text-rose-300"
              )}
            >
              {isPositiveDelta ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {isPositiveDelta ? `+${deltaPct}%` : `${deltaPct}%`}
            </span>
          )}
        </button>
      </div>

      {/* Main Timeline Slider Section */}
      <div className="mt-4 rounded-xl border border-border/70 bg-secondary/30 p-3.5">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 w-7 rounded-lg p-0"
              onClick={() => setIsPlaying(!isPlaying)}
              title={isPlaying ? "Pause" : "Lecture automatique"}
            >
              {isPlaying ? <Pause className="h-3.5 w-3.5 text-primary" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              Date analysée :{" "}
              <span className="font-bold text-primary">
                {activePoint?.label ?? "Date actuelle"}
              </span>
            </span>
          </div>

          <div className="text-[11px] font-mono text-muted-foreground">
            {activeType === "ndvi" && activePoint && (
              <span>Indice moyen : <strong>{activePoint.ndvi.toFixed(2)}</strong></span>
            )}
            {activeType === "ndwi" && activePoint && (
              <span>Hydratation : <strong>{activePoint.ndwi > 0 ? `+${activePoint.ndwi.toFixed(2)}` : activePoint.ndwi.toFixed(2)}</strong></span>
            )}
          </div>
        </div>

        {/* Range Slider */}
        <div className="relative pt-1 pb-1">
          <input
            type="range"
            min={0}
            max={Math.max(0, timeline.length - 1)}
            value={selectedMonthIndex}
            onChange={(e) => onMonthIndexChange(parseInt(e.target.value, 10))}
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-secondary accent-primary transition-all"
          />

          {/* Month Labels Bar */}
          <div className="mt-2 flex justify-between text-[10px] font-medium text-muted-foreground select-none">
            {timeline.map((pt, idx) => {
              const isSelected = idx === selectedMonthIndex;
              return (
                <button
                  key={pt.date}
                  type="button"
                  onClick={() => onMonthIndexChange(idx)}
                  className={cn(
                    "transition-colors hover:text-foreground text-center",
                    isSelected && "font-bold text-primary scale-105"
                  )}
                >
                  {pt.label.split(" ")[0]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Live Health Diagnosis & Statistics Grid */}
      {stats && (
        <div className="mt-3.5 grid gap-3 sm:grid-cols-3">
          {/* Vigor Card */}
          <div className="rounded-xl border border-border/60 bg-card/60 p-2.5">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Sprout className="h-3.5 w-3.5 text-emerald-500" />
              État de Vigueur
            </div>
            <div className="mt-1 font-semibold text-xs text-foreground">
              {stats.vigor_class}
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground font-mono">
              Plage : [{stats.min.toFixed(2)} - {stats.max.toFixed(2)}] · σ={stats.std.toFixed(2)}
            </div>
          </div>

          {/* Water Stress Card */}
          <div className="rounded-xl border border-border/60 bg-card/60 p-2.5">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Droplets className="h-3.5 w-3.5 text-sky-500" />
              Hydratation & Eau
            </div>
            <div className="mt-1 font-semibold text-xs text-foreground">
              {stats.water_stress_class ?? "Normal"}
            </div>
            <div className="mt-1 text-[10px] text-muted-foreground">
              Couverture nuages : {stats.cloud_cover_pct}%
            </div>
          </div>

          {/* Health Distribution Zones Bar */}
          <div className="rounded-xl border border-border/60 bg-card/60 p-2.5">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Zonage Parcelle</span>
              <span className="font-mono text-[10px] text-emerald-500">
                {stats.distribution_pct.optimal}% Optimale
              </span>
            </div>
            {/* Visual breakdown bar */}
            <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                style={{ width: `${stats.distribution_pct.optimal}%` }}
                className="bg-emerald-500 transition-all duration-500"
                title={`Vigueur optimale: ${stats.distribution_pct.optimal}%`}
              />
              <div
                style={{ width: `${stats.distribution_pct.moderate}%` }}
                className="bg-amber-400 transition-all duration-500"
                title={`Vigueur modérée: ${stats.distribution_pct.moderate}%`}
              />
              <div
                style={{ width: `${stats.distribution_pct.stressed}%` }}
                className="bg-rose-500 transition-all duration-500"
                title={`Stress / Sol nu: ${stats.distribution_pct.stressed}%`}
              />
            </div>
            <div className="mt-1 flex justify-between text-[9px] text-muted-foreground">
              <span className="text-emerald-500 font-medium">Opt: {stats.distribution_pct.optimal}%</span>
              <span className="text-amber-500 font-medium">Mod: {stats.distribution_pct.moderate}%</span>
              <span className="text-rose-500 font-medium">Str: {stats.distribution_pct.stressed}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Color Scale Legend */}
      <div className="mt-3 flex items-center gap-3 pt-2 border-t border-border/50 text-[10px] text-muted-foreground">
        <span className="font-semibold text-foreground shrink-0 flex items-center gap-1">
          <Info className="h-3 w-3" />
          Échelle {activeType.toUpperCase()} :
        </span>
        <div className="flex-1 flex items-center gap-2">
          <span>{activeType === "ndwi" ? "Sec (-0.25)" : "Sol nu (0.0)"}</span>
          <div
            className={cn(
              "h-2 flex-1 rounded-full",
              activeType === "ndvi"
                ? "bg-gradient-to-r from-rose-600 via-amber-400 via-lime-400 to-emerald-700"
                : activeType === "ndwi"
                ? "bg-gradient-to-r from-amber-700 via-lime-200 via-sky-400 to-blue-700"
                : "bg-gradient-to-r from-stone-600 via-emerald-700 to-emerald-900"
            )}
          />
          <span>{activeType === "ndwi" ? "Saturé (+0.50)" : "Végétation dense (0.90)"}</span>
        </div>
      </div>
    </div>
  );
}
