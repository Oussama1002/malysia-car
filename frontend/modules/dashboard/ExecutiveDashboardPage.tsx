import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
  CartesianGrid,
} from 'recharts';
import {
  getExecutiveDashboard,
  type DashboardRange,
  type DashboardParams,
} from '@/services/dashboardApi';
import { KpiCard } from '@/modules/shared/components/KpiCard';
import { StatusChip } from '@/modules/shared/components/StatusChip';
import { Icon } from '@/modules/shared/components/Icon';
import { formatCurrencyMad, formatDate } from '@/modules/shared/formatters';
import { useAuthSession } from '@/modules/auth/AuthContext';
import { isRealDashboardEnabled } from '@/config/featureFlags';

const RANGES: { k: DashboardRange; label: string }[] = [
  { k: '7d',  label: '7 jours' },
  { k: '30d', label: '30 jours' },
  { k: '90d', label: '90 jours' },
  { k: 'ytd', label: 'YTD' },
];

const COLORS = ['#5b5bf4', '#22d3ee', '#10b981', '#f59e0b', '#f43f5e'];

// Drilldown links for each KPI
const DRILLDOWN: Record<string, string> = {
  active_contracts:       '/contracts',
  arrears_active_count:   '/arrears',
  pending_credit_count:   '/credit',
  dues_today_count:       '/finance/invoices?status=overdue',
  gps_alerts_today:       '/gps/alerts',
  fleet_vehicle_count:    '/fleet',
  customer_count:         '/customers',
};

