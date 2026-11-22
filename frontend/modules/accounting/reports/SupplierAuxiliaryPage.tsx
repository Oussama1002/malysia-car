import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getSupplierAuxiliary } from '@/services/accountingApi';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { formatCurrencyMad } from '@/modules/shared/formatters';
import { DateField } from '@/modules/shared/components/DateField';

export const SupplierAuxiliaryPage: React.FC = () => {
  const [asOf, setAsOf] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [accountCode, setAccountCode] = useState('');

  const q = useQuery({
    queryKey: ['accounting', 'supplier-aux', { asOf, onlyOpen, accountCode }],
    queryFn: () =>
      getSupplierAuxiliary({
        as_of: asOf || undefined,
        only_open: onlyOpen,
        account_code: accountCode || undefined,
      }),
  });

  const data = q.data?.data;

  return (
    <div className="space-y-6">
      <header>
        <Link to="/accounting" className="text-xs font-bold text-indigo-600">← Comptabilité</Link>
        <h1 className="text-2xl font-black text-slate-900">Grand livre auxiliaire fournisseurs</h1>
        <p className="text-sm text-slate-500">Dettes fournisseurs (4411) et sous-location (6136) — soldes à une date donnée.</p>
      </header>

      <div className="df-card">
        <div className="df-card__body flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-bold uppercase text-slate-500">Au</label>
            <DateField className="df-input mt-1" value={asOf} onChange={(v) => setAsOf(v)} />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-slate-500">Compte</label>
            <input
              className="df-input mt-1 w-32"
              placeholder="Tous"
              value={accountCode}
              onChange={(e) => setAccountCode(e.target.value)}
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={onlyOpen}
              onChange={(e) => setOnlyOpen(e.target.checked)}
            />
            Soldes non apurés seulement
          </label>
        </div>
      </div>

      {data && (
        <div className="grid gap-4 md:grid-cols-4">
          <Kpi label="Fournisseurs" value={String(data.totals.supplier_count)} />
          <Kpi label="Total débit" value={formatCurrencyMad(data.totals.total_debit)} />
          <Kpi label="Total crédit" value={formatCurrencyMad(data.totals.total_credit)} />
          <Kpi
            label="Solde net (dû)"
            value={formatCurrencyMad(data.totals.total_balance)}
            tone={data.totals.total_balance >= 0 ? 'rose' : 'emerald'}
          />
        </div>
      )}

      {q.isLoading ? (
        <div className="text-slate-500">Chargement…</div>
      ) : data && (
        <div className="df-card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Fournisseur</th>
                <th>Type</th>
                <th className="text-right">Débit</th>
                <th className="text-right">Crédit</th>
                <th className="text-right">Solde</th>
                <th className="text-right">Lignes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.suppliers.map((row) => (
                <tr key={`${row.supplier_kind}-${row.supplier_id}`} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-semibold text-slate-900">{row.supplier_name}</td>
                  <td>
                    <StatusBadge
                      label={row.supplier_kind === 'supplier_agency' ? 'Sous-location' : 'Fournisseur'}
                      tone="default"
                    />
                  </td>
                  <td className="text-right font-mono">{formatCurrencyMad(row.total_debit)}</td>
                  <td className="text-right font-mono">{formatCurrencyMad(row.total_credit)}</td>
                  <td className={`text-right font-mono font-bold ${row.balance >= 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {formatCurrencyMad(row.balance)}
                  </td>
                  <td className="text-right text-slate-500">{row.line_count}</td>
                </tr>
              ))}
              {data.suppliers.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Aucun fournisseur à afficher.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const Kpi: React.FC<{ label: string; value: string; tone?: 'rose' | 'emerald' }> = ({ label, value, tone }) => (
  <div className="df-card">
    <div className="df-card__body">
      <div className="text-xs font-bold uppercase text-slate-500">{label}</div>
      <div className={`text-xl font-black mt-1 ${tone === 'rose' ? 'text-rose-600' : tone === 'emerald' ? 'text-emerald-600' : 'text-slate-900'}`}>{value}</div>
    </div>
  </div>
);
