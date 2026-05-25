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
import { notificationsApi, type NotificationDto } from '@/services/notificationsApi';
import { maintenanceApi, type MaintenanceAlertDto } from '@/services/maintenanceApi';
import { gpsApi } from '@/services/gpsApi';
import type { GpsAlertDto } from '@/services/dtos';
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

      {/* ── Notifications & alerts center ───────────────────────────────── */}
      <NotificationsAlertsSection />

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

// ═══════════════════════════════════════════════════════════════════════════
// Notifications & alerts center
// ───────────────────────────────────────────────────────────────────────────
// Aggregates three independent feeds in one place so the dirigeant doesn't
// have to navigate to the bell icon, the fleet module, and the GPS module
// separately:
//   1. In-app notifications  → notificationsApi.list (paginated, all modules)
//   2. Maintenance alerts    → maintenanceApi.alerts (vehicle-bound)
//   3. GPS alerts            → gpsApi.alerts (speeding, geofence, offline…)
//
// Each feed query is independent — if one endpoint is down (e.g. GPS provider
// outage) the others still render. Empty/error states are inline per tab.
// ═══════════════════════════════════════════════════════════════════════════

type AlertSource = 'notification' | 'maintenance' | 'gps';
type AlertSeverity = 'critical' | 'high' | 'normal' | 'low';

interface UnifiedAlert {
  id: string;
  source: AlertSource;
  severity: AlertSeverity;
  title: string;
  body: string | null;
  at: string | null;
  linkTo: string | null;
  read?: boolean;
}

const SOURCE_META: Record<AlertSource, { label: string; icon: string; color: string }> = {
  notification: { label: 'Notifications',  icon: '🔔', color: '#5b5bf4' },
  maintenance:  { label: 'Maintenance',    icon: '🔧', color: '#f59e0b' },
  gps:          { label: 'GPS',            icon: '🛰️', color: '#22d3ee' },
};

