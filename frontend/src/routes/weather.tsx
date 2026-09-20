import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CloudRain,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  Sprout,
} from "lucide-react";

import { AppShell } from "@/components/AppShell";
import {
  ChooseFieldsPanel,
  FieldTabs,
  type FieldTabId,
} from "@/components/weather/ChooseFieldsPanel";
import { HourlyForecastStrip } from "@/components/weather/HourlyForecastStrip";
import { DailyForecastStrip } from "@/components/weather/DailyForecastStrip";
import { TrendsChart } from "@/components/weather/TrendsChart";
import { DecisionSignals } from "@/components/weather/DecisionSignals";
import { WeatherCalendar } from "@/components/weather/WeatherCalendar";
import { PageTour } from "@/components/onboarding/PageTour";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import {
  geocodePlaceName,
  pickDefaultWeatherLocation,
  saveWeatherTerrainId,
  terrainToWeatherLocation,
  type WeatherLocation,
} from "@/lib/parcelLocation";
import { WeatherApiError, getWeatherDashboard } from "@/lib/weatherApi";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MANUAL_VALUE = "__manual__";

export const Route = createFileRoute("/weather")({
  head: () => ({
    meta: [
      { title: "Météo · Dashboard - AgriMent" },
      {
        name: "description",
        content:
          "Tableau de bord météo complet : prévisions 24h, 15 jours, tendances températures / précipitations et calendrier.",
      },
    ],
  }),
  component: WeatherRoute,
});

