import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient, getApiBase } from '@/services/apiClient';
import { ApiError } from '@/services/apiError';

type ComplianceFilter = '' | 'insurance_expired' | 'technical_expired' | 'compliance_ok';

type FleetVehicleRow = {
  id: string;
  registration?: string;
  brand?: string;
  model?: string;
  status?: string;
  complianceStatus?: 'ok' | 'warning' | 'critical';
  complianceAlerts?: string[];
};

function complianceBadge(row: FleetVehicleRow) {
  const s = row.complianceStatus ?? 'ok';
  if (s === 'critical') {
    return <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">Conformite critique</span>;
  }
  if (s === 'warning') {
    return <span className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">A surveiller</span>;
  }
  return <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Conformite OK</span>;
}

export const FleetListPage: React.FC = () => {
  const apiReady = !!getApiBase();
  const [compliance, setCompliance] = useState<ComplianceFilter>('');

  const qs = useMemo(() => {
    const p = new URLSearchParams({ per_page: '200' });
    if (compliance) p.set('compliance', compliance);
    return p.toString();
  }, [compliance]);

  const vehiclesQ = useQuery({
    queryKey: ['fleet', 'vehicles', 'list', compliance],
    queryFn: () => apiClient<{ data: FleetVehicleRow[]; meta?: Record<string, unknown> }>(`/v1/vehicles?${qs}`),
    enabled: apiReady,
  });

  if (!apiReady) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-700">
        API non configuree. Renseignez <span className="font-mono">VITE_API_BASE</span> pour activer la flotte.
      </div>
    );
  }

  if (vehiclesQ.isLoading) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Chargement flotte…</div>;
  }

  if (vehiclesQ.isError) {
    const error = vehiclesQ.error instanceof ApiError ? vehiclesQ.error.message : 'Erreur de chargement de la flotte.';
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{error}</div>;
  }

  const rows = vehiclesQ.data?.data ?? [];

  const filterBtn = (key: ComplianceFilter, label: string) => (
    <button
      type="button"
      key={key || 'all'}
      onClick={() => setCompliance(key)}
      className={`rounded-full px-3 py-1 text-xs font-bold transition ${
        compliance === key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {filterBtn('', 'Tous')}
          {filterBtn('insurance_expired', 'Assurance expiree')}
          {filterBtn('technical_expired', 'Visite technique expiree')}
          {filterBtn('compliance_ok', 'Conformite OK')}
        </div>
        <div className="flex flex-wrap gap-3 text-xs font-semibold">
          <Link className="rounded-lg bg-indigo-600 px-3 py-1.5 text-white hover:bg-indigo-700" to="/fleet/vehicles">
            + Nouveau vehicule
          </Link>
          <Link className="text-indigo-600 hover:underline" to="/fleet/compliance">
            Tableau conformite
          </Link>
          <span className="text-slate-300">|</span>
          <Link className="text-indigo-600 hover:underline" to="/fleet/maintenance">
            Maintenance
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Aucun vehicule pour ce filtre.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((v) => (
            <Link key={v.id} to={`/fleet/${v.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 hover:border-indigo-300">
              <div className="text-sm font-black text-slate-900">
                {v.brand ?? '—'} {v.model ?? ''}
              </div>
              <div className="mt-1 font-mono text-xs text-slate-500">{v.registration ?? v.id}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-700">{v.status ?? 'UNKNOWN'}</span>
                {complianceBadge(v)}
              </div>
            </Link>
          ))}
        </div>
      )}

    </div>
  );
};
