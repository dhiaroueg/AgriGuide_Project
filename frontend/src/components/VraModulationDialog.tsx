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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Layers,
  Sprout,
  Coins,
  TrendingDown,
  Download,
  Loader2,
  FileSpreadsheet,
  Cpu,
  Sparkles,
} from "lucide-react";
import {
  generateVraPrescription,
  type VraPrescriptionRequest,
  type VraPrescriptionResponse,
} from "@/lib/agricultureApi";

interface VraModulationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  geometry: Record<string, unknown>;
  areaHa: number;
  cropDeclared?: string | null;
}

export function VraModulationDialog({
  open,
  onOpenChange,
  geometry,
  areaHa,
  cropDeclared,
}: VraModulationDialogProps) {
  const [cropType, setCropType] = useState<string>(cropDeclared || "Blé tendre");
  const [targetYield, setTargetYield] = useState<number>(85);
  const [nBudget, setNBudget] = useState<number>(170);
  const [strategy, setStrategy] = useState<
    "ndvi_proportional" | "soil_potential" | "protein_optimization"
  >("ndvi_proportional");
  const [unitCost, setUnitCost] = useState<number>(1.35);

  const {
    data: vraData,
    mutate: calculateVra,
    isPending,
  } = useMutation({
    mutationFn: (req: VraPrescriptionRequest) => generateVraPrescription(req),
  });

  useEffect(() => {
    if (open && areaHa > 0 && geometry) {
      calculateVra({
        geometry,
        area_ha: areaHa,
        crop_type: cropType,
        target_yield_q_ha: targetYield,
        total_n_budget_kg_ha: nBudget,
        strategy,
        fertilizer_unit_cost_eur_kg: unitCost,
      });
    }
  }, [open, geometry, areaHa, cropType, targetYield, nBudget, strategy, unitCost, calculateVra]);

  const handleDownloadCsv = () => {
    if (!vraData) return;
    const blob = new Blob([vraData.csv_prescription], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Prescription_VRA_Azote_${cropType.replace(/\s+/g, "_")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadIsobus = () => {
    if (!vraData) return;
    const blob = new Blob([vraData.isobus_task_data_json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ISOBUS_TaskData_${cropType.replace(/\s+/g, "_")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-white text-slate-900 border-slate-200 shadow-2xl">
        <DialogHeader className="border-b border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-100 text-blue-700 border border-blue-200">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                Cartes de Modulation VRA (Azote / Engrais)
              </DialogTitle>
              <DialogDescription className="text-slate-600 text-sm">
                Modulez l'épandage d'azote par zone NDVI satellite pour optimiser le rendement et économiser les intrants.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Culture Cible</label>
              <Input
                value={cropType}
                onChange={(e) => setCropType(e.target.value)}
                placeholder="ex. Blé tendre, Maïs"
                className="h-9 bg-white text-slate-900 border-slate-300"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Objectif Rendement (q/ha)</label>
              <Input
                type="number"
                value={targetYield}
                onChange={(e) => setTargetYield(Number(e.target.value))}
                className="h-9 bg-white text-slate-900 border-slate-300"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Dose Moyenne Visée (kg N/ha)</label>
              <Input
                type="number"
                value={nBudget}
                onChange={(e) => setNBudget(Number(e.target.value))}
                className="h-9 bg-white text-slate-900 border-slate-300"
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-slate-700">Stratégie de Modulation VRA</label>
              <Select
                value={strategy}
                onValueChange={(val) =>
                  setStrategy(val as "ndvi_proportional" | "soil_potential" | "protein_optimization")
                }
              >
                <SelectTrigger className="h-9 bg-white text-slate-900 border-slate-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ndvi_proportional">
                    Proportionnelle NDVI (Plus de N sur les zones fortes)
                  </SelectItem>
                  <SelectItem value="soil_potential">
                    Économie & Potentiel Sol (Réguler les zones très poussantes)
                  </SelectItem>
                  <SelectItem value="protein_optimization">
                    Optimisation Protéines (Boost de qualité fin de cycle)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Prix Engrais (€/kg N)</label>
              <Input
                type="number"
                step="0.05"
                value={unitCost}
                onChange={(e) => setUnitCost(Number(e.target.value))}
                className="h-9 bg-white text-slate-900 border-slate-300"
              />
            </div>
          </div>

          {isPending ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-sm">Génération de la carte de prescription d'azote par zones...</p>
            </div>
          ) : vraData ? (
            <>
              {/* Savings Summary Banner */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-blue-700 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Dose Moyenne Modulée</span>
                    <Sprout className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-2xl font-extrabold text-slate-900">
                      {vraData.modulated_avg_n_dose_kg_ha}
                    </span>
                    <span className="text-xs text-slate-600 ml-1">kg N / ha</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-2">
                    Dose fixe initiale : {vraData.base_n_budget_kg_ha} kg N/ha
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-emerald-700 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Azote Économisé</span>
                    <TrendingDown className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-2xl font-extrabold text-emerald-700">
                      -{vraData.n_saved_total_kg}
                    </span>
                    <span className="text-xs text-slate-600 ml-1">kg N total</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-2">
                    Réduction globale : <strong className="text-emerald-700">-{vraData.savings_pct}%</strong> d'intrants
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-amber-700 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Économie Financière</span>
                    <Coins className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-2xl font-extrabold text-slate-900">
                      {vraData.savings_eur.toLocaleString("fr-FR")} €
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-2">
                    Gains directs sur la parcelle ({vraData.area_ha} ha)
                  </p>
                </div>
              </div>

              {/* Zones Prescription Breakdown */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  Prescription par Zones de Vigueur Satellite
                </h4>

                <div className="space-y-2.5">
                  {vraData.zones.map((zone) => (
                    <div
                      key={zone.zone_id}
                      className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded-full flex-shrink-0 shadow-sm"
                          style={{ backgroundColor: zone.color_hex }}
                        />
                        <div>
                          <h5 className="text-sm font-semibold text-slate-900">{zone.label}</h5>
                          <span className="text-xs text-slate-600">
                            Surface: {zone.area_ha} ha ({zone.area_pct}%) • NDVI: {zone.ndvi_range}
                          </span>
                        </div>
                      </div>

                      <div className="text-left sm:text-right flex-shrink-0">
                        <span className="text-base font-extrabold text-slate-900">
                          {zone.prescribed_n_dose_kg_ha} kg N/ha
                        </span>
                        <span className="text-xs text-slate-600 block">
                          Total zone: {zone.total_n_zone_kg} kg N
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tractor Computer Export Footer */}
              <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Cpu className="w-6 h-6 text-blue-700 flex-shrink-0" />
                  <div className="text-xs">
                    <p className="font-semibold text-slate-900">Exportation Matériel Agricole</p>
                    <p className="text-slate-600">
                      Fichiers de préconisation directement transférables par clé USB ou cloud sur console John Deere, Fendt, CLAAS, Kuhn, Amazone.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    onClick={handleDownloadCsv}
                    variant="outline"
                    className="gap-2 text-xs h-9 border-slate-300 bg-white text-slate-800"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    CSV Prescription
                  </Button>
                  <Button
                    onClick={handleDownloadIsobus}
                    className="bg-blue-600 hover:bg-blue-700 text-white gap-2 text-xs h-9 shadow-sm"
                  >
                    <Download className="w-4 h-4" />
                    Fichier ISOBUS
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
