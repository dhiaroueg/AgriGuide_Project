import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { AlertBanner } from "@/components/AlertBanner";
import { Reveal } from "@/components/motion/Reveal";
import { WeatherPanel } from "@/components/WeatherPanel";
import { AgentConstellationHub } from "@/components/AgentConstellationHub";
import { PageTour } from "@/components/onboarding/PageTour";
import { listings } from "@/features/marketplace/data";
import { useAuth } from "@/lib/auth-context";
import {
  Sprout,
  ScrollText,
  LineChart,
  Store,
  ArrowRight,
  MapPinned,
  BrainCircuit,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Tableau de bord - AgriMent" },
      {
        name: "description",
        content: "Vue d'ensemble de votre exploitation : météo, alertes et conseils du jour.",
      },
      { property: "og:title", content: "Tableau de bord - AgriMent" },
      { property: "og:description", content: "Météo, alertes et conseillers en un coup d'œil." },
    ],
  }),
  component: Dashboard,
});

const ADVISOR_FLOW = [
  {
    to: "/regulation" as const,
    step: "01",
    label: "Sécuriser le projet",
    advisor: "Conseiller Réglementaire",
    body: "Vérifiez les aides, obligations et certifications avant de décider.",
    icon: ScrollText,
  },
  {
    to: "/agriculture" as const,
    step: "02",
    label: "Lire la parcelle",
    advisor: "Conseiller Agricole",
    body: "Analysez le sol, le climat et les cultures adaptées à votre terrain.",
    icon: Sprout,
  },
  {
    to: "/business" as const,
    step: "03",
    label: "Chiffrer les options",
    advisor: "Conseiller Financier",
    body: "Comparez les scénarios qui découlent de vos choix de culture.",
    icon: LineChart,
  },
] as const;

const myListings = listings.filter((l) => l.mine);
const myRecoltes = myListings.filter((l) => l.kind === "recolte").length;
const myDechets = myListings.filter((l) => l.kind === "dechet").length;

const ABOUT_PILLARS = [
  {
    title: "Partir du terrain",
    body: "Météo, parcelle et contexte cultural pour ancrer chaque recommandation dans votre exploitation.",
    icon: MapPinned,
  },
  {
    title: "Éclairer la décision",
    body: "Des conseillers agricoles, financiers et réglementaires qui mettent les options à plat.",
    icon: BrainCircuit,
  },
  {
    title: "Garder le cap",
    body: "Des signaux utiles, des sources identifiables et des priorités concrètes au fil de la saison.",
    icon: ShieldCheck,
  },
] as const;

