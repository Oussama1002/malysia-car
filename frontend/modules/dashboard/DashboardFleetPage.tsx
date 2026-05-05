import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Cell,
  PieChart,
  Pie,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { getFleetDashboard, type DashboardRange } from '@/services/dashboardApi';
import { formatCurrencyMad } from '@/modules/shared/formatters';

const RANGES: { k: DashboardRange; label: string }[] = [
  { k: '30d', label: '30j' },
  { k: '90d', label: '90j' },
  { k: 'ytd', label: 'YTD' },
];

const STATUS_LABEL: Record<string, string> = {
  available:          'Disponible',
  on_lease:           'Loué / crédit',
  under_maintenance:  'Maintenance',
  sold:               'Vendu',
  reserved:           'Réservé',
  pending_delivery:   'En livraison',
  inactive:           'Inactif',
};

const COLORS = ['#10b981', '#5b5bf4', '#f59e0b', '#94a3b8', '#22d3ee', '#f43f5e', '#e879f9'];

export const DashboardFleetPage: React.FC = () => {
  const [range, setRange] = useState<DashboardRange>('30d');

  const q = useQuery({
    queryKey: ['dashboard', 'fleet', range],
    queryFn: () => getFleetDashboard({ range }),
    staleTime: 60_000,
  });

  const d = q.data?.data;

  const totalVehicles = (d?.status_counts ?? []).reduce((s, r) => s + Number(r.cnt), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/dashboard" className="text-xs font-bold text-indigo-600">← Cockpit</Link>
          <h1 className="text-2xl font-black text-slate-900">Tableau de bord Flotte</h1>
          <p className="text-slate-500">Occupation, maintenance, immobilisations, contrats expirants.</p>
        </div>
        <div className="df-tabs" role="tablist">
          {RANGES.map((r) => (
            <button key={r.k} role="tab" aria-selected={range === r.k} onClick={() => setRange(r.k)} className={`df-tab ${range === r.k ? 'df-tab--active' : ''}`}>{r.label}</button>
          ))}
        </div>
      </header>

      {/* Alert banners */}
      <div className="space-y-2">
        {(d?.km_overrun_count ?? 0) > 0 && (
          <Link to="/fleet" className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800 hover:bg-amber-100 transition">
            <span className="text-lg">📍</span>
            <span className="font-bold">{d?.km_overrun_count} véhicule{(d?.km_overrun_count ?? 0) > 1 ? 's' : ''} en dépassement kilométrique</span>
            <span className="ml-auto">→</span>
          </Link>
        )}
        {(d?.contracts_expiring_30d ?? 0) > 0 && (
          <Link to="/contracts" className="flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-800 hover:bg-indigo-100 transition">
            <span className="text-lg">📅</span>
            <span className="font-bold">{d?.contracts_expiring_30d} contrat{(d?.contracts_expiring_30d ?? 0) > 1 ? 's' : ''} expirant dans les 30 jours</span>
            <span className="ml-auto">→</span>
          </Link>
        )}
        {(d?.maintenance_scheduled_30d ?? 0) > 0 && (
          <Link to="/fleet" className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm text-orange-800 hover:bg-orange-100 transition">
            <span className="text-lg">🔧</span>
            <span className="font-bold">{d?.maintenance_scheduled_30d} maintenance{(d?.maintenance_scheduled_30d ?? 0) > 1 ? 's' : ''} planifiée{(d?.maintenance_scheduled_30d ?? 0) > 1 ? 's' : ''} dans les 30 jours</span>
            <span className="ml-auto">→</span>
          </Link>
        )}
      </div>

      {/* KPI grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="df-card"><div className="df-card__body">
          <div className="text-xs font-bold uppercase text-slate-500">Total parc</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{totalVehicles || '…'}</div>
          <Link to="/fleet" className="text-xs text-indigo-600 hover:underline">Voir flotte →</Link>
        </div></div>
        <div className="df-card"><div className="df-card__body">
          <div className="text-xs font-bold uppercase text-slate-500">Maintenance planifiée (30j)</div>
          <div className={`text-2xl font-black mt-1 ${(d?.maintenance_scheduled_30d ?? 0) > 0 ? 'text-orange-500' : 'text-emerald-600'}`}>
            {d?.maintenance_scheduled_30d ?? '…'}
          </div>
        </div></div>
        <div className="df-card"><div className="df-card__body">
          <div className="text-xs font-bold uppercase text-slate-500">Coût maintenance période</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{d ? formatCurrencyMad(d.maintenance_cost_period) : '…'}</div>
        </div></div>
        <div className="df-card"><div className="df-card__body">
          <div className="text-xs font-bold uppercase text-slate-500">Dépassement km</div>
          <div className={`text-2xl font-black mt-1 ${(d?.km_overrun_count ?? 0) > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {d?.km_overrun_count ?? '…'}
          </div>
        </div></div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Fleet status donut */}
        <div className="df-card">
          <div className="df-card__header">
            <div>
              <div className="df-card__hint">Occupation</div>
              <h3 className="text-lg font-bold tracking-tight">Répartition du parc</h3>
            </div>
            <Link to="/fleet" className="df-btn df-btn--ghost df-btn--sm text-xs">Voir flotte →</Link>
          </div>
          <div className="df-card__body">
            {d && d.status_counts.length > 0 ? (
              <>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={d.status_counts.map((s) => ({ name: STATUS_LABEL[s.status] ?? s.status, value: Number(s.cnt) }))}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={88}
                        paddingAngle={3}
                        stroke="var(--df-surface-solid)"
                        strokeWidth={2}
                      >
                        {d.status_counts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'var(--df-surface-elev)', border: '1px solid var(--df-border-strong)', borderRadius: 12, color: 'var(--df-text)' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 space-y-1.5">
                  {d.status_counts.map((s, i) => (
                    <div key={s.status} className="flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="flex-1 text-slate-700">{STATUS_LABEL[s.status] ?? s.status}</span>
                      <span className="font-mono font-bold text-slate-900">{s.cnt}</span>
                      {totalVehicles > 0 && <span className="text-slate-400 text-xs">({Math.round((Number(s.cnt) / totalVehicles) * 100)}%)</span>}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-slate-400 text-sm py-6 text-center">Aucun véhicule dans le parc.</p>
            )}
          </div>
        </div>

        {/* Fixed assets */}
        <div className="df-card">
          <div className="df-card__header">
            <div>
              <div className="df-card__hint">Immobilisations</div>
              <h3 className="text-lg font-bold tracking-tight">Actifs immobilisés</h3>
            </div>
            <Link to="/accounting/fixed-assets" className="df-btn df-btn--ghost df-btn--sm text-xs">Détail →</Link>
          </div>
          <div className="df-card__body space-y-4">
            {d ? (
              <>
                {/* Coût total */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-500">Coût d'acquisition</span>
                    <span className="font-mono font-bold text-slate-900">{formatCurrencyMad(d.fixed_assets.total_cost)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-indigo-400" style={{ width: '100%' }} />
                  </div>
                </div>
                {/* Amortissement */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-500">Amort. cumulé</span>
                    <span className="font-mono font-bold text-rose-500">{formatCurrencyMad(d.fixed_assets.total_dep)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-rose-400"
                      style={{ width: d.fixed_assets.total_cost > 0 ? `${Math.min(100, (d.fixed_assets.total_dep / d.fixed_assets.total_cost) * 100).toFixed(1)}%` : '0%' }}
                    />
                  </div>
                </div>
                {/* VNC */}
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
                  <div className="text-xs font-bold uppercase text-emerald-600">Valeur nette comptable</div>
                  <div className="text-2xl font-black text-emerald-700 mt-1">{formatCurrencyMad(d.fixed_assets.total_vnc)}</div>
                  {d.fixed_assets.total_cost > 0 && (
                    <div className="text-xs text-emerald-500 mt-0.5">
                      {((d.fixed_assets.total_vnc / d.fixed_assets.total_cost) * 100).toFixed(1)}% de valeur résiduelle
                    </div>
                  )}
                </div>

                {/* Contracts expiring soon */}
                {(d.contracts_expiring_30d ?? 0) > 0 && (
                  <Link to="/contracts" className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800 hover:bg-indigo-100 transition">
                    <span className="font-bold">📅 {d.contracts_expiring_30d} contrat{(d.contracts_expiring_30d ?? 0) > 1 ? 's' : ''} à renouveler</span>
                    <span>→</span>
                  </Link>
                )}
              </>
            ) : (
              <div className="text-slate-400 text-sm">Chargement…</div>
            )}
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid gap-3 md:grid-cols-4">
        {[
          { to: '/fleet', label: 'Gestion de la flotte', icon: '🚗' },
          { to: '/accounting/fixed-assets', label: 'Immobilisations', icon: '🏭' },
          { to: '/contracts', label: 'Contrats actifs', icon: '📋' },
          { to: '/used-cars', label: 'Véhicules d\'occasion', icon: '🏷️' },
        ].map((link) => (
          <Link key={link.to} to={link.to} className="df-card hover:shadow-lg transition">
            <div className="df-card__body flex items-center gap-3">
              <span className="text-2xl">{link.icon}</span>
              <span className="font-bold text-slate-800 text-sm">{link.label}</span>
              <span className="ml-auto text-slate-400 text-xs">→</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};
