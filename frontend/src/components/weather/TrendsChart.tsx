import { useMemo, useState } from "react";
import { TrendingUp, BarChart3, Lightbulb } from "lucide-react";
import type { TrendSeries, WeatherDashboardResponse } from "@/lib/weatherApi";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
  Bar,
  Area,
  AreaChart,
  type TooltipProps,
} from "recharts";
import { cn } from "@/lib/utils";

type TrendWindowId = "24h" | "7d" | "15d" | "30d" | "90d" | "365d";
type TrendVariableId =
  | "temperature"
  | "precipitation"
  | "humidity"
  | "wind"
  | "uv"
  | "solar"
  | "soil_1in_temp";

const WINDOWS: { id: TrendWindowId; label: string }[] = [
  { id: "24h", label: "24h" },
  { id: "7d", label: "7d" },
  { id: "15d", label: "15d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "Plus" },
];

const VARIABLES: { id: TrendVariableId; label: string }[] = [
  { id: "temperature", label: "Température" },
  { id: "precipitation", label: "Précipitations" },
  { id: "humidity", label: "Humidité" },
  { id: "wind", label: "Vent" },
  { id: "uv", label: "Indice UV" },
  { id: "solar", label: "Rayonnement solaire" },
  { id: "soil_1in_temp", label: "Température du sol" },
];

type SeriesPt = Record<string, unknown>;

function _pickSeries(
  trends: Record<string, TrendSeries>,
  win: TrendWindowId,
  variable: TrendVariableId,
): TrendSeries | null {
  if (win === "24h") {
    if (variable === "temperature") return trends["24h_temp_f"] ?? null;
    if (variable === "humidity") return trends["48h_humidity_pct"] ?? null;
    return trends["24h_temp_f"] ?? null;
  }
  if (win === "365d") win = "30d"; // fallback
  return trends[win] ?? null;
}

function _hourShortLabel(iso: string): string {
  const d = new Date(iso.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return iso.slice(-5);
  const h = d.getHours();
  return `${h === 0 ? 12 : h > 12 ? h - 12 : h} ${h >= 12 ? "PM" : "AM"}`;
}

function _dateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function buildChartRows(
  data: WeatherDashboardResponse,
  series: TrendSeries | null,
  win: TrendWindowId,
  variable: TrendVariableId,
): SeriesPt[] {
  if (win === "24h") {
    return data.hourly.slice(0, 25).map((point) => {
      const out: SeriesPt = {
        label: _hourShortLabel(point.time),
        unit: "",
      };

      switch (variable) {
        case "temperature":
          out.value = point.temp_f;
          out.feels_like = point.feels_like_f;
          out.unit = "°F";
          break;
        case "humidity":
          out.value = point.humidity_pct;
          out.unit = "%";
          break;
        case "precipitation":
          out.value = point.precip_in;
          out.unit = " in";
          break;
        case "wind":
          out.value =
            point.wind_speed_kmh != null
              ? Number((point.wind_speed_kmh / 1.609344).toFixed(1))
              : null;
          out.unit = " mph";
          break;
        case "uv":
          out.value = point.uv_index;
          break;
        case "solar":
          out.value = point.solar_radiation_wm2;
          out.unit = " W/m²";
          break;
        case "soil_1in_temp":
          out.value = point.soil_temp_f;
          out.unit = "°F";
          break;
        default:
          out.value = null;
      }
      return out;
    });
  }

  const points = series?.points.length
    ? series.points
    : data.daily.map((point) => ({
        date: point.date,
        temp_max_f: point.temp_max_f,
        temp_min_f: point.temp_min_f,
        precip_in: point.precip_sum_in,
        wind_kmh: point.wind_speed_max_kmh,
        uv_index: point.uv_index_max,
      }));

  if (!points.length) return [];
  return points.map((pt) => {
    const out: SeriesPt = { ...pt };
    const d = (pt.date as string) ?? "";
    out.label = _dateShort(d);
    out.temp_max = pt.temp_max_f;
    out.temp_min = pt.temp_min_f;
    if (variable === "precipitation") {
      out.value = pt.precip_in;
      out.unit = "in";
    } else if (variable === "wind") {
      const kmh = pt.wind_kmh as number | undefined;
      out.value = kmh != null ? Number((kmh / 1.609344).toFixed(1)) : null;
      out.unit = "mph";
    } else if (variable === "uv") {
      out.value = pt.uv_index;
      out.unit = "";
    } else if (variable === "solar") {
      out.value = pt.solar_mj_m2;
      out.unit = "MJ/m²";
    } else {
      // Temperature is represented by its daily high and low values.
      out.unit = "°F";
    }
    return out;
  });
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || !payload.length) return null;
  const unit = payload[0]?.payload?.unit as string | undefined;
  return (
    <div className="rounded-xl border border-[#C7E3D0] bg-[#0C2819] px-4 py-2.5 text-xs text-[#EAF7EF] shadow-lg">
      <div className="font-mono text-[10px] uppercase tracking-wider text-[#A6C7B2]">
        {label as string}
      </div>
      <div className="mt-1 space-y-0.5">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: (p as { color?: string }).color ?? "#7EC8A3" }}
            />
            <span className="font-semibold capitalize">
              {(p as { name?: string }).name?.replaceAll("_", " ") ?? ""}
            </span>
            <span>
              {typeof p.value === "number"
                ? Number.isInteger(p.value)
                  ? p.value
                  : p.value.toFixed(1)
                : "—"}
              {unit ?? ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function numberValues(rows: SeriesPt[], key: string): number[] {
  return rows
    .map((row) => row[key])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function formatCelsius(fahrenheit: number): string {
  return `${Math.round((fahrenheit - 32) * 5 / 9)} °C`;
}

function trendGuidance(variable: TrendVariableId, rows: SeriesPt[]) {
  const values = numberValues(rows, variable === "temperature" ? "temp_min" : "value");
  const temperatureValues = variable === "temperature"
    ? [...numberValues(rows, "value"), ...numberValues(rows, "temp_min"), ...numberValues(rows, "temp_max")]
    : [];
  const max = values.length ? Math.max(...values) : null;
  const sum = values.reduce((total, value) => total + value, 0);

  if (variable === "temperature" && temperatureValues.length) {
    const low = Math.min(...temperatureValues);
    const high = Math.max(...temperatureValues);
    return low <= 32
      ? { observation: `Le thermomètre peut descendre jusqu’à ${formatCelsius(low)}.`, action: "Protégez les jeunes plants et évitez toute irrigation tardive." }
      : { observation: `Températures attendues entre ${formatCelsius(low)} et ${formatCelsius(high)}.`, action: "Conditions thermiques globalement favorables aux travaux prévus." };
  }
  if (variable === "precipitation" && max != null) {
    const totalMm = sum * 25.4;
    return totalMm >= 12
      ? { observation: `${Math.round(totalMm)} mm de pluie sont attendus sur la période.`, action: "Décalez les passages d’engins et surveillez les zones sensibles au ruissellement." }
      : { observation: `${Math.round(totalMm)} mm de pluie sont attendus sur la période.`, action: "Surveillez le besoin en eau des cultures, surtout sur les sols légers." };
  }
  if (variable === "humidity" && max != null) {
    return max >= 85
      ? { observation: `L’humidité peut atteindre ${Math.round(max)} %.`, action: "Une forte humidité favorise certaines maladies: inspectez les feuilles après les périodes humides." }
      : { observation: `L’humidité reste sous ${Math.round(max)} %.`, action: "Le risque lié à l’humidité paraît limité; gardez un œil sur l’état hydrique du sol." };
  }
  if (variable === "wind" && max != null) {
    const maxKmh = Math.round(max * 1.609344);
    return maxKmh >= 30
      ? { observation: `Des rafales jusqu’à ${maxKmh} km/h sont possibles.`, action: "Évitez les traitements et les interventions exposées au vent." }
      : { observation: `Vent maximal attendu: ${maxKmh} km/h.`, action: "Les conditions semblent compatibles avec les interventions prévues." };
  }
  if (variable === "uv" && max != null) {
    return max >= 6
      ? { observation: `L’indice UV peut atteindre ${Math.round(max)}.`, action: "Privilégiez les travaux physiques tôt le matin et protégez les opérateurs." }
      : { observation: `L’indice UV reste modéré, jusqu’à ${Math.round(max)}.`, action: "Aucune vigilance UV particulière; adaptez les horaires aux températures." };
  }
  if (variable === "solar" && max != null) {
    return { observation: `Le rayonnement atteindra jusqu’à ${Math.round(max)} W/m².`, action: "Un bon ensoleillement augmente l’évaporation: surveillez l’humidité du sol." };
  }
  if (variable === "soil_1in_temp" && max != null) {
    return { observation: `La température du sol atteint environ ${formatCelsius(max)}.`, action: "Comparez cette valeur aux besoins de germination avant de semer." };
  }
  return { observation: "Les données disponibles ne permettent pas encore une lecture fiable.", action: "Réessayez plus tard ou consultez le briefing météo." };
}

export function TrendsChart({ data }: { data: WeatherDashboardResponse }) {
  const [win, setWin] = useState<TrendWindowId>("24h");
  const [variable, setVariable] = useState<TrendVariableId>("temperature");
  const [includeFeels, setIncludeFeels] = useState(true);

  const series = useMemo(
    () => _pickSeries(data.trends, win, variable),
    [data.trends, win, variable],
  );
  const rows = useMemo(
    () => buildChartRows(data, series, win, variable),
    [data, series, win, variable],
  );
  const isTemperature = variable === "temperature";
  const isHumidity = variable === "humidity";
  const guidance = useMemo(() => trendGuidance(variable, rows), [variable, rows]);

  return (
    <section className="rounded-3xl border border-[#C7E3D0] bg-white/90 p-5 shadow-sm ring-1 ring-[#D5E7DB] md:p-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-lg font-bold text-[#0C2819]">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#DFF5E6] text-[#2E7D4E]">
            <TrendingUp className="h-4 w-4" />
          </span>
          Lecture météo
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-2xl border border-[#D5E7DB] bg-[#F4FAF6] p-1 text-sm">
            <select
              className="h-9 rounded-xl bg-transparent px-3 pr-7 text-sm font-semibold text-[#0C2819] outline-none"
              aria-label="Indicateur météo"
              value={variable}
              onChange={(e) => setVariable(e.target.value as TrendVariableId)}
            >
              {VARIABLES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-xl border border-[#D5E7DB] px-3 text-sm font-semibold text-[#3B5245]"
            title="Les détails sont disponibles au survol du graphique"
          >
            <BarChart3 className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {WINDOWS.map((w) => (
          <button
            type="button"
            key={w.id}
            onClick={() => setWin(w.id)}
            className={cn(
              "rounded-xl px-3.5 py-1.5 text-sm font-semibold transition",
              win === w.id
                ? "bg-[#0C2819] text-[#F0F9F3] shadow-sm"
                : "border border-[#D5E7DB] bg-[#F4FAF6] text-[#4D6254] hover:text-[#0C2819]",
            )}
          >
            {w.label}
          </button>
        ))}
        {win === "24h" && variable === "temperature" ? (
          <button
            type="button"
            onClick={() => setIncludeFeels((v) => !v)}
            className={cn(
              "ml-2 rounded-xl px-3.5 py-1.5 text-sm font-semibold transition border",
              includeFeels
                ? "border-[#3F8A5E] bg-[#EAF7EF] text-[#2E7D4E]"
                : "border-[#D5E7DB] bg-[#F4FAF6] text-[#4D6254]",
            )}
          >
            + Température ressentie
          </button>
        ) : null}
      </div>

      <div className="mt-5 grid gap-4 border-l-2 border-[#57A677] bg-[#F4FAF6] p-4 sm:grid-cols-[1fr_1fr]">
        <div className="flex gap-2.5">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[#2E7D4E]" />
          <div>
            <p className="text-xs font-semibold text-[#0C2819]">À retenir</p>
            <p className="mt-1 text-sm leading-relaxed text-[#4D6254]">{guidance.observation}</p>
          </div>
        </div>
        <div className="border-t border-[#D5E7DB] pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
          <p className="text-xs font-semibold text-[#0C2819]">À faire</p>
          <p className="mt-1 text-sm leading-relaxed text-[#4D6254]">{guidance.action}</p>
        </div>
      </div>

      <div className="mt-5 h-[320px] w-full">
        {!rows.length ? (
          <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[#C7E3D0] bg-[#F4FAF6] text-sm text-[#4D6254]">
            Pas assez de données pour cette fenêtre. Essayez 24h ou 7d.
          </div>
        ) : win === "24h" ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ top: 10, right: 16, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="tempFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#3F8A5E" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#3F8A5E" stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="feelsFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#E0A84B" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#E0A84B" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 6" stroke="#D5E7DB" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#4D6254", fontSize: 12 }}
                axisLine={{ stroke: "#C7E3D0" }}
                tickLine={false}
                minTickGap={22}
              />
              <YAxis
                tick={{ fill: "#4D6254", fontSize: 12 }}
                axisLine={{ stroke: "#C7E3D0" }}
                tickLine={false}
                domain={["auto", "auto"]}
                unit={isHumidity ? "%" : isTemperature ? "°F" : undefined}
              />
              <Tooltip content={<CustomTooltip />} />
              {isHumidity ? (
                <Area
                  type="monotone"
                  dataKey="value"
                  name="Humidité"
                  stroke="#3F8A5E"
                  fill="url(#tempFill)"
                  strokeWidth={2.2}
                  isAnimationActive={false}
                />
              ) : isTemperature ? (
                <>
                  <Area
                    type="monotone"
                    dataKey="value"
                    name="Température"
                    stroke="#0C2819"
                    fill="url(#tempFill)"
                    strokeWidth={2.6}
                    isAnimationActive={false}
                  />
                  {includeFeels ? (
                    <Area
                      type="monotone"
                      dataKey="feels_like"
                      name="Ressenti"
                      stroke="#C48A2B"
                      fill="url(#feelsFill)"
                      strokeWidth={1.8}
                      strokeDasharray="6 5"
                      isAnimationActive={false}
                    />
                  ) : null}
                </>
              ) : (
                <Area
                  type="monotone"
                  dataKey="value"
                  name={VARIABLES.find((item) => item.id === variable)?.label ?? "Value"}
                  stroke={variable === "uv" ? "#C48A2B" : "#2C6F92"}
                  fill="url(#tempFill)"
                  strokeWidth={2.4}
                  isAnimationActive={false}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        ) : variable === "precipitation" ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 10, right: 16, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 6" stroke="#D5E7DB" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#4D6254", fontSize: 12 }}
                axisLine={{ stroke: "#C7E3D0" }}
                tickLine={false}
                minTickGap={10}
              />
              <YAxis
                tick={{ fill: "#4D6254", fontSize: 12 }}
                axisLine={{ stroke: "#C7E3D0" }}
                tickLine={false}
                unit=" in"
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="value"
                name="Précipitations (pouces)"
                fill="#57A677"
                radius={[6, 6, 0, 0]}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="temp_max"
                name="Max °F"
                stroke="#B4691A"
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="temp_min"
                name="Min °F"
                stroke="#2C6F92"
                strokeWidth={1.4}
                dot={false}
                strokeDasharray="4 4"
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : variable === "uv" || variable === "solar" || variable === "wind" ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 10, right: 16, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 6" stroke="#D5E7DB" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#4D6254", fontSize: 12 }}
                axisLine={{ stroke: "#C7E3D0" }}
                tickLine={false}
                minTickGap={10}
              />
              <YAxis
                tick={{ fill: "#4D6254", fontSize: 12 }}
                axisLine={{ stroke: "#C7E3D0" }}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="value"
                name={
                  variable === "uv"
                    ? "Indice UV"
                    : variable === "solar"
                      ? "Rayonnement solaire"
                      : "Vent (mph)"
                }
                stroke={
                  variable === "uv"
                    ? "#C48A2B"
                    : variable === "solar"
                      ? "#9A71D2"
                      : "#2C6F92"
                }
                strokeWidth={2.2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 10, right: 16, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 6" stroke="#D5E7DB" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "#4D6254", fontSize: 12 }}
                axisLine={{ stroke: "#C7E3D0" }}
                tickLine={false}
                minTickGap={10}
              />
              <YAxis
                tick={{ fill: "#4D6254", fontSize: 12 }}
                axisLine={{ stroke: "#C7E3D0" }}
                tickLine={false}
                unit="°F"
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="temp_max"
                name="Max °F"
                stroke="#0C2819"
                strokeWidth={2.4}
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="temp_min"
                name="Min °F"
                stroke="#3F8A5E"
                strokeWidth={1.8}
                dot={false}
                strokeDasharray="5 5"
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
