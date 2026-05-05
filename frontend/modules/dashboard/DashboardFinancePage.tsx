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
import { getFinanceDashboard, type DashboardRange } from '@/services/dashboardApi';
import { formatCurrencyMad } from '@/modules/shared/formatters';

const RANGES: { k: DashboardRange; label: string }[] = [
  { k: '7d', label: '7j' },
  { k: '30d', label: '30j' },
  { k: '90d', label: '90j' },
  { k: 'ytd', label: 'YTD' },
];

const METHOD_LABEL: Record<string, string> = {
  cash: 'Espèces',
  bank_transfer: 'Virement',
  cheque: 'Chèque',
  card: 'Carte',
  direct_debit: 'Prélèvement',
};

const COLORS = ['#5b5bf4', '#10b981', '#f59e0b', '#22d3ee', '#f43f5e'];

export const DashboardFinancePage: React.FC = () => {
  const [range, setRange] = useState<DashboardRange>('30d');

  const q = useQuery({
    queryKey: ['dashboard', 'finance', range],
    queryFn: () => getFinanceDashboard({ range }),
    staleTime: 60_000,
  });

  const d = q.data?.data;

  const collectionRate = d && d.invoiced.total > 0
    ? ((d.invoiced.paid / d.invoiced.total) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/dashboard" className="text-xs font-bold text-indigo-600">← Cockpit</Link>
          <h1 className="text-2xl font-black text-slate-900">Tableau de bord Finance</h1>
          <p className="text-slate-500">Facturation, encaissements, impayés — données réelles.</p>
        </div>
        <div className="df-tabs" role="tablist">
          {RANGES.map((r) => (
            <button key={r.k} role="tab" aria-selected={range === r.k} onClick={() => setRange(r.k)} className={`df-tab ${range === r.k ? 'df-tab--active' : ''}`}>{r.label}</button>
          ))}
        </div>
      </header>

      {/* KPI row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="df-card"><div className="df-card__body">
          <div className="text-xs font-bold uppercase text-slate-500">Facturé</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{d ? formatCurrencyMad(d.invoiced.total) : '…'}</div>
          <div className="text-xs text-slate-400 mt-0.5">{d?.invoiced.count ?? '—'} factures</div>
        </div></div>
        <div className="df-card"><div className="df-card__body">
          <div className="text-xs font-bold uppercase text-slate-500">Encaissé</div>
          <div className="text-2xl font-black text-emerald-600 mt-1">{d ? formatCurrencyMad(d.collected.total) : '…'}</div>
          <div className="text-xs text-slate-400 mt-0.5">Taux : {collectionRate}%</div>
        </div></div>
        <div className="df-card"><div className="df-card__body">
          <div className="text-xs font-bold uppercase text-slate-500">Impayés</div>
          <div className="text-2xl font-black text-rose-600 mt-1">{d ? formatCurrencyMad(d.overdue.amount) : '…'}</div>
          <div className="text-xs text-rose-400 mt-0.5">{d?.overdue.count ?? '—'} factures en retard</div>
        </div></div>
        <div className="df-card"><div className="df-card__body">
          <div className="text-xs font-bold uppercase text-slate-500">TVA collectée</div>
          <div className="text-2xl font-black text-indigo-600 mt-1">{d ? formatCurrencyMad(d.vat_collected) : '…'}</div>
        </div></div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Encaissement par mode */}
        <div className="df-card">
          <div className="df-card__header">
            <div>
              <div className="df-card__hint">Répartition</div>
              <h3 className="text-lg font-bold tracking-tight">Encaissements par mode</h3>
            </div>
          </div>
          <div className="df-card__body">
            {d && d.by_method.length > 0 ? (
              <>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={d.by_method.map((m) => ({ name: METHOD_LABEL[m.method] ?? m.method, value: m.total }))} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3} stroke="var(--df-surface-solid)" strokeWidth={2}>
                        {d.by_method.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'var(--df-surface-elev)', border: '1px solid var(--df-border-strong)', borderRadius: 12, color: 'var(--df-text)' }}
                        formatter={(v: number) => [formatCurrencyMad(v)]} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 space-y-1.5">
                  {d.by_method.map((m, i) => (
                    <div key={m.method} className="flex items-center gap-2 text-sm">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="flex-1 text-slate-700">{METHOD_LABEL[m.method] ?? m.method}</span>
                      <span className="font-mono font-bold text-slate-900">{formatCurrencyMad(m.total)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-slate-400 text-sm">Aucun encaissement sur la période.</p>
            )}
          </div>
        </div>

        {/* Top clients impayés */}
        <div className="df-card">
          <div className="df-card__header">
            <div>
              <div className="df-card__hint">Risque crédit</div>
              <h3 className="text-lg font-bold tracking-tight">Top 5 clients impayés</h3>
            </div>
            <Link to="/arrears" className="df-btn df-btn--ghost df-btn--sm text-xs">Contentieux →</Link>
          </div>
          <div className="df-card__body">
            {d && d.top_overdue.length > 0 ? (
              <div className="space-y-3">
                {d.top_overdue.map((c, i) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-100 text-xs font-black text-rose-600">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <Link to={`/customers/${c.id}`} className="font-semibold text-slate-900 hover:text-indigo-600 truncate block">{c.name}</Link>
                      <div className="text-xs text-slate-400">{c.invoice_count} facture{c.invoice_count > 1 ? 's' : ''}</div>
                    </div>
                    <div className="font-mono font-bold text-rose-600 text-sm shrink-0">{formatCurrencyMad(c.overdue_amount)}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-emerald-600 text-sm font-semibold">✓ Aucun client en impayé sur la période.</p>
            )}
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div className="grid gap-3 md:grid-cols-4">
        {[
          { to: '/finance/invoices', label: 'Toutes les factures', icon: '🧾' },
          { to: '/finance/payments', label: 'Tous les paiements', icon: '💳' },
          { to: '/finance/treasury', label: 'Trésorerie', icon: '🏦' },
          { to: '/accounting', label: 'Comptabilité', icon: '📊' },
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