function Dashboard() {
  const { user } = useAuth();
  const firstName = user?.nom?.split(" ")[0] ?? "Jean";

  return (
    <AppShell>
      <div className="landing-rise mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Exploitation · live
          </p>
          <h1 className="mt-2 font-display text-3xl md:text-[2.75rem] font-bold tracking-tight leading-[1.05]">
            Bonjour {firstName}.
            <br />
            <span className="text-primary/80">Voici le pouls du jour.</span>
          </h1>
        </div>
        <Link
          to="/aujourd-hui"
          className="nudge-x inline-flex items-center gap-2 self-start rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 md:self-auto"
          data-tour="dash-briefing"
        >
          Briefing du jour
          <ArrowRight className="nudge-target h-4 w-4" />
        </Link>
      </div>

      {/* Agent Constellation Orchestration Hub */}
      <Reveal delay={40} className="mb-8">
        <AgentConstellationHub />
      </Reveal>

      <Reveal delay={60}>
        <AlertBanner tone="warning" title="Risque de gel cette nuit (Ferme des Prés)">
          Les températures descendront jusqu'à -2°C entre 3h et 6h. Protégez vos jeunes plants.
        </AlertBanner>
      </Reveal>

      {/* Weather + marketplace */}
      <div className="mt-6 grid gap-4 md:grid-cols-3 md:items-stretch">
        <Reveal from="left" className="md:col-span-2 flex">
          <div data-tour="dash-weather" className="w-full">
            <WeatherPanel className="w-full" />
          </div>
        </Reveal>

        <Reveal from="right" delay={100} className="flex">
          <Link
            to="/marketplace"
            className="group zoom-media nudge-x surface-glass relative flex h-full min-h-[280px] w-full flex-col overflow-hidden rounded-2xl transition-all duration-400 hover:-translate-y-1"
          >
            <div className="relative grid h-36 grid-cols-3 gap-0.5 overflow-hidden sm:h-40">
              {myListings.slice(0, 3).map((l, i) => (
                <div key={l.id} className="relative overflow-hidden bg-muted">
                  <img
                    src={l.image}
                    alt=""
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                    style={{ transitionDelay: `${i * 40}ms` }}
                    loading="lazy"
                  />
                </div>
              ))}
              <div
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card via-card/30 to-transparent"
                aria-hidden
              />
            </div>

            <div className="relative flex flex-1 flex-col px-5 pb-5 pt-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <Store className="h-3.5 w-3.5 text-primary" />
                Marché
              </div>
              <div className="mt-1 font-display text-2xl font-bold tracking-tight">
                {myListings.length} annonces
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {myRecoltes} récolte{myRecoltes > 1 ? "s" : ""}
                {myDechets > 0
                  ? ` · ${myDechets} déchet${myDechets > 1 ? "s" : ""}`
                  : ""}
              </p>

              <ul className="mt-3 space-y-2">
                {myListings.slice(0, 3).map((l) => (
                  <li key={l.id} className="flex items-center gap-2.5 text-sm">
                    <span className="h-8 w-8 shrink-0 overflow-hidden rounded-lg ring-1 ring-border/60">
                      <img src={l.image} alt="" className="h-full w-full object-cover" />
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{l.title}</span>
                    <span className="shrink-0 font-mono text-xs font-semibold text-primary">
                      {l.price}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto pt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                Voir le marché <ArrowRight className="nudge-target h-4 w-4" />
              </div>
            </div>
          </Link>
        </Reveal>
      </div>

      <section className="mt-11 border-y border-border/70 py-8 md:py-10" aria-labelledby="advisor-flow-title">
        <Reveal className="max-w-2xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Vos conseillers travaillent ensemble
          </p>
          <h2 id="advisor-flow-title" className="mt-2 font-display text-2xl font-bold tracking-tight md:text-3xl">
            Une décision, trois regards.
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Chaque étape utilise la même connaissance de votre exploitation pour transformer une
            observation terrain en choix réaliste et conforme.
          </p>
        </Reveal>

        <div className="relative mt-7">
          <div className="pointer-events-none absolute left-[1.45rem] right-[1.45rem] top-[1.45rem] hidden h-px bg-border md:block" aria-hidden />
          <ol className="grid gap-7 md:grid-cols-3 md:gap-0" data-tour="dash-actions">
          {ADVISOR_FLOW.map((advisor, i) => {
            const Icon = advisor.icon;
            return (
              <Reveal key={advisor.to} as="li" from="up" delay={i * 90} className="relative md:px-6 first:md:pl-0 last:md:pr-0">
                <Link to={advisor.to} className="group block outline-none">
                  <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-card text-primary transition-transform duration-300 group-hover:-translate-y-1 group-hover:border-signal">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="mt-5 font-mono text-[11px] font-medium tracking-[0.16em] text-primary">
                    {advisor.step} · {advisor.advisor}
                  </p>
                  <h3 className="mt-1 font-display text-xl font-bold tracking-tight">{advisor.label}</h3>
                  <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">{advisor.body}</p>
                  <span className="nudge-x mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary">
                    Ouvrir le conseiller <ArrowRight className="nudge-target h-4 w-4" />
                  </span>
                </Link>
              </Reveal>
            );
          })}
          </ol>
        </div>
      </section>

      <Reveal from="up" className="mt-12">
        <section className="border-y border-border/70 py-8 md:py-10" aria-labelledby="about-agriment">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:items-center lg:gap-12">
            <div className="relative min-h-64 overflow-hidden rounded-xl sm:min-h-72">
              <img
                src="/img/landing-hero-field.jpg"
                alt="Vue d'un champ cultivé"
                className="h-full w-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-primary/30" aria-hidden />
              <div className="absolute bottom-0 left-0 right-0 p-5 text-primary-foreground">
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-signal">
                  AgriMent
                </p>
                <p className="mt-1 max-w-sm font-display text-xl font-bold leading-tight">
                  Des décisions plus sereines, de la parcelle au bilan.
                </p>
              </div>
            </div>

            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                À propos
              </p>
              <h2 id="about-agriment" className="mt-2 font-display text-2xl font-bold tracking-tight md:text-3xl">
                Un copilote pour les décisions qui comptent.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
                AgriMent rassemble les informations utiles à votre exploitation et les transforme en
                repères actionnables. Vous gardez la main sur vos choix, avec une vision plus claire
                des risques, des opportunités et des prochaines étapes.
              </p>

              <div className="mt-6 grid gap-5 sm:grid-cols-3">
                {ABOUT_PILLARS.map((pillar) => {
                  const Icon = pillar.icon;
                  return (
                    <div key={pillar.title} className="border-l-2 border-signal/70 pl-3.5">
                      <Icon className="h-4 w-4 text-primary" />
                      <h3 className="mt-2 font-display text-base font-bold tracking-tight">{pillar.title}</h3>
                      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{pillar.body}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal from="blur" className="mt-10">
        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-primary px-6 py-7 md:px-8 md:py-8 text-primary-foreground">
          <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal">
                Conseil du jour
              </p>
              <h3 className="mt-2 font-display text-xl md:text-2xl font-bold tracking-tight">
                Stade épiaison — surveillez la septoriose
              </h3>
              <p className="mt-2 text-sm text-primary-foreground/70 leading-relaxed">
                Vos parcelles de blé approchent du stade épiaison. C&apos;est le bon moment pour
                surveiller l&apos;apparition de la septoriose. Nous vous préviendrons si un risque
                est détecté.
              </p>
            </div>
            <Link
              to="/aujourd-hui"
              className="nudge-x inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-signal px-4 py-2.5 text-sm font-bold text-signal-foreground md:self-auto"
            >
              Ouvrir le briefing
              <ArrowRight className="nudge-target h-4 w-4" />
            </Link>
          </div>
        </div>
      </Reveal>
      <PageTour tourId="dashboard" />
    </AppShell>
  );
}
