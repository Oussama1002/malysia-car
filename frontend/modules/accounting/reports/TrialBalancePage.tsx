import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getTrialBalance, ACCOUNT_TYPE_LABEL, type AccountType } from '@/services/accountingApi';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { formatCurrencyMad } from '@/modules/shared/formatters';

export const TrialBalancePage: React.FC = () => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const tbQ = useQuery({
    queryKey: ['accounting', 'trial-balance', { from, to }],
    queryFn: () => getTrialBalance({ from: from || undefined, to: to || undefined }),
  });

  const data = tbQ.data?.data;

  return (
    <div className="space-y-6">
      <header>
        <Link to="/accounting" className="text-xs font-bold text-indigo-600">← Comptabilité</Link>
        <h1 className="text-2xl font-black text-slate-900">Balance générale</h1>
      </header>

      <div className="df-card">
        <div className="df-card__body flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-bold uppercase text-slate-500">Du</label>
            <input type="date" className="df-input mt-1" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-slate-500">Au</label>
            <input type="date" className="df-input mt-1" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      {data && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="df-card"><div className="df-card__body"><div className="text-xs font-bold uppercase text-slate-500">Total débit</div><div className="text-xl font-black text-slate-900 mt-1">{formatCurrencyMad(data.totals.total_debit)}</div></div></div>
          <div className="df-card"><div className="df-card__body"><div className="text-xs font-bold uppercase text-slate-500">Total crédit</div><div className="text-xl font-black text-slate-900 mt-1">{formatCurrencyMad(data.totals.total_credit)}</div></div></div>
          <div className="df-card"><div className="df-card__body"><div className="text-xs font-bold uppercase text-slate-500">Équilibre</div><div className={`text-xl font-black mt-1 ${data.totals.is_balanced ? 'text-emerald-600' : 'text-rose-600'}`}>{data.totals.is_balanced ? '✓ Équilibrée' : '✗ Déséquilibrée'}</div></div></div>
        </div>
      )}

      {tbQ.isLoading ? (
        <div className="text-slate-500">Chargement…</div>
      ) : data && (
        <div className="df-card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Code</th>
                <th>Intitulé</th>
                <th>Type</th>
                <th className="text-right">Solde ouverture</th>
                <th className="text-right">Débit période</th>
                <th className="text-right">Crédit période</th>
                <th className="text-right">Solde clôture</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.lines.map((line) => (
                <tr key={line.account_code} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono font-bold text-slate-900">{line.account_code}</td>
                  <td className="text-slate-800">{line.account_name}</td>
                  <td><StatusBadge label={ACCOUNT_TYPE_LABEL[line.account_type as AccountType] ?? line.account_type} tone="default" /></td>
                  <td className="text-right font-mono text-slate-600">{formatCurrencyMad(Number(line.opening_balance))}</td>
                  <td className="text-right font-mono">{formatCurrencyMad(Number(line.period_debit))}</td>
                  <td className="text-right font-mono">{formatCurrencyMad(Number(line.period_credit))}</td>
                  <td className={`text-right font-mono font-bold ${Number(line.closing_balance) >= 0 ? 'text-slate-900' : 'text-rose-600'}`}>{formatCurrencyMad(Number(line.closing_balance))}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold text-xs uppercase tracking-wide">
                <td colSpan={4} className="px-4 py-2 text-slate-600">Totaux</td>
                <td className="text-right font-mono px-2">{formatCurrencyMad(data.totals.total_debit)}</td>
                <td className="text-right font-mono px-2">{formatCurrencyMad(data.totals.total_credit)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};
