import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { listings } from "@/features/marketplace/data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MapPin, Phone, Mail, Sparkles, BadgeCheck, MessageCircle, Star, Truck } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { createReservation, sendMessage, startConversation } from "@/lib/marketplaceApi";

export const Route = createFileRoute("/marketplace/$id")({
  component: Detail,
});

function Detail() {
  const { id } = useParams({ from: "/marketplace/$id" });
  const l = listings.find((x) => x.id === id);
  const [revealed, setRevealed] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const { token, user } = useAuth();

  if (!l) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Annonce introuvable.</p>
        <Link to="/marketplace" className="text-primary underline mt-3 inline-block">Retour au marketplace</Link>
      </div>
    );
  }

  const reserve = async () => {
    const value = Number.parseFloat(quantity.replace(",", "."));
    if (!token) return toast.error("Connectez-vous pour réserver.");
    if (!Number.isFinite(value) || value <= 0) return toast.error("Indiquez une quantité valide.");
    setSending(true);
    try {
      await createReservation(l.id, { quantity: value, pickup_mode: l.deliveryModes[0], note: message || undefined }, token);
      toast.success("Demande envoyée au vendeur. Vous serez notifié de sa réponse.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Réservation impossible."); }
    finally { setSending(false); }
  };

  const contactSeller = async () => {
    if (!token) return toast.error("Connectez-vous pour écrire au vendeur.");
    if (!message.trim()) return toast.error("Écrivez un message avant de l’envoyer.");
    setSending(true);
    try {
      const conversation = await startConversation(l.id, token);
      await sendMessage(conversation.id, message.trim(), token);
      setMessage(""); setRevealed(true);
      toast.success("Message envoyé dans la messagerie sécurisée.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Message impossible à envoyer."); }
    finally { setSending(false); }
  };

  return (
    <div className="max-w-4xl">
      <Link to="/marketplace" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour aux annonces
      </Link>

      <div className="mt-4 grid gap-6 md:grid-cols-[1fr_320px]">
        <div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-muted">
            <img
              src={l.image}
              alt={l.title}
              className="h-full w-full object-cover"
            />
            <div
              className="absolute inset-0 bg-gradient-to-t from-[#1C2B1C]/35 via-transparent to-transparent"
              aria-hidden
            />
            <div className="absolute left-3 top-3 flex gap-2">
              {l.kind === "recolte" ? (
                <Badge className="border-0 bg-white/95 text-harvest shadow-sm">Récolte</Badge>
              ) : (
                <Badge className="border-0 bg-white/95 text-waste-foreground shadow-sm">
                  Déchet valorisable
                </Badge>
              )}
              {l.status === "reserve" && (
                <Badge className="border-0 bg-foreground/80 text-background shadow-sm">Réservé</Badge>
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2">
            <span className="text-sm text-muted-foreground inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {l.region} · {l.distance}
            </span>
          </div>

          <h1 className="mt-2 font-display text-3xl md:text-4xl font-semibold">{l.title}</h1>
          <div className="mt-2 text-muted-foreground">{l.quantity}</div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            {l.seller.verified && <Badge variant="outline" className="gap-1 border-primary/30 text-primary"><BadgeCheck className="h-4 w-4" />Vendeur vérifié</Badge>}
            <span className="inline-flex items-center gap-1 text-muted-foreground"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{l.seller.rating.toFixed(1)} · {l.seller.reviewCount} avis</span>
            {l.certifications.map((certification) => <Badge key={certification} variant="secondary">{certification}</Badge>)}
          </div>

          <p className="mt-6 text-base leading-relaxed">{l.description}</p>

          {l.utility && (
            <div className="mt-6 rounded-2xl bg-waste/10 border border-waste/30 p-5">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-waste-foreground">
                <Sparkles className="h-4 w-4" /> Peut servir à
              </div>
              <p className="mt-1 text-sm">{l.utility}</p>
            </div>
          )}
        </div>

        {/* Contact panel */}
        <aside className="card-soft p-6 h-fit md:sticky md:top-6">
          <div className="text-xs text-muted-foreground">Prix</div>
          <div className="font-display text-3xl font-semibold text-primary">{l.price}</div>

          <div className="mt-4 rounded-xl bg-secondary p-3 text-sm">
            <div className="font-medium flex items-center gap-2"><Truck className="h-4 w-4 text-primary" />Remise proposée</div>
            <div className="mt-1 text-muted-foreground">{l.deliveryModes.map((mode) => mode === "retrait_sur_place" ? "Retrait sur place" : mode === "point_relais" ? "Point relais" : `Livraison (jusqu’à ${l.deliveryRadiusKm} km)`).join(" · ")}</div>
          </div>

          {l.status === "disponible" && user?.id !== (l.mine ? user.id : "") && <div className="mt-4 space-y-2">
            <Input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="decimal" placeholder="Quantité souhaitée" className="rounded-xl" />
            <Button className="w-full rounded-xl h-11" onClick={reserve} disabled={sending}>Réserver cette quantité</Button>
          </div>}

          <div className="mt-4">
            <Textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} placeholder="Posez une question au vendeur (sans partager de données sensibles)..." className="rounded-xl" />
            <Button variant="outline" className="mt-2 w-full rounded-xl" onClick={contactSeller} disabled={sending}><MessageCircle className="mr-2 h-4 w-4" />Envoyer un message sécurisé</Button>
          </div>

          {!revealed ? (
            <Button className="w-full mt-6 rounded-xl h-12" onClick={() => setRevealed(true)}>
              Contacter le vendeur
            </Button>
          ) : (
            <div className="mt-6 space-y-3">
              <a href={`tel:${l.contact.phone}`} className="flex items-center gap-3 rounded-xl bg-secondary p-3">
                <Phone className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-xs text-muted-foreground">Téléphone</div>
                  <div className="font-medium">{l.contact.phone}</div>
                </div>
              </a>
              <a href={`mailto:${l.contact.email}`} className="flex items-center gap-3 rounded-xl bg-secondary p-3">
                <Mail className="h-5 w-5 text-primary" />
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">Email</div>
                  <div className="font-medium truncate">{l.contact.email}</div>
                </div>
              </a>
            </div>
          )}

          <p className="text-xs text-muted-foreground mt-4">
            Paiement hors plateforme. La réservation conserve une trace de l’accord et protège la disponibilité.
          </p>
        </aside>
      </div>
    </div>
  );
}
