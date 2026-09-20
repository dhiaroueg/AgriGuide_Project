import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  AlertTriangle,
  Droplets,
  Eye,
  Image,
  Loader2,
  Mountain,
  Move3d,
  Rotate3d,
  Ruler,
  Satellite,
  TrendingUp,
  Waves,
  ZoomIn,
} from "lucide-react";
import { AlertBanner } from "@/components/AlertBanner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getReliefGrid, getReliefOrthophoto, type ReliefGrid } from "@/lib/agricultureApi";

type Mode = "ndvi" | "ndwi" | "ndmi" | "slope" | "photo";
const NEUTRAL = new THREE.Color("#98a09b");
// A modest visual exaggeration makes metre-scale agricultural relief readable
// at parcel scale. It affects only the 3D view; all displayed slope values
// remain calculated from the unmodified IGN elevations.
const RELIEF_VISUAL_EXAGGERATION = 1.6;

const MODE_TITLE: Record<Mode, string> = {
  ndvi: "Vigueur NDVI",
  ndwi: "Eau NDWI",
  ndmi: "Humidité NDMI",
  slope: "Pente",
  photo: "Orthophoto",
};

const MODE_HELP: Record<Mode, string> = {
  ndvi: "NDVI — vigueur et activité chlorophyllienne. Ce n'est pas une mesure de rendement.",
  ndwi: "NDWI (McFeeters) — indicateur d'eau libre de surface, pas un indicateur d'humidité du sol.",
  ndmi: "NDMI (Gao) — indicateur d'humidité de la végétation, à interpréter avec la culture et la météo.",
  slope: "Pente calculée à partir du modèle numérique de terrain IGN.",
  photo:
    "Orthophoto IGN plaquée sur le relief ; elle représente une acquisition aérienne, pas une image temps réel.",
};

const MODE_ICON: Record<Mode, typeof Mountain> = {
  ndvi: Satellite,
  ndwi: Waves,
  ndmi: Droplets,
  slope: Mountain,
  photo: Image,
};

const MODE_DESCRIPTION: Record<Mode, string> = {
  ndvi: "Carte de vigueur de la végétation : du rouge (sol nu / stress) au vert foncé (végétation dense et active).",
  ndwi: "Carte de l'eau libre en surface : du brun (sec) au bleu (eau présente). Ne mesure pas l'humidité du sol.",
  ndmi: "Carte de l'humidité de la végétation : du brun (sec) au vert (végétation hydratée). À croiser avec la météo.",
  slope:
    "Carte des pentes : du vert (plat) au rouge (forte pente). Utile pour l'irrigation et le travail du sol.",
  photo: "Photographie aérienne IGN plaquée sur le relief réel de la parcelle.",
};

const MODE_LEGEND: Record<
  Exclude<Mode, "photo">,
  { low: string; mid: string; high: string; lowLabel: string; highLabel: string }
> = {
  ndvi: {
    low: "#8a2d1f",
    mid: "#d9a441",
    high: "#1f6b3a",
    lowLabel: "Sol nu / stress",
    highLabel: "Végétation dense",
  },
  ndwi: {
    low: "#7a4a21",
    mid: "#3f7d8c",
    high: "#1b3f8f",
    lowLabel: "Sec",
    highLabel: "Eau présente",
  },
  ndmi: {
    low: "#7a4a21",
    mid: "#8a9a3f",
    high: "#1f6b3a",
    lowLabel: "Sec",
    highLabel: "Humide",
  },
  slope: {
    low: "#1f6b3a",
    mid: "#d9a441",
    high: "#8a2d1f",
    lowLabel: "Plat",
    highLabel: "Forte pente",
  },
};

function colorFor(value: number, mode: Exclude<Mode, "photo" | "slope">): THREE.Color {
  // Use the same stops as the on-screen legend.  The former hue-only NDWI
  // palette passed through green at values near zero, despite NDWI being
  // presented as brown (dry land) to blue (surface water).
  const stops = MODE_LEGEND[mode];
  const [minimum, maximum] = mode === "ndvi" ? [-0.2, 0.8] : [-0.4, 0.4];
  const normalized = Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum)));
  const low = new THREE.Color(stops.low);
  const mid = new THREE.Color(stops.mid);
  const high = new THREE.Color(stops.high);

  return normalized <= 0.5
    ? low.lerp(mid, normalized * 2)
    : mid.lerp(high, (normalized - 0.5) * 2);
}