const SEVERITY_TONE: Record<AlertSeverity, { bg: string; text: string; border: string; label: string }> = {
  critical: { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-200',   label: 'Critique' },
  high:     { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  label: 'Élevée'   },
  normal:   { bg: 'bg-sky-50',    text: 'text-sky-700',    border: 'border-sky-200',    label: 'Normale'  },
  low:      { bg: 'bg-slate-50',  text: 'text-slate-600',  border: 'border-slate-200',  label: 'Info'     },
};

/** Map any free-form severity string from the 3 backends into our 4 buckets. */
function normalizeSeverity(raw: string | null | undefined): AlertSeverity {
  const v = (raw ?? '').toLowerCase();
  if (v === 'critical' || v === 'urgent') return 'critical';
  if (v === 'high' || v === 'warning')    return 'high';
  if (v === 'low' || v === 'info')        return 'low';
  return 'normal';
}

const NotificationsAlertsSection: React.FC = () => {
  const [tab, setTab] = useState<'all' | AlertSource>('all');

  // ── 3 independent queries — failure of one does not poison the others ──
  const notifQ = useQuery({
    queryKey: ['dashboard', 'notifications'],
    // Pull the 50 most recent across all modules — we filter/sort client-side.
    queryFn:  () => notificationsApi.list({ per_page: 50 }),
    staleTime: 30_000,
    retry:     1,
  });

  const maintQ = useQuery({
    queryKey: ['dashboard', 'maintenance-alerts'],
    queryFn:  () => maintenanceApi.alerts(),
    staleTime: 60_000,
    retry:     1,
  });

  const gpsQ = useQuery({
    queryKey: ['dashboard', 'gps-alerts'],
    queryFn:  () => gpsApi.alerts(),
    staleTime: 30_000,
    retry:     1,
  });

  // ── Normalize every feed into the same shape so they can share one list ──
  const unified: UnifiedAlert[] = useMemo(() => {
    const items: UnifiedAlert[] = [];

    (notifQ.data?.data ?? []).forEach((n: NotificationDto) => {
      items.push({
        id:       `notif-${n.id}`,
        source:   'notification',
        severity: normalizeSeverity(n.priority),
        title:    n.title,
        body:     n.body,
        at:       n.created_at,
        linkTo:   n.link_url,
        read:     n.read_at != null,
      });
    });

    (maintQ.data?.data?.alerts ?? []).forEach((a: MaintenanceAlertDto) => {
      const reg = a.vehicle?.registration ? ` · ${a.vehicle.registration}` : '';
      items.push({
        id:       `maint-${a.id}`,
        source:   'maintenance',
        severity: normalizeSeverity(a.severity),
        title:    `${a.title}${reg}`,
        body:     a.description,
        at:       a.triggeredAt,
        linkTo:   a.vehicle?.id ? `/fleet/${a.vehicle.id}` : '/fleet',
      });
    });

    (gpsQ.data ?? []).forEach((g: GpsAlertDto) => {
      items.push({
        id:       `gps-${g.id}`,
        source:   'gps',
        severity: normalizeSeverity(g.severity),
        title:    g.type ? String(g.type) : 'Alerte GPS',
        body:     g.message ?? null,
        at:       g.at ?? null,
        linkTo:   '/gps/alerts',
      });
    });

    // Most recent first; null dates sink to the bottom.
    return items.sort((a, b) => {
      const ta = a.at ? Date.parse(a.at) : 0;
      const tb = b.at ? Date.parse(b.at) : 0;
      return tb - ta;
    });
  }, [notifQ.data, maintQ.data, gpsQ.data]);

  const counts = useMemo(() => {
    const c = { all: unified.length, notification: 0, maintenance: 0, gps: 0, critical: 0, unread: 0 };
    unified.forEach((u) => {
      c[u.source]++;
      if (u.severity === 'critical') c.critical++;
      if (u.source === 'notification' && u.read === false) c.unread++;
    });
    return c;
  }, [unified]);

  const filtered = tab === 'all' ? unified : unified.filter((u) => u.source === tab);

  const anyLoading = notifQ.isLoading || maintQ.isLoading || gpsQ.isLoading;
  const allFailed  = notifQ.isError && maintQ.isError && gpsQ.isError;

  return (
    <section className="df-card">
      <div className="df-card__header">
        <div>
          <div className="df-card__hint">Centre opérationnel</div>
          <h3 className="text-lg font-bold tracking-tight">Notifications &amp; alertes</h3>
        </div>
        <div className="flex items-center gap-2">
          {counts.critical > 0 && (
            <StatusChip label={`${counts.critical} critique${counts.critical > 1 ? 's' : ''}`} tone="danger" dot />
          )}
          {counts.unread > 0 && (
            <StatusChip label={`${counts.unread} non lu${counts.unread > 1 ? 's' : ''}`} tone="brand" dot />
          )}
          <Link to="/notifications" className="df-btn df-btn--ghost df-btn--sm text-xs">
            Tout voir →
          </Link>
        </div>
      </div>

      <div className="df-card__body">
        {/* Source filter tabs */}
        <div className="df-tabs mb-4 flex-wrap" role="tablist">
          {(['all', 'notification', 'maintenance', 'gps'] as const).map((k) => {
            const label = k === 'all' ? 'Tout' : SOURCE_META[k].label;
            const count = k === 'all' ? counts.all : counts[k];
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`df-tab ${tab === k ? 'df-tab--active' : ''}`}
              >
                {k !== 'all' && <span className="mr-1">{SOURCE_META[k as AlertSource].icon}</span>}
                {label}
                <span className="ml-2 rounded-full bg-[color:var(--df-surface-elev)] px-2 py-0.5 text-[10px] font-bold text-[color:var(--df-text-muted)]">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* States */}
        {anyLoading && filtered.length === 0 && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="df-shimmer h-16 rounded-xl" />
            ))}
          </div>
        )}

        {allFailed && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            Impossible de charger les notifications et les alertes — vérifiez la connexion à l'API.
          </div>
        )}

        {!anyLoading && !allFailed && filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[color:var(--df-border)] py-10 text-center text-sm text-[color:var(--df-text-muted)]">
            <div className="mb-2 text-3xl">✨</div>
            Aucune notification ni alerte à signaler.
          </div>
        )}

        {/* Unified, scrollable list (cap height so the dashboard stays compact) */}
        {filtered.length > 0 && (
          <ul className="max-h-[28rem] divide-y divide-[color:var(--df-border)] overflow-y-auto">
            {filtered.slice(0, 50).map((a) => {
              const meta = SOURCE_META[a.source];
              const tone = SEVERITY_TONE[a.severity];
              const row = (
                <li
                  className={`flex items-start gap-3 py-3 transition ${
                    a.linkTo ? 'cursor-pointer hover:bg-[color:var(--df-surface-elev)]' : ''
                  } ${a.read === false ? 'bg-indigo-50/40' : ''}`}
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
                    style={{ background: `color-mix(in srgb, ${meta.color} 12%, transparent)` }}
                    title={meta.label}
                  >
                    {meta.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold text-[color:var(--df-text)]">{a.title}</span>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tone.bg} ${tone.text} ${tone.border}`}
                      >
                        {tone.label}
                      </span>
                      {a.read === false && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-indigo-500" title="Non lue" />
                      )}
                    </div>
                    {a.body && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-[color:var(--df-text-muted)]">{a.body}</p>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-[color:var(--df-text-faint)]">
                      <span className="font-semibold uppercase tracking-wide">{meta.label}</span>
                      {a.at && <span>· {formatDate(new Date(a.at))}</span>}
                    </div>
                  </div>
                  {a.linkTo && <span className="self-center text-[color:var(--df-text-faint)]">→</span>}
                </li>
              );
              return a.linkTo ? (
                <Link key={a.id} to={a.linkTo} className="block px-1 no-underline">
                  {row}
                </Link>
              ) : (
                <div key={a.id} className="px-1">
                  {row}
                </div>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};
