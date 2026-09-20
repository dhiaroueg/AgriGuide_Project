import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { Reveal } from "@/components/motion/Reveal";
import { cn } from "@/lib/utils";
import { MapPicker } from "@/components/MapPicker";
import { TerrainMap3D } from "@/components/TerrainMap3D";
import { AlertBanner } from "@/components/AlertBanner";
import { ReportMarkdown } from "@/components/ReportMarkdown";
import { AgricultureChatWidget } from "@/components/AgricultureChatWidget";
import { PageTour } from "@/components/onboarding/PageTour";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Sprout,
  Droplets,
  FlaskConical,
  Sun,
  ChevronRight,
  Satellite,
  Layers,
  Info,
  TrendingUp,
  MapPin,
  Ruler,
  Loader2,
  FileText,
  Bug,
  Leaf,
  CheckCircle2,
  CircleSlash,
  Users,
  BookmarkPlus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Box,
  ArrowRight,
} from "lucide-react";
import { getCropVisual, scoreTone } from "@/lib/cropVisual";
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SKIP_AUTH, useAuth } from "@/lib/auth-context";
import { centroid, type LatLng } from "@/lib/terrain";
import {
  addTerrain,
  deleteTerrain,
  fetchMe,
  AuthApiError,
} from "@/lib/authApi";
import {
  resolveParcel,
  getNeighbors,
  getNdviHeatmap,
  fetchSatelliteTimeline,
  analyzeParcel,
  buildChatContext,
  AgricultureApiError,
  type AnalyzeResponse,
  type SoilData,
  type VegetationData,
  type AgroCalcEstimate,
  type YieldEstimate,
  type NeighborCropContext,
  type CropRecommendationOut,
  type ParcelResolution,
  type SatelliteIndexType,
  type SatelliteTimelineResponse,
} from "@/lib/agricultureApi";
import { saveRealCropRecommendations, cultureLabel } from "@/lib/cropRecommendations";
import { CropWasteValorization } from "@/components/CropWasteValorization";
import { SatelliteTimelineControl } from "@/components/SatelliteTimelineControl";
import { CarbonCreditDialog } from "@/components/CarbonCreditDialog";
import { VraModulationDialog } from "@/components/VraModulationDialog";

const Terrain3DDialog = lazy(() =>
  import("@/components/Terrain3DDialog").then((module) => ({ default: module.Terrain3DDialog })),
);

type GeoPolygon =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

/** Convertit un contour terrain [lat,lng] en GeoJSON Polygon [lng,lat] pour la carte. */
function pointsToPolygon(points: LatLng[]): GeoPolygon | null {
  if (points.length < 3) return null;
  const ring = points.map(([lat, lng]) => [lng, lat]);
  const [fLng, fLat] = ring[0];
  const [lLng, lLat] = ring[ring.length - 1];
  if (fLng !== lLng || fLat !== lLat) ring.push([fLng, fLat]);
  return { type: "Polygon", coordinates: [ring] };
}

/** Extrait l'anneau extérieur d'une géométrie cadastre/RPG → points [lat,lng] pour l'API auth. */
function geometryToPoints(geometry: Record<string, unknown> | null | undefined): LatLng[] | null {
  if (!geometry || typeof geometry.type !== "string") return null;
  let ring: number[][] | undefined;
  if (geometry.type === "Polygon") {
    ring = (geometry.coordinates as number[][][])?.[0];
  } else if (geometry.type === "MultiPolygon") {
    ring = (geometry.coordinates as number[][][][])?.[0]?.[0];
  }
  if (!ring || ring.length < 3) return null;
  const points: LatLng[] = ring.map(([lng, lat]) => [lat, lng]);
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] === last[0] && first[1] === last[1]) points.pop();
  return points.length >= 3 ? points : null;
}

export const Route = createFileRoute("/agriculture")({
  head: () => ({
    meta: [
      { title: "Conseiller Agricole - AgriMent" },
      { name: "description", content: "Analyse du sol, données satellite et top 5 des cultures recommandées pour votre parcelle." },
      { property: "og:title", content: "Conseiller Agricole - AgriMent" },
      { property: "og:description", content: "Découvrez les cultures les plus adaptées à votre terrain." },
    ],
  }),
  component: Page,
});

