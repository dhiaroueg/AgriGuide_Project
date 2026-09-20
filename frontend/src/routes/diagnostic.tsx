import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { Reveal } from "@/components/motion/Reveal";
import { Button } from "@/components/ui/button";
import {
  fetchDiagnosticSamples,
  scanPlantImage,
  type DiagnosticResponse,
  type DiagnosticSample,
} from "@/lib/diagnosticApi";
import {
  Camera,
  UploadCloud,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Bug,
  Leaf,
  ShieldCheck,
  CloudSun,
  MapPin,
  ArrowRight,
  Loader2,
  RefreshCw,
  ExternalLink,
  HelpCircle,
  FileCheck,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/diagnostic")({
  head: () => ({
    meta: [
      { title: "Agent Diagnostic & Scanner Phytosanitaire - AgriGuide" },
      {
        name: "description",
        content: "Scanner IA de diagnostic des maladies des plantes et ravageurs agricoles.",
      },
    ],
  }),
  component: DiagnosticPage,
});

function DiagnosticPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activeSampleId, setActiveSampleId] = useState<string | null>("sample_rouille_ble");
  const [cropContext, setCropContext] = useState<string>("Blé Tendre");

  // Fetch sample test images
  const { data: samples, isLoading: loadingSamples } = useQuery({
    queryKey: ["diagnostic_samples"],
    queryFn: fetchDiagnosticSamples,
  });

  // Scan mutation
  const {
    mutate: runScan,
    data: scanResult,
    isPending: isScanning,
  } = useMutation({
    mutationFn: scanPlantImage,
    onSuccess: () => {
      toast.success("Analyse phytosanitaire terminée avec succès !");
    },
    onError: () => {
      toast.error("Erreur lors de l'analyse. Veuillez réessayer.");
    },
  });

  // Trigger default initial scan with sample 1 on mount
  useEffect(() => {
    runScan({ sampleId: "sample_rouille_ble", cropContext: "Blé Tendre" });
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setActiveSampleId(null);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      runScan({ file, cropContext });
    }
  };

  const handleSelectSample = (sample: DiagnosticSample) => {
    setActiveSampleId(sample.id);
    setSelectedFile(null);
    setPreviewUrl(sample.sample_image_url);
    setCropContext(sample.crop);
    runScan({ sampleId: sample.id, cropContext: sample.crop });
  };

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case "critical":
        return {
          label: "Risque Critique (Seuil d'intervention dépassé)",
          className: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
        };
      case "high":
        return {
          label: "Risque Élevé (Surveillance active)",
          className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
        };
      case "medium":
        return {
          label: "Risque Modéré",
          className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
        };
      default:
        return {
          label: "Faible / Auxiliaire Bénéfique",
          className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
        };
    }
  };

  return (
    <AppShell allowRoles={["farmer", "acheteur"]}>
      <div className="space-y-6 pb-12">
        {/* Page Header */}
        <PageHeader
          icon={Camera}
          title="Diagnostic & Scanner Phytosanitaire"
          subtitle="Identifiez instantanément les maladies foliaires, champignons et insectes ravageurs à partir de simples photos prises au champ."
        />

        {/* Top Feature Highlights Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl bg-card border border-border/80 shadow-sm flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground">Vision par Ordinateur IA</h4>
              <p className="text-[11px] text-muted-foreground">Reconnaissance de +40 pathologies</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-card border border-border/80 shadow-sm flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground">Protocoles Arvalis & Inovia</h4>
              <p className="text-[11px] text-muted-foreground">Seuils et préconisations certifiés</p>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-card border border-border/80 shadow-sm flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
              <CloudSun className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground">Couplage Météo & Climat</h4>
              <p className="text-[11px] text-muted-foreground">Fenêtres de traitement optimales</p>
            </div>
          </div>
        </div>

        {/* Main Scanner Workbench Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Image Uploader & Samples (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            {/* Upload Zone */}
            <div className="p-6 rounded-3xl border-2 border-dashed border-border/80 hover:border-primary/50 bg-card/70 backdrop-blur text-center space-y-4 transition shadow-sm">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />

              {/* Photo preview or drop placeholder */}
              {previewUrl ? (
                <div className="relative rounded-2xl overflow-hidden border border-border/60 aspect-video max-h-56 mx-auto bg-muted">
                  <img
                    src={previewUrl}
                    alt="Feuille analysée"
                    className="w-full h-full object-cover"
                  />
                  {isScanning && (
                    <div className="absolute inset-0 bg-background/70 backdrop-blur-xs flex flex-col items-center justify-center gap-2">
                      <Loader2 className="w-6 h-6 text-primary animate-spin" />
                      <span className="text-xs font-bold font-mono text-foreground">Analyse IA en cours...</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-6 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-semibold text-foreground">
                    Glissez une photo de feuille ou plante malade
                  </p>
                  <p className="text-[11px]">Formats supportés : JPG, PNG, WebP (max 15 Mo)</p>
                </div>
              )}

              <div className="flex items-center justify-center gap-2">
                <Button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-9 px-4 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl gap-1.5 shadow-sm"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Importer / Prendre une Photo</span>
                </Button>

                {previewUrl && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (selectedFile) runScan({ file: selectedFile, cropContext });
                      else if (activeSampleId) runScan({ sampleId: activeSampleId, cropContext });
                    }}
                    className="h-9 px-3 text-xs rounded-xl"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>

            {/* Test Sample Library */}
            <div className="p-5 rounded-3xl bg-card border border-border/80 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  Échantillons de Démonstration
                </h3>
                <span className="text-[10px] text-muted-foreground">1-clic pour tester</span>
              </div>

              <div className="space-y-2">
                {samples?.map((s) => {
                  const isSelected = activeSampleId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSelectSample(s)}
                      className={`w-full p-2.5 rounded-2xl border text-left transition flex items-center gap-3 ${
                        isSelected
                          ? "bg-primary/10 border-primary shadow-xs ring-2 ring-primary/20"
                          : "bg-background/80 hover:bg-accent/40 border-border/60"
                      }`}
                    >
                      <img
                        src={s.sample_image_url}
                        alt={s.title}
                        className="w-12 h-12 rounded-xl object-cover shrink-0 border border-border/60"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[11px] font-bold text-foreground truncate block">
                            {s.species}
                          </span>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-accent/60 text-muted-foreground">
                            {s.crop}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                          {s.scientific_name}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Diagnostic Results & Multi-Agent Relay (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {scanResult ? (
              <div className="p-6 rounded-3xl bg-card border border-border/80 shadow-sm space-y-6">
                {/* Result Header Badge & Title */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`text-[10px] font-mono font-bold uppercase px-2.5 py-1 rounded-full border ${getRiskBadge(scanResult.risk_level).className}`}>
                        {getRiskBadge(scanResult.risk_level).label}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground">
                        Confiance IA : {(scanResult.confidence * 100).toFixed(0)}%
                      </span>
                    </div>

                    <h2 className="text-xl font-display font-bold text-foreground">
                      {scanResult.species}
                    </h2>
                    <p className="text-xs font-mono text-primary font-semibold italic">
                      {scanResult.scientific_name} · Culture : {scanResult.crop}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono bg-accent/30 px-3 py-1.5 rounded-xl border border-border/50 shrink-0">
                    <FileCheck className="w-3.5 h-3.5 text-primary" />
                    <span>{scanResult.detection_id}</span>
                  </div>
                </div>

                {/* Description Box */}
                <div className="p-4 rounded-2xl bg-accent/20 border border-border/60 space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                    Description Pathologique & Symptômes
                  </span>
                  <p className="text-xs text-foreground/90 leading-relaxed font-medium">
                    {scanResult.description}
                  </p>
                </div>

                {/* Recommendations Steps */}
                <div className="space-y-2.5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    Protocole d'Intervention & Biocontrôle Recommandé
                  </h3>

                  <div className="space-y-2">
                    {scanResult.recommendations.map((step, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-2xl bg-background border border-border/60 text-xs flex items-start gap-2.5"
                      >
                        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-mono font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <span className="text-foreground/90 font-medium leading-snug">
                          {step}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Multi-Agent Relay & Cross-Agent Action Box */}
                <div className="p-4 rounded-2xl bg-primary/10 border border-primary/30 space-y-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <h4 className="text-xs font-bold text-foreground">
                      Relais Multi-Agents : Prochaines Actions d'Exploitation
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <Link
                      to="/weather"
                      className="p-3 rounded-xl bg-card hover:bg-accent border border-border/60 transition flex items-center justify-between text-xs font-bold text-foreground group"
                    >
                      <div className="flex items-center gap-2">
                        <CloudSun className="w-4 h-4 text-primary" />
                        <span>Vérifier la Fenêtre Météo Pulvérisation</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition" />
                    </Link>

                    <Link
                      to="/agriculture"
                      className="p-3 rounded-xl bg-card hover:bg-accent border border-border/60 transition flex items-center justify-between text-xs font-bold text-foreground group"
                    >
                      <div className="flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-primary" />
                        <span>Reporter l'Alerte sur la Carte Parcelle</span>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition" />
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-12 rounded-3xl bg-card border border-border/80 shadow-sm text-center space-y-3">
                <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
                <h3 className="text-sm font-bold text-foreground">Chargement de l'analyse...</h3>
                <p className="text-xs text-muted-foreground">
                  Sélectionnez un échantillon ou importez une photo pour démarrer.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
