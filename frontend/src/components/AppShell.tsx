import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Sprout,
  ScrollText,
  LineChart,
  CalendarDays,
  Store,
  LogOut,
  User,
  Loader2,
  CloudSun,
  TrendingUp,
  Camera,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useAuth, roleLabel } from "@/lib/auth-context";
import type { Role } from "@/lib/authApi";
import { AgriLogo } from "@/components/AgriLogo";
import { ScrollMoreHint } from "@/components/motion/ScrollMoreHint";
import { APP_LANGUAGES, useAppLanguage } from "@/lib/languageContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const nav = [
  { to: "/dashboard", label: "Accueil", shortLabel: "Accueil", icon: Home, roles: ["farmer"] as Role[] },
  { to: "/regulation", label: "Conseiller Réglementaire", shortLabel: "Règles", icon: ScrollText, roles: ["farmer"] as Role[] },
  { to: "/agriculture", label: "Conseiller Agricole", shortLabel: "Agricole", icon: Sprout, roles: ["farmer"] as Role[] },
  { to: "/business", label: "Conseiller Financier", shortLabel: "Financier", icon: LineChart, roles: ["farmer"] as Role[] },
  { to: "/trading", label: "Bourse & Vente à Terme", shortLabel: "Trading", icon: TrendingUp, roles: ["farmer"] as Role[] },
  { to: "/aujourd-hui", label: "Aujourd'hui", shortLabel: "Aujourd'hui", icon: CalendarDays, roles: ["farmer"] as Role[] },
  { to: "/weather", label: "Météo · Dashboard", shortLabel: "Météo", icon: CloudSun, roles: ["farmer"] as Role[] },
  { to: "/marketplace", label: "Marché", shortLabel: "Marché", icon: Store, roles: ["farmer", "acheteur"] as Role[] },
  { to: "/diagnostic", label: "Diagnostic & Scanner IA", shortLabel: "Scanner", icon: Camera, roles: ["farmer", "acheteur"] as Role[] },
  { to: "/organizations", label: "Organisations & Contacts", shortLabel: "Contacts", icon: Users, roles: ["farmer", "acheteur"] as Role[] },
] as const;

function FullPageLoader() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background bg-mesh">
      <span className="relative flex h-12 w-12 items-center justify-center rounded-full text-primary pulse-ring">
        <Loader2 className="h-7 w-7 animate-spin" />
      </span>
      <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
        Chargement
      </span>
    </div>
  );
}

