import {
  CloudSun,
  Droplets,
  Gauge,
  Sunrise,
  Sunset,
  Thermometer,
  Wind,
  CloudRain,
  Sun,
  type LucideIcon,
} from "lucide-react";
import type {
  AtmosphereMetrics,
  CurrentWeather,
  SoilMetrics,
  SolarMetrics,
} from "@/lib/weatherApi";
import { WeatherIcon, describeWMO, toneBg } from "@/components/weather/weatherIcon";
import { cn } from "@/lib/utils";

export type FieldTabId = "current" | "atmosphere" | "soil" | "solar";

const TABS: { id: FieldTabId; label: string }[] = [
  { id: "current", label: "Current" },
  { id: "atmosphere", label: "Atmosphere" },
  { id: "soil", label: "Soil" },
  { id: "solar", label: "Solar" },
];

export function FieldTabs({
  value,
  onChange,
}: {
  value: FieldTabId;
  onChange: (id: FieldTabId) => void;
}) {
  return (
    <div className="inline-flex rounded-2xl border border-[#D5E7DB] bg-[#F4FAF6] p-1 text-sm text-[#2E4036]">
      {TABS.map((t) => {
        const active = value === t.id;
        return (
          <button
            type="button"
            key={t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              "rounded-xl px-4 py-2 font-semibold transition",
              active
                ? "bg-white shadow-sm ring-1 ring-[#D5E7DB] text-[#0C2819]"
                : "text-[#4D6254] hover:text-[#0C2819]",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function _fmt(n: number | null | undefined, digits = 1, suffix = ""): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}${suffix}`;
}

function _dtLabel(t: string | null | undefined): { label: string; hoursOnly: string } {
  if (!t) return { label: "—", hoursOnly: "—" };
  try {
    const d = new Date(t.replace(" ", "T"));
    if (Number.isNaN(d.getTime())) {
      // already ISO-ish
      const d2 = new Date(t);
      if (Number.isNaN(d2.getTime())) return { label: t, hoursOnly: t };
      const hrs = d2.getHours();
      const mins = d2.getMinutes();
      return {
        label: d2.toLocaleString([], { month: "short", day: "numeric", hour: "numeric" }),
        hoursOnly: `${hrs === 0 ? 12 : hrs > 12 ? hrs - 12 : hrs} ${hrs >= 12 ? "PM" : "AM"}`,
      };
    }
    const hrs = d.getHours();
    const mins = d.getMinutes();
    return {
      label: d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
      hoursOnly: `${hrs === 0 ? 12 : hrs > 12 ? hrs - 12 : hrs}${mins ? `:${mins.toString().padStart(2, "0")}` : ""} ${hrs >= 12 ? "PM" : "AM"}`,
    };
  } catch {
    return { label: String(t), hoursOnly: String(t) };
  }
}

function StatCard({
  icon: Icon,
  title,
  value,
  hint,
  accent = "default",
}: {
  icon: LucideIcon;
  title: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  accent?: "default" | "primary";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border p-4 transition",
        accent === "primary"
          ? "border-[#B7E4C4] bg-[#EAF7EF]"
          : "border-[#D5E7DB] bg-[#F0F9F3]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[#4D6254]">
          <Icon className="h-4 w-4 text-[#3F8A5E]" />
          <span>{title}</span>
        </div>
      </div>
      <div className="mt-2 text-2xl font-bold leading-none text-[#0C2819]">{value}</div>
      {hint ? <div className="mt-1 text-xs text-[#4D6254]">{hint}</div> : null}
    </div>
  );
}

export function ChooseFieldsPanel({
  data,
  tab,
}: {
  data: {
    current: CurrentWeather;
    atmosphere: AtmosphereMetrics;
    soil: SoilMetrics;
    solar: SolarMetrics;
    location_label?: string | null;
    latitude: number;
    longitude: number;
  };
  tab: FieldTabId;
}) {
  const c = data.current;
  const vis = describeWMO(c.weather_code, false);
  const nowLabel = _dtLabel(c.time);

  return (
    <section className="rounded-3xl border border-[#C7E3D0] bg-white/90 p-5 shadow-sm ring-1 ring-[#D5E7DB] md:p-7">
      <header className="flex items-center gap-2 text-lg font-bold text-[#0C2819]">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#DFF5E6] text-[#2E7D4E]">
          <Gauge className="h-4 w-4" />
        </span>
        Choose Fields
      </header>

      <div className="mt-4">
        <FieldTabs value={tab} onChange={() => {}} />
      </div>

      {tab === "current" ? (
        <CurrentBody data={data} visIconLabel={vis.labelEN} nowLabel={nowLabel} />
      ) : null}
      {tab === "atmosphere" ? <AtmosphereBody atmo={data.atmosphere} cur={c} /> : null}
      {tab === "soil" ? <SoilBody soil={data.soil} cur={c} /> : null}
      {tab === "solar" ? <SolarBody solar={data.solar} cur={c} /> : null}
    </section>
  );
}

function CurrentBody({
  data,
  visIconLabel,
  nowLabel,
}: {
  data: {
    current: CurrentWeather;
    soil?: SoilMetrics | null;
    location_label?: string | null;
    latitude: number;
    longitude: number;
  };
  visIconLabel: string;
  nowLabel: { label: string; hoursOnly: string };
}) {
  const c = data.current;
  return (
    <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-[1.3fr,1fr]">
      <div className="flex flex-col">
        <div className="flex items-start gap-4">
          <WeatherIcon code={c.weather_code} size={44} />
          <div>
            <div className="flex items-end gap-2">
              <span className="text-[88px] font-extrabold leading-[0.85] tracking-tight text-[#0C2819]">
                {_fmt(c.temperature_2m, 1)}
              </span>
              <span className="mb-3 text-3xl font-bold text-[#2E4036]">°F</span>
            </div>
            <p className="mt-1 inline-flex items-center gap-2 text-lg font-semibold text-[#3B5245]">
              {visIconLabel === "Sunny" ? (
                <Sun className="h-5 w-5 text-amber-500" />
              ) : (
                <CloudSun className="h-5 w-5 text-[#3F8A5E]" />
              )}
              {visIconLabel}
            </p>
            <p className="mt-2 text-sm text-[#3B5245]">
              Feels like <b className="text-[#0C2819]">{_fmt(c.apparent_temperature, 1)}°F</b>
            </p>
            <p className="mt-1 text-sm text-[#4D6254]">{nowLabel.label}</p>
            <p className="mt-0.5 text-xs font-mono text-[#4D6254]">
              {data.latitude.toFixed(1)}°, {data.longitude.toFixed(1)}°
              {data.location_label ? ` · ${data.location_label}` : ""}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={Wind}
          title="WIND"
          value={`${_fmt(c.wind_speed_10m, 1)} mph`}
          hint={`${c.wind_compass ?? "—"} · gust ${_fmt(c.wind_gusts_10m, 1)}`}
        />
        <StatCard
          icon={Droplets}
          title="HUMIDITY"
          value={`${c.relative_humidity_2m ?? "—"}%`}
          hint={`Dew pt ${_fmt(c.dew_point_2m, 1)}°F`}
        />
        <StatCard
          icon={CloudRain}
          title="PRECIP 24H"
          value={`${_fmt(c.precipitation, 2)} inches`}
          hint={`${c.precipitation_probability ?? "—"}% chance`}
        />
        <StatCard
          icon={Sun}
          title="UV"
          value={`${c.uv_index ?? "—"}`}
          hint={c.uv_label ?? "—"}
          accent="primary"
        />
        <StatCard
          icon={Thermometer}
          title="SOIL 1&Prime;"
          value={`${_fmt(c.soil_temperature_0cm, 1)}°F`}
          hint={
            c.soil_moisture_0cm != null
              ? `${data.soil?.soil_texture_note ?? ""} ${c.soil_moisture_0cm.toFixed(3)}`
              : "—"
          }
        />
        <StatCard
          icon={Gauge}
          title="PRESSURE"
          value={`${Math.round(c.surface_pressure ?? NaN) || "—"}`}
          hint="hPa"
        />
      </div>
    </div>
  );
}

function AtmosphereBody({ atmo, cur }: { atmo: AtmosphereMetrics; cur: CurrentWeather }) {
  return (
    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        icon={Droplets}
        title="DEW POINT"
        value={`${_fmt(atmo.dew_point_f, 1)}°F`}
        hint={`${_fmt(atmo.dew_point_c, 1)} °C`}
      />
      <StatCard
        icon={Gauge}
        title="PRESSURE"
        value={`${_fmt(atmo.pressure_inhg, 2)} inHg`}
        hint={`${_fmt(atmo.pressure_hpa, 0)} hPa`}
      />
      <StatCard
        icon={CloudSun}
        title="VISIBILITY"
        value={`${_fmt(atmo.visibility_mi, 1)} mi`}
        hint={`${_fmt(atmo.visibility_km, 1)} km`}
      />
      <StatCard
        icon={CloudSun}
        title="CLOUD COVER"
        value={`${atmo.cloud_cover_pct ?? cur.cloud_cover ?? "—"}%`}
        hint={atmo.cloud_cover_pct ? "Opaque coverage" : "From current snapshot"}
      />
      <StatCard
        icon={Wind}
        title="WIND"
        value={`${_fmt(cur.wind_speed_10m, 1)} mph`}
        hint={`${cur.wind_compass ?? "—"} ${cur.wind_direction_10m ?? ""}°`}
      />
      <StatCard
        icon={Droplets}
        title="HUMIDITY"
        value={`${cur.relative_humidity_2m ?? "—"}%`}
        hint="2 m above ground"
      />
    </div>
  );
}

function SoilBody({ soil, cur }: { soil: SoilMetrics; cur: CurrentWeather }) {
  const rows = [
    {
      label: "0 – 1 cm (≈ 1\")",
      temp_c: soil.depth_0_1cm_temp_c,
      temp_f: soil.depth_0_1cm_temp_f ?? cur.soil_temperature_0cm,
      moist: soil.depth_0_1cm_moisture_m3m3 ?? cur.soil_moisture_0cm,
    },
    {
      label: "1 – 3 cm",
      temp_c: soil.depth_1_3cm_temp_c,
      temp_f: soil.depth_1_3cm_temp_f,
      moist: soil.depth_1_3cm_moisture_m3m3,
    },
    {
      label: "3 – 9 cm",
      temp_c: soil.depth_3_9cm_temp_c,
      temp_f: soil.depth_3_9cm_temp_f,
      moist: soil.depth_3_9cm_moisture_m3m3,
    },
    {
      label: "9 – 27 cm",
      temp_c: soil.depth_9_27cm_temp_c,
      temp_f: soil.depth_9_27cm_temp_f,
      moist: soil.depth_9_27cm_moisture_m3m3,
    },
  ];
  return (
    <div className="mt-5 space-y-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {rows.map((r) => (
          <StatCard
            key={r.label}
            icon={Thermometer}
            title={`DEPTH ${r.label}`}
            value={`${_fmt(r.temp_f, 1)}°F`}
            hint={
              <>
                {r.moist != null ? (
                  <>
                    Moist <b>{(r.moist * 100).toFixed(1)}%</b> · {r.moist.toFixed(3)} m³/m³
                  </>
                ) : (
                  "—"
                )}
                <span className="block text-[10px] text-[#64806E]">{_fmt(r.temp_c, 1)} °C</span>
              </>
            }
          />
        ))}
      </div>
      {soil.soil_texture_note ? (
        <div className="rounded-2xl border border-[#D5E7DB] bg-[#F4FAF6] px-4 py-3 text-sm text-[#3B5245]">
          0–1 cm classification : <b className="text-[#0C2819]">{soil.soil_texture_note}</b> (volumetric water content)
        </div>
      ) : null}
    </div>
  );
}

function SolarBody({ solar, cur }: { solar: SolarMetrics; cur: CurrentWeather }) {
  function hhmm(s: string | null | undefined): string {
    if (!s) return "—";
    const d = new Date(s.replace(" ", "T"));
    if (Number.isNaN(d.getTime())) {
      const d2 = new Date(s);
      if (Number.isNaN(d2.getTime())) return s;
      return `${d2.getHours() === 0 ? 12 : d2.getHours() > 12 ? d2.getHours() - 12 : d2.getHours()}:${d2.getMinutes().toString().padStart(2, "0")} ${d2.getHours() >= 12 ? "PM" : "AM"}`;
    }
    return `${d.getHours() === 0 ? 12 : d.getHours() > 12 ? d.getHours() - 12 : d.getHours()}:${d.getMinutes().toString().padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
  }
  return (
    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        icon={Sun}
        title="UV INDEX"
        value={`${solar.uv_index ?? cur.uv_index ?? "—"}`}
        hint={cur.uv_label ?? (solar.uv_clear_sky ? `Clear sky max ${solar.uv_clear_sky}` : "Clear sky N/A")}
        accent="primary"
      />
      <StatCard
        icon={Sunrise}
        title="SUNRISE"
        value={hhmm(solar.sunrise_local)}
        hint="Local apparent time"
      />
      <StatCard
        icon={Sunset}
        title="SUNSET"
        value={hhmm(solar.sunset_local)}
        hint={`Day length ${_fmt(solar.day_length_h, 1)} h`}
      />
      <StatCard
        icon={CloudSun}
        title="SUNSHINE DURATION"
        value={`${_fmt(solar.sunshine_duration_h, 1)} h`}
        hint="Sun above horizon (bright sun)"
      />
      <StatCard
        icon={Sun}
        title="SHORTWAVE W/m²"
        value={`${Math.round(solar.shortwave_radiation_wm2 ?? NaN) || "—"}`}
        hint={`Direct ${Math.round(solar.direct_radiation_wm2 ?? NaN) || "0"} · Diffuse ${Math.round(solar.diffuse_radiation_wm2 ?? NaN) || "0"}`}
      />
      <StatCard
        icon={CloudSun}
        title="CLEAR-SKY UV"
        value={`${solar.uv_clear_sky ?? cur.uv_index ?? "—"}`}
        hint="If no clouds were present"
      />
    </div>
  );
}

export { _dtLabel, _fmt };