function TerrainCanvas({
  data,
  mode,
  orthophoto,
}: {
  data: ReliefGrid;
  mode: Mode;
  orthophoto: string | null;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0a0f0d");
    scene.fog = new THREE.Fog("#0a0f0d", 500, 3000);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 5000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    host.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    const { largeur: width, hauteur: height, largeur_m: widthM, hauteur_m: heightM } = data;
    // Only use cells that actually belong to the parcel when normalising the
    // mesh.  This keeps an IGN no-data/fill value outside an irregular parcel
    // from flattening or exaggerating the whole 3D relief.
    const terrainElevations = data.grille_elevation.flat().filter((value, index) => {
      const y = Math.floor(index / width);
      const x = index % width;
      return data.grille_validite[y]?.[x] && Number.isFinite(value);
    });
    const elevationRange = terrainElevations.length
      ? terrainElevations
      : data.grille_elevation.flat().filter(Number.isFinite);
    const minElevation = Math.min(...elevationRange);
    const maxElevation = Math.max(...elevationRange);
    const elevationScale =
      (Math.max(widthM, heightM) / Math.max(maxElevation - minElevation, 1)) *
      0.3 *
      RELIEF_VISUAL_EXAGGERATION;
    const positions = new Float32Array(width * height * 3);
    const colours = new Float32Array(width * height * 3);
    const uvs = new Float32Array(width * height * 2);
    const values =
      mode === "ndvi"
        ? data.grille_ndvi
        : mode === "ndwi"
          ? data.grille_ndwi
          : mode === "ndmi"
            ? data.grille_ndmi
            : data.grille_pente_pct;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        positions[i * 3] = (x / Math.max(width - 1, 1) - 0.5) * widthM;
        positions[i * 3 + 1] = (data.grille_elevation[y][x] - minElevation) * elevationScale;
        positions[i * 3 + 2] = (y / Math.max(height - 1, 1) - 0.5) * heightM;
        uvs[i * 2] = x / Math.max(width - 1, 1);
        uvs[i * 2 + 1] = 1 - y / Math.max(height - 1, 1);
        const hasSatelliteValue = data.grille_validite_satellite[y][x];
        const hasTerrainValue = data.grille_validite[y][x];
        const colour =
          mode === "slope"
            ? hasTerrainValue
              ? new THREE.Color().setHSL(
                  Math.max(0, 0.34 - Math.min(values[y][x], 30) / 90),
                  0.72,
                  0.42,
                )
              : NEUTRAL
            : hasSatelliteValue
              ? colorFor(values[y][x], mode === "photo" ? "ndvi" : mode)
              : NEUTRAL;
        colours.set([colour.r, colour.g, colour.b], i * 3);
      }
    }
    const indices: number[] = [];
    for (let y = 0; y < height - 1; y += 1) {
      for (let x = 0; x < width - 1; x += 1) {
        const a = y * width + x;
        if (
          data.grille_validite[y][x] &&
          data.grille_validite[y + 1][x] &&
          data.grille_validite[y][x + 1] &&
          data.grille_validite[y + 1][x + 1]
        ) {
          indices.push(a, a + width, a + 1, a + 1, a + width, a + width + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const texture =
      mode === "photo" && orthophoto ? new THREE.TextureLoader().load(orthophoto) : null;
    if (texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      // Vertex UVs already convert the north-to-south raster rows to the
      // mesh's coordinate system.  Applying Three's default flip as well
      // inverted the orthophoto relative to the elevation and index grids.
      texture.flipY = false;
      texture.needsUpdate = true;
    }
    const material = new THREE.MeshStandardMaterial({
      vertexColors: !texture,
      map: texture,
      roughness: 0.84,
      side: THREE.DoubleSide,
    });
    scene.add(new THREE.Mesh(geometry, material));
    scene.add(new THREE.HemisphereLight(0xe8fff0, 0x07100b, 1.25));
    const sun = new THREE.DirectionalLight(0xfff4d6, 3.2);
    sun.position.set(-widthM * 0.7, Math.max(widthM, heightM) * 0.8, heightM);
    scene.add(sun);
    const size = Math.max(widthM, heightM);
    const grid = new THREE.GridHelper(size * 1.7, 18, 0x547260, 0x294337);
    grid.position.y = -size * 0.015;
    scene.add(grid);
    // A lower initial viewpoint exposes terrain contours immediately while
    // OrbitControls still lets the user inspect it from any angle.
    camera.position.set(size * 0.82, size * 0.52, size * 0.9);
    controls.target.set(0, size * 0.14, 0);
    const resize = () => {
      const box = host.getBoundingClientRect();
      renderer.setSize(box.width, box.height, false);
      camera.aspect = box.width / Math.max(box.height, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    let frame = 0;
    const render = () => {
      frame = requestAnimationFrame(render);
      controls.update();
      renderer.render(scene, camera);
    };
    render();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      geometry.dispose();
      material.dispose();
      texture?.dispose();
      renderer.dispose();
      host.replaceChildren();
    };
  }, [data, mode, orthophoto]);
  return <div ref={hostRef} className="h-full w-full" />;
}

function fmt(value: number | null, suffix = "") {
  return value === null ? "Indisponible" : `${value.toFixed(3)}${suffix}`;
}

function ColorLegend({ mode }: { mode: Mode }) {
  if (mode === "photo") return null;
  const legend = MODE_LEGEND[mode];
  return (
    <div className="flex items-center gap-2 rounded-lg bg-black/60 px-2.5 py-1.5 backdrop-blur-md">
      <span className="text-[10px] font-semibold text-white/70">{legend.lowLabel}</span>
      <div
        className="h-1.5 w-24 rounded-full"
        style={{
          background: `linear-gradient(to right, ${legend.low}, ${legend.mid}, ${legend.high})`,
        }}
      />
      <span className="text-[10px] font-semibold text-white/70">{legend.highLabel}</span>
    </div>
  );
}

function ModeSwitcher({
  mode,
  satelliteAvailable,
  photoLoading,
  onSelect,
}: {
  mode: Mode;
  satelliteAvailable: boolean;
  photoLoading: boolean;
  onSelect: (mode: Mode) => void;
}) {
  const items: {
    value: Mode;
    label: string;
    icon: typeof Mountain;
    satellite?: boolean;
    loading?: boolean;
  }[] = [
    { value: "slope", label: "Pente", icon: Mountain },
    { value: "ndvi", label: "NDVI", icon: Satellite, satellite: true },
    { value: "ndwi", label: "NDWI", icon: Waves, satellite: true },
    { value: "ndmi", label: "NDMI", icon: Droplets, satellite: true },
    { value: "photo", label: "Orthophoto", icon: Image, loading: photoLoading },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(({ value, label, icon: Icon, satellite, loading }) => {
        const disabled = (satellite && !satelliteAvailable) || loading;
        const active = mode === value;
        return (
          <button
            key={value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            title={
              satellite && !satelliteAvailable
                ? "Disponible uniquement avec des données Sentinel-2"
                : undefined
            }
            onClick={() => onSelect(value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all",
              active
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground",
              disabled && "pointer-events-none opacity-40",
            )}
          >
            <Icon className={cn("h-4 w-4", loading && "animate-spin")} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

function StatsPanel({ data }: { data: ReliefGrid }) {
  const stats = [
    {
      icon: Ruler,
      label: "Résolution",
      value: `${data.resolution_relief_m} m`,
      hint: data.source_relief,
    },
    {
      icon: TrendingUp,
      label: "Pente moyenne",
      value: `${data.stats_pente.moyenne_pct.toFixed(1)} %`,
      hint: `max ${data.stats_pente.max_pct.toFixed(1)} %`,
    },
    {
      icon: Satellite,
      label: "NDVI moyen",
      value: fmt(data.stats_ndvi.moyen),
      hint: data.satellite_available ? "Sentinel-2" : "Indisponible",
    },
    {
      icon: Waves,
      label: "NDWI moyen",
      value: fmt(data.stats_ndvi.ndwi_moyen),
      hint: data.satellite_available ? "Eau libre de surface (Sentinel-2)" : "Indisponible",
    },
    {
      icon: Droplets,
      label: "NDMI moyen",
      value: fmt(data.stats_ndvi.ndmi_moyen),
      hint: data.satellite_available ? "Sentinel-2" : "Indisponible",
    },
    {
      icon: Eye,
      label: "Pixels valides",
      value: `${data.stats_ndvi.couverture_pct} %`,
      hint: "couverture Sentinel",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {stats.map((s) => (
        <div key={s.label} className="rounded-lg border bg-card p-3">
          <div className="flex items-center gap-2">
            <s.icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
          </div>
          <div className="mt-1.5 text-lg font-bold text-foreground">{s.value}</div>
          <div className="text-xs text-muted-foreground/70" title={s.hint}>
            {s.hint}
          </div>
        </div>
      ))}
    </div>
  );
}

function SatelliteContext({ data, mode }: { data: ReliefGrid; mode: Mode }) {
  if (!data.satellite_available || mode === "slope" || mode === "photo") return null;

  const exactMeasurement =
    mode === "ndvi"
      ? `NDVI moyen ${fmt(data.stats_ndvi.moyen)} (de ${fmt(data.stats_ndvi.min)} à ${fmt(data.stats_ndvi.max)}). ${data.stats_ndvi.vegetation_faible_pct ?? "—"}% des pixels valides sont sous 0,20.`
      : mode === "ndwi"
        ? `NDWI moyen ${fmt(data.stats_ndvi.ndwi_moyen)} (de ${fmt(data.stats_ndvi.ndwi_min)} à ${fmt(data.stats_ndvi.ndwi_max)}). ${data.stats_ndvi.signal_eau_libre_pct ?? "—"}% des pixels valides dépassent 0,15, seuil de signal d’eau libre.`
        : `NDMI moyen ${fmt(data.stats_ndvi.ndmi_moyen)} (de ${fmt(data.stats_ndvi.ndmi_min)} à ${fmt(data.stats_ndvi.ndmi_max)}). ${data.stats_ndvi.humidite_vegetation_faible_pct ?? "—"}% des pixels valides sont négatifs.`;
  const farmerSummary =
    mode === "ndvi"
      ? `${data.stats_ndvi.vegetation_faible_pct ?? "—"}% de la parcelle présente un signal de végétation faible.`
      : mode === "ndwi"
        ? (data.stats_ndvi.signal_eau_libre_pct ?? 0) > 0
          ? `Signal d’eau libre détecté sur ${data.stats_ndvi.signal_eau_libre_pct}% de la parcelle.`
          : "Aucun signal d’eau libre détecté sur la parcelle."
        : `${data.stats_ndvi.humidite_vegetation_faible_pct ?? "—"}% de la parcelle présente un signal de végétation peu humide.`;
  const nextAction =
    mode === "ndvi"
      ? "À faire : allez d’abord dans les zones rouges/brunes et vérifiez le stade de culture, les dégâts ou les manques de levée."
      : mode === "ndwi"
        ? (data.stats_ndvi.signal_eau_libre_pct ?? 0) > 0
          ? "À faire : vérifiez sur place les zones bleues : elles peuvent correspondre à de l’eau visible en surface (flaques, fossés ou zone inondée)."
          : "Conclusion : aucune zone n’atteint le seuil d’eau libre. Les nuances bleutées éventuelles indiquent seulement les zones relativement moins sèches, pas de l’eau confirmée."
        : "À faire : comparez les zones brunes avec l’irrigation récente et l’état réel des plantes.";

  return (
    <div className="rounded-lg border bg-sky-50/50 p-3 text-xs text-slate-700 dark:bg-sky-950/20 dark:text-slate-300">
      <p className="font-semibold text-foreground">Ce que la carte indique pour votre parcelle</p>
      <p className="mt-1 font-medium leading-relaxed text-foreground">{farmerSummary}</p>
      <p className="mt-1 leading-relaxed">{nextAction}</p>
      <p className="mt-2 text-muted-foreground">Mesure exacte : {exactMeasurement}</p>
      {mode === "ndwi" && (
        <p className="mt-2 text-muted-foreground">
          Le NDWI repère l’eau visible à la surface en comparant la lumière verte et l’infrarouge proche réfléchis par le sol et la végétation.
          Il peut révéler une flaque, un fossé, un étang ou une inondation, mais ne mesure ni l’eau contenue dans le sol ni le besoin d’irrigation.
        </p>
      )}
      <p className="mt-2 text-muted-foreground">
        Fiabilité : {data.stats_ndvi.couverture_pct}% de la parcelle a une image exploitable. Données Sentinel-2 sur les {data.periode_recherche},
        avec un détail de {data.resolution_satellite_m} m (NDVI/NDWI) et {data.resolution_ndmi_m} m (NDMI).
      </p>
    </div>
  );
}

function GeneralParcelConclusion({ data }: { data: ReliefGrid }) {
  const waterSignal = data.stats_ndvi.signal_eau_libre_pct ?? 0;
  const weakVegetation = data.stats_ndvi.vegetation_faible_pct ?? 0;
  const lowVegetationMoisture = data.stats_ndvi.humidite_vegetation_faible_pct ?? 0;
  const priorities = [
    weakVegetation > 0
      ? `Visiter d’abord les zones rouges/brunes du NDVI (${weakVegetation}% de signal végétal faible).`
      : "Aucune zone de végétation faible n’est signalée par le NDVI.",
    waterSignal > 0
      ? `Contrôler les zones bleues du NDWI (${waterSignal}% avec signal d’eau libre).`
      : "Aucune eau libre de surface n’est détectée par le NDWI.",
    lowVegetationMoisture > 50
      ? `Comparer les zones brunes du NDMI avec les apports d’eau récents (${lowVegetationMoisture}% avec signal peu humide).`
      : "Le NDMI ne montre pas une majorité de végétation avec signal peu humide.",
  ];

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
      <h3 className="text-sm font-semibold text-foreground">Bilan général de la parcelle</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Relief IGN : pente moyenne {data.stats_pente.moyenne_pct.toFixed(1)}%, maximum {data.stats_pente.max_pct.toFixed(1)}%.
        {data.satellite_available
          ? ` Données Sentinel exploitables sur ${data.stats_ndvi.couverture_pct}% de la parcelle.`
          : " Les indices satellite ne sont pas disponibles."}
      </p>
      {data.satellite_available && (
        <>
          <p className="mt-3 text-xs font-medium text-foreground">Priorités de contrôle sur le terrain</p>
          <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-muted-foreground">
            {priorities.map((priority) => (
              <li key={priority}>• {priority}</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Cette synthèse aide à décider où observer en premier ; elle ne remplace pas une vérification sur place avant une décision d’irrigation ou de traitement.
          </p>
        </>
      )}
    </div>
  );
}

export function Terrain3DDialog({
  open,
  onOpenChange,
  geometry,
  label,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  geometry: Record<string, unknown> | null;
  label?: string | null;
}) {
  const [data, setData] = useState<ReliefGrid | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<Mode>("slope");
  const [orthophoto, setOrthophoto] = useState<string | null>(null);
  const [photoLoading, setPhotoLoading] = useState(false);
  useEffect(() => {
    setData(null);
    setOrthophoto(null);
    setError(null);
    setMode("slope");
  }, [geometry]);
  useEffect(() => {
    if (!open) {
      setData(null);
      setOrthophoto(null);
      setError(null);
    }
  }, [open]);
  useEffect(() => {
    if (!open || !geometry || data || loading) return;
    setLoading(true);
    setError(null);
    void getReliefGrid(geometry)
      .then(setData)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Chargement du relief impossible."),
      )
      .finally(() => setLoading(false));
  }, [open, geometry, data, loading]);
  async function selectMode(next: Mode) {
    setMode(next);
    if (next !== "photo" || orthophoto || !geometry) return;
    setPhotoLoading(true);
    try {
      setOrthophoto((await getReliefOrthophoto(geometry)).image_base64);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Orthophoto indisponible.");
      setMode("slope");
    } finally {
      setPhotoLoading(false);
    }
  }
  const ModeIcon = MODE_ICON[mode];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,64rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        {/* Header — stays fixed while the body scrolls */}
        <div className="flex shrink-0 items-start justify-between gap-4 border-b px-6 py-4 pr-12">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <ModeIcon className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold">
                Analyse 3D — {label ?? "parcelle sélectionnée"}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {MODE_DESCRIPTION[mode]}
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Scrollable body: full-size 3D first, details below */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="flex flex-col gap-4 p-6 pb-8">
            {loading && (
              <div className="flex h-[min(62vh,560px)] shrink-0 flex-col items-center justify-center gap-4 rounded-xl border bg-[#0a0f0d]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <div className="text-center text-white">
                  <div className="font-medium">Génération du relief 3D…</div>
                  <div className="mt-1 text-sm text-white/70">
                    Chargement des données IGN et Sentinel-2
                  </div>
                </div>
              </div>
            )}

            {error && (
              <AlertBanner tone="danger" title="Analyse 3D">
                {error}
              </AlertBanner>
            )}

            {data && (
              <>
                {!data.satellite_available && (
                  <AlertBanner tone="warning" title="Indices NDVI, NDWI et NDMI non calculés">
                    Sentinel-2 exige `SENTINEL_HUB_CLIENT_ID` et `SENTINEL_HUB_CLIENT_SECRET` dans le
                    fichier `.env` racine. La pente et le relief IGN restent réels, mais aucun indice
                    satellite n'est affiché sans ces données.
                  </AlertBanner>
                )}

                <div className="shrink-0">
                  <ModeSwitcher
                    mode={mode}
                    satelliteAvailable={data.satellite_available}
                    photoLoading={photoLoading}
                    onSelect={(next) => void selectMode(next)}
                  />
                </div>

                {/* Fixed-height 3D stage — never compressed by the details below */}
                <div className="relative h-[min(62vh,560px)] w-full shrink-0 overflow-hidden rounded-xl border bg-[#0a0f0d]">
                  <TerrainCanvas data={data} mode={mode} orthophoto={orthophoto} />

                  <div className="pointer-events-none absolute left-3 top-3">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-md">
                      <ModeIcon className="h-3 w-3" />
                      {MODE_TITLE[mode]}
                    </span>
                  </div>

                  {mode !== "slope" && mode !== "photo" && (
                    <div className="pointer-events-none absolute right-3 top-3 rounded-md bg-black/60 px-2 py-1 text-[11px] font-medium text-white/85 backdrop-blur-md">
                      Sentinel-2 ·{" "}
                      {mode === "ndmi" ? data.resolution_ndmi_m : data.resolution_satellite_m} m ·{" "}
                      {data.stats_ndvi.couverture_pct}% valide
                    </div>
                  )}

                  <div className="pointer-events-none absolute right-3 top-10 rounded-md bg-black/60 px-2 py-1 text-[11px] font-medium text-white/75 backdrop-blur-md">
                    Relief ×{RELIEF_VISUAL_EXAGGERATION} pour la lecture
                  </div>

                  <div className="pointer-events-none absolute bottom-3 left-3">
                    <ColorLegend mode={mode} />
                  </div>

                  <div className="pointer-events-none absolute bottom-3 right-3 flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-white/60 backdrop-blur-md">
                    <Rotate3d className="h-3 w-3" />
                    <ZoomIn className="h-3 w-3" />
                    <Move3d className="h-3 w-3" />
                  </div>
                </div>

                <StatsPanel data={data} />
                <SatelliteContext data={data} mode={mode} />

                {/* Info */}
                {data.warnings.length > 0 && (
                  <div className="space-y-1.5 rounded-lg bg-muted/30 p-3">
                    <p className="hidden">
                      Zones grises : données Sentinel-2 masquées (nuages, ombres, neige ou hors données)
                      — aucune valeur n'est inventée.
                    </p>
                    {data.warnings.map((warning) => (
                      <p
                        key={warning}
                        className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"
                      >
                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                        {warning}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
