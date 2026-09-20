import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Building2,
  Users,
  UserPlus,
  Plus,
  Info,
  Briefcase,
  Share2,
  Phone,
  Mail,
  MapPin,
  CheckCircle2,
  Search,
  Sparkles,
  ShieldCheck,
  FolderSync,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/organizations")({
  head: () => ({
    meta: [
      { title: "Organisations & Contacts - AgriGuide" },
      {
        name: "description",
        content: "Gérez vos organisations, contacts et partagez vos parcelles et diagnostics.",
      },
    ],
  }),
  component: OrganizationsPage,
});

type Contact = {
  id: string;
  name: string;
  role: string;
  organization: string;
  email: string;
  phone: string;
  sharedFields: string[];
  avatarColor: string;
};

type Organization = {
  id: string;
  name: string;
  type: "GAEC" | "CUMA" | "Coopérative" | "Exploitation";
  siret: string;
  membersCount: number;
  parcellesCount: number;
  description: string;
};

const INITIAL_ORGANIZATIONS: Organization[] = [
  {
    id: "org_1",
    name: "Coopérative Agricole de l'Eure (AgriCoop 27)",
    type: "Coopérative",
    siret: "412 879 231 00024",
    membersCount: 42,
    parcellesCount: 156,
    description: "Groupement de collecte, conseil agronomique et achats groupés d'intrants.",
  },
  {
    id: "org_2",
    name: "CUMA des Prés Verts",
    type: "CUMA",
    siret: "329 104 558 00012",
    membersCount: 8,
    parcellesCount: 34,
    description: "Partage de semoirs de précision, moissonneuses-batteuses et bennes.",
  },
];

const INITIAL_CONTACTS: Contact[] = [
  {
    id: "c_1",
    name: "Dr. Marc Delorme",
    role: "Conseiller Agronome Référent",
    organization: "Chambre d'Agriculture 27",
    email: "marc.delorme@agri27.chambagri.fr",
    phone: "06 42 18 90 24",
    sharedFields: ["Ferme des Prés (20 ha)", "Parcelle Nord (50 ha)"],
    avatarColor: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400",
  },
  {
    id: "c_2",
    name: "Antoine Mercier",
    role: "Associé Gérant (GAEC)",
    organization: "GAEC des Deux Vallées",
    email: "a.mercier@gaec2vallees.fr",
    phone: "06 71 83 40 19",
    sharedFields: ["Toutes les parcelles"],
    avatarColor: "bg-blue-500/20 text-blue-600 dark:text-blue-400",
  },
];

