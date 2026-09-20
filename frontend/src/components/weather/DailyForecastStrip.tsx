import { useRef } from "react";
import { Calendar } from "lucide-react";
import type { DailyForecastPoint } from "@/lib/weatherApi";
import { WeatherIcon, describeWMO } from "@/components/weather/weatherIcon";
import { cn } from "@/lib/utils";
import { _fmt } from "./ChooseFieldsPanel";

function kmhToMph(k: number | null | undefined): number | null {
  if (k == null || !Number.isFinite(k)) return null;
  return k / 1.609344;
}

export function DailyForecastStrip({ daily }: { daily: DailyForecastPoint[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  return (
    <section className="rounded-3xl border border-[#C7E3D0] bg-white/90 p-5 shadow-sm ring-1 ring-[#D5E7DB] md:p-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-lg font-bold text-[#0C2819]">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-[#DFF5E6] text-[#2E7D4E]">
            <Calendar className="h-4 w-4" />
          </span>
          15-Day Forecast
        </div>
        <div className="text-xs font-mono uppercase tracking-wider text-[#4D6254]">
          Starts tomorrow
        </div>
      </header>

      <div
        ref={ref}
        className="mt-5 flex gap-3 overflow-x-auto pb-3 [scrollbar-color:#C7E3D0_transparent]"
      >
        {daily.map((d, i) => {
          const vis = describeWMO(d.weather_code);
          const windMph = kmhToMph(d.wind_speed_max_kmh);
          return (
            <div
              key={d.date + i}
              className={cn(
                "shrink-0 w-[170px] rounded-2xl border border-[#D5E7DB] bg-[#F0F9F3] p-4 transition hover:-translate-y-0.5 hover:bg-[#E8F6ED]",
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-bold text-[#0C2819]">
                    {d.weekday_label ?? "—"}
                  </div>
                  <div className="text-xs text-[#4D6254]">{d.day_month_label ?? "—"}</div>
                </div>
                <WeatherIcon code={d.weather_code} size={30} />
              </div>

              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-2xl font-extrabold text-[#0C2819]">
                  {_fmt(d.temp_max_f, 0)}°F
                </span>
                <span className="text-sm font-semibold text-[#4D6254]">
                  {_fmt(d.temp_min_f, 0)}°F
                </span>
              </div>

              <div className="mt-3 space-y-1.5 text-xs">
                <div className="flex items-center gap-1.5 text-[#3B5245]">
                  <span className="inline-flex h-4 w-4 items-center justify-center text-sky-600">
                    💧
                  </span>
                  <span className="font-semibold text-[#0C2819]">
                    {d.precip_prob_max_pct ?? "—"}%
                  </span>
                  <span className="text-[#64806E]">
                    · {_fmt(d.precip_sum_in, 2)} inches
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[#3B5245]">
                  <span className="inline-flex h-4 w-4 items-center justify-center text-[#3F8A5E]">
                    💨
                  </span>
                  <span>
                    {windMph != null ? windMph.toFixed(0) : "—"} mph
                  </span>
                </div>
                <div className="pt-1 text-[11px] text-[#4D6254]">{vis.labelEN}</div>
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
