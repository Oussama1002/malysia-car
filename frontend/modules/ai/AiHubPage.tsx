import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { aiApi } from '@/services/aiApi';
import { useAuthSession } from '@/modules/auth/AuthContext';

export const AiHubPage: React.FC = () => {
  const { appRole } = useAuthSession();
  const { data } = useQuery({
    queryKey: ['ai', 'overview'],
    queryFn: aiApi.overview,
  });

  const roleRoutes = {
    canAssistant: appRole === 'ADMIN' || appRole === 'DIRECTEUR',
    canMaintenance: appRole === 'ADMIN' || appRole === 'DIRECTEUR' || appRole === 'GESTIONNAIRE_FLOTTE',
    canCreditRisk: appRole === 'ADMIN' || appRole === 'DIRECTEUR' || appRole === 'ANALYSTE_CREDIT',
    canCashFlow: appRole === 'ADMIN' || appRole === 'DIRECTEUR' || appRole === 'COMPTABLE',
    canPricing: appRole === 'ADMIN' || appRole === 'DIRECTEUR' || appRole === 'GESTIONNAIRE_FLOTTE',
    canAnomalies: appRole === 'ADMIN' || appRole === 'DIRECTEUR' || appRole === 'CONTENTIEUX',
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-slate-900">IA operationnelle</h1>
        <p className="text-slate-500">Insights ERP deterministes avec option AI-assisted si un provider externe est configure.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {roleRoutes.canAssistant && (
          <Link to="/ai/assistant" className="block rounded-2xl border border-indigo-100 bg-white p-6 shadow-sm hover:shadow-md">
            <div className="text-sm font-black text-slate-900">Assistant IA</div>
            <div className="mt-2 text-sm text-slate-600">Questions metier, reponses deterministes, references ERP.</div>
            <div className="mt-3 text-xs text-slate-500">rule-based insight</div>
          </Link>
        )}

        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="text-sm font-black text-slate-900">Predictions et anomalies</div>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
            {roleRoutes.canMaintenance && <li><Link className="font-semibold text-indigo-600" to="/ai/predictions/maintenance">Maintenance</Link></li>}
            {roleRoutes.canCreditRisk && <li><Link className="font-semibold text-indigo-600" to="/ai/predictions/credit-risk">Credit risk</Link></li>}
            {roleRoutes.canCashFlow && <li><Link className="font-semibold text-indigo-600" to="/ai/predictions/cash-flow">Cash-flow</Link></li>}
            {roleRoutes.canPricing && <li><Link className="font-semibold text-indigo-600" to="/ai/predictions/vehicle-pricing">Vehicle pricing</Link></li>}
            {roleRoutes.canAnomalies && <li><Link className="font-semibold text-indigo-600" to="/ai/anomalies">Anomalies</Link></li>}
          </ul>
          <div className="mt-4 space-y-1 text-xs text-slate-500">
            <div>rule-based insight</div>
            <div>AI-assisted if external provider enabled</div>
            <div>requires human validation</div>
          </div>
        </div>
      </div>

      {data?.kpis && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="rounded-xl border border-slate-100 bg-white p-3 text-sm">Maintenance critiques: <b>{data.kpis.maintenance_critical}</b></div>
          <div className="rounded-xl border border-slate-100 bg-white p-3 text-sm">Credit risque eleve: <b>{data.kpis.credit_high_risk}</b></div>
          <div className="rounded-xl border border-slate-100 bg-white p-3 text-sm">Factures overdue: <b>{data.kpis.cash_overdue_invoices}</b></div>
          <div className="rounded-xl border border-slate-100 bg-white p-3 text-sm">Pricing ecarts: <b>{data.kpis.pricing_mispriced}</b></div>
          <div className="rounded-xl border border-slate-100 bg-white p-3 text-sm">Anomalies critiques: <b>{data.kpis.anomalies_critical}</b></div>
        </div>
      )}
    </div>
  );
};
