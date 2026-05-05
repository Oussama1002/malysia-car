import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getTaxReport } from '@/services/accountingApi';
import { formatCurrencyMad } from '@/modules/shared/formatters';

export const TaxReportPage: React.FC = () => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const taxQ = useQuery({
    queryKey: ['accounting', 'tax-report', { from, to }],
    queryFn: () => getTaxReport({ from: from || undefined, to: to || undefined }),
  });

  const data = taxQ.data?.data;

  return (
    <div className="space-y-6">
      <header>
        <Link to="/accounting" className="text-xs font-bold text-indigo-600">← Comptabilité</Link>
        <h1 className="text-2xl font-black text-slate-900">État TVA</h1>
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
        <div className="grid gap-4 md:grid-cols-2">
          <div className="df-card"><div className="df-card__body">
            <div className="text-xs font-bold uppercase text-slate-500">TVA collectée</div>
            <div className="text-xl font-black text-indigo-700 mt-1">{formatCurrencyMad(data.total_vat_collected)}</div>
          </div></div>
          <div className="df-card"><div className="df-card__body">
            <div className="text-xs font-bold uppercase text-slate-500">Retenues à la source</div>
            <div className="text-xl font-black text-orange-600 mt-1">{formatCurrencyMad(data.total_withholding)}</div>
          </div></div>
        </div>
      )}

      {taxQ.isLoading ? (
        <div className="text-slate-500">Chargement…</div>
      ) : data && (Array.isArray(data.taxes) && data.taxes.length > 0 ? (
        <div className="df-card overflow-x-auto">
          <div className="df-card__body border-b border-slate-100 pb-2">
            <h2 className="font-bold text-slate-800">Détail par taxe</h2>
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Code taxe</th>
                <th>Nom</th>
                <th>Type</th>
                <th className="text-right">Taux</th>
                <th className="text-right">Montant taxe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data.taxes as Record<string, unknown>[]).map((t, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono font-bold text-slate-900">{String(t.tax_code ?? '—')}</td>
                  <td className="text-slate-800">{String(t.tax_name ?? '—')}</td>
                  <td className="text-slate-600">{String(t.tax_type ?? '—')}</td>
                  <td className="text-right font-mono">{t.rate != null ? `${Number(t.rate).toFixed(1)}%` : '—'}</td>
                  <td className="text-right font-mono font-semibold">{formatCurrencyMad(Number(t.total_tax ?? 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="df-card"><div className="df-card__body text-slate-500">Aucun mouvement de taxe sur cette période.</div></div>
      ))}
    </div>
  );
};
