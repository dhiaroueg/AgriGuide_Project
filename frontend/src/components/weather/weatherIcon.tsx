import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudHail,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Snowflake,
  Sun,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

export type WeatherVisual = {
  icon: LucideIcon;
  tone: "sunny" | "cloudy" | "rainy" | "snowy" | "stormy" | "foggy" | "night" | "night-cloudy";
  labelEN: string;
  labelFR: string;
};

const NIGHT_WMO = new Set([0, 1, 2, 3]);

export function describeWMO(code: number | null | undefined, isNight = false): WeatherVisual {
  if (code == null) {
    return { icon: Cloud, tone: "cloudy", labelEN: "N/A", labelFR: "—" };
  }
  const n = code;
  const nightFlag = isNight && NIGHT_WMO.has(n);
  const map: Record<number, WeatherVisual> = {
    0: nightFlag
      ? { icon: Moon, tone: "night", labelEN: "Clear", labelFR: "Ciel clair nuit" }
      : { icon: Sun, tone: "sunny", labelEN: "Sunny", labelFR: "Ensoleillé" },
    1: nightFlag
      ? { icon: CloudMoon, tone: "night-cloudy", labelEN: "Mainly clear", labelFR: "Peu nuageux" }
      : { icon: Sun, tone: "sunny", labelEN: "Mainly clear", labelFR: "Peu nuageux" },
    2: nightFlag
      ? { icon: CloudMoon, tone: "night-cloudy", labelEN: "Partly cloudy", labelFR: "Partiellement nuageux" }
      : { icon: CloudSun, tone: "cloudy", labelEN: "Partly cloudy", labelFR: "Partiellement nuageux" },
    3: { icon: Cloud, tone: "cloudy", labelEN: "Overcast", labelFR: "Couvert" },
    45: { icon: CloudFog, tone: "foggy", labelEN: "Fog", labelFR: "Brouillard" },
    48: { icon: CloudFog, tone: "foggy", labelEN: "Rime fog", labelFR: "Brouillard givrant" },
    51: { icon: CloudDrizzle, tone: "rainy", labelEN: "Light drizzle", labelFR: "Bruine légère" },
    53: { icon: CloudDrizzle, tone: "rainy", labelEN: "Drizzle", labelFR: "Bruine" },
    55: { icon: CloudDrizzle, tone: "rainy", labelEN: "Dense drizzle", labelFR: "Bruine dense" },
    56: { icon: CloudDrizzle, tone: "rainy", labelEN: "Freezing drizzle", labelFR: "Bruine verglaçante" },
    61: { icon: CloudRain, tone: "rainy", labelEN: "Slight rain", labelFR: "Pluie faible" },
    63: { icon: CloudRain, tone: "rainy", labelEN: "Rain", labelFR: "Pluie modérée" },
    65: { icon: CloudRain, tone: "rainy", labelEN: "Heavy rain", labelFR: "Pluie forte" },
    66: { icon: CloudRain, tone: "rainy", labelEN: "Freezing rain", labelFR: "Pluie verglaçante" },
    71: { icon: CloudSnow, tone: "snowy", labelEN: "Slight snow", labelFR: "Neige faible" },
    73: { icon: CloudSnow, tone: "snowy", labelEN: "Snow", labelFR: "Neige modérée" },
    75: { icon: CloudSnow, tone: "snowy", labelEN: "Heavy snow", labelFR: "Neige forte" },
    77: { icon: Snowflake, tone: "snowy", labelEN: "Snow grains", labelFR: "Neige en grains" },
    80: { icon: CloudRain, tone: "rainy", labelEN: "Rain showers", labelFR: "Averses" },
    81: { icon: CloudRain, tone: "rainy", labelEN: "Moderate showers", labelFR: "Averses modérées" },
    82: { icon: CloudRain, tone: "rainy", labelEN: "Violent showers", labelFR: "Averses violentes" },
    85: { icon: CloudSnow, tone: "snowy", labelEN: "Slight snow showers", labelFR: "Averses de neige" },
    86: { icon: CloudSnow, tone: "snowy", labelEN: "Heavy snow showers", labelFR: "Averses neige fortes" },
    95: { icon: CloudLightning, tone: "stormy", labelEN: "Thunderstorm", labelFR: "Orage" },
    96: { icon: CloudHail, tone: "stormy", labelEN: "Thunderstorm + hail", labelFR: "Orage + grêle" },
    99: { icon: CloudLightning, tone: "stormy", labelEN: "Severe thunderstorm", labelFR: "Orage violent" },
  };
  return map[n] ?? { icon: Cloud, tone: "cloudy", labelEN: `WMO ${n}`, labelFR: `Code ${n}` };
}

export function toneBg(tone: WeatherVisual["tone"]): string {
  switch (tone) {
    case "sunny":
      return "text-amber-500 bg-amber-50 border-amber-100";
    case "night":
      return "text-indigo-500 bg-indigo-50 border-indigo-100";
    case "night-cloudy":
      return "text-indigo-400 bg-indigo-50 border-indigo-100";
    case "cloudy":
      return "text-slate-500 bg-slate-50 border-slate-200";
    case "rainy":
      return "text-sky-600 bg-sky-50 border-sky-100";
    case "snowy":
      return "text-cyan-600 bg-cyan-50 border-cyan-100";
    case "stormy":
      return "text-purple-600 bg-purple-50 border-purple-100";
    case "foggy":
      return "text-zinc-500 bg-zinc-50 border-zinc-200";
  }
}

export function WeatherIcon({
  code,
  isNight,
  size = 28,
  className,
}: {
  code: number | null | undefined;
  isNight?: boolean;
  size?: number;
  className?: string;
}): ReactNode {
  const vis = describeWMO(code, isNight);
  const Icon = vis.icon;
  return (
    <div
      className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border ${toneBg(vis.tone)} ${className ?? ""}`}
    >
      <Icon width={size} height={size} strokeWidth={2.1} />
    </div>
  );
}
