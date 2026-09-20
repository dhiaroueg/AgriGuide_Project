import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { PageTour } from "@/components/onboarding/PageTour";
import { Plus, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/marketplace")({
  head: () => ({
    meta: [
      { title: "Marketplace - AgriMent" },
      {
        name: "description",
        content: "Achetez, vendez et échangez récoltes et déchets valorisables entre agriculteurs.",
      },
      { property: "og:title", content: "Marketplace - AgriMent" },
      {
        property: "og:description",
        content: "Un marché communautaire pour vos récoltes et vos déchets valorisables.",
      },
    ],
  }),
  component: Layout,
});

const tabs = [
  { to: "/marketplace" as const, label: "Parcourir", exact: true },
  { to: "/marketplace/mes-annonces" as const, label: "Mes annonces" },
];

function Layout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAcheteur = user?.role === "acheteur";
  const showTabs =
    (!pathname.startsWith("/marketplace/nouveau") && !/^\/marketplace\/[^/]+$/.test(pathname)) ||
    pathname === "/marketplace" ||
    pathname === "/marketplace/mes-annonces";

  // Un acheteur peut parcourir et consulter le détail d'une annonce, mais ne
  // peut ni déposer d'annonce ni gérer "mes annonces" (il n'en a pas).
  const restrictedForAcheteur =
    pathname.startsWith("/marketplace/nouveau") || pathname.startsWith("/marketplace/mes-annonces");
  useEffect(() => {
    if (isAcheteur && restrictedForAcheteur) {
      navigate({ to: "/marketplace" });
    }
  }, [isAcheteur, restrictedForAcheteur, navigate]);

  return (
    <AppShell allowRoles={["farmer", "acheteur"]}>
      <PageHeader
        icon={Store}
        title="Marketplace"
        subtitle="Récoltes & déchets valorisables - entre agriculteurs."
        className="mb-6"
        action={
          !isAcheteur ? (
            <Link
              to="/marketplace/nouveau"
              data-tour="market-new"
              className="group press nudge-x inline-flex items-center gap-2 rounded-2xl bg-primary text-primary-foreground px-5 h-12 font-medium shadow-soft transition-all duration-300 hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-lift"
            >
              <Plus className="h-5 w-5 transition-transform duration-300 group-hover:rotate-90" />
              Déposer une annonce
            </Link>
          ) : undefined
        }
      />

      {showTabs && !isAcheteur && (
        <div className="flex gap-2 mb-6 border-b border-border" data-tour="market-tabs">
          {tabs.map((t) => {
            const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "relative px-4 py-3 text-sm font-medium transition-colors duration-300",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                {/* Souligné qui se déploie depuis le centre. */}
                <span
                  className={cn(
                    "absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary transition-transform duration-300",
                    active ? "scale-x-100" : "scale-x-0",
                  )}
                  aria-hidden
                />
              </Link>
            );
          })}
        </div>
      )}

      {isAcheteur && restrictedForAcheteur ? null : <Outlet />}
      <PageTour tourId="marketplace" />
    </AppShell>
  );
}
