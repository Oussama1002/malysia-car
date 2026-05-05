import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { aiApi, type AiPredictionItem } from '@/services/aiApi';

function RiskBadge({ score }: { score: number }) {
  const cls =
    score >= 75 ? 'bg-rose-100 text-rose-700 border-rose-200' :
    score >= 50 ? 'bg-orange-100 text-orange-700 border-orange-200' :
    score >= 30 ? 'bg-amber-100 text-amber-700 border-amber-200' :
      'bg-emerald-100 text-emerald-700 border-emerald-200';
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-bold ${cls}`}>{score}</span>;
}

const SharedPredictionPage: React.FC<{
  title: string;
  subtitle: string;
  queryKey: string;
  queryFn: () => Promise<any>;
}> = ({ title, subtitle, queryKey, queryFn }) => {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ai', queryKey],
    queryFn,
  });

  const rows: AiPredictionItem[] = data?.items ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">{title}</h1>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-3 text-xs text-slate-500">
        rule-based insight · AI-assisted if external provider enabled · requires human validation
      </div>

      {isLoading && <div className="rounded-xl border border-slate-100 bg-white p-6 text-sm text-slate-500">Chargement...</div>}
      {isError && (
        <div className="rounded-xl border border-slate-100 bg-white p-6 text-sm text-slate-500">
          Impossible de charger les predictions.
          <button type="button" onClick={() => refetch()} className="ml-3 rounded bg-slate-100 px-2 py-1 text-xs font-semibold">Reessayer</button>
        </div>
      )}

      {!isLoading && !isError && (
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500">
                <th className="px-4 py-3">Summary</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3">Links</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`${row.entity_id ?? 'x'}-${i}`} className="border-b border-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{row.summary}</div>
                    <div className="text-xs text-slate-500">{row.label}</div>
                  </td>
                  <td className="px-4 py-3"><RiskBadge score={Number(row.score ?? 0)} /></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(row.entity_links ?? []).map((link, idx) => (
                        <Link key={`${link.type}-${link.id}-${idx}`} to={link.path} className="rounded bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">
                          {link.type}
                        </Link>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-500">Aucune donnee.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const AiMaintenancePredictionPage: React.FC = () => (
  <SharedPredictionPage
    title="Maintenance prediction"
    subtitle="Priorisation maintenance a partir des donnees ERP."
    queryKey="maintenance"
    queryFn={aiApi.maintenance}
  />
);

export const AiCreditRiskPredictionPage: React.FC = () => (
  <SharedPredictionPage
    title="Credit-risk prediction"
    subtitle="Risque credit base sur ratio d'endettement et statut dossier."
    queryKey="credit-risk"
    queryFn={aiApi.creditRisk}
  />
);

export const AiCashFlowPredictionPage: React.FC = () => (
  <SharedPredictionPage
    title="Cash-flow prediction"
    subtitle="Projection de tresorerie et risques de factures overdue."
    queryKey="cash-flow"
    queryFn={aiApi.cashFlow}
  />
);

export const AiVehiclePricingPredictionPage: React.FC = () => (
  <SharedPredictionPage
    title="Vehicle pricing prediction"
    subtitle="Ecart prix VO detecte a partir des attributs vehicule."
    queryKey="vehicle-pricing"
    queryFn={aiApi.vehiclePricing}
  />
);

export const AiAnomaliesPage: React.FC = () => (
  <SharedPredictionPage
    title="Anomalies"
    subtitle="Detection d'anomalies cross-module (factures, credit, flotte, arrears)."
    queryKey="anomalies"
    queryFn={aiApi.anomalies}
  />
);