export function AppShell({
  children,
  allowRoles = ["farmer"],
}: {
  children: ReactNode;
  allowRoles?: Role[];
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { status, user } = useAuth();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const roleMismatch =
    status === "authenticated" && user !== null && !allowRoles.includes(user.role);

  useEffect(() => {
    if (status === "anonymous") {
      navigate({ to: "/connexion" });
    } else if (roleMismatch && user) {
      navigate({ to: user.role === "farmer" ? "/dashboard" : "/marketplace" });
    }
  }, [status, roleMismatch, user, navigate]);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  function openSidebar() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setExpanded(true);
  }

  function scheduleCloseSidebar() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setExpanded(false), 160);
  }

  if (status === "loading" || status === "anonymous" || roleMismatch) {
    return <FullPageLoader />;
  }

  const visibleNav = nav.filter((n) => !user || n.roles.includes(user.role));

  return (
    <div className="app-motion app-canvas min-h-screen bg-background pb-24 md:pb-0 md:pl-[4.75rem]">
      {/* Sidebar — collapsed by default, expands smoothly on hover */}
      <aside
        onMouseEnter={openSidebar}
        onMouseLeave={scheduleCloseSidebar}
        onFocusCapture={openSidebar}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
            scheduleCloseSidebar();
          }
        }}
        className={cn(
          "group/sidebar hidden md:flex fixed left-0 top-0 z-30 h-screen flex-col",
          "border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
          "overflow-hidden px-3 py-6 gap-1",
          "transition-[width,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          expanded
            ? "w-[17.5rem] shadow-[12px_0_40px_-24px_rgba(20,40,32,0.45)]"
            : "w-[4.75rem]",
        )}
      >
        <Link
          to="/dashboard"
          className={cn(
            "mb-6 inline-flex press items-center",
            expanded ? "justify-start px-1" : "justify-center",
          )}
        >
          <AgriLogo
            size={40}
            withWordmark={expanded}
            tagline={null}
            variant="onDark"
            className={cn(
              "transition-opacity duration-300",
              expanded ? "opacity-100" : "opacity-100",
            )}
          />
        </Link>

        <LanguageSwitcher expanded={expanded} />

        <nav className="flex flex-1 flex-col gap-0.5">
          {visibleNav.map(({ to, label, icon: Icon }, i) => {
            const active = pathname === to || pathname.startsWith(to + "/");
            return (
              <Link
                key={to}
                to={to}
                title={label}
                style={{ ["--i" as string]: i }}
                className={cn(
                  "group page-enter relative flex items-center overflow-hidden rounded-xl py-2.5 text-sm font-semibold",
                  "transition-all duration-300 [animation-delay:calc(50ms*var(--i))]",
                  expanded ? "gap-3 px-3" : "justify-center px-0",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                )}
              >
                <span
                  className={cn(
                    "absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-signal",
                    "origin-center transition-transform duration-300",
                    active ? "scale-y-100" : "scale-y-0",
                  )}
                  aria-hidden
                />
                <Icon
                  className={cn(
                    "h-[1.15rem] w-[1.15rem] shrink-0 transition-transform duration-300",
                    active ? "scale-105" : "group-hover:scale-105",
                  )}
                />
                <span
                  className={cn(
                    "truncate whitespace-nowrap transition-all duration-300",
                    expanded
                      ? "max-w-[13rem] opacity-100 translate-x-0"
                      : "max-w-0 opacity-0 -translate-x-1",
                  )}
                >
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto pt-4 border-t border-sidebar-border">
          <UserMenu
            expanded={expanded}
            onMenuEnter={openSidebar}
            onMenuLeave={scheduleCloseSidebar}
          />
        </div>
      </aside>

      <main
        key={pathname}
        className={cn(
          "page-enter mx-auto w-full max-w-[1680px] px-5 sm:px-6 md:px-5 lg:px-12",
          pathname === "/regulation" || pathname.startsWith("/regulation/")
            ? "py-3 md:py-4 pb-20 md:pb-4"
            : "py-7 md:py-6",
        )}
      >
        {children}
        {pathname !== "/regulation" && !pathname.startsWith("/regulation/") && (
          <ScrollMoreHint />
        )}
      </main>

      {/* Bottom nav (mobile) — floating dock */}
      <nav className="md:hidden fixed bottom-3 inset-x-3 z-40 rounded-2xl border border-border/70 bg-card/90 backdrop-blur-xl shadow-[0_12px_40px_-20px_rgba(20,40,32,0.45)]">
        <div
          className="grid"
          style={{ gridTemplateColumns: `repeat(${visibleNav.length + 1}, minmax(0, 1fr))` }}
        >
          {visibleNav.map(({ to, label, shortLabel, icon: Icon }) => {
            const active = pathname === to || pathname.startsWith(to + "/");
            return (
              <Link
                key={to}
                to={to}
                title={label}
                className={cn(
                  "press relative flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold transition-colors duration-300",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "absolute top-1.5 h-1 w-1 rounded-full bg-signal transition-transform duration-300",
                    active ? "scale-100" : "scale-0",
                  )}
                  aria-hidden
                />
                <Icon
                  className={cn(
                    "mt-1 h-5 w-5 transition-transform duration-300",
                    active && "-translate-y-0.5 scale-110",
                  )}
                />
                {shortLabel}
              </Link>
            );
          })}
          <UserMenu compact />
        </div>
      </nav>
    </div>
  );
}

function LanguageSwitcher({ expanded }: { expanded: boolean }) {
  const { language, setLanguage } = useAppLanguage();
  const current = APP_LANGUAGES.find((l) => l.code === language) ?? APP_LANGUAGES[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "mb-2 flex items-center rounded-xl py-2 text-sm font-semibold transition-colors hover:bg-sidebar-accent",
          expanded ? "gap-2.5 px-2.5 justify-start" : "justify-center px-0",
        )}
        title="Changer de langue"
      >
        <span className="text-lg leading-none">{current.flag}</span>
        {expanded && <span className="text-sidebar-foreground/80">{current.label}</span>}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right" className="w-44">
        <DropdownMenuLabel>Langue</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {APP_LANGUAGES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => setLanguage(l.code)}
            className={cn("gap-2", l.code === language && "font-semibold")}
          >
            <span className="text-base leading-none">{l.flag}</span> {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function UserMenu({
  compact = false,
  expanded = true,
  onMenuEnter,
  onMenuLeave,
}: {
  compact?: boolean;
  expanded?: boolean;
  onMenuEnter?: () => void;
  onMenuLeave?: () => void;
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  const initiales = user.nom
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  function handleSignOut() {
    signOut();
    navigate({ to: "/connexion" });
  }

  if (compact) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger className="flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-semibold text-muted-foreground">
          <Avatar className="mt-1 h-5 w-5">
            <AvatarFallback className="text-[9px]">{initiales}</AvatarFallback>
          </Avatar>
          Profil
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top">
          <DropdownMenuLabel className="truncate">{user.nom}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {user.role === "farmer" && (
            <DropdownMenuItem asChild>
              <Link to="/profil">
                <User className="h-4 w-4" /> Mon profil
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={handleSignOut}>
            <LogOut className="h-4 w-4" /> Déconnexion
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center rounded-xl py-2 text-left transition-colors hover:bg-sidebar-accent",
          expanded ? "gap-3 px-2.5" : "justify-center px-0",
        )}
      >
        <Avatar className="h-9 w-9 shrink-0 ring-1 ring-white/15">
          <AvatarFallback className="bg-signal/20 text-signal font-semibold text-sm">
            {initiales}
          </AvatarFallback>
        </Avatar>
        <div
          className={cn(
            "min-w-0 flex-1 overflow-hidden transition-all duration-300",
            expanded ? "max-w-[13rem] opacity-100" : "max-w-0 opacity-0",
          )}
        >
          <div className="text-sm font-semibold truncate text-sidebar-foreground whitespace-nowrap">
            {user.nom}
          </div>
          <div className="text-[11px] text-sidebar-foreground/55 whitespace-nowrap">
            {roleLabel(user.role)}
          </div>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        className="w-56"
        onMouseEnter={onMenuEnter}
        onMouseLeave={onMenuLeave}
      >
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.role === "farmer" && (
          <DropdownMenuItem asChild>
            <Link to="/profil">
              <User className="h-4 w-4" /> Mon profil
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOut className="h-4 w-4" /> Déconnexion
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
