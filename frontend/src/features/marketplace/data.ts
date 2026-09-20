export type Listing = {
  id: string;
  kind: "recolte" | "dechet";
  title: string;
  crop: string;
  quantity: string;
  price: string;
  freePrice?: boolean;
  region: string;
  distance: string;
  emoji: string;
  image: string;
  description: string;
  utility?: string;
  contact: { phone: string; email: string };
  status?: "disponible" | "reserve" | "expire";
  deliveryModes: ("retrait_sur_place" | "livraison" | "point_relais")[];
  deliveryRadiusKm: number;
  certifications: string[];
  seller: { name: string; verified: boolean; rating: number; reviewCount: number };
  mine?: boolean;
};

export const listings: Listing[] = [
  {
    id: "1",
    kind: "recolte",
    title: "Blé tendre bio",
    crop: "Blé",
    quantity: "3,5 tonnes",
    price: "285 €/t",
    region: "Eure-et-Loir",
    distance: "12 km",
    emoji: "🌾",
    image: "/img/marketplace/ble.jpg",
    description:
      "Récolte 2026, blé tendre bio certifié AB. Taux de protéines 11,8%. Livraison possible dans un rayon de 40 km.",
    contact: { phone: "06 12 34 56 78", email: "jean.martin@fermedespres.fr" },
    status: "disponible",
    deliveryModes: ["retrait_sur_place", "livraison"], deliveryRadiusKm: 40, certifications: ["Agriculture biologique (AB)"],
    seller: { name: "Jean Martin", verified: true, rating: 4.9, reviewCount: 18 },
    mine: true,
  },
  {
    id: "2",
    kind: "dechet",
    title: "Paille de blé",
    crop: "Paille",
    quantity: "200 bottes",
    price: "À convenir",
    freePrice: true,
    region: "Loiret",
    distance: "23 km",
    emoji: "🌿",
    image: "/img/marketplace/paille.jpg",
    description: "Bottes rondes de paille de blé, bon état, stockées à l'abri.",
    utility: "Idéale pour la litière animale, le paillage de sol ou l'isolation naturelle.",
    contact: { phone: "07 88 22 44 11", email: "contact@fermedelabatie.fr" },
    status: "disponible",
    deliveryModes: ["retrait_sur_place"], deliveryRadiusKm: 0, certifications: [],
    seller: { name: "Ferme de la Bâtie", verified: true, rating: 4.7, reviewCount: 11 },
    mine: true,
  },
  {
    id: "3",
    kind: "recolte",
    title: "Colza HOLL",
    crop: "Colza",
    quantity: "8 tonnes",
    price: "460 €/t",
    region: "Yvelines",
    distance: "34 km",
    emoji: "🌼",
    image: "/img/marketplace/colza.jpg",
    description: "Colza HOLL, débouché huile alimentaire. Livraison assurée.",
    contact: { phone: "06 55 44 33 22", email: "amelie@grangehaut.fr" },
    status: "disponible",
    deliveryModes: ["livraison", "point_relais"], deliveryRadiusKm: 80, certifications: ["HVE niveau 3"],
    seller: { name: "Amélie Durand", verified: true, rating: 4.8, reviewCount: 24 },
  },
  {
    id: "4",
    kind: "dechet",
    title: "Marc de raisin",
    crop: "Vigne",
    quantity: "1,2 tonnes",
    price: "Gratuit",
    freePrice: true,
    region: "Loir-et-Cher",
    distance: "58 km",
    emoji: "🍇",
    image: "/img/marketplace/raisin.jpg",
    description: "Marc de raisin issu des vendanges 2026, à récupérer sur place.",
    utility: "Compostage, méthanisation, ou distillation artisanale.",
    contact: { phone: "06 77 88 99 00", email: "domaine@coteauxsud.fr" },
    status: "disponible",
    deliveryModes: ["retrait_sur_place"], deliveryRadiusKm: 0, certifications: ["Bio"],
    seller: { name: "Domaine Coteaux Sud", verified: true, rating: 4.6, reviewCount: 8 },
  },
  {
    id: "5",
    kind: "recolte",
    title: "Tournesol",
    crop: "Tournesol",
    quantity: "5 tonnes",
    price: "410 €/t",
    region: "Indre-et-Loire",
    distance: "72 km",
    emoji: "🌻",
    image: "/img/marketplace/tournesol.jpg",
    description: "Récolte propre, taux d'huile 43%. Prêt à charger.",
    contact: { phone: "06 11 22 33 44", email: "pierre.laurent@agri.fr" },
    status: "reserve",
    deliveryModes: ["livraison"], deliveryRadiusKm: 60, certifications: [],
    seller: { name: "Pierre Laurent", verified: false, rating: 4.5, reviewCount: 4 },
    mine: true,
  },
  {
    id: "6",
    kind: "dechet",
    title: "Fumier de bovins",
    crop: "Fumier",
    quantity: "15 m³",
    price: "20 €/m³",
    region: "Eure-et-Loir",
    distance: "8 km",
    emoji: "🐄",
    image: "/img/marketplace/fumier.jpg",
    description: "Fumier bien décomposé, prêt à épandre.",
    utility: "Amendement organique riche en azote, potassium et phosphore.",
    contact: { phone: "06 45 67 89 10", email: "elevage.dupre@gmail.com" },
    status: "disponible",
    deliveryModes: ["retrait_sur_place", "livraison"], deliveryRadiusKm: 25, certifications: ["Label Rouge"],
    seller: { name: "Élevage Dupré", verified: true, rating: 4.9, reviewCount: 30 },
  },
];
