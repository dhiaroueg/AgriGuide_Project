import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { listings } from "@/features/marketplace/data";
import { ListingCard } from "@/features/marketplace/ListingCard";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BadgeCheck, PackageOpen, Search, Truck } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/marketplace/")({
  component: Browse,
});

const kinds = [
  { id: "all", label: "Tout" },
  { id: "recolte", label: "Récoltes" },
  { id: "dechet", label: "Déchets valorisables" },
] as const;

function Browse() {
  const [kind, setKind] = useState<(typeof kinds)[number]["id"]>("all");
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("all");
  const [price, setPrice] = useState("all");
  const [delivery, setDelivery] = useState("all");
  const [certification, setCertification] = useState("all");
  const [radius, setRadius] = useState("all");

  const regions = useMemo(() => Array.from(new Set(listings.map((l) => l.region))), []);

  const filtered = useMemo(
    () =>
      listings.filter((l) => {
        if (kind !== "all" && l.kind !== kind) return false;
        if (q && !l.title.toLowerCase().includes(q.toLowerCase())) return false;
        if (region !== "all" && l.region !== region) return false;
        if (price === "free" && !l.freePrice) return false;
        if (price === "paid" && l.freePrice) return false;
        if (delivery !== "all" && !l.deliveryModes.includes(delivery as "retrait_sur_place" | "livraison" | "point_relais")) return false;
        if (certification !== "all" && !l.certifications.includes(certification)) return false;
        if (radius !== "all" && Number.parseInt(l.distance, 10) > Number(radius)) return false;
        return true;
      }),
    [kind, q, region, price],
  );

  return (
    <div data-tour="market-browse">
      {/* Kind pills */}
      <div className="flex gap-2 mb-5">
        {kinds.map((k, i) => (
          <button
            key={k.id}
            onClick={() => setKind(k.id)}
            style={{ animationDelay: `${i * 70}ms` }}
            className={cn(
      "page-enter press rounded-full border px-4 py-2 text-sm font-medium transition-all duration-300",
              kind === k.id
                ? "bg-primary text-primary-foreground border-primary shadow-soft"
                : "bg-card border-border hover:bg-secondary hover:-translate-y-0.5",
            )}
          >
            {k.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card-soft p-4 mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-[1.35fr_repeat(4,180px)]">
        <div className="relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher (blé, colza, paille...)"
            className="pl-9 h-11 rounded-xl"
          />
        </div>
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger className="h-11 rounded-xl">
            <SelectValue placeholder="Région" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes les régions</SelectItem>
            {regions.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={price} onValueChange={setPrice}>
          <SelectTrigger className="h-11 rounded-xl">
            <SelectValue placeholder="Prix" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les prix</SelectItem>
            <SelectItem value="free">Gratuit / à convenir</SelectItem>
            <SelectItem value="paid">Avec prix</SelectItem>
          </SelectContent>
        </Select>
        <Select value={delivery} onValueChange={setDelivery}>
          <SelectTrigger className="h-11 rounded-xl"><Truck className="mr-2 h-4 w-4" /><SelectValue placeholder="Livraison" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les modes</SelectItem>
            <SelectItem value="retrait_sur_place">Retrait sur place</SelectItem>
            <SelectItem value="livraison">Livraison</SelectItem>
            <SelectItem value="point_relais">Point relais</SelectItem>
          </SelectContent>
        </Select>
        <Select value={radius} onValueChange={setRadius}>
          <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Rayon" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes distances</SelectItem>
            <SelectItem value="25">À moins de 25 km</SelectItem>
            <SelectItem value="50">À moins de 50 km</SelectItem>
            <SelectItem value="100">À moins de 100 km</SelectItem>
          </SelectContent>
        </Select>
        <Select value={certification} onValueChange={setCertification}>
          <SelectTrigger className="h-11 rounded-xl"><BadgeCheck className="mr-2 h-4 w-4" /><SelectValue placeholder="Certification" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes certifications</SelectItem>
            {Array.from(new Set(listings.flatMap((l) => l.certifications))).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="page-enter flex flex-col items-center gap-3 py-20 text-center text-muted-foreground">
          <PackageOpen className="float-soft h-10 w-10 opacity-40" />
          Aucune annonce ne correspond à vos filtres.
        </div>
      ) : (
        // La clé dépend des filtres pour rejouer l'entrée en cascade à chaque tri.
        <div
          key={`${kind}-${region}-${price}-${delivery}-${certification}-${radius}-${q}`}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {filtered.map((l, i) => (
            <ListingCard key={l.id} l={l} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
