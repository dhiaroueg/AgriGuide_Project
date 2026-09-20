import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, MapPin, Star, Truck } from "lucide-react";
import type { Listing } from "@/features/marketplace/data";
import { Badge } from "@/components/ui/badge";
import { Reveal } from "@/components/motion/Reveal";
import { cn } from "@/lib/utils";

export function ListingCard({ l, index = 0 }: { l: Listing; index?: number }) {
  const isRecolte = l.kind === "recolte";
  return (
    <Reveal from="up" delay={Math.min(index, 8) * 90} className="flex">
      <Link
        to="/marketplace/$id"
        params={{ id: l.id }}
        className="press group zoom-media flex flex-1 flex-col overflow-hidden rounded-2xl bg-card shadow-[0_8px_30px_-18px_rgba(28,43,28,0.3)] ring-1 ring-border/80 transition-all duration-400 hover:-translate-y-1.5 hover:shadow-lift"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-muted">
          <img
            src={l.image}
            alt={l.title}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          <div
            className="absolute inset-0 bg-gradient-to-t from-[#1C2B1C]/45 via-transparent to-transparent"
            aria-hidden
          />
          <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
            {isRecolte ? (
              <Badge className="border-0 bg-white/95 text-harvest shadow-sm backdrop-blur-sm">
                Récolte
              </Badge>
            ) : (
              <Badge className="border-0 bg-white/95 text-waste-foreground shadow-sm backdrop-blur-sm">
                Déchet valorisable
              </Badge>
            )}
            {l.status === "reserve" && (
              <Badge className="border-0 bg-foreground/80 text-background shadow-sm backdrop-blur-sm">
                Réservé
              </Badge>
            )}
          </div>
          <span className="absolute bottom-2.5 right-2.5 rounded-full bg-white/95 px-2.5 py-1 font-display text-sm font-semibold text-primary shadow-sm">
            {l.price}
          </span>
        </div>

        <div className="flex flex-1 flex-col p-4">
          <div className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" /> {l.region} · {l.distance}
          </div>
          <div className="mt-1.5 font-display text-lg font-semibold leading-tight transition-colors group-hover:text-primary">
            {l.title}
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground">{l.quantity}</div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {l.seller.verified && <span className="inline-flex items-center gap-1 text-primary"><BadgeCheck className="h-3.5 w-3.5" />Vendeur vérifié</span>}
            <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{l.seller.rating.toFixed(1)} ({l.seller.reviewCount})</span>
            {l.deliveryModes.includes("livraison") && <Truck className="h-3.5 w-3.5" aria-label="Livraison disponible" />}
          </div>
          <div
            className={cn(
              "mt-auto pt-3 inline-flex items-center gap-1 text-sm font-medium text-primary",
              "opacity-70 transition group-hover:opacity-100",
            )}
          >
            Voir l’annonce <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </div>
        </div>
      </Link>
    </Reveal>
  );
}