function WeatherRoute() {
  const { user } = useAuth();
  const terrains = user?.terrains ?? [];

  const defaultLoc = useMemo(() => pickDefaultWeatherLocation(terrains), [terrains]);

  const [fieldTab, setFieldTab] = useState<FieldTabId>("current");
  const [selectedKey, setSelectedKey] = useState<string>(
    () => defaultLoc.terrainId ?? MANUAL_VALUE,
  );
  const [lat, setLat] = useState<string>(() => defaultLoc.lat.toFixed(4));
  const [lon, setLon] = useState<string>(() => defaultLoc.lon.toFixed(4));
  const [loc, setLoc] = useState<string>(() => defaultLoc.label);
  const [geocoding, setGeocoding] = useState(false);
  const didSyncTerrainsRef = useRef(false);

  useEffect(() => {
    if (didSyncTerrainsRef.current || terrains.length === 0) return;
    didSyncTerrainsRef.current = true;
    const next = pickDefaultWeatherLocation(terrains);
    applyLocation(next, next.terrainId ?? MANUAL_VALUE);
  }, [terrains]);

  function applyLocation(next: WeatherLocation, terrainKey: string) {
    setSelectedKey(terrainKey);
    setLat(next.lat.toFixed(4));
    setLon(next.lon.toFixed(4));
    setLoc(next.label);
    if (next.terrainId) saveWeatherTerrainId(next.terrainId);
    else saveWeatherTerrainId(null);
  }

  function onParcelChange(value: string) {
    if (value === MANUAL_VALUE) {
      setSelectedKey(MANUAL_VALUE);
      saveWeatherTerrainId(null);
      return;
    }
    const terrain = terrains.find((t) => t.id === value);
    if (!terrain) return;
    const next = terrainToWeatherLocation(terrain);
    if (next) applyLocation(next, value);
  }

  const query = useQuery({
    queryKey: ["weather-dashboard", lat, lon, loc],
    queryFn: async () => {
      const pLat = parseFloat(lat);
      const pLon = parseFloat(lon);
      if (!Number.isFinite(pLat) || !Number.isFinite(pLon)) {
        throw new WeatherApiError("Coordonnées GPS invalides.");
      }
      return await getWeatherDashboard({
        point: { lat: pLat, lon: pLon },
        location_label: loc || null,
        forecast_days: 16,
        past_days: 0,
        history_days: 30,
        models: "best_match",
        wind_speed_unit: "kmh",
        temperature_unit: "fahrenheit",
      });
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();

    if (selectedKey === MANUAL_VALUE && loc.trim()) {
      const pLat = parseFloat(lat);
      const pLon = parseFloat(lon);
      const coordsValid = Number.isFinite(pLat) && Number.isFinite(pLon);

      if (!coordsValid) {
        setGeocoding(true);
        try {
          const found = await geocodePlaceName(loc);
          if (!found) {
            toast.error("Lieu introuvable — précisez le nom ou les coordonnées GPS.");
            return;
          }
          applyLocation(found, MANUAL_VALUE);
        } catch {
          toast.error("Recherche de lieu indisponible.");
          return;
        } finally {
          setGeocoding(false);
        }
      }
    }

    query.refetch().catch(() => {
      toast.error("Échec du rechargement météo.");
    });
  }

  const isParcelMode = selectedKey !== MANUAL_VALUE;

  return (
    <AppShell>
      <div className="landing-rise mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Météo · Dashboard
          </p>
          <h1 className="mt-2 font-display text-3xl md:text-[2.5rem] font-bold tracking-tight leading-[1.05]">
            Météo en direct sur votre parcelle
            <br />
            <span className="text-primary/80">
              Liée à vos terrains enregistrés — Open-Meteo.
            </span>
          </h1>
        </div>

        <form
          onSubmit={onSearch}
          className="flex flex-col gap-2 rounded-2xl border border-sidebar-border bg-white/60 p-3 backdrop-blur-sm sm:min-w-[22rem]"
          data-tour="weather-location"
        >
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-primary" />
            <Select value={selectedKey} onValueChange={onParcelChange}>
              <SelectTrigger className="h-9 flex-1 rounded-xl bg-transparent text-sm">
                <SelectValue placeholder="Choisir une parcelle" />
              </SelectTrigger>
              <SelectContent>
                {terrains.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nom ?? "Terrain"} ({t.superficie_ha.toFixed(1)} ha)
                    {t.region ? ` · ${t.region}` : ""}
                  </SelectItem>
                ))}
                <SelectItem value={MANUAL_VALUE}>Autre lieu (ville, coordonnées…)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {terrains.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Aucune parcelle enregistrée.{" "}
              <Link to="/agriculture" className="font-semibold text-primary underline-offset-2 hover:underline">
                Sélectionnez-en une dans le Conseiller Agricole
              </Link>
              , ou recherchez un lieu ci-dessous.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Même parcelles que dans{" "}
              <Link to="/agriculture" className="font-semibold text-primary underline-offset-2 hover:underline">
                Conseiller Agricole
              </Link>
              . Coordonnées = centre du terrain tracé.
            </p>
          )}

          {!isParcelMode ? (
            <div className="flex flex-wrap items-end gap-2">
              <Input
                type="text"
                value={loc}
                onChange={(e) => setLoc(e.target.value)}
                placeholder="Ville ou nom du lieu…"
                className="min-w-[10rem] flex-1 h-9 text-sm"
              />
              <Input
                type="number"
                step="0.0001"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="Lat"
                className="w-28 h-9 text-sm"
                aria-label="Latitude"
              />
              <Input
                type="number"
                step="0.0001"
                value={lon}
                onChange={(e) => setLon(e.target.value)}
                placeholder="Lon"
                className="w-28 h-9 text-sm"
                aria-label="Longitude"
              />
            </div>
          ) : (
            <p className="rounded-lg bg-primary/5 px-2.5 py-1.5 text-xs text-[#3B5245]">
              <Sprout className="mr-1 inline h-3.5 w-3.5 text-primary" />
              {loc} · {parseFloat(lat).toFixed(4)}°, {parseFloat(lon).toFixed(4)}°
            </p>
          )}

          <div className="flex gap-1.5">
            <Button type="submit" size="sm" className="gap-1.5" disabled={query.isFetching || geocoding}>
              {query.isFetching || geocoding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {isParcelMode ? "Actualiser" : "Charger"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              title="Rafraîchir"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>

      {query.isError ? (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="flex-1">
            <b className="font-semibold">API météo temporairement inaccessible.</b>
            <p className="mt-0.5 text-amber-700">
              {query.error instanceof Error ? query.error.message : ""}
              <br />
              Démarrez l&apos;agent weather&nbsp;:{" "}
              <code className="rounded bg-white/70 px-1.5 py-0.5 text-xs font-mono">
                cd backend\agent_weather ; uvicorn app.main:app --reload --port 8006
              </code>
            </p>
          </div>
        </div>
      ) : null}

      {query.isLoading || !query.data ? (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-[#C7E3D0] bg-[#F4FAF6] text-[#3B5245]">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full text-primary pulse-ring">
            <Loader2 className="h-6 w-6 animate-spin" />
          </span>
          <div className="text-sm text-center">
            <div className="font-semibold">Chargement du dashboard météo…</div>
            <div className="mt-1 text-xs opacity-75">
              Open-Meteo via agent_weather · parcelle : {loc}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <section
            className={cn(
              "rounded-3xl border border-[#C7E3D0] bg-white/90 p-5 shadow-sm ring-1 ring-[#D5E7DB] md:p-7",
              "[&_.weather-panel]:rounded-none [&_.weather-panel]:ring-0 [&_.weather-panel]:shadow-none [&_.weather-panel]:border-0 [&_.weather-panel]:bg-transparent [&_.weather-panel]:p-0",
            )}
            data-tour="weather-fields"
          >
            <header className="flex items-center gap-2 text-lg font-bold text-[#0C2819]">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#DFF5E6] text-[#2E7D4E]">
                <Search className="h-4 w-4" />
              </span>
              Choose Fields
            </header>
            <div className="mt-4">
              <FieldTabs value={fieldTab} onChange={setFieldTab} />
            </div>
            <div className="mt-5">
              <ChooseFieldsPanel data={query.data} tab={fieldTab} />
            </div>
          </section>

          <HourlyForecastStrip hourly={query.data.hourly} maxHours={25} />
          <div data-tour="weather-forecast">
            <DailyForecastStrip daily={query.data.daily} />
            <TrendsChart data={query.data} />
            <DecisionSignals signals={query.data.decision_signals ?? []} />
            <WeatherCalendar data={query.data} />
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#C7E3D0] bg-[#F4FAF6] px-4 py-3 text-xs text-[#4D6254]">
            <div className="flex items-center gap-2">
              <CloudRain className="h-4 w-4 text-[#3F8A5E]" />
              Source :{" "}
              <b className="text-[#0C2819]">
                {query.data.source === "open-meteo"
                  ? "Open-Meteo"
                  : query.data.source === "fallback"
                    ? "Données de substitution (API hors ligne)"
                    : query.data.source}
              </b>{" "}
              · {query.data.location_label ?? loc} · {query.data.timezone}
            </div>
            {query.data.warning ? (
              <div className="rounded-lg bg-white/80 px-2.5 py-1 text-[11px] text-amber-700 ring-1 ring-amber-200">
                {query.data.warning}
              </div>
            ) : null}
          </footer>
        </div>
      )}
      <PageTour tourId="weather" />
    </AppShell>
  );
}