/** Nom lisible pour un code culture (RPG ou clé interne), avec repli sur la même règle que `taxonomy.get_display_name` côté backend. */
function displayCrop(code: string | null | undefined): string {
  if (!code) return "Non renseignée";
  const known = cultureLabel(code);
  if (known !== code) return known;
  return code.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function phQualifier(ph: number): string {
  if (ph < 5.5) return "acide";
  if (ph < 6.5) return "légèrement acide";
  if (ph <= 7.5) return "neutre";
  return "basique";
}

function fmtPct(v: number | null): string {
  return v === null ? "?" : `${v.toFixed(0)}%`;
}

function labelizeKey(key: string): string {
  const label = key.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "N/A";
  if (typeof value === "number") return value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  return String(value);
}

const FACTOR_LABELS: Record<string, string> = {
  ph: "pH du sol",
  temp: "Température",
  nitrogen: "Azote du sol",
  cec: "Capacité d'échange cationique",
  precip: "Précipitations (prévision)",
  workability: "Praticabilité du sol",
};

/** Reconstruit la contribution de chaque facteur (poids × score, voir `ml_service.py`) pour expliquer un score sans dupliquer la logique de scoring côté frontend. */
function topContributingFactors(featureImportance: Record<string, unknown>, limit = 2): string[] {
  const weights = featureImportance.weights as Record<string, number> | undefined;
  if (!weights || typeof weights !== "object") return [];
  const contributions = Object.entries(weights)
    .map(([factor, weight]) => {
      const score = featureImportance[`${factor}_score`];
      if (typeof score !== "number" || typeof weight !== "number") return null;
      return { factor, contribution: score * weight };
    })
    .filter((x): x is { factor: string; contribution: number } => x !== null)
    .sort((a, b) => b.contribution - a.contribution);
  return contributions.slice(0, limit).map((c) => FACTOR_LABELS[c.factor] ?? c.factor);
}

function topNeighborCrops(neighbors: NeighborCropContext, limit = 3): string {
  const entries = Object.entries(neighbors.crop_distribution_pct).sort((a, b) => b[1] - a[1]).slice(0, limit);
  if (entries.length === 0) return "aucune donnée exploitable";
  return entries.map(([code, pct]) => `${displayCrop(code)} (${Math.round(pct)}%)`).join(", ");
}

/** Doit rester en phase avec le défaut `radius_m` de `POST /agriculture/parcel/neighbors` côté backend. */
const NEIGHBORS_RADIUS_M = 800;
const EXPLORE_VALUE = "__explore__";

function Page() {
  const navigate = useNavigate();
  const { user, token, setUser } = useAuth();
  const terrains = useMemo(() => user?.terrains ?? [], [user]);

  const [selectedTerrainId, setSelectedTerrainId] = useState<string | undefined>(terrains[0]?.id);
  /** "terrain" = sélection dans la liste ; "carte" = point cliqué (exploration). */
  const [selectionSource, setSelectionSource] = useState<"terrain" | "carte">(
    terrains.length > 0 ? "terrain" : "carte",
  );
  const [clickedPoint, setClickedPoint] = useState<[number, number] | null>(null);
  const [openCrop, setOpenCrop] = useState<CropRecommendationOut | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [savingTerrain, setSavingTerrain] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [terrainError, setTerrainError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showRelief3d, setShowRelief3d] = useState(false);
  const [mapView, setMapView] = useState<"2d" | "3d">("2d");
  const [ndviOverlay, setNdviOverlay] = useState<{
    imageBase64: string;
    bounds: { south: number; west: number; north: number; east: number };
  } | null>(null);
  const [ndviLoading, setNdviLoading] = useState(false);
  const [ndviError, setNdviError] = useState<string | null>(null);
  const [showCarbonDialog, setShowCarbonDialog] = useState(false);
  const [showVraDialog, setShowVraDialog] = useState(false);

  useEffect(() => {
    if (!selectedTerrainId && terrains[0]) {
      setSelectedTerrainId(terrains[0].id);
      setSelectionSource("terrain");
    }
  }, [terrains, selectedTerrainId]);

  const selectedTerrain = terrains.find((t) => t.id === selectedTerrainId) ?? null;
  const terrainCentroid = selectedTerrain ? centroid(selectedTerrain.points) : null;

  const activePoint: [number, number] | null =
    selectionSource === "terrain" && terrainCentroid
      ? terrainCentroid
      : selectionSource === "carte"
        ? clickedPoint
        : null;


  useEffect(() => {
    setNdviOverlay(null);
    setNdviError(null);
  }, [activePoint?.[0], activePoint?.[1]]);

  const previewQuery = useQuery({
    queryKey: ["agriculture-parcel-preview", activePoint?.[0], activePoint?.[1], selectionSource],
    queryFn: () => resolveParcel({ point: { lat: activePoint![0], lon: activePoint![1] } }),
    enabled: activePoint !== null,
    retry: false,
  });

  const neighborsQuery = useQuery({
    queryKey: ["agriculture-neighbors-preview", activePoint?.[0], activePoint?.[1]],
    queryFn: () => getNeighbors({ point: { lat: activePoint![0], lon: activePoint![1] } }, NEIGHBORS_RADIUS_M),
    enabled: activePoint !== null,
    retry: false,
  });

  const analyzeMutation = useMutation({
    mutationFn: analyzeParcel,
    onSuccess: (data) => {
      setShowReport(false);
      // Sauvegarde toujours les recommandations, même si terrain_id est null (mode SKIP_AUTH / exploration carte).
      saveRealCropRecommendations(data.terrain_id ?? null, data.crop_recommendations);
    },
  });

  const analysis: AnalyzeResponse | null = analyzeMutation.data ?? null;

  function handleSelectTerrain(value: string) {
    if (value === EXPLORE_VALUE) {
      setSelectionSource("carte");
      setSelectedTerrainId(undefined);
      return;
    }
    setSelectedTerrainId(value);
    setSelectionSource("terrain");
    setClickedPoint(null);
  }

  function handleMapPoint(point: [number, number]) {
    setClickedPoint(point);
    setSelectionSource("carte");
    setShowSaveForm(false);
    setTerrainError(null);
  }

  function handleAnalyze() {
    if (!activePoint) return;
    // The auth bypass exposes a visual demonstration terrain, but it is not
    // persisted in Postgres and therefore has no database UUID. Analyze its
    // centroid as a fresh map point instead of sending the placeholder id.
    if (selectionSource === "terrain" && selectedTerrain && !SKIP_AUTH) {
      analyzeMutation.mutate({
        point: { lat: activePoint[0], lon: activePoint[1] },
        terrain_id: selectedTerrain.id,
      });
      return;
    }
    analyzeMutation.mutate({ point: { lat: activePoint[0], lon: activePoint[1] } });
  }

  const terrainPolygon = selectionSource === "terrain" && selectedTerrain
    ? pointsToPolygon(selectedTerrain.points)
    : null;

  const overlayGeometry: GeoPolygon | null =
    terrainPolygon ??
    (selectionSource === "carte" && previewQuery.data?.geometry
      ? (previewQuery.data.geometry as unknown as GeoPolygon)
      : null);

  const neighborGeometries =
    neighborsQuery.data?.neighbors
      ? (neighborsQuery.data.neighbors.map((n) => n.geometry) as unknown as GeoPolygon[])
      : [];

  const mapCenter = activePoint ?? ([46.7, 2.5] as [number, number]);
  const mapZoom = activePoint ? 15 : 6;

  const selectValue =
    selectionSource === "terrain" && selectedTerrainId ? selectedTerrainId : EXPLORE_VALUE;

  const canSaveExplored =
    selectionSource === "carte" &&
    !!token &&
    !!previewQuery.data?.resolved &&
    !!geometryToPoints(previewQuery.data.geometry);

  async function handleSaveTerrain() {
    if (!token || !previewQuery.data?.resolved) return;
    const points = geometryToPoints(previewQuery.data.geometry);
    if (!points) {
      setTerrainError("Contour cadastral introuvable - impossible d'enregistrer ce terrain.");
      return;
    }
    const nom = saveName.trim() || previewQuery.data.parcel_id || "Ma parcelle";
    setSavingTerrain(true);
    setTerrainError(null);
    try {
      const created = await addTerrain(token, {
        nom,
        points,
        superficie_ha: previewQuery.data.area_ha ?? undefined,
      });
      const me = await fetchMe(token);
      setUser(me);
      setSelectedTerrainId(created.id);
      setSelectionSource("terrain");
      setClickedPoint(null);
      setShowSaveForm(false);
      setSaveName("");
    } catch (err) {
      setTerrainError(err instanceof AuthApiError ? err.message : "Impossible d'enregistrer ce terrain.");
    } finally {
      setSavingTerrain(false);
    }
  }

  async function handleDeleteTerrain(terrainId: string) {
    if (!token) return;
    setDeletingId(terrainId);
    setTerrainError(null);
    try {
      await deleteTerrain(token, terrainId);
      const me = await fetchMe(token);
      setUser(me);
      if (selectedTerrainId === terrainId) {
        setSelectedTerrainId(me.terrains[0]?.id);
        setSelectionSource(me.terrains[0] ? "terrain" : "carte");
      }
    } catch (err) {
      setTerrainError(err instanceof AuthApiError ? err.message : "Impossible de supprimer ce terrain.");
    } finally {
      setDeletingId(null);
    }
  }

  const [showSatelliteTimeline, setShowSatelliteTimeline] = useState(false);
  const [satelliteType, setSatelliteType] = useState<SatelliteIndexType>("ndvi");
  const [satelliteMonthIndex, setSatelliteMonthIndex] = useState(11);
  const [satelliteComparePrior, setSatelliteComparePrior] = useState(false);
  const [satelliteData, setSatelliteData] = useState<SatelliteTimelineResponse | null>(null);
  const [satelliteLoading, setSatelliteLoading] = useState(false);
  const [satelliteError, setSatelliteError] = useState<string | null>(null);

  async function loadSatelliteTimeline(
    geom?: Record<string, unknown> | null,
    type: SatelliteIndexType = satelliteType,
    monthIdx: number = satelliteMonthIndex,
    compare: boolean = satelliteComparePrior,
  ) {
    const targetGeom = geom ?? overlayGeometry;
    let finalGeom = targetGeom;

    if (!finalGeom && activePoint) {
      const d = 0.002;
      const [lat, lon] = activePoint;
      finalGeom = {
        type: "Polygon",
        coordinates: [
          [
            [lon - d, lat - d],
            [lon + d, lat - d],
            [lon + d, lat + d],
            [lon - d, lat + d],
            [lon - d, lat - d],
          ],
        ],
      };
    }

    if (!finalGeom) return;

    setSatelliteLoading(true);
    setSatelliteError(null);
    try {
      const targetDate = satelliteData?.timeline[monthIdx]?.date ?? null;
      const res = await fetchSatelliteTimeline(
        {
          geometry: finalGeom,
          index_type: type,
          target_date: targetDate,
          compare_year_prior: compare,
        },
        token,
      );

      setSatelliteData(res);
      if (res.image_base64 && res.bounds) {
        setNdviOverlay({ imageBase64: res.image_base64, bounds: res.bounds });
      }
    } catch (err) {
      setSatelliteError(
        err instanceof AgricultureApiError ? err.message : "Erreur lors du chargement satellite multi-temporel.",
      );
    } finally {
      setSatelliteLoading(false);
    }
  }

  function handleToggleSatelliteTimeline() {
    if (showSatelliteTimeline) {
      setShowSatelliteTimeline(false);
      setNdviOverlay(null);
    } else {
      setShowSatelliteTimeline(true);
      void loadSatelliteTimeline(overlayGeometry, satelliteType, satelliteMonthIndex, satelliteComparePrior);
    }
  }

  return (
    <AppShell>
      <PageHeader
        icon={Sprout}
        tone="harvest"
        title="Conseiller Agricole"
        subtitle="Cliquez une parcelle sur la carte, enregistrez-la, puis lancez l'analyse."
      />

      <Reveal from="up" delay={100} className="card-soft p-5 md:p-6 mt-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1 min-w-0">
            <Select value={selectValue} onValueChange={handleSelectTerrain}>
              <SelectTrigger className="sm:w-72 rounded-xl h-11">
                <SelectValue placeholder="Choisir un terrain" />
              </SelectTrigger>
              <SelectContent className="z-[1100]" position="popper">
                {terrains.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nom ?? "Terrain"} ({typeof t.superficie_ha === "number" ? t.superficie_ha.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) : "0"} ha)
                  </SelectItem>
                ))}
                <SelectItem value={EXPLORE_VALUE}>Explorer sur la carte</SelectItem>
              </SelectContent>
            </Select>
            {selectionSource === "terrain" && selectedTerrain && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-xl text-muted-foreground hover:text-destructive"
                disabled={deletingId === selectedTerrain.id}
                onClick={() => void handleDeleteTerrain(selectedTerrain.id)}
              >
                {deletingId === selectedTerrain.id ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-1.5" />
                )}
                Supprimer
              </Button>
            )}
          </div>
          <div className="lg:text-right max-w-sm">
            <div className="text-sm font-semibold">
              {selectionSource === "terrain" && selectedTerrain
                ? `Terrain « ${selectedTerrain.nom ?? "Terrain"} »`
                : "Cliquez sur votre parcelle"}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {selectionSource === "terrain" && selectedTerrain
                ? "Cliquez ailleurs pour explorer une autre parcelle."
                : "Cliquez sur une parcelle pour afficher son contour et ses voisins."}
            </p>
          </div>
        </div>

        {terrainError && (
          <AlertBanner tone="danger" title="Terrains">
            {terrainError}
          </AlertBanner>
        )}

        {mapView === "2d" ? (
          <div data-tour="agri-map">
          <MapPicker
          mode="point"
          onPoint={handleMapPoint}
          markerPosition={selectionSource === "carte" ? clickedPoint : terrainCentroid}
          overlayGeometry={overlayGeometry}
          neighborGeometries={neighborGeometries}
          center={mapCenter}
          zoom={mapZoom}
          height={440}
          showHint={false}
        
            ndviOverlay={ndviOverlay}
          />
          </div>
        ) : (
          <div data-tour="agri-map">
          <TerrainMap3D center={mapCenter} overlayGeometry={overlayGeometry} height={440} />
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setMapView((v) => (v === "2d" ? "3d" : "2d"))}>
            <Box className="h-4 w-4 mr-1.5" />
            {mapView === "2d" ? "Vue 3D du terrain" : "Retour à la carte 2D"}
          </Button>

          {mapView === "2d" && activePoint && (
            <Button
              variant={showSatelliteTimeline ? "default" : "outline"}
              size="sm"
              disabled={satelliteLoading}
              onClick={handleToggleSatelliteTimeline}
              className={cn(
                "rounded-xl transition-all duration-300",
                showSatelliteTimeline && "bg-primary text-primary-foreground shadow-sm"
              )}
            >
              {satelliteLoading ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Satellite className="h-4 w-4 mr-1.5 text-emerald-400" />
              )}
              {showSatelliteTimeline
                ? "Masquer l'imagerie satellite"
                : "Analyse Satellite Multi-Temporelle & Stress Eau"}
            </Button>
          )}

          {satelliteError && <span className="text-xs text-destructive">{satelliteError}</span>}
        </div>

        {/* Satellite Multi-Temporal Timeline & Health Index Control */}
        {showSatelliteTimeline && (
          <div className="mt-3 animate-in fade-in slide-in-from-top-2 duration-300">
            <SatelliteTimelineControl
              data={satelliteData}
              isLoading={satelliteLoading}
              activeType={satelliteType}
              selectedMonthIndex={satelliteMonthIndex}
              isComparePriorYear={satelliteComparePrior}
              onTypeChange={(type) => {
                setSatelliteType(type);
                void loadSatelliteTimeline(overlayGeometry, type, satelliteMonthIndex, satelliteComparePrior);
              }}
              onMonthIndexChange={(idx) => {
                setSatelliteMonthIndex(idx);
                void loadSatelliteTimeline(overlayGeometry, satelliteType, idx, satelliteComparePrior);
              }}
              onCompareToggle={(compare) => {
                setSatelliteComparePrior(compare);
                void loadSatelliteTimeline(overlayGeometry, satelliteType, satelliteMonthIndex, compare);
              }}
              onClose={() => {
                setShowSatelliteTimeline(false);
                setNdviOverlay(null);
              }}
            />
          </div>
        )}

        {activePoint && (
          <div className="space-y-4">
            {previewQuery.isPending && (
              <div className="rounded-2xl border border-border bg-secondary/40 p-4">
                <Skeleton className="h-5 w-2/3" />
              </div>
            )}
            {previewQuery.isError && (
              <div className="rounded-2xl border border-border bg-secondary/40 p-4">
                <p className="text-sm text-destructive">Impossible de résoudre la parcelle à ce point.</p>
              </div>
            )}
            {(previewQuery.data || (selectionSource === "terrain" && selectedTerrain)) && (
              <>
                <div className="grid gap-4 lg:grid-cols-2">
                  {previewQuery.data ? (
                    <ParcelInfoCard
                      parcel={previewQuery.data}
                      overrideAreaHa={
                        selectionSource === "terrain" ? selectedTerrain?.superficie_ha ?? null : null
                      }
                      overrideLabel={
                        selectionSource === "terrain" ? selectedTerrain?.nom ?? null : null
                      }
                    />
                  ) : (
                    <div className="card-soft p-5 space-y-3">
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  )}
                  {neighborsQuery.isPending ? (
                    <div className="card-soft p-5 space-y-3">
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-16 w-full" />
                    </div>
                  ) : neighborsQuery.data ? (
                    <NeighborsPreviewCard neighbors={neighborsQuery.data} radiusM={NEIGHBORS_RADIUS_M} />
                  ) : null}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-end">
                  {overlayGeometry && (
                    <Button type="button" variant="outline" className="rounded-xl" onClick={() => setShowRelief3d(true)}>
                      <Box className="h-4 w-4 mr-2" />
                      Vue 3D
                    </Button>
                  )}
                  {canSaveExplored && !showSaveForm && (
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-xl"
                      onClick={() => {
                        setShowSaveForm(true);
                        setSaveName(
                          previewQuery.data?.crop_declared
                            ? `Parcelle ${previewQuery.data.crop_declared}`
                            : previewQuery.data?.parcel_id
                              ? `Réf. ${previewQuery.data.parcel_id}`
                              : "",
                        );
                      }}
            >
                      <BookmarkPlus className="h-4 w-4 mr-2" />
                      Enregistrer comme mon terrain
                    </Button>
                  )}
                  <Button
                    className="rounded-xl"
                    disabled={analyzeMutation.isPending}
                    onClick={handleAnalyze}
                    data-tour="agri-analyze"
                  >
                    {analyzeMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sprout className="h-4 w-4 mr-2" />
                    )}
                    {selectionSource === "terrain" && selectedTerrain
                      ? `Analyser ${selectedTerrain.nom ?? "ce terrain"}`
                      : "Analyser cette parcelle"}
                  </Button>
                </div>

                {showSaveForm && canSaveExplored && (
                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row gap-3 sm:items-end">
                    <div className="flex-1 min-w-0">
                      <label htmlFor="save-terrain-nom" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Nom du terrain
                      </label>
                      <Input
                        id="save-terrain-nom"
                        value={saveName}
                        onChange={(e) => setSaveName(e.target.value)}
                        placeholder="ex. Parcelle Nord"
                        className="mt-1.5 h-11 rounded-xl"
                        autoFocus
                      />
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        className="rounded-xl"
                        onClick={() => {
                          setShowSaveForm(false);
                          setSaveName("");
                        }}
                      >
                        Annuler
                      </Button>
                      <Button
                        type="button"
                        className="rounded-xl"
                        disabled={savingTerrain}
                        onClick={() => void handleSaveTerrain()}
                      >
                        {savingTerrain ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <BookmarkPlus className="h-4 w-4 mr-2" />}
                        Enregistrer
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Reveal>

      {analyzeMutation.isError && (
        <div className="mt-6">
          <AlertBanner tone="danger" title="L'analyse a échoué">
            {analyzeMutation.error instanceof AgricultureApiError
              ? analyzeMutation.error.message
              : "Une erreur inattendue est survenue."}
          </AlertBanner>
        </div>
      )}

      {analyzeMutation.isPending && (
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Reveal key={i} from="up" delay={i * 100} className="card-soft p-6 space-y-4">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </Reveal>
          ))}
        </div>
      )}

      {analysis && (
        <>
          {analysis.warnings.length > 0 && (
            <div className="mt-6 space-y-3">
              {analysis.warnings.map((w, i) => (
                <AlertBanner key={i} tone="warning" title="À noter">
                  {w}
                </AlertBanner>
              ))}
            </div>
          )}

          <div className="mt-8 grid gap-5 md:grid-cols-3">
            <SoilCard soil={analysis.soil} />
            <NdviCard vegetation={analysis.vegetation} />
            <SummaryCard analysis={analysis} />
          </div>

          {analysis.yield_estimate && (
            <YieldCard
              estimate={analysis.yield_estimate}
              cropCode={analysis.crop_recommendations[0]?.culture ?? null}
            />
          )}

          {analysis.agro_calc_top_crop && (
            <div className="mt-6">
              <AgroCalcCard
                estimate={analysis.agro_calc_top_crop}
                cropCode={analysis.crop_recommendations[0]?.culture ?? null}
              />
            </div>
          )}

          {/* AgTech Carbon & VRA Precision Modules */}
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="p-5 rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent flex flex-col justify-between space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-emerald-500 font-bold text-xs uppercase tracking-wider">
                  <Leaf className="w-4 h-4" />
                  Bilan Carbone & Crédits Agricoles
                </div>
                <h3 className="text-lg font-bold text-foreground">Stockage de Carbone du Sol</h3>
                <p className="text-xs text-muted-foreground">
                  Simulez la séquestration de CO₂ de votre sol selon vos pratiques (semis direct, couverts) et valorisez financièrement vos crédits carbone.
                </p>
              </div>
              <Button
                onClick={() => setShowCarbonDialog(true)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-2 h-10 text-xs w-full sm:w-auto"
              >
                <Leaf className="w-4 h-4" />
                Estimer les Crédits Carbone
              </Button>
            </div>

            <div className="p-5 rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent flex flex-col justify-between space-y-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-blue-500 font-bold text-xs uppercase tracking-wider">
                  <Layers className="w-4 h-4" />
                  Modulation d'Azote VRA (Agriculture de Précision)
                </div>
                <h3 className="text-lg font-bold text-foreground">Cartes de Prescription Engrais</h3>
                <p className="text-xs text-muted-foreground">
                  Générez une carte d'épandage d'azote modulée par zones satellite NDVI pour économiser les intrants et exporter vers votre tracteur.
                </p>
              </div>
              <Button
                onClick={() => setShowVraDialog(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl gap-2 h-10 text-xs w-full sm:w-auto"
              >
                <Layers className="w-4 h-4" />
                Générer la Carte VRA
              </Button>
            </div>
          </div>

          <div className="mt-10">
            <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
              <div>
                <h2 className="font-display text-3xl font-semibold">Top {analysis.crop_recommendations.length} cultures recommandées</h2>
                <p className="text-muted-foreground mt-1">Classées par compatibilité avec le sol et le climat local.</p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                {analysis.report && (
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => setShowReport((v) => !v)}
                  >
                    {showReport ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                    {showReport ? "Masquer le rapport" : "Afficher le rapport"}
                    {showReport ? <ChevronUp className="h-4 w-4 ml-1" /> : <ChevronDown className="h-4 w-4 ml-1" />}
                  </Button>
                )}
                <Button
                  className="rounded-xl gap-2"
                  onClick={() => navigate({ to: "/business" })}
                >
                  <TrendingUp className="h-4 w-4" />
                  Conseiller Financier
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {analysis.crop_recommendations.map((c) => (
                <CropCard key={c.culture} crop={c} onDetails={() => setOpenCrop(c)} />
              ))}
            </div>

            <CropWasteValorization 
              cultures={analysis.crop_recommendations.map((c) => c.culture)}
            />

            {/* CTA banner — redirige vers le Conseiller Financier */}
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-6 py-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-sm">Prêt pour l'étude financière ?</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Vos {analysis.crop_recommendations.length} cultures recommandées sont prêtes à être simulées.
                  </p>
                </div>
              </div>
              <Button
                className="rounded-xl shrink-0 gap-2 h-11 px-6"
                onClick={() => navigate({ to: "/business" })}
              >
                <TrendingUp className="h-4 w-4" />
                Aller au Conseiller Financier
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {showReport && analysis.report && (
            <div className="mt-8 card-soft p-6 md:p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="h-11 w-11 rounded-2xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-display text-xl font-semibold">
                    Rapport
                    {(analysis.report.parcel_id ?? analysis.parcel.parcel_id) &&
                      ` - Réf. ${analysis.report.parcel_id ?? analysis.parcel.parcel_id}`}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Généré le {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                  </div>
                </div>
              </div>
              <ReportMarkdown markdown={analysis.report.report_markdown} />
              {analysis.report.unverified_figures.length > 0 && (
                <div className="mt-6 rounded-2xl bg-waste/10 border border-waste/30 p-4">
                  <div className="text-xs font-semibold text-waste-foreground uppercase tracking-wide">Chiffres non vérifiés à relire</div>
                  <ul className="mt-2 list-disc pl-5 text-sm space-y-1">
                    {analysis.report.unverified_figures.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <img
                  src="/LABEL_AI%20GENERATED_black%20transparent.png"
                  alt="Contenu généré par IA"
                  className="h-16 w-auto"
                />
              </div>
            </div>
          )}

          {/* Carbon Credit Dialog */}
          <CarbonCreditDialog
            open={showCarbonDialog}
            onOpenChange={setShowCarbonDialog}
            areaHa={analysis.parcel.area_ha ?? 10}
            clayPct={analysis.soil.clay_pct}
            soilCarbonGKg={analysis.soil.organic_carbon_g_kg}
          />

          {/* VRA Fertilizer Modulation Dialog */}
          <VraModulationDialog
            open={showVraDialog}
            onOpenChange={setShowVraDialog}
            geometry={analysis.parcel.geometry ?? previewQuery.data?.geometry ?? { type: "Point", coordinates: [0, 0] }}
            areaHa={analysis.parcel.area_ha ?? 10}
            cropDeclared={analysis.parcel.crop_declared}
          />
        </>
      )}

      <Dialog open={!!openCrop} onOpenChange={(v) => !v && setOpenCrop(null)}>
        <DialogContent className="rounded-3xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">{openCrop ? displayCrop(openCrop.culture) : ""}</DialogTitle>
            <DialogDescription>Besoins estimés par hectare, calculés pour cette parcelle.</DialogDescription>
          </DialogHeader>
          {openCrop && (
            <div className="grid gap-3 mt-2">
              <NeedsSection title="Irrigation" icon={Droplets} data={openCrop.besoins_irrigation} />
              <NeedsSection title="Engrais azotés" icon={FlaskConical} data={openCrop.besoins_engrais} />
              <NeedsSection title="Pesticides" icon={Bug} data={openCrop.besoins_pesticides} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Suspense fallback={null}>
        <Terrain3DDialog
          open={showRelief3d}
          onOpenChange={setShowRelief3d}
          geometry={overlayGeometry as Record<string, unknown> | null}
          label={selectedTerrain?.nom ?? previewQuery.data?.parcel_id}
        />
      </Suspense>

      <AgricultureChatWidget parcelContext={buildChatContext(analysis)} />
      <PageTour tourId="agriculture" />
    </AppShell>
  );
}

function SoilCard({ soil }: { soil: SoilData }) {
  const rows: { label: string; value: ReactNode }[] = [];
  if (soil.ph !== null) rows.push({ label: "pH", value: `${soil.ph.toFixed(1)} - ${phQualifier(soil.ph)}` });
  if (soil.organic_carbon_g_kg !== null) rows.push({ label: "Matière organique", value: `${soil.organic_carbon_g_kg.toFixed(1)} g/kg` });
  if (soil.nitrogen_g_kg !== null) rows.push({ label: "Azote total", value: `${soil.nitrogen_g_kg.toFixed(2)} g/kg` });
  if (soil.cec_cmolkg !== null) {
    rows.push({ label: "Capacité d'échange cationique", value: `${soil.cec_cmolkg.toFixed(1)} cmol+/kg` });
  }
  if (soil.bulk_density_kg_dm3 !== null) rows.push({ label: "Densité apparente", value: `${soil.bulk_density_kg_dm3.toFixed(2)} kg/dm³` });
  if (soil.coarse_fragments_pct !== null) rows.push({ label: "Éléments grossiers", value: `${soil.coarse_fragments_pct.toFixed(0)}%` });

  const hasTexture = soil.clay_pct !== null || soil.sand_pct !== null || soil.silt_pct !== null;

  const unavailable = rows.length === 0 && !hasTexture;
  return (
    <section className="border border-border bg-card p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Layers className="h-4 w-4" /></span>
          <div><p className="font-display text-lg font-bold tracking-tight">Sol</p><p className="text-xs text-muted-foreground">Propriétés cartographiées</p></div>
        </div>
        <span className={unavailable ? "text-xs font-semibold text-amber-700" : "text-xs font-semibold text-primary"}>{unavailable ? "À compléter" : "Disponible"}</span>
      </div>
      {unavailable ? (
        <div className="mt-5 border-l-2 border-amber-400 bg-amber-50 px-3 py-3">
          <p className="text-sm font-semibold text-amber-950">Donnée de sol indisponible</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/75">{soil.warning ?? "Le service cartographique ne répond pas pour cette parcelle."}</p>
          <p className="mt-2 text-xs font-medium text-amber-900">À faire: utilisez un prélèvement de sol avant de valider la fertilisation.</p>
        </div>
      ) : (
        <div className="mt-5">
          {hasTexture && <div className="grid grid-cols-3 gap-2 border-b border-border pb-4 text-center text-xs"><SoilSlice label="Argile" value={fmtPct(soil.clay_pct)} /><SoilSlice label="Sable" value={fmtPct(soil.sand_pct)} /><SoilSlice label="Limon" value={fmtPct(soil.silt_pct)} /></div>}
          <div className="mt-4 grid gap-x-5 gap-y-3 sm:grid-cols-2 text-sm">
            {rows.map((r) => <div key={r.label} className="flex items-start justify-between gap-3 border-b border-border/70 pb-2"><span className="text-muted-foreground">{r.label}</span><span className="font-semibold text-right">{r.value}</span></div>)}
          </div>
        </div>
      )}
      <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">Source: {soil.source === "soilgrids" ? "SoilGrids (ISRIC), donnée cartographiée" : "indisponible"}. Ce n’est pas une analyse de laboratoire.</p>
    </section>
  );
}

function SoilSlice({ label, value }: { label: string; value: string }) {
  return <div><p className="font-display text-lg font-bold text-foreground">{value}</p><p className="mt-0.5 text-muted-foreground">{label}</p></div>;
}

function NdviCard({ vegetation }: { vegetation: VegetationData }) {
  const unavailable = vegetation.source === "unavailable" || vegetation.mean_ndvi === null;
  const ndvi = vegetation.mean_ndvi ?? 0;
  const pct = Math.round(Math.min(1, Math.max(0, ndvi)) * 100);
  const label = ndvi < 0.2 ? "Sol nu / végétation clairsemée" : ndvi < 0.5 ? "Végétation modérée" : "Végétation dense et active";

  return (
    <section className="border border-border bg-card p-5 md:p-6">
      <div className="flex items-center gap-2"><span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-sky/15 text-sky"><Satellite className="h-4 w-4" /></span><div><p className="font-display text-lg font-bold tracking-tight">Végétation observée</p><p className="text-xs text-muted-foreground">Imagerie Sentinel-2 · NDVI</p></div></div>
      {unavailable ? <p className="mt-5 text-sm text-muted-foreground">{vegetation.warning ?? "Donnée satellite indisponible pour cette parcelle."}</p> : <>
        <div className="mt-6 flex items-end justify-between gap-4"><div><p className="font-display text-5xl font-bold tracking-tight text-primary">{ndvi.toFixed(2)}</p><p className="mt-1 text-sm font-semibold">{label}</p></div><p className="max-w-28 text-right text-xs leading-relaxed text-muted-foreground">Indice de vigueur, pas un rendement.</p></div>
        <div className="mt-5 h-2 overflow-hidden bg-secondary"><div className="h-full bg-primary" style={{ width: `${pct}%` }} /></div>
        <div className="mt-2 flex justify-between text-[11px] text-muted-foreground"><span>Végétation faible</span><span>Végétation dense</span></div>
        {vegetation.observation_window_days !== null && <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">Observation sur {vegetation.observation_window_days} jours · {vegetation.valid_pixel_count ?? 0} pixels valides.</p>}
      </>}
    </section>
  );
}

function ParcelInfoCard({
  parcel,
  overrideAreaHa = null,
  overrideLabel = null,
}: {
  parcel: ParcelResolution;
  /** Surface du terrain déclaré (prioritaire sur la surface cadastrale au centroïde). */
  overrideAreaHa?: number | null;
  overrideLabel?: string | null;
}) {
  if (!parcel.resolved && overrideAreaHa === null) {
    return (
      <div className="card-soft p-5">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase mb-3">
          <MapPin className="h-4 w-4" /> Parcelle
        </div>
        <p className="text-sm text-muted-foreground">
          {parcel.warning ?? "Aucune parcelle cadastrale trouvée à cet endroit."}
        </p>
      </div>
    );
  }

  const ref = parcel.parcel_id ?? parcel.rpg_id_parcel;
  const sourceLabel = overrideLabel
    ? `Mon terrain - ${overrideLabel}`
    : parcel.source === "cadastre"
      ? "Cadastre (IGN)"
      : parcel.source === "rpg"
        ? "RPG"
        : "Tracé manuel";
  const areaHa = overrideAreaHa ?? parcel.area_ha;

  return (
    <div className="card-soft p-5">
      {ref && (
        <div className="text-xs font-semibold tracking-widest text-muted-foreground uppercase mb-3">Réf. {ref}</div>
      )}
      <div className="space-y-2.5 text-sm">
        <InfoRow icon={MapPin} label="Source" value={sourceLabel} />
        <InfoRow
          icon={Sprout}
          label="Statut"
          value={
            parcel.is_agricultural === true ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 text-primary px-2.5 py-0.5 text-xs font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" /> Terre agricole (RPG)
              </span>
            ) : parcel.is_agricultural === false ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-waste/15 text-waste-foreground px-2.5 py-0.5 text-xs font-semibold">
                <CircleSlash className="h-3.5 w-3.5" /> Non déclarée RPG
              </span>
            ) : (
              <span className="text-muted-foreground">Non vérifié</span>
            )
          }
        />
        <InfoRow icon={Leaf} label="Culture" value={displayCrop(parcel.crop_declared)} />
        <InfoRow
          icon={Ruler}
          label="Surface"
          value={areaHa !== null && areaHa !== undefined ? `${areaHa.toFixed(2)} ha` : "Inconnue"}
        />
      </div>
      {parcel.agricultural_note && parcel.is_agricultural === false && (
        <p className="mt-3 text-xs text-muted-foreground">{parcel.agricultural_note}</p>
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Droplets; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border pb-2.5 last:border-none last:pb-0">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" /> {label}
      </span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

function NeighborsPreviewCard({ neighbors, radiusM }: { neighbors: NeighborCropContext; radiusM: number }) {
  const entries = Object.entries(neighbors.crop_distribution_pct).sort((a, b) => b[1] - a[1]);

  return (
    <div className="card-soft p-5">
      <div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase mb-4">
        <Users className="h-4 w-4" />
        Cultures voisines - {neighbors.neighbor_count} parcelle{neighbors.neighbor_count > 1 ? "s" : ""} ({radiusM >= 1000 ? `${radiusM / 1000} km` : `${radiusM} m`})
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{neighbors.note}</p>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
          {entries.map(([crop, pct]) => (
            <div key={crop}>
              <div className="flex items-center justify-between gap-2 text-sm mb-1">
                <span className="truncate">{crop}</span>
                <span className="font-semibold text-primary shrink-0">{pct.toFixed(1)}%</span>
              </div>
              <Progress value={pct} className="h-1.5" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ analysis }: { analysis: AnalyzeResponse }) {
  const { parcel, dl_observation, neighbors } = analysis;
  return (
    <div className="rounded-3xl p-6 border border-border" style={{ background: "oklch(0.95 0.03 155)" }}>
      <div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        <Info className="h-4 w-4" />
        Résumé de la parcelle
      </div>
      <ul className="mt-4 space-y-2.5 text-sm">
        <li className="flex items-center gap-2">
          <Ruler className="h-4 w-4 text-primary shrink-0" />
          Surface : {parcel.area_ha ? `${parcel.area_ha.toFixed(2)} ha` : "inconnue"}
          {parcel.source !== "unresolved" && ` (source : ${parcel.source})`}
        </li>
        <li className="flex items-center gap-2">
          <Sun className="h-4 w-4 text-harvest shrink-0" />
          Culture déclarée (RPG) : {displayCrop(parcel.crop_declared)}
        </li>
        {parcel.is_agricultural === false && (
          <li className="flex items-center gap-2 text-destructive">
            <Info className="h-4 w-4 shrink-0" /> {parcel.agricultural_note ?? "Parcelle non reconnue comme agricole."}
          </li>
        )}
        {dl_observation.source !== "unavailable" && dl_observation.predicted_class_fr && (
          <li className="flex items-center gap-2">
            <Satellite className="h-4 w-4 text-sky shrink-0" />
            Culture observée par IA (satellite) : {dl_observation.predicted_class_fr}
            {dl_observation.confidence !== null && ` (confiance ${Math.round(dl_observation.confidence * 100)}%)`}
          </li>
        )}
        {neighbors && neighbors.neighbor_count > 0 && (
          <li className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary shrink-0" />
            Voisinage ({neighbors.neighbor_count} parcelles) : {topNeighborCrops(neighbors)}
          </li>
        )}
      </ul>
    </div>
  );
}

function AgroCalcCard({ estimate, cropCode }: { estimate: AgroCalcEstimate; cropCode: string | null }) {
  return (
    <section className="mt-6 border-y border-border/70 py-6 md:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Repères de campagne</p><h2 className="mt-1 font-display text-2xl font-bold tracking-tight">Fertilisation et irrigation · {displayCrop(cropCode)}</h2></div><p className="max-w-sm text-sm text-muted-foreground">Des repères à ajuster avec les observations de la parcelle.</p></div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <AgroMetric icon={FlaskConical} label="Azote à prévoir" value={estimate.n_dose_kg_ha !== null ? `${formatValue(estimate.n_dose_kg_ha)} kg N/ha` : "Non disponible"} note="À confirmer avec un reliquat azoté et l’historique de la parcelle." />
        <AgroMetric icon={Droplets} label="Eau à surveiller" value={estimate.irrigation_need_mm !== null ? `${formatValue(estimate.irrigation_need_mm)} mm` : "Non disponible"} note={estimate.irrigation_window_days ? `Sur les ${estimate.irrigation_window_days} prochains jours.` : "Fenêtre de prévision non disponible."} />
      </div>
      {(estimate.n_method_note || estimate.irrigation_method_note) && <details className="mt-5 border-t border-border pt-4"><summary className="cursor-pointer text-sm font-semibold text-muted-foreground">Comprendre le calcul et ses limites</summary><p className="mt-3 max-w-4xl text-xs leading-relaxed text-muted-foreground">{estimate.n_method_note} {estimate.irrigation_method_note}</p></details>}
      {estimate.warning && <p className="mt-3 border-l-2 border-amber-400 pl-3 text-xs leading-relaxed text-amber-800">{estimate.warning}</p>}
    </section>
  );
}

function AgroMetric({ icon: Icon, label, value, note }: { icon: typeof Droplets; label: string; value: string; note: string }) {
  return <div className="border border-border bg-card p-5"><Icon className="h-5 w-5 text-primary" /><p className="mt-4 text-sm text-muted-foreground">{label}</p><p className="mt-1 font-display text-3xl font-bold tracking-tight">{value}</p><p className="mt-3 text-xs leading-relaxed text-muted-foreground">{note}</p></div>;
}

function CropCard({ crop, onDetails }: { crop: CropRecommendationOut; onDetails: () => void }) {
  const factors = topContributingFactors(crop.feature_importance);
  const nDose = crop.besoins_engrais?.n_dose_kg_ha;
  const cropLabel = displayCrop(crop.culture);
  const { icon: CropIcon, bg: iconBg, fg: iconFg } = getCropVisual(cropLabel);
  const tone = scoreTone(crop.score_compatibilite);
  return (
    <div className="card-soft p-6 flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex gap-3">
          <div
            className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: iconBg, color: iconFg }}
          >
            <CropIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-harvest tracking-wide">#{crop.rang}</div>
            <div className="font-display text-2xl font-semibold mt-1">{cropLabel}</div>
            {factors.length > 0 && (
              <p className="text-sm text-muted-foreground mt-2">Facteurs favorables : {factors.join(", ")}</p>
            )}
          </div>
        </div>
        <div
          className="h-14 w-14 rounded-full flex items-center justify-center font-display text-xl font-semibold shrink-0"
          style={{ background: tone.bg, color: tone.fg }}
        >
          {Math.round(crop.score_compatibilite)}
        </div>
      </div>
      <div className="mt-5 pt-5 border-t border-border grid grid-cols-2 gap-4">
        <div>
          <div className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Cycle de culture</div>
          <div className="font-display text-lg mt-1">{crop.cycle_jours} jours</div>
        </div>
        <div>
          <div className="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase">Azote conseillé</div>
          <div className="font-display text-lg mt-1">{typeof nDose === "number" ? `${formatValue(nDose)} kg/ha` : "N/A"}</div>
        </div>
      </div>
      <Button variant="outline" size="sm" className="mt-5 rounded-xl self-start" onClick={onDetails}>
        Voir les besoins <ChevronRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );
}

function NeedsSection({ title, icon: Icon, data }: { title: string; icon: typeof Droplets; data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([k]) => k !== "warning" && k !== "note");
  const note = data.note as string | undefined;
  const warning = data.warning as string | undefined;
  return (
    <div className="rounded-2xl bg-secondary/50 p-4">
      <div className="flex items-center gap-2 text-sm font-semibold mb-2">
        <div className="h-8 w-8 rounded-xl bg-card flex items-center justify-center text-primary shrink-0">
          <Icon className="h-4 w-4" />
        </div>
        {title}
      </div>
      {entries.length === 0 && !warning ? (
        <p className="text-xs text-muted-foreground">Aucune donnée.</p>
      ) : (
        <div className="space-y-1.5 text-sm">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{labelizeKey(k)}</span>
              <span className="font-medium text-right">{formatValue(v)}</span>
            </div>
          ))}
        </div>
      )}
      {note && <p className="mt-2 text-xs text-muted-foreground italic">{note}</p>}
      {warning && <p className="mt-2 text-xs text-waste-foreground">{warning}</p>}
    </div>
  );
}

function Row({ icon: Icon, label, value }: { icon: typeof Droplets; label: string; value?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-secondary/50 p-4">
      <div className="h-10 w-10 rounded-xl bg-card flex items-center justify-center text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-medium">{value}</div>
      </div>
    </div>
  );
}

function YieldCard({ estimate, cropCode }: { estimate: YieldEstimate; cropCode: string | null }) {
  return (
    <section className="mt-6 grid gap-5 border-y border-border/70 py-6 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:py-8">
      <div><p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Projection indicative</p><h2 className="mt-1 font-display text-2xl font-bold tracking-tight">Rendement · {displayCrop(cropCode)}</h2><p className="mt-3 text-sm leading-relaxed text-muted-foreground">Un ordre de grandeur pour comparer les cultures, pas une promesse de récolte.</p></div>
      <div className="border-l-2 border-primary pl-5"><p className="text-sm text-muted-foreground">Rendement central estimé</p><p className="mt-1 font-display text-4xl font-bold tracking-tight text-primary">{estimate.yield_estimate_q_ha !== null ? `${formatValue(estimate.yield_estimate_q_ha)} q/ha` : "Non disponible"}</p>{estimate.yield_range_low_q_ha !== null && estimate.yield_range_high_q_ha !== null && <p className="mt-2 text-sm text-muted-foreground">Fourchette de travail: {formatValue(estimate.yield_range_low_q_ha)} à {formatValue(estimate.yield_range_high_q_ha)} q/ha</p>}</div>
      {estimate.method_note && <details className="md:col-span-2 border-t border-border pt-4"><summary className="cursor-pointer text-sm font-semibold text-muted-foreground">Origine de cette estimation</summary><p className="mt-3 text-xs leading-relaxed text-muted-foreground">{estimate.method_note}</p></details>}
      {estimate.warning && <p className="md:col-span-2 border-l-2 border-amber-400 pl-3 text-xs text-amber-800">{estimate.warning}</p>}
    </section>
  );
}
