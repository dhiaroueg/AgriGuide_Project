import { useCountUp } from "@/components/motion/useCountUp";
import { describeWMO } from "@/components/weather/weatherIcon";
import { useAuth } from "@/lib/auth-context";
import { pickDefaultWeatherLocation } from "@/lib/parcelLocation";
import { getWeatherDashboard } from "@/lib/weatherApi";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CloudSun,
  Droplets,
  Eye,
  Gauge,
  Loader2,
  MapPin,
  Snowflake,
  Sun,
  Thermometer,
  Wind,
} from "lucide-react";

function windHint(speedMph: number | null | undefined, compass: string | null | undefined): string {
  if (speedMph == null) return "—";
  const dir = compass ?? "—";
  if (speedMph < 8) return `${dir} · faible`;
  if (speedMph < 18) return `${dir} · modéré`;
  return `${dir} · fort`;
}

function uvHint(label: string | null | undefined): string {
  return label ?? "—";
}

function parcelIndexScore(data: {
  tempF: number | null;
  precipProb: number | null;
  uv: number | null;
  minTonightF: number | null;
}): { label: string; pct: number } {
  let score = 72;
  if (data.tempF != null && (data.tempF < 32 || data.tempF > 95)) score -= 25;
  if (data.minTonightF != null && data.minTonightF <= 32) score -= 20;
  if (data.precipProb != null && data.precipProb >= 70) score -= 15;
  if (data.uv != null && data.uv >= 8) score -= 10;
  score = Math.max(20, Math.min(98, score));
  if (score >= 75) return { label: "Bon", pct: score / 100 };
  if (score >= 50) return { label: "Moyen", pct: score / 100 };
  return { label: "Vigilance", pct: score / 100 };
}

