import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient, getApiBase } from '@/services/apiClient';
import { formatCurrencyMad } from '@/modules/shared/formatters';

export const FleetAnalysisPage: React.FC = () => {
  const apiReady = !!getApiBase();
  const q = useQuery({
    queryKey: ['fleet', 'analysis'],
    queryFn: async () => {
      const r = await apiClient<{ data: Record<string, unknown> }>('/v1/fleet/analysis');
      return (r as { data: Record<string, unknown> }).data;
    },
    enabled: apiReady,
  });

  const data = q.data as {
    kpis?: Record<string, number>;
    vehicles?: Array<Record<string, unknown>>;
  } | undefined;

  const k = data?.kpis;
  const integerValue = (value: unknown): string => {
    if (value === null || value === undefined || value === '') {
      return '—';
    }
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) {
      return '—';
    }
    return Math.round(numeric).toLocaleString('fr-MA');
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-[color:var(--df-text)]">Analyse de parc</h1>
        <p className="text-sm text-[color:var(--df-text-muted)]">Rentabilité, disponibilité et coûts par véhicule.</p>
      </header>

      {!apiReady && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
          Backend API non configurée. Configurez `VITE_API_BASE` pour charger l'analyse de parc.
        </div>
      )}
      {q.isLoading && (
        <div className="rounded-xl border border-[color:var(--df-border)] bg-[color:var(--df-surface-sunk)] p-3 text-sm text-[color:var(--df-text-muted)]">
          Chargement de l'analyse de parc…
        </div>
      )}
      {q.isError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
          Impossible de charger l'analyse de parc. Vérifiez l'API (`/v1/fleet/analysis`) et vos droits d'accès.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        {[
          ['Total', k?.totalVehicles],
          ['Disponibles', k?.availableVehicles],
          ['En location', k?.rentedVehiclesApprox],
          ['Maintenance', k?.vehiclesInMaintenance],
          ['Réparation', k?.vehiclesInRepair],
          ['Sinistre', k?.vehiclesInAccident],
          ['Indisponibles', k?.vehiclesUnavailable],
          ['Utilisation %', k?.utilizationRatePct],
        ].map(([label, val]) => (
          <div key={String(label)} className="df-card df-card--elev p-3">
            <div className="text-[10px] font-black uppercase text-[color:var(--df-text-muted)]">{label}</div>
            <div className="text-lg font-black">{integerValue(val)}</div>
          </div>
        ))}
      </div>

      <div className="df-card p-5">
        <h2 className="mb-3 text-sm font-bold">Par véhicule</h2>
        <div className="overflow-x-auto">
          <table className="df-table w-full text-xs">
            <thead>
              <tr>
                <th>Immat.</th>
                <th>Statut</th>
                <th>Dispo.</th>
                <th>CA</th>
                <th>Coûts</th>
                <th>Marge</th>
              </tr>
            </thead>
            <tbody>
              {(data?.vehicles ?? []).map((v) => (
                <tr key={String(v.vehicleId)}>
                  <td className="font-mono">{String(v.registration ?? '')}</td>
                  <td>{String(v.status ?? '')}</td>
                  <td>{String(v.availability ?? '')}</td>
                  <td>{formatCurrencyMad(Number(v.revenue ?? 0))}</td>
                  <td>{formatCurrencyMad(Number(v.totalCost ?? 0))}</td>
                  <td className="font-semibold">{formatCurrencyMad(Number(v.profitability ?? 0))}</td>
                </tr>
              ))}
              {!q.isLoading && (data?.vehicles ?? []).length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-[color:var(--df-text-muted)]">
                    Aucune donnée de véhicule disponible.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
