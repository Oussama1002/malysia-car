import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';
import { getRiskDashboard, type DashboardRange } from '@/services/dashboardApi';
import { ARREARS_STAGE_LABEL, arrearsStageTone, type ArrearsStage } from '@/services/arrearsApi';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { formatCurrencyMad } from '@/modules/shared/formatters';

const RANGES: { k: DashboardRange; label: string }[] = [
  { k: '30d', label: '30j' },
  { k: '90d', label: '90j' },
  { k: 'ytd', label: 'YTD' },
];

const CREDIT_STATUS_LABEL: Record<string, string> = {
  pending: 'En attente',
  under_review: 'En analyse',
  approved: 'Approuvé',
  rejected: 'Rejeté',
  cancelled: 'Annulé',
};

const CREDIT_TONE: Record<string, 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
  pending: 'warning',
  under_review: 'info',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'default',
};

const COLORS = ['#f43f5e', '#f59e0b', '#5b5bf4', '#10b981', '#22d3ee', '#e879f9', '#0ea5e9', '#84cc16'];

export const DashboardRiskPage: React.FC = () => {
  const [range, setRange] = useState<DashboardRange>('30d');

  const q = useQuery({
    queryKey: ['dashboard', 'risk', range],
    queryFn: () => getRiskDashboard({ range }),
    staleTime: 60_000,
  });

  const d = q.data?.data;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/dashboard" className="text-xs font-bold text-indigo-600">← Cockpit</Link>
          <h1 className="text-2xl font-black text-slate-900">Tableau de bord Risque</h1>
          <p className="text-slate-500">Contentieux, crédit, juridique — exposition réelle.</p>
        </div>
        <div className="df-tabs" role="tablist">
          {RANGES.map((r) => (
            <button key={r.k} role="tab" aria-selected={range === r.k} onClick={() => setRange(r.k)} className={`df-tab ${range === r.k ? 'df-tab--active' : ''}`}>{r.label}</button>
          ))}
        </div>
      </header>

      {/* Arrears KPIs */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="df-card"><div className="df-card__body">
          <div className="text-xs font-bold uppercase text-slate-500">Dossiers actifs</div>
          <div className="text-2xl font-black text-rose-600 mt-1">{d?.arrears.total_active ?? '…'}</div>
          <Link to="/arrears" className="text-xs text-indigo-600 hover:underline">Voir dossiers →</Link>
        </div></div>
        <div className="df-card"><div className="df-card__body">
          <div className="text-xs font-bold uppercase text-slate-500">Total impayés</div>
          <div className="text-2xl font-black text-rose-700 mt-1">{d ? formatCurrencyMad(d.arrears.total_overdue) : '…'}</div>
        </div></div>
        <div className="df-card"><div className="df-card__body">
          <div className="text-xs font-bold uppercase text-slate-500">Recouvré</div>
          <div className="text-2xl font-black text-emerald-600 mt-1">{d ? formatCurrencyMad(d.arrears.total_recovered) : '…'}</div>
          <div className="text-xs text-slate-400">Taux : {d?.arrears.recovery_rate ?? '—'}%</div>
        </div></div>
        <div className="df-card"><div className="df-card__body">
          <div className="text-xs font-bold uppercase text-slate-500">Promesses à honorer (7j)</div>
          <div className={`text-2xl font-black mt-1 ${(d?.arrears.upcoming_promises ?? 0) > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
            {d?.arrears.upcoming_promises ?? '…'}
          </div>
          <Link to="/arrears" className="text-xs text-indigo-600 hover:underline">Voir dossiers →</Link>
        </div></div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Arrears by stage */}
        <div className="df-card">
          <div className="df-card__header">
            <div>
              <div className="df-card__hint">Contentieux</div>
              <h3 className="text-lg font-bold tracking-tight">Dossiers par étape</h3>
            </div>
            <Link to="/arrears" className="df-btn df-btn--ghost df-btn--sm text-xs">Voir tout →</Link>
          </div>
          <div className="df-card__body">
            {d && d.arrears.by_stage.length > 0 ? (
              <>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={d.arrears.by_stage.map((s) => ({ name: ARREARS_STAGE_LABEL[s.stage as ArrearsStage] ?? s.stage, cnt: Number(s.cnt), overdue: s.overdue }))} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--df-border)" vertical={false} />
                      <XAxis dataKey="name" stroke="var(--df-text-faint)" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--df-text-faint)" fontSize={11} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ background: 'var(--df-surface-elev)', border: '1px solid var(--df-border-strong)', borderRadius: 12, color: 'var(--df-text)' }} />
                      <Bar dataKey="cnt" name="Dossiers" radius={[4, 4, 0, 0]}>
                        {d.arrears.by_stage.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 space-y-1.5">
                  {d.arrears.by_stage.map((s) => (
                    <div key={s.stage} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <StatusBadge label={ARREARS_STAGE_LABEL[s.stage as ArrearsStage] ?? s.stage} tone={arrearsStageTone(s.stage as ArrearsStage)} />
                        <span className="font-mono font-bold text-slate-700">{s.cnt} dossiers</span>
                      </div>
                      <span className="font-mono text-rose-600 text-xs">{formatCurrencyMad(Number(s.overdue))}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-emerald-600 text-sm font-semibold py-6 text-center">✓ Aucun dossier de contentieux actif.</p>
            )}
          </div>
        </div>

        {/* Credit + Legal */}
        <div className="space-y-4">
          {/* Credit status */}
          <div className="df-card">
            <div className="df-card__header">
              <div>
                <div className="df-card__hint">Crédit</div>
                <h3 className="text-base font-bold tracking-tight">Dossiers crédit par statut</h3>
              </div>
              <Link to="/credit" className="df-btn df-btn--ghost df-btn--sm text-xs">Voir →</Link>
            </div>
            <div className="df-card__body">
              {d && d.credit.by_status.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {d.credit.by_status.map((c) => (
                    <div key={c.status} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5">
                      <StatusBadge label={CREDIT_STATUS_LABEL[c.status] ?? c.status} tone={CREDIT_TONE[c.status] ?? 'default'} />
                      <span className="font-mono font-black text-slate-900">{c.cnt}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-400 text-sm">Aucun dossier crédit.</p>
              )}
            </div>
          </div>

          {/* Legal cases */}
          <div className="df-card">
            <div className="df-card__header">
              <div>
                <div className="df-card__hint">Juridique</div>
                <h3 className="text-base font-bold tracking-tight">Dossiers juridiques</h3>
              </div>
              <Link to="/arrears/legal" className="df-btn df-btn--ghost df-btn--sm text-xs">Voir →</Link>
            </div>
            <div className="df-card__body space-y-2">
              {d && d.legal.by_status.length > 0 ? (
                d.legal.by_status.map((l) => (
                  <div key={l.status} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 capitalize">{l.status.replace('_', ' ')}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-slate-500 text-xs">{formatCurrencyMad(Number(l.amount))}</span>
                      <span className="font-mono font-bold text-slate-900 w-6 text-right">{l.cnt}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-slate-400 text-sm">Aucun dossier juridique.</p>
              )}

              {d && d.legal.repo_orders.length > 0 && (
                <div className="mt-2 border-t border-slate-100 pt-2">
                  <div className="text-xs font-bold uppercase text-slate-400 mb-1">Ordres de saisie</div>
                  <div className="flex flex-wrap gap-2">
                    {d.legal.repo_orders.map((r) => (
                      <div key={r.status} className="flex items-center gap-1.5 rounded border border-slate-200 px-2 py-1 text-xs">
                        <span className="capitalize text-slate-600">{r.status}</span>
                        <span className="font-bold text-slate-900">{r.cnt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
