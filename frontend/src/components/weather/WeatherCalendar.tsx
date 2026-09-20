import { useMemo, useState } from "react";
import { CalendarDays } from "lucide-react";
import type { WeatherDashboardResponse } from "@/lib/weatherApi";
import { describeWMO, WeatherIcon } from "@/components/weather/weatherIcon";
import { _fmt } from "./ChooseFieldsPanel";

type CalVariable = "precipitation" | "temperature" | "solar" | "wind";

const VARIABLES: { id: CalVariable; label: string }[] = [
  { id: "precipitation", label: "Precipitation" },
  { id: "temperature", label: "Temperature" },
  { id: "solar", label: "Solar" },
  { id: "wind", label: "Wind" },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function pctColor(pct: number): string {
  if (pct < 33) return "bg-[#EAF7EF]";
  if (pct < 66) return "bg-[#C4E8D0]";
  if (pct < 85) return "bg-[#7EC8A3] text-[#0C2819]";
  return "bg-[#3F8A5E] text-white";
}

export function WeatherCalendar({ data }: { data: WeatherDashboardResponse }) {
  const [variable, setVariable] = useState<CalVariable>("precipitation");

  const month = data.calendar_month;

  const { cellDays, minV, maxV } = useMemo(() => {
    const days = month.days ?? [];
    let minV = Infinity;
    let maxV = -Infinity;
    for (const d of days) {
      const v = Number(d.primary_value);
      if (!Number.isFinite(v)) continue;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }
    if (!Number.isFinite(minV) || !Number.isFinite(maxV)) {
      minV = 0;
      maxV = 1;
    }
    if (minV === maxV) maxV = minV + 0.01;

    if (!days.length) return { cellDays: [], minV, maxV };

    const first = days[0];
    const firstDow = first.dow; // 0=Mon
    const pad = Array.from({ length: firstDow }, () => null as unknown as typeof days[number]);
    const cellDays = [...pad, ...days];
    while (cellDays.length % 7 !== 0) cellDays.push(null as unknown as typeof days[number]);
    return { cellDays, minV, maxV };
  }, [month]);

  const monthName = new Date(
    Number(month.year ?? new Date().getFullYear()),
    Number(month.month ?? new Date().getMonth()),
    1,
  ).toLocaleString("en-US", { month: "long" });

  return (
    <section className="rounded-3xl border border-[#C7E3D0] bg-white/90 p-5 shadow-sm ring-1 ring-[#D5E7DB] md:p-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-lg font-bold text-[#0C2819]">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#DFF5E6] text-[#2E7D4E]">
            <CalendarDays className="h-4 w-4" />
          </span>
          Calendar
        </div>
        <div className="rounded-2xl border border-[#D5E7DB] bg-[#F4FAF6] p-1 text-sm">
          <select
            className="h-9 rounded-xl bg-transparent px-3 pr-7 text-sm font-semibold text-[#0C2819] outline-none"
            aria-label="Calendar variable"
            value={variable}
            onChange={(e) => setVariable(e.target.value as CalVariable)}
          >
            {VARIABLES.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
      </header>

      <div className="mt-4">
        <div className="mb-3 flex items-baseline justify-between px-1">
          <div className="text-base font-bold text-[#0C2819]">
            {monthName} {month.year}
          </div>
          <div className="text-xs text-[#4D6254]">
            Unit:{" "}
            {variable === "precipitation"
              ? "inches"
              : variable === "temperature"
                ? "°F (high)"
                : variable === "solar"
                  ? "MJ/m²"
                  : "km/h"}
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 text-xs">
          {WEEKDAYS.map((w) => (
            <div
              key={w}
              className="rounded-lg bg-[#EAF7EF] px-1.5 py-1.5 text-center font-bold text-[#2E7D4E]"
            >
              {w}
            </div>
          ))}
          {cellDays.map((d, i) => {
            if (!d) {
              return <div key={`pad-${i}`} className="h-[88px] rounded-lg bg-transparent" />;
            }
            const v = Number(d.primary_value);
            const pct = Number.isFinite(v) && maxV !== minV ? (v - minV) / (maxV - minV) : 0;
            const pct100 = Math.max(0, Math.min(100, Math.round(pct * 100)));
            const vis = describeWMO(d.weather_code);
            const dayNum = Number(d.date.slice(-2));
            const unit =
              variable === "precipitation"
                ? "in"
                : variable === "temperature"
                  ? "°F"
                  : variable === "solar"
                    ? "MJ"
                    : "kmh";
            return (
              <div
                key={d.date}
                className={`group relative h-[88px] overflow-hidden rounded-lg border border-[#D5E7DB] p-1.5 text-[11px] transition hover:ring-2 hover:ring-[#3F8A5E] ${pctColor(pct100)}`}
              >
                <div className="flex items-start justify-between">
                  <span className="font-bold text-[#0C2819]">{dayNum}</span>
                  <WeatherIcon code={d.weather_code} size={16} className="h-6 w-6 rounded-lg" />
                </div>
                <div className="mt-1.5 truncate font-semibold text-[#0C2819]">
                  {Number.isFinite(v) ? _fmt(v, variable === "precipitation" ? 2 : 1) : "—"}
                  <span className="ml-0.5 text-[10px] opacity-70">{unit}</span>
                </div>
                {d.max_value != null && d.min_value != null ? (
                  <div className="text-[10px] text-[#4D6254]">
                    H {Number(d.max_value).toFixed(0)}° · L {Number(d.min_value).toFixed(0)}°
                  </div>
                ) : d.secondary_value != null ? (
                  <div className="text-[10px] text-[#4D6254] truncate">{vis.labelEN}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
