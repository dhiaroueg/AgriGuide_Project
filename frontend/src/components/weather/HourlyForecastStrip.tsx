import { useRef } from "react";
import { Clock } from "lucide-react";
import type { HourlyForecastPoint } from "@/lib/weatherApi";
import { WeatherIcon, describeWMO } from "@/components/weather/weatherIcon";
import { cn } from "@/lib/utils";
import { _fmt } from "./ChooseFieldsPanel";

function hourLabel(time: string): string {
  let d: Date | null = null;
  try {
    d = new Date(time.replace(" ", "T"));
    if (Number.isNaN(d.getTime())) d = new Date(time);
    if (Number.isNaN(d.getTime())) return time.slice(-5);
  } catch {
    return time;
  }
  const h = d.getHours();
  return `${h === 0 ? 12 : h > 12 ? h - 12 : h} ${h >= 12 ? "PM" : "AM"}`;
}

function nowMinutesLabel(): string {
  const d = new Date();
  const h = d.getHours();
  return `${h === 0 ? 12 : h > 12 ? h - 12 : h} ${h >= 12 ? "PM" : "AM"}`;
}

export function HourlyForecastStrip({
  hourly,
  maxHours = 25,
}: {
  hourly: HourlyForecastPoint[];
  maxHours?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const slice = hourly.slice(0, maxHours);
  const isNight = (t: string) => {
    const d = new Date(t.replace(" ", "T"));
    const h = Number.isNaN(d.getTime()) ? new Date(t).getHours() : d.getHours();
    return h < 6 || h >= 20;
  };

  return (
    <section className="rounded-3xl border border-[#C7E3D0] bg-white/90 p-5 shadow-sm ring-1 ring-[#D5E7DB] md:p-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-lg font-bold text-[#0C2819]">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#DFF5E6] text-[#2E7D4E]">
            <Clock className="h-4 w-4" />
          </span>
          24-Hour Forecast
        </div>
        <div className="text-xs font-mono uppercase tracking-wider text-[#4D6254]">
          Now: {nowMinutesLabel()}
        </div>
      </header>

      <div
        ref={ref}
        className="mt-5 flex gap-3 overflow-x-auto pb-3 [scrollbar-color:#C7E3D0_transparent]"
      >
        {slice.map((h, i) => {
          const now = i === 0;
          const vis = describeWMO(h.weather_code, isNight(h.time));
          const windKmh = h.wind_speed_kmh ?? 0;
          const windMph = windKmh / 1.609344;
          return (
            <div
              key={h.time + i}
              className={cn(
                "shrink-0 rounded-2xl border px-4 py-4 text-center transition w-[120px]",
                now
                  ? "border-[#7EB791] bg-[#DCE7DF] ring-2 ring-[#3F8A5E]"
                  : "border-[#D5E7DB] bg-[#F0F9F3]",
              )}
            >
              <div
                className={cn(
                  "text-xs font-bold uppercase tracking-wider",
                  now ? "text-[#2E7D4E]" : "text-[#4D6254]",
                )}
              >
                {now ? "NOW" : hourLabel(h.time)}
              </div>
              <div className="mt-3 flex justify-center">
                <WeatherIcon code={h.weather_code} isNight={isNight(h.time)} size={34} />
              </div>
              <div className="mt-3 text-2xl font-extrabold text-[#0C2819]">
                {_fmt(h.temp_f, 1)}°F
              </div>
              <div className="mt-1 text-xs text-[#4D6254]">{vis.labelEN}</div>
              <div className="mt-2 text-[11px] text-[#3B5245]">
                {_fmt(h.precip_in, 2)} inches
                {h.precip_prob_pct != null ? (
                  <span className="block text-[10px] text-[#4D6254]">
                    {h.precip_prob_pct}% precip
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#D5E7DB]">
        <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-[#7EC8A3] to-[#3F8A5E]" />
      </div>
    </section>
  );
}
