import { AlertTriangle, CheckCircle2, CircleGauge, CloudSun, type LucideIcon } from "lucide-react";
import type { WeatherDecisionSignal } from "@/lib/weatherApi";

const SIGNAL_STYLES = {
  neutral: { icon: CircleGauge, accent: "text-[#2C6F92] bg-[#EAF3F8]", border: "border-[#C9DDE8]" },
  good: { icon: CheckCircle2, accent: "text-[#2E7D4E] bg-[#EAF7EF]", border: "border-[#C7E3D0]" },
  warning: { icon: AlertTriangle, accent: "text-[#9A651A] bg-[#FFF6DF]", border: "border-[#EFD7A0]" },
  critical: { icon: AlertTriangle, accent: "text-[#B14435] bg-[#FFF0EC]", border: "border-[#F1C8C0]" },
} as const;

function SignalItem({ signal }: { signal: WeatherDecisionSignal }) {
  const style = SIGNAL_STYLES[signal.tone];
  const Icon: LucideIcon = style.icon;

  return (
    <div className={`border-l-2 ${style.border} pl-3.5`}>
      <div className="flex items-start justify-between gap-3">
        <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${style.accent}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="font-display text-base font-bold text-[#0C2819]">{signal.value}</span>
      </div>
      <h3 className="mt-2 text-sm font-semibold text-[#0C2819]">{signal.title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-[#4D6254]">{signal.detail}</p>
    </div>
  );
}

export function DecisionSignals({ signals }: { signals: WeatherDecisionSignal[] }) {
  if (!signals.length) return null;

  return (
    <section className="border-y border-[#C7E3D0] py-7 md:py-8" aria-labelledby="decision-signals-title">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#DFF5E6] text-[#2E7D4E]">
          <CloudSun className="h-4 w-4" />
        </span>
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-[#4D6254]">
            Anticiper
          </p>
          <h2 id="decision-signals-title" className="mt-0.5 font-display text-xl font-bold tracking-tight text-[#0C2819]">
            Les signaux utiles pour votre parcelle
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#4D6254]">
            Une lecture rapide des données avancées, pour savoir quoi surveiller avant d’agir.
          </p>
        </div>
      </div>
      <div className="mt-6 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
        {signals.map((signal) => <SignalItem key={signal.id} signal={signal} />)}
      </div>
    </section>
  );
}