export function WeatherPanel({ className }: { className?: string }) {
  const { user } = useAuth();
  const terrains = user?.terrains ?? [];
  const defaultLoc = pickDefaultWeatherLocation(terrains);
  const lat = defaultLoc.lat;
  const lon = defaultLoc.lon;
  const locationLabel = defaultLoc.label;

  const query = useQuery({
    queryKey: ["weather-panel", lat, lon],
    queryFn: () =>
      getWeatherDashboard({
        point: { lat, lon },
        location_label: locationLabel,
        forecast_days: 2,
        past_days: 0,
        history_days: 0,
        models: "best_match",
        wind_speed_unit: "kmh",
        temperature_unit: "fahrenheit",
      }),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const data = query.data;
  const current = data?.current;
  const today = data?.daily?.[0];
  const tonight = data?.daily?.[0];

  const tempTarget = Math.round(current?.temperature_2m ?? 0);
  const feelsTarget = Math.round(current?.apparent_temperature ?? tempTarget);
  const [tempRef, temp] = useCountUp(tempTarget);
  const [feelsRef, feels] = useCountUp(feelsTarget);

  const conditions = current?.weather_label ?? describeWMO(current?.weather_code ?? null).labelEN;
  const minTonightF = tonight?.temp_min_f ?? null;
  const frostRisk = minTonightF != null && minTonightF <= 32;
  const index = parcelIndexScore({
    tempF: current?.temperature_2m ?? null,
    precipProb: current?.precipitation_probability ?? today?.precip_prob_max_pct ?? null,
    uv: current?.uv_index ?? null,
    minTonightF,
  });

  const metrics = [
    {
      label: "Humidité",
      value: current?.relative_humidity_2m != null ? `${current.relative_humidity_2m}%` : "—",
      hint:
        current?.relative_humidity_2m != null
          ? current.relative_humidity_2m > 70
            ? "Élevée"
            : current.relative_humidity_2m < 35
              ? "Sèche"
              : "Confortable"
          : "—",
      icon: Droplets,
      fill: current?.relative_humidity_2m ?? 0,
    },
    {
      label: "Vent",
      value:
        current?.wind_speed_10m != null ? `${Math.round(current.wind_speed_10m)} mph` : "—",
      hint: windHint(current?.wind_speed_10m, current?.wind_compass ?? null),
      icon: Wind,
      fill: Math.min(100, ((current?.wind_speed_10m ?? 0) / 25) * 100),
    },
    {
      label: "UV",
      value:
        current?.uv_index != null
          ? `${Math.round(current.uv_index)} / 11`
          : today?.uv_index_max != null
            ? `${Math.round(today.uv_index_max)} / 11`
            : "—",
      hint: uvHint(current?.uv_label ?? null),
      icon: Sun,
      fill: Math.min(100, ((current?.uv_index ?? today?.uv_index_max ?? 0) / 11) * 100),
    },
    {
      label: "Visibilité",
      value:
        current?.visibility != null ? `${current.visibility.toFixed(1)} mi` : "—",
      hint:
        current?.visibility != null
          ? current.visibility >= 6
            ? "Claire"
            : "Réduite"
          : "—",
      icon: Eye,
      fill: Math.min(100, ((current?.visibility ?? 0) / 12) * 100),
    },
  ];

  const isLoading = query.isLoading;
  const isFallback = data?.source === "fallback";
  const isLive = data?.source === "open-meteo";

  return (
    <div
      className={cn(
        "weather-panel relative isolate overflow-hidden rounded-3xl text-[#F4FAF6]",
        className,
      )}
    >
      <div className="weather-sky pointer-events-none absolute inset-0" aria-hidden>
        <span className="weather-cloud weather-cloud-a" />
        <span className="weather-cloud weather-cloud-b" />
        <span className="weather-cloud weather-cloud-c" />
        <span className="weather-haze" />
        <div className="weather-horizon" />
        <div className="weather-field-lines">
          {Array.from({ length: 7 }).map((_, i) => (
            <span key={i} style={{ ["--i" as string]: i }} />
          ))}
        </div>
      </div>

      <div className="relative z-10 flex h-full flex-col p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold backdrop-blur-md ring-1 ring-white/15">
            <MapPin className="h-3.5 w-3.5 text-signal" />
            {locationLabel}
            {isLive ? (
              <>
                <span className="weather-live-dot ml-1" />
                <span className="font-mono text-[10px] uppercase tracking-wider text-white/65">
                  Live
                </span>
              </>
            ) : isLoading ? (
              <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-white/70" />
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-wider text-amber-200/90">
                Hors ligne
              </span>
            )}
          </div>
          <div className="inline-flex items-center gap-2 rounded-lg bg-black/20 px-3 py-1.5 text-xs font-medium backdrop-blur-md ring-1 ring-white/10">
            <CloudSun className="h-3.5 w-3.5" />
            {isLoading ? "Chargement…" : conditions}
          </div>
        </div>

        {isFallback && data?.warning ? (
          <div className="mt-3 inline-flex items-start gap-2 rounded-lg bg-amber-500/20 px-3 py-2 text-xs text-amber-100 ring-1 ring-amber-300/30">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Données de substitution — vérifiez que l&apos;agent weather tourne sur le port 8006.
          </div>
        ) : null}

        <div className="mt-5 flex flex-1 flex-col gap-6 md:mt-6 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-white/50">
              Aujourd&apos;hui sur la parcelle
            </p>
            <div className="mt-1 flex items-end gap-3">
              <span
                ref={tempRef}
                className="font-display text-[4.5rem] leading-none font-bold tracking-tight drop-shadow-sm md:text-[5.25rem]"
              >
                {isLoading ? "—" : temp}°
              </span>
              <div className="mb-2 space-y-1">
                <p className="text-sm text-white/75">
                  Ressenti{" "}
                  <span ref={feelsRef} className="font-semibold text-white">
                    {isLoading ? "—" : feels}°
                  </span>
                </p>
                <p className="inline-flex items-center gap-1.5 text-xs text-signal">
                  <Thermometer className="h-3.5 w-3.5" />
                  {today?.temp_max_f != null && today?.temp_min_f != null
                    ? `Max ${Math.round(today.temp_max_f)}° · Min ${Math.round(today.temp_min_f)}°`
                    : "Prévisions du jour"}
                </p>
              </div>
            </div>

            {frostRisk ? (
              <div className="mt-4 inline-flex max-w-md items-start gap-2.5 rounded-xl bg-black/25 px-3.5 py-2.5 text-sm backdrop-blur-md ring-1 ring-signal/35">
                <Snowflake className="mt-0.5 h-4 w-4 shrink-0 text-signal" />
                <p className="leading-snug text-white/90">
                  <span className="font-semibold text-signal">Gel possible cette nuit</span>
                  {" — "}
                  minimum prévu {Math.round(minTonightF!)}°F. Surveillez les jeunes plants.
                </p>
              </div>
            ) : query.isError ? (
              <div className="mt-4 inline-flex max-w-md items-start gap-2.5 rounded-xl bg-black/25 px-3.5 py-2.5 text-sm backdrop-blur-md ring-1 ring-white/20">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <p className="leading-snug text-white/90">
                  Météo indisponible.{" "}
                  <Link to="/weather" className="font-semibold text-signal underline-offset-2 hover:underline">
                    Ouvrir le dashboard météo
                  </Link>
                </p>
              </div>
            ) : null}
          </div>

          <div className="weather-orb relative mx-auto flex h-36 w-36 shrink-0 items-center justify-center md:mx-0 md:h-40 md:w-40">
            <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 120 120" aria-hidden>
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="rgba(255,255,255,0.15)"
                strokeWidth="8"
              />
              <circle
                className="weather-orb-arc"
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="url(#weatherOrbGrad)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 52}`}
                strokeDashoffset={`${2 * Math.PI * 52 * (1 - index.pct)}`}
              />
              <defs>
                <linearGradient id="weatherOrbGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#C8F542" />
                  <stop offset="100%" stopColor="#7EC8A3" />
                </linearGradient>
              </defs>
            </svg>
            <div className="relative text-center">
              <Gauge className="mx-auto h-5 w-5 text-signal" />
              <p className="mt-1 font-display text-2xl font-bold leading-none">
                {isLoading ? "…" : index.label}
              </p>
              <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-white/55">
                Indice parcelle
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {metrics.map((m) => {
            const Icon = m.icon;
            return (
              <div
                key={m.label}
                className="group rounded-xl bg-white/10 px-3 py-3 backdrop-blur-md ring-1 ring-white/12 transition duration-300 hover:-translate-y-0.5 hover:bg-white/16"
              >
                <div className="flex items-center justify-between gap-2">
                  <Icon className="h-4 w-4 text-signal transition-transform duration-400 group-hover:scale-110" />
                  <span className="font-mono text-[10px] font-medium uppercase tracking-wide text-white/50">
                    {m.label}
                  </span>
                </div>
                <p className="mt-1.5 font-display text-lg font-bold leading-none">{m.value}</p>
                <p className="mt-1 text-[11px] text-white/60">{m.hint}</p>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/15">
                  <div
                    className="weather-meter-fill h-full rounded-full bg-gradient-to-r from-signal to-[#7EC8A3]"
                    style={{ width: `${m.fill}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