function OrganizationsPage() {
  const [contacts, setContacts] = useState<Contact[]>(INITIAL_CONTACTS);
  const [organizations, setOrganizations] = useState<Organization[]>(INITIAL_ORGANIZATIONS);
  const [searchQuery, setSearchQuery] = useState("");

  // Modals state
  const [isNewContactOpen, setIsNewContactOpen] = useState(false);
  const [isNewOrgOpen, setIsNewOrgOpen] = useState(false);
  const [isViewOrgsOpen, setIsViewOrgsOpen] = useState(false);

  // Form states
  const [newContactName, setNewContactName] = useState("");
  const [newContactRole, setNewContactRole] = useState("Conseiller Agronome");
  const [newContactOrg, setNewContactOrg] = useState("Chambre d'Agriculture");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactPhone, setNewContactPhone] = useState("");

  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgType, setNewOrgType] = useState<Organization["type"]>("GAEC");
  const [newOrgSiret, setNewOrgSiret] = useState("");
  const [newOrgDesc, setNewOrgDesc] = useState("");

  const filteredContacts = contacts.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.organization.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleCreateContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContactName.trim()) return;

    const newContact: Contact = {
      id: `c_${Date.now()}`,
      name: newContactName,
      role: newContactRole,
      organization: newContactOrg,
      email: newContactEmail || "contact@agri.fr",
      phone: newContactPhone || "06 00 00 00 00",
      sharedFields: ["Ferme des Prés (20 ha)"],
      avatarColor: "bg-primary/20 text-primary",
    };

    setContacts((prev) => [newContact, ...prev]);
    setIsNewContactOpen(false);
    setNewContactName("");
    setNewContactEmail("");
    setNewContactPhone("");
    toast.success(`Contact ${newContact.name} ajouté avec succès !`);
  };

  const handleCreateOrg = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOrgName.trim()) return;

    const newOrg: Organization = {
      id: `org_${Date.now()}`,
      name: newOrgName,
      type: newOrgType,
      siret: newOrgSiret || "800 123 456 00018",
      membersCount: 1,
      parcellesCount: 2,
      description: newOrgDesc || "Organisation agricole partagée.",
    };

    setOrganizations((prev) => [newOrg, ...prev]);
    setIsNewOrgOpen(false);
    setNewOrgName("");
    setNewOrgSiret("");
    setNewOrgDesc("");
    toast.success(`Organisation ${newOrg.name} créée !`);
  };

  const handleDeleteContact = (id: string, name: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    toast.info(`Contact ${name} supprimé.`);
  };

  return (
    <AppShell allowRoles={["farmer", "acheteur"]}>
      <div className="relative min-h-[calc(100vh-140px)] flex flex-col justify-between space-y-6 pb-24">
        <div className="space-y-6">
          {/* Header */}
          <PageHeader
            icon={Users}
            title="Organisations & Répertoire de Contacts"
            subtitle="Créez des organisations (GAEC, CUMA, Coopératives) pour synchroniser et partager vos parcelles, notes de terrain, météo et analyses avec vos collaborateurs."
          />

          {/* Top Banner (As in the user screenshot) */}
          <div className="flex items-center gap-3 p-4 rounded-2xl border border-border/80 bg-card shadow-sm text-foreground">
            <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
              <Info className="w-5 h-5" />
            </div>
            <p className="text-xs sm:text-sm font-medium">
              Créez ou rejoignez une <strong>Organisation</strong> pour synchroniser vos données avec plusieurs comptes et collaborateurs agricoles.
            </p>
          </div>

          {/* Search bar & quick filters */}
          {contacts.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-80">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher un contact, conseiller..."
                  className="pl-9 h-10 text-xs rounded-xl bg-card border-border/80"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <span className="text-xs text-muted-foreground font-mono font-semibold">
                  {filteredContacts.length} Contact{filteredContacts.length > 1 ? "s" : ""} enregistré{filteredContacts.length > 1 ? "s" : ""}
                </span>
              </div>
            </div>
          )}

          {/* Contacts Grid / List */}
          {filteredContacts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredContacts.map((contact) => (
                <div
                  key={contact.id}
                  className="p-5 rounded-3xl bg-card border border-border/80 shadow-sm hover:border-primary/50 transition duration-200 flex flex-col justify-between space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-bold text-base ${contact.avatarColor}`}>
                        {contact.name
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")}
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-foreground">{contact.name}</h4>
                        <span className="text-xs text-muted-foreground block font-medium">
                          {contact.role}
                        </span>
                        <span className="text-[11px] font-mono text-primary font-bold">
                          {contact.organization}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteContact(contact.id, contact.name)}
                      className="text-muted-foreground hover:text-destructive p-1 rounded-lg transition"
                      title="Supprimer le contact"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-primary" />
                      <span className="truncate">{contact.email}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-primary" />
                      <span>{contact.phone}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-primary" />
                      <span className="truncate">Parcelles : {contact.sharedFields.join(", ")}</span>
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toast.success(`Partage de parcelles mis à jour avec ${contact.name}`)}
                      className="w-full text-xs h-8 rounded-xl font-semibold gap-1.5"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>Partager mes Parcelles</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Center Empty State (As in screenshot) */
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
              <div className="w-16 h-16 rounded-3xl bg-accent/40 border border-border/80 flex items-center justify-center text-muted-foreground">
                <Users className="w-8 h-8" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                Aucun contact pour l'instant. Ajoutez-en en appuyant sur le bouton <strong>+</strong> ci-dessous.
              </p>
            </div>
          )}
        </div>

        {/* Floating Add Contact Button (As in screenshot) */}
        <button
          type="button"
          onClick={() => setIsNewContactOpen(true)}
          className="fixed bottom-24 right-8 z-30 w-14 h-14 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-2xl flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
          title="Ajouter un contact"
        >
          <Plus className="w-7 h-7" />
        </button>

        {/* Bottom Action Bar & Tagline (As in screenshot) */}
        <div className="space-y-3 pt-6 border-t border-border/60">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setIsNewOrgOpen(true)}
              className="flex items-center justify-center gap-2 h-12 px-6 rounded-2xl bg-[#092b20] hover:bg-[#0d382a] text-white font-bold text-sm shadow-md transition"
            >
              <Building2 className="w-4 h-4" />
              <span>Créer une Organisation</span>
            </button>

            <button
              type="button"
              onClick={() => setIsViewOrgsOpen(true)}
              className="flex items-center justify-center gap-2 h-12 px-6 rounded-2xl bg-[#527339] hover:bg-[#5e8342] text-white font-bold text-sm shadow-md transition"
            >
              <Briefcase className="w-4 h-4" />
              <span>Voir les Organisations ({organizations.length})</span>
            </button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            Créez et gérez vos contacts pour partager vos parcelles, notes de terrain, visualisations NDVI, chats et bien plus encore en un clic.
          </p>
        </div>

        {/* Modal 1: Create Contact */}
        <Dialog open={isNewContactOpen} onOpenChange={setIsNewContactOpen}>
          <DialogContent className="sm:max-w-md rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" />
                Ajouter un Nouveau Contact
              </DialogTitle>
              <DialogDescription className="text-xs">
                Renseignez les coordonnées de votre conseiller, associé ou collaborateur.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateContact} className="space-y-3 pt-2">
              <div>
                <label className="text-xs font-bold text-muted-foreground block mb-1">Nom complet</label>
                <Input
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  placeholder="ex: Dr. Marc Delorme"
                  className="h-9 text-xs rounded-xl"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-muted-foreground block mb-1">Rôle / Métier</label>
                  <Input
                    value={newContactRole}
                    onChange={(e) => setNewContactRole(e.target.value)}
                    placeholder="ex: Conseiller Agronome"
                    className="h-9 text-xs rounded-xl"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground block mb-1">Organisation</label>
                  <Input
                    value={newContactOrg}
                    onChange={(e) => setNewContactOrg(e.target.value)}
                    placeholder="ex: Chambre d'Agri 27"
                    className="h-9 text-xs rounded-xl"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-muted-foreground block mb-1">Email</label>
                <Input
                  type="email"
                  value={newContactEmail}
                  onChange={(e) => setNewContactEmail(e.target.value)}
                  placeholder="ex: marc.delorme@agri.fr"
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-muted-foreground block mb-1">Téléphone</label>
                <Input
                  type="tel"
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                  placeholder="ex: 06 42 18 90 24"
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsNewContactOpen(false)} className="rounded-xl">
                  Annuler
                </Button>
                <Button type="submit" size="sm" className="rounded-xl bg-primary text-primary-foreground font-bold">
                  Enregistrer le Contact
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal 2: Create Organization */}
        <Dialog open={isNewOrgOpen} onOpenChange={setIsNewOrgOpen}>
          <DialogContent className="sm:max-w-md rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <Building2 className="w-5 h-5 text-primary" />
                Créer une Organisation
              </DialogTitle>
              <DialogDescription className="text-xs">
                Configurez une structure collective (GAEC, CUMA, Coopérative) pour regrouper vos exploitations.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateOrg} className="space-y-3 pt-2">
              <div>
                <label className="text-xs font-bold text-muted-foreground block mb-1">Nom de l'organisation</label>
                <Input
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="ex: GAEC des Deux Vallées"
                  className="h-9 text-xs rounded-xl"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold text-muted-foreground block mb-1">Type de structure</label>
                  <select
                    value={newOrgType}
                    onChange={(e) => setNewOrgType(e.target.value as any)}
                    className="w-full h-9 px-3 rounded-xl border border-input bg-background text-xs"
                  >
                    <option value="GAEC">GAEC</option>
                    <option value="CUMA">CUMA</option>
                    <option value="Coopérative">Coopérative</option>
                    <option value="Exploitation">Exploitation Individuelle</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground block mb-1">Numéro SIRET</label>
                  <Input
                    value={newOrgSiret}
                    onChange={(e) => setNewOrgSiret(e.target.value)}
                    placeholder="ex: 412 879 231 00024"
                    className="h-9 text-xs rounded-xl font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-muted-foreground block mb-1">Description / Activité</label>
                <Input
                  value={newOrgDesc}
                  onChange={(e) => setNewOrgDesc(e.target.value)}
                  placeholder="ex: Partage de matériel et assolements communs"
                  className="h-9 text-xs rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsNewOrgOpen(false)} className="rounded-xl">
                  Annuler
                </Button>
                <Button type="submit" size="sm" className="rounded-xl bg-primary text-primary-foreground font-bold">
                  Créer l'Organisation
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Modal 3: View Organizations */}
        <Dialog open={isViewOrgsOpen} onOpenChange={setIsViewOrgsOpen}>
          <DialogContent className="sm:max-w-lg rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-primary" />
                Organisations Affiliées
              </DialogTitle>
              <DialogDescription className="text-xs">
                Structures et coopératives associées à votre compte.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 pt-2 max-h-96 overflow-y-auto pr-1">
              {organizations.map((org) => (
                <div key={org.id} className="p-4 rounded-2xl bg-card border border-border/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-foreground">{org.name}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-primary/10 text-primary border border-primary/20">
                      {org.type}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{org.description}</p>
                  <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground pt-1 border-t border-border/40">
                    <span>SIRET : {org.siret}</span>
                    <span>{org.membersCount} membres · {org.parcellesCount} parcelles</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button
                size="sm"
                onClick={() => {
                  setIsViewOrgsOpen(false);
                  setIsNewOrgOpen(true);
                }}
                className="rounded-xl text-xs bg-primary font-bold text-primary-foreground"
              >
                + Nouvelle Organisation
              </Button>
              <Button size="sm" variant="outline" onClick={() => setIsViewOrgsOpen(false)} className="rounded-xl text-xs">
                Fermer
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
