import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { maintenanceApi } from '@/services/maintenanceApi';
import { formatCurrencyMad, formatDate } from '@/modules/shared/formatters';

export const FleetMaintenanceDashboardPage: React.FC = () => {
  const alertsQ = useQuery({
    queryKey: ['fleet', 'maintenance', 'alerts'],
    queryFn: () => maintenanceApi.alerts(),
    refetchInterval: 60000,
  });

  const data = alertsQ.data?.data;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">Maintenance proactive</h1>
        <p className="text-sm text-[color:var(--df-text-muted)]">Alertes critiques, entretiens a venir, immobilisations et couts.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Alertes critiques" value={String(data?.criticalAlertsCount ?? 0)} tone="text-red-600" />
        <KpiCard label="Entretiens a venir" value={String(data?.upcomingMaintenanceCount ?? 0)} tone="text-amber-600" />
        <KpiCard label="Vehicules immobilises" value={String(data?.immobilizedVehiclesCount ?? 0)} tone="text-orange-600" />
        <KpiCard label="Cout mensuel" value={formatCurrencyMad(data?.monthlyMaintenanceCost ?? 0)} tone="text-slate-900" />
      </div>

      <section className="df-card df-card--elev p-5">
        <h2 className="mb-3 text-sm font-black uppercase tracking-widest text-[color:var(--df-text-muted)]">Alertes ouvertes</h2>
        {alertsQ.isLoading && <p className="text-sm text-[color:var(--df-text-muted)]">Chargement…</p>}
        {!alertsQ.isLoading && !(data?.alerts?.length) && <p className="text-sm text-[color:var(--df-text-muted)]">Aucune alerte active.</p>}
        <div className="space-y-2">
          {data?.alerts?.map((a) => (
            <div key={a.id} className="rounded-xl border border-[color:var(--df-border)] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{a.title}</div>
                  <div className="text-xs text-[color:var(--df-text-muted)]">{a.description ?? '—'}</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${a.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                  {a.severity}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-[color:var(--df-text-muted)]">
                <span>{a.triggeredAt ? formatDate(a.triggeredAt) : '—'}</span>
                {a.vehicle?.id && <Link className="font-semibold text-[color:var(--df-brand-600)]" to={`/fleet/${a.vehicle.id}`}>Ouvrir vehicule</Link>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

function KpiCard({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="df-card df-card--elev p-4">
      <div className="text-[10px] font-black uppercase tracking-widest text-[color:var(--df-text-muted)]">{label}</div>
      <div className={`mt-1 text-xl font-black ${tone}`}>{value}</div>
    </div>
  );
}
