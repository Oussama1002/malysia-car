import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getIncomeStatement } from '@/services/accountingApi';
import { formatCurrencyMad } from '@/modules/shared/formatters';

export const IncomeStatementPage: React.FC = () => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const plQ = useQuery({
    queryKey: ['accounting', 'income-statement', { from, to }],
    queryFn: () => getIncomeStatement({ from: from || undefined, to: to || undefined }),
  });

  const data = plQ.data?.data;

  return (
    <div className="space-y-6">
      <header>
        <Link to="/accounting" className="text-xs font-bold text-indigo-600">← Comptabilité</Link>
        <h1 className="text-2xl font-black text-slate-900">Compte de résultat</h1>
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
          <div className="df-card"><div className="df-card__body">
            <div className="text-xs font-bold uppercase text-slate-500">Total Produits</div>
            <div className="text-xl font-black text-emerald-700 mt-1">{formatCurrencyMad(data.income.total)}</div>
          </div></div>
          <div className="df-card"><div className="df-card__body">
            <div className="text-xs font-bold uppercase text-slate-500">Total Charges</div>
            <div className="text-xl font-black text-rose-600 mt-1">{formatCurrencyMad(data.expense.total)}</div>
          </div></div>
          <div className="df-card"><div className="df-card__body">
            <div className="text-xs font-bold uppercase text-slate-500">Résultat net</div>
            <div className={`text-xl font-black mt-1 ${data.net_income >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
              {formatCurrencyMad(data.net_income)}
            </div>
            <div className={`text-xs mt-1 font-bold ${data.is_profitable ? 'text-emerald-600' : 'text-rose-500'}`}>
              {data.is_profitable ? '↑ Bénéfice' : '↓ Déficit'}
            </div>
          </div></div>
        </div>
      )}

      {plQ.isLoading ? (
        <div className="text-slate-500">Chargement…</div>
      ) : data && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* Produits */}
          <div className="df-card overflow-x-auto">
            <div className="df-card__body border-b border-slate-100 pb-2">
              <h2 className="font-bold text-emerald-700">PRODUITS</h2>
              {data.from && <p className="text-xs text-slate-500">Du {data.from} au {data.to}</p>}
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {data.income.lines.map((line) => (
                  <tr key={line.code} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-slate-600">{line.code}</td>
                    <td className="text-slate-800">{line.name}</td>
                    <td className="text-right font-mono font-semibold text-emerald-700 pr-4">{formatCurrencyMad(Number(line.amount))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-emerald-200 bg-emerald-50 font-bold">
                  <td colSpan={2} className="px-4 py-2 text-emerald-700 text-xs uppercase tracking-wide">Total Produits</td>
                  <td className="text-right font-mono text-emerald-700 pr-4">{formatCurrencyMad(data.income.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Charges */}
          <div className="df-card overflow-x-auto">
            <div className="df-card__body border-b border-slate-100 pb-2">
              <h2 className="font-bold text-rose-700">CHARGES</h2>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {data.expense.lines.map((line) => (
                  <tr key={line.code} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-slate-600">{line.code}</td>
                    <td className="text-slate-800">{line.name}</td>
                    <td className="text-right font-mono font-semibold text-rose-600 pr-4">{formatCurrencyMad(Number(line.amount))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-rose-200 bg-rose-50 font-bold">
                  <td colSpan={2} className="px-4 py-2 text-rose-700 text-xs uppercase tracking-wide">Total Charges</td>
                  <td className="text-right font-mono text-rose-700 pr-4">{formatCurrencyMad(data.expense.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {data && (
        <div className={`rounded-xl p-4 font-bold text-center text-lg ${data.net_income >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
          {data.net_income >= 0 ? 'Bénéfice net : ' : 'Déficit net : '}
          {formatCurrencyMad(Math.abs(data.net_income))}
        </div>
      )}
    </div>
  );
};
