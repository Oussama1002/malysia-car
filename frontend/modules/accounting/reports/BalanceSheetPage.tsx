import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getBalanceSheet } from '@/services/accountingApi';
import { formatCurrencyMad } from '@/modules/shared/formatters';

export const BalanceSheetPage: React.FC = () => {
  const [asOf, setAsOf] = useState(new Date().toISOString().substring(0, 10));

  const bsQ = useQuery({
    queryKey: ['accounting', 'balance-sheet', asOf],
    queryFn: () => getBalanceSheet(asOf || undefined),
  });

  const data = bsQ.data?.data;

  return (
    <div className="space-y-6">
      <header>
        <Link to="/accounting" className="text-xs font-bold text-indigo-600">← Comptabilité</Link>
        <h1 className="text-2xl font-black text-slate-900">Bilan — Actif / Passif</h1>
      </header>

      <div className="df-card">
        <div className="df-card__body flex gap-3 items-end">
          <div>
            <label className="text-xs font-bold uppercase text-slate-500">À la date du</label>
            <input type="date" className="df-input mt-1" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          </div>
        </div>
      </div>

      {data && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="df-card"><div className="df-card__body"><div className="text-xs font-bold uppercase text-slate-500">Total Actif</div><div className="text-xl font-black text-indigo-700 mt-1">{formatCurrencyMad(data.assets.total)}</div></div></div>
          <div className="df-card"><div className="df-card__body"><div className="text-xs font-bold uppercase text-slate-500">Total Passif + Capitaux</div><div className="text-xl font-black text-slate-900 mt-1">{formatCurrencyMad(data.total_liabilities_equity)}</div></div></div>
          <div className="df-card"><div className="df-card__body"><div className="text-xs font-bold uppercase text-slate-500">Équilibre</div><div className={`text-xl font-black mt-1 ${data.is_balanced ? 'text-emerald-600' : 'text-rose-600'}`}>{data.is_balanced ? '✓ Équilibré' : '✗ Déséquilibré'}</div></div></div>
        </div>
      )}

      {bsQ.isLoading ? (
        <div className="text-slate-500">Chargement…</div>
      ) : data && (
        <div className="grid gap-6 md:grid-cols-2">
          {/* ACTIF */}
          <div className="df-card overflow-x-auto">
            <div className="df-card__body border-b border-slate-100 pb-2">
              <h2 className="font-bold text-indigo-700">ACTIF</h2>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {data.assets.lines.map((line) => (
                  <tr key={line.code} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-slate-600">{line.code}</td>
                    <td className="text-slate-800">{line.name}</td>
                    <td className="text-right font-mono font-semibold pr-4">{formatCurrencyMad(Number(line.balance))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-indigo-200 bg-indigo-50 font-bold">
                  <td colSpan={2} className="px-4 py-2 text-indigo-700 text-xs uppercase tracking-wide">Total Actif</td>
                  <td className="text-right font-mono text-indigo-700 pr-4">{formatCurrencyMad(data.assets.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* PASSIF + CAPITAUX */}
          <div className="space-y-4">
            <div className="df-card overflow-x-auto">
              <div className="df-card__body border-b border-slate-100 pb-2">
                <h2 className="font-bold text-orange-700">PASSIF</h2>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {data.liabilities.lines.map((line) => (
                    <tr key={line.code} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-slate-600">{line.code}</td>
                      <td className="text-slate-800">{line.name}</td>
                      <td className="text-right font-mono font-semibold pr-4">{formatCurrencyMad(Number(line.balance))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-orange-200 bg-orange-50 font-bold">
                    <td colSpan={2} className="px-4 py-2 text-orange-700 text-xs uppercase tracking-wide">Total Passif</td>
                    <td className="text-right font-mono text-orange-700 pr-4">{formatCurrencyMad(data.liabilities.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="df-card overflow-x-auto">
              <div className="df-card__body border-b border-slate-100 pb-2">
                <h2 className="font-bold text-emerald-700">CAPITAUX PROPRES</h2>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-100">
                  {data.equity.lines.map((line) => (
                    <tr key={line.code} className="hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-slate-600">{line.code}</td>
                      <td className="text-slate-800">{line.name}</td>
                      <td className="text-right font-mono font-semibold pr-4">{formatCurrencyMad(Number(line.balance))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-emerald-200 bg-emerald-50 font-bold">
                    <td colSpan={2} className="px-4 py-2 text-emerald-700 text-xs uppercase tracking-wide">Total Capitaux</td>
                    <td className="text-right font-mono text-emerald-700 pr-4">{formatCurrencyMad(data.equity.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
