import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Leaf,
  Coins,
  TrendingUp,
  Award,
  CheckCircle2,
  AlertCircle,
  Download,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import {
  estimateCarbonCredits,
  type CarbonCalculationRequest,
  type CarbonCalculationResponse,
} from "@/lib/agricultureApi";

interface CarbonCreditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  areaHa: number;
  clayPct?: number | null;
  soilCarbonGKg?: number | null;
}

export function CarbonCreditDialog({
  open,
  onOpenChange,
  areaHa,
  clayPct,
  soilCarbonGKg,
}: CarbonCreditDialogProps) {
  const [tillage, setTillage] = useState<
    "semis_direct" | "travail_reduit" | "labour_conventionnel"
  >("semis_direct");
  const [coverCrop, setCoverCrop] = useState<
    "couvert_permanent" | "couvert_intermediaire" | "aucun"
  >("couvert_intermediaire");
  const [amendments, setAmendments] = useState<
    "compost" | "fumier" | "aucun"
  >("compost");
  const [residues, setResidues] = useState<
    "restitution_sol" | "exportation_paille"
  >("restitution_sol");

  const {
    data: carbonData,
    mutate: calculate,
    isPending,
  } = useMutation({
    mutationFn: (req: CarbonCalculationRequest) => estimateCarbonCredits(req),
  });

  useEffect(() => {
    if (open && areaHa > 0) {
      calculate({
        area_ha: areaHa,
        tillage_practice: tillage,
        cover_crop: coverCrop,
        organic_amendments: amendments,
        residue_management: residues,
        clay_pct: clayPct,
        soil_carbon_g_kg: soilCarbonGKg,
      });
    }
  }, [open, areaHa, tillage, coverCrop, amendments, residues, clayPct, soilCarbonGKg, calculate]);

  const handleDownloadReport = () => {
    if (!carbonData) return;
    const reportText = `# Rapport Bilan Carbone & Crédits Agricoles — AgriGuide
Date: ${new Date().toLocaleDateString("fr-FR")}
Surface Analysée: ${carbonData.area_ha} ha
Note Éco-Carbone: ${carbonData.carbon_rating} (Score: ${carbonData.practices_score_pct}%)

---

## 📊 Résultats du Stockage de Carbone
- Taux de Séquestration Sol: ${carbonData.sequestration_rate_t_co2e_ha_yr} t CO2e / ha / an
- Séquestration Totale Exploitation: ${carbonData.total_sequestration_t_co2e_yr} t CO2e / an
- Estimation Revenus Crédits Carbone: ${carbonData.estimated_credit_value_eur_yr.toLocaleString("fr-FR")} € / an (sur la base de ${carbonData.credit_price_per_ton_eur} € / t CO2e)
- Éligibilité Label Bas-Carbone: ${carbonData.certification_eligible ? "Oui ✅" : "Non ⚠️ (Améliorations requises)"}

## 🌿 Répartition par Pratique Culturales
${Object.entries(carbonData.breakdown_by_practice)
  .map(([k, v]) => `- ${k}: ${v} t CO2e/an`)
  .join("\n")}

## 💡 Recommandations Agro-Écologiques
${carbonData.recommendations.map((r) => `- ${r}`).join("\n")}
`;

    const blob = new Blob([reportText], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Bilan_Carbone_Parcelle_${areaHa}ha.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white text-slate-900 border-slate-200 shadow-2xl">
        <DialogHeader className="border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700 border border-emerald-200">
              <Leaf className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                Bilan Carbone & Crédits Carbone Agricoles
              </DialogTitle>
              <DialogDescription className="text-slate-600 text-sm">
                Estimez le stockage de carbone de votre sol et valorisez financièrement vos pratiques durables.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Form Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Travail du Sol</label>
              <Select
                value={tillage}
                onValueChange={(val) =>
                  setTillage(val as "semis_direct" | "travail_reduit" | "labour_conventionnel")
                }
              >
                <SelectTrigger className="h-9 bg-white text-slate-900 border-slate-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semis_direct">Semis Direct (No-Till) — Max Carbone</SelectItem>
                  <SelectItem value="travail_reduit">Travail Simplifié / TCS</SelectItem>
                  <SelectItem value="labour_conventionnel">Labour Conventionnel</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Couverts Végétaux</label>
              <Select
                value={coverCrop}
                onValueChange={(val) =>
                  setCoverCrop(val as "couvert_permanent" | "couvert_intermediaire" | "aucun")
                }
              >
                <SelectTrigger className="h-9 bg-white text-slate-900 border-slate-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="couvert_permanent">Couvert Permanent Végétalisé</SelectItem>
                  <SelectItem value="couvert_intermediaire">Couvert Intermédiaire / CIPAN</SelectItem>
                  <SelectItem value="aucun">Aucun Couvert (Sol Nu)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Amendements Organiques</label>
              <Select
                value={amendments}
                onValueChange={(val) =>
                  setAmendments(val as "compost" | "fumier" | "aucun")
                }
              >
                <SelectTrigger className="h-9 bg-white text-slate-900 border-slate-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compost">Compost de Matières Organiques</SelectItem>
                  <SelectItem value="fumier">Fumier / Effluents d'Élevage</SelectItem>
                  <SelectItem value="aucun">Aucun Apport Organique</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Gestion des Résidus</label>
              <Select
                value={residues}
                onValueChange={(val) =>
                  setResidues(val as "restitution_sol" | "exportation_paille")
                }
              >
                <SelectTrigger className="h-9 bg-white text-slate-900 border-slate-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="restitution_sol">Restitution au Sol (Broyage)</SelectItem>
                  <SelectItem value="exportation_paille">Exportation des Pailles</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isPending ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
              <p className="text-sm">Calcul du bilan carbone en cours...</p>
            </div>
          ) : carbonData ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-emerald-700 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Séquestration Sol</span>
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-2xl font-extrabold text-slate-900">
                      {carbonData.sequestration_rate_t_co2e_ha_yr}
                    </span>
                    <span className="text-xs text-slate-600 ml-1">t CO₂e / ha / an</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-2">
                    Total parcelle ({carbonData.area_ha} ha) :{" "}
                    <strong className="text-emerald-700 font-semibold">{carbonData.total_sequestration_t_co2e_yr} t CO₂e/an</strong>
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-amber-700 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Valeur Crédits Carbone</span>
                    <Coins className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-2xl font-extrabold text-slate-900">
                      {carbonData.estimated_credit_value_eur_yr.toLocaleString("fr-FR")} €
                    </span>
                    <span className="text-xs text-slate-600 ml-1">/ an</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-2">
                    Basé sur {carbonData.credit_price_per_ton_eur} € / t CO₂e certifiée
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-blue-700 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Note Éco-Sol</span>
                    <Award className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-lg font-bold text-slate-900">
                      {carbonData.carbon_rating}
                    </span>
                  </div>
                  <div className="space-y-1 mt-2">
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>Score de pratiques</span>
                      <span>{carbonData.practices_score_pct}%</span>
                    </div>
                    <Progress value={carbonData.practices_score_pct} className="h-1.5 bg-blue-200" />
                  </div>
                </div>
              </div>

              {/* Breakdown */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Gain de stockage par levier d'action
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  {Object.entries(carbonData.breakdown_by_practice).map(([key, val]) => (
                    <div key={key} className="p-2.5 rounded-lg bg-white border border-slate-200 shadow-sm">
                      <span className="text-slate-600 block font-medium">{key}</span>
                      <strong className="text-emerald-700 text-sm font-bold block mt-0.5">
                        +{val} t CO₂e/an
                      </strong>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommendations */}
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Recommandations pour maximiser vos crédits carbone
                </h4>
                <ul className="space-y-1.5 text-xs text-slate-700">
                  {carbonData.recommendations.map((rec, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-emerald-600 font-bold">•</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  {carbonData.certification_eligible ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Éligible à la certification Label Bas-Carbone
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-amber-700 font-semibold">
                      <AlertCircle className="w-4 h-4 text-amber-600" /> Améliorations conseillées avant certification
                    </span>
                  )}
                </div>

                <Button
                  onClick={handleDownloadReport}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 text-xs h-9 shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Télécharger le Rapport Carbone
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