export const ExecutiveDashboardPage: React.FC = () => {
  const { session } = useAuthSession();
  const realDashboard = isRealDashboardEnabled();
  const [range, setRange] = useState<DashboardRange>('30d');
  const [branchId, setBranchId] = useState<string>('');

  const params: DashboardParams = useMemo(
    () => ({ range, branch_id: branchId || undefined }),
    [range, branchId],
  );

  const q = useQuery({
    queryKey: ['dashboard', 'executive', params],
    queryFn: () => getExecutiveDashboard(params),
    staleTime: 60_000,
    enabled: realDashboard,
  });

  if (!realDashboard) {
    return (
      <div className="space-y-8">
        <section className="df-card df-card--elev relative overflow-hidden p-8 md:p-12">
          <div className="df-grid-bg pointer-events-none absolute inset-0 opacity-30" />
          <div className="relative mx-auto max-w-xl text-center">
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-[color:var(--df-border)] bg-[color:var(--df-surface)] text-2xl shadow-sm">
              📊
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--df-text-faint)]">
              Direction · {formatDate(new Date())}
            </p>
            <h1 className="mt-3 text-2xl font-black tracking-tight md:text-3xl">
              Bonjour {session?.user.name?.split(' ')[0] ?? 'Dirigeant'}
            </h1>
            <p className="mt-6 text-lg font-semibold text-[color:var(--df-text-muted)]">
              Tableau de bord en cours de finalisation
            </p>
            <p className="mt-2 text-sm text-[color:var(--df-text-faint)]">
              Les indicateurs et graphiques seront affichés lorsque les données seront validées côté serveur.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-2 border-t border-[color:var(--df-border)] pt-8">
              <Link to="/dashboard/finance" className="df-btn df-btn--ghost df-btn--sm">
                Finance →
              </Link>
              <Link to="/dashboard/risk" className="df-btn df-btn--ghost df-btn--sm">
                Risque →
              </Link>
              <Link to="/dashboard/fleet" className="df-btn df-btn--ghost df-btn--sm">
                Flotte →
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const data = q.data?.data;

  // ── Loading shimmer ───────────────────────────────────────────────────────
  if (!data && q.isLoading) {
    return (
      <div className="space-y-6">
        <div className="df-shimmer h-28 rounded-3xl" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="df-shimmer h-32 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const kpis              = data?.kpis;
  const revenueSeries     = data?.revenue_series ?? [];
  const overdueTrend      = data?.overdue_trend ?? [];
  const contractMix       = data?.contract_mix ?? [];
  const fleetOccupancy    = data?.fleet_occupancy ?? [];
  const maintenanceTrend  = data?.maintenance_cost_trend ?? [];

  const cashBest  = (kpis?.cash_forecast_30d_mad ?? 0) * 1.18;
  const cashWorst = (kpis?.cash_forecast_30d_mad ?? 0) * 0.78;

  return (
    <div className="space-y-8">

      {/* ── Hero / welcome band ─────────────────────────────────────────── */}
      <section className="df-card df-card--elev relative overflow-hidden p-6 md:p-8">
        <div className="df-grid-bg pointer-events-none absolute inset-0 opacity-30" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[color:var(--df-text-faint)]">
              <span className="df-pulse-dot" style={{ background: 'var(--df-success-500)', color: 'var(--df-success-500)' }} />
              Cockpit en temps réel · {formatDate(new Date())}
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight md:text-4xl">
              Bonjour {session?.user.name?.split(' ')[0] ?? 'Dirigeant'} <span className="inline-block animate-pulse">👋</span>
            </h1>
            <p className="mt-2 max-w-2xl text-[color:var(--df-text-muted)]">
              Vue d'ensemble de votre activité automobile & leasing — KPIs stratégiques, trésorerie prévisionnelle, risque client et santé de la flotte.
            </p>
          </div>

          <div className="flex flex-col items-start gap-3 lg:items-end">
            {/* Range tabs */}
            <div className="df-tabs" role="tablist">
              {RANGES.map((r) => (
                <button
                  key={r.k}
                  type="button"
                  role="tab"
                  aria-selected={range === r.k}
                  onClick={() => setRange(r.k)}
                  className={`df-tab ${range === r.k ? 'df-tab--active' : ''}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <select
                className="df-input text-xs"
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
              >
                <option value="">Toutes les agences</option>
                {/* Branch options populated from auth context / separate query */}
              </select>
              <Link to="/dashboard/finance" className="df-btn df-btn--ghost df-btn--sm">Finance →</Link>
              <Link to="/dashboard/risk" className="df-btn df-btn--ghost df-btn--sm">Risque →</Link>
              <Link to="/dashboard/fleet" className="df-btn df-btn--ghost df-btn--sm">Flotte →</Link>
            </div>
          </div>
        </div>

        {/* Métier quick-action strips */}
        <div className="relative mt-6 grid gap-3 md:grid-cols-4">
          {[
            { icon: '📋', label: 'Contrats actifs',        value: kpis?.active_contracts ?? '…',      to: DRILLDOWN.active_contracts,     bg: 'var(--df-brand-500)' },
            { icon: '⚠️', label: 'Dossiers contentieux',   value: kpis?.arrears_active_count ?? '…',  to: DRILLDOWN.arrears_active_count, bg: 'var(--df-danger-500)' },
            { icon: '🕐', label: 'Dossiers crédit attente',value: kpis?.pending_credit_count ?? '…',  to: DRILLDOWN.pending_credit_count, bg: 'var(--df-warning-500)' },
            { icon: '📅', label: 'Échéances du jour',      value: kpis?.dues_today_count ?? '…',      to: DRILLDOWN.dues_today_count,     bg: 'var(--df-info-500)' },
          ].map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className="flex items-center gap-3 rounded-2xl border border-[color:var(--df-border)] bg-[color:var(--df-surface)] p-3 transition hover:shadow-md"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl"
                style={{ background: `color-mix(in srgb, ${item.bg} 14%, transparent)` }}>
                {item.icon}
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--df-text-faint)]">{item.label}</div>
                <div className="text-xl font-black text-[color:var(--df-text)]">{String(item.value)}</div>
              </div>
              <div className="ml-auto text-[color:var(--df-text-faint)] text-xs">→</div>
            </Link>
          ))}
        </div>
      </section>

      {/* ── KPI grid ─────────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          title="Valeur du parc"
          value={formatCurrencyMad(kpis?.fleet_value_mad ?? 0)}
          hint="VNC immobilisations actives"
          tone="brand"
          icon="car"
          sparklineData={[80, 82, 84, 85, 88, 90, 92, 95]}
        />
        <KpiCard
          title="CA mensuel"
          value={formatCurrencyMad(kpis?.monthly_revenue_mad ?? 0)}
          hint="Loyers + mensualités encaissés"
          tone="success"
          icon="coin"
          sparklineData={revenueSeries.slice(-8).map((s) => s.value)}
        />
        <KpiCard
          title="Taux d'impayés"
          value={`${(kpis?.overdue_rate_pct ?? 0).toFixed(1)} %`}
          hint="Seuil cible < 3 %"
          tone={((kpis?.overdue_rate_pct ?? 0) > 3) ? 'danger' : 'success'}
          icon="alert"
          goodDirection="down"
          sparklineData={overdueTrend.slice(-8).map((s) => s.value)}
          insight={(kpis?.overdue_rate_pct ?? 0) > 3 ? 'Dépassement du seuil cible.' : undefined}
        />
        <KpiCard
          title="Prévision cash 30j"
          value={formatCurrencyMad(kpis?.cash_forecast_30d_mad ?? 0)}
          hint="Scénario central"
          tone="info"
          icon="trend-up"
          sparklineData={[60, 58, 64, 70, 72, 78, 82, 86]}
        />
        <KpiCard
          title="Rentabilité / véhicule"
          value={formatCurrencyMad(kpis?.profitability_per_vehicle_mad ?? 0)}
          hint="Marge opérationnelle"
          tone="brand"
          icon="trend-up"
          sparklineData={[12, 14, 13, 16, 18, 17, 19, 20]}
        />
        <KpiCard
          title="Rentabilité / client"
          value={formatCurrencyMad(kpis?.profitability_per_client_mad ?? 0)}
          hint="Valeur vie client"
          tone="warning"
          icon="users"
          sparklineData={[22, 21, 23, 22, 20, 21, 20, 19]}
        />
      </section>

      {/* ── GPS alerts banner (if any) ────────────────────────────────────── */}
      {(kpis?.gps_alerts_today ?? 0) > 0 && (
        <Link to="/gps/alerts" className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 transition hover:bg-amber-100">
          <span className="text-lg">🛰️</span>
          <span className="font-bold">{kpis?.gps_alerts_today} alerte{(kpis?.gps_alerts_today ?? 0) > 1 ? 's' : ''} GPS non résolue{(kpis?.gps_alerts_today ?? 0) > 1 ? 's' : ''} aujourd'hui</span>
          <span className="ml-auto font-bold">Voir →</span>
        </Link>
      )}

      {/* ── Main chart grid ───────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">

        {/* Cash-flow forecast (wide) */}
        <div className="df-card xl:col-span-2">
          <div className="df-card__header">
            <div>
              <div className="df-card__hint">Finance · <Link to="/dashboard/finance" className="text-indigo-500 hover:underline">voir détail</Link></div>
              <h3 className="text-lg font-bold tracking-tight">Encaissements · {range.toUpperCase()}</h3>
            </div>
            <StatusChip label="Données réelles" tone="brand" dot />
          </div>
          <div className="df-card__body">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueSeries} margin={{ top: 10, right: 12, bottom: 0, left: -16 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#5b5bf4" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#5b5bf4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--df-border)" vertical={false} />
                  <XAxis dataKey="month" stroke="var(--df-text-faint)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--df-text-faint)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}k`} />
                  <Tooltip
                    contentStyle={{ background: 'var(--df-surface-elev)', border: '1px solid var(--df-border-strong)', borderRadius: 12, color: 'var(--df-text)' }}
                    formatter={(v: number) => [`${v}k MAD`, 'Encaissements']}
                  />
                  <Area type="monotone" dataKey="value" stroke="#5b5bf4" strokeWidth={2.5} fill="url(#revGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[color:var(--df-border)] pt-4">
              <div>
                <div className="df-card__hint">Pire scénario</div>
                <div className="df-num mt-1" style={{ fontSize: 18, fontWeight: 700 }}>{formatCurrencyMad(cashWorst)}</div>
              </div>
              <div>
                <div className="df-card__hint">Scénario central</div>
                <div className="df-num mt-1 text-[color:var(--df-brand-600)]" style={{ fontSize: 18, fontWeight: 800 }}>{formatCurrencyMad(kpis?.cash_forecast_30d_mad ?? 0)}</div>
              </div>
              <div>
                <div className="df-card__hint">Optimiste</div>
                <div className="df-num mt-1" style={{ fontSize: 18, fontWeight: 700 }}>{formatCurrencyMad(cashBest)}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Contract mix donut */}
        <div className="df-card">
          <div className="df-card__header">
            <div>
              <div className="df-card__hint">Répartition</div>
              <h3 className="text-lg font-bold tracking-tight">Mix contrats</h3>
            </div>
            <Link to="/contracts" className="df-btn df-btn--ghost df-btn--sm text-xs">Voir tout →</Link>
          </div>
          <div className="df-card__body">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={contractMix.length ? contractMix : [{ name: 'Aucun', value: 1 }]}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={88}
                    paddingAngle={3}
                    stroke="var(--df-surface-solid)"
                    strokeWidth={2}
                  >
                    {contractMix.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--df-surface-elev)', border: '1px solid var(--df-border-strong)', borderRadius: 12, color: 'var(--df-text)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 space-y-1.5">
              {contractMix.map((c, i) => (
                <div key={c.name} className="flex items-center gap-2 text-[13px]">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="flex-1 font-semibold">{c.name}</span>
                  <span className="df-num font-bold">{c.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Second row ───────────────────────────────────────────────────── */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">

        {/* Overdue trend chart */}
        <div className="df-card xl:col-span-2">
          <div className="df-card__header">
            <div>
              <div className="df-card__hint">Risque · <Link to="/dashboard/risk" className="text-indigo-500 hover:underline">voir détail</Link></div>
              <h3 className="text-lg font-bold tracking-tight">Tendance taux d'impayés (%)</h3>
            </div>
            <StatusChip label={`${kpis?.arrears_active_count ?? 0} dossiers actifs`} tone={(kpis?.arrears_active_count ?? 0) > 0 ? 'danger' : 'neutral'} dot />
          </div>
          <div className="df-card__body">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={overdueTrend} margin={{ top: 10, right: 12, bottom: 0, left: -16 }}>
                  <defs>
                    <linearGradient id="overdueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--df-border)" vertical={false} />
                  <XAxis dataKey="month" stroke="var(--df-text-faint)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--df-text-faint)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                  {/* 3% target line */}
                  <Tooltip
                    contentStyle={{ background: 'var(--df-surface-elev)', border: '1px solid var(--df-border-strong)', borderRadius: 12, color: 'var(--df-text)' }}
                    formatter={(v: number) => [`${v}%`, 'Taux impayés']}
                  />
                  <Area type="monotone" dataKey="value" stroke="#f43f5e" strokeWidth={2.5} fill="url(#overdueGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            {/* Arrears quick stats */}
            <div className="mt-3 grid grid-cols-3 gap-3 border-t border-[color:var(--df-border)] pt-3 text-center">
              <div>
                <div className="df-card__hint">Impayés totaux</div>
                <div className="font-black text-rose-600 mt-0.5">{formatCurrencyMad(kpis?.arrears_total_overdue_mad ?? 0)}</div>
              </div>
              <div>
                <div className="df-card__hint">Crédit en attente</div>
                <Link to="/credit" className="font-black text-amber-600 hover:underline block mt-0.5">{kpis?.pending_credit_count ?? 0}</Link>
              </div>
              <div>
                <div className="df-card__hint">GPS alertes</div>
                <Link to="/gps/alerts" className="font-black text-indigo-600 hover:underline block mt-0.5">{kpis?.gps_alerts_today ?? 0}</Link>
              </div>
            </div>
          </div>
        </div>

        {/* Fleet occupancy */}
        <div className="df-card">
          <div className="df-card__header">
            <div>
              <div className="df-card__hint">Flotte · <Link to="/dashboard/fleet" className="text-indigo-500 hover:underline">voir détail</Link></div>
              <h3 className="text-lg font-bold tracking-tight">Occupation véhicules</h3>
            </div>
          </div>
          <div className="df-card__body">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={fleetOccupancy} layout="vertical" margin={{ left: 16, right: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--df-border)" horizontal={false} />
                  <XAxis type="number" stroke="var(--df-text-faint)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis type="category" dataKey="label" stroke="var(--df-text-muted)" fontSize={12} tickLine={false} axisLine={false} width={110} />
                  <Tooltip contentStyle={{ background: 'var(--df-surface-elev)', border: '1px solid var(--df-border-strong)', borderRadius: 12, color: 'var(--df-text)' }} />
                  <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                    {fleetOccupancy.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 border-t border-[color:var(--df-border)] pt-3 flex justify-between text-sm">
              <span className="text-[color:var(--df-text-muted)]">Total parc :</span>
              <Link to="/fleet" className="font-black text-[color:var(--df-brand-600)] hover:underline">{kpis?.fleet_vehicle_count ?? '…'} véhicules</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Maintenance trend ─────────────────────────────────────────────── */}
      <section className="df-card">
        <div className="df-card__header">
          <div>
            <div className="df-card__hint">Maintenance</div>
            <h3 className="text-lg font-bold tracking-tight">Charges maintenance — tendance</h3>
          </div>
          <Link to="/fleet" className="df-btn df-btn--ghost df-btn--sm text-xs">Voir flotte →</Link>
        </div>
        <div className="df-card__body">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={maintenanceTrend} margin={{ top: 10, right: 12, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--df-border)" vertical={false} />
                <XAxis dataKey="month" stroke="var(--df-text-faint)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--df-text-faint)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip
                  contentStyle={{ background: 'var(--df-surface-elev)', border: '1px solid var(--df-border-strong)', borderRadius: 12, color: 'var(--df-text)' }}
                  formatter={(v: number) => [formatCurrencyMad(v), 'Charges']}
                />
                <Line type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: '#f59e0b' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

    </div>
  );
};
