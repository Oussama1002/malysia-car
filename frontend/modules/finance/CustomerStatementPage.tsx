import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getCustomerBalance, getCustomerStatement } from '@/services/financeApi';
import { KpiCard } from '@/modules/shared/components/KpiCard';
import { EmptyState } from '@/modules/shared/components/EmptyState';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { formatCurrencyMad, formatDate } from '@/modules/shared/formatters';

export const CustomerStatementPage: React.FC = () => {
  const { id = '' } = useParams();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const balQ = useQuery({
    queryKey: ['customer-balance', id],
    queryFn: () => getCustomerBalance(id),
    enabled: !!id,
  });
  const stQ = useQuery({
    queryKey: ['customer-statement', id, from, to],
    queryFn: () => getCustomerStatement(id, { from: from || undefined, to: to || undefined }),
    enabled: !!id,
  });

  const bal = balQ.data?.data;
  const st = stQ.data?.data;

  return (
    <div className="space-y-6">
      <Link to={`/customers/${id}`} className="text-xs font-bold text-indigo-600">
        ← Retour au dossier client
      </Link>

      <header>
        <h1 className="text-2xl font-black text-slate-900">Relevé de compte client</h1>
        <p className="text-slate-500">{st?.customer?.full_name ?? ''} {st?.customer?.customer_code ? `(${st.customer.customer_code})` : ''}</p>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard title="Total facturé" value={bal ? formatCurrencyMad(bal.total_invoiced) : '…'} accentClass="bg-indigo-600" />
        <KpiCard title="Total encaissé" value={bal ? formatCurrencyMad(bal.total_paid) : '…'} accentClass="bg-emerald-600" />
        <KpiCard title="Reste dû" value={bal ? formatCurrencyMad(bal.total_due) : '…'} accentClass="bg-amber-600" />
        <KpiCard title="Retards" value={bal ? formatCurrencyMad(bal.overdue_amount) : '…'} accentClass="bg-rose-600" />
      </div>

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
          <button className="df-btn df-btn--ghost" onClick={() => { setFrom(''); setTo(''); }}>
            Réinitialiser
          </button>
        </div>
      </div>

      {stQ.isLoading ? (
        <div className="text-slate-500">Chargement…</div>
      ) : !st || !st.entries.length ? (
        <EmptyState title="Aucun mouvement" description="Aucune facture ni paiement sur la période." />
      ) : (
        <div className="df-card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Date</th>
                <th>Type</th>
                <th>Référence</th>
                <th>Description</th>
                <th className="text-right">Débit</th>
                <th className="text-right">Crédit</th>
                <th className="text-right">Solde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {st.entries.map((e, idx) => (
                <tr key={`${e.source_id}-${idx}`}>
                  <td className="px-3 py-2">{e.date ? formatDate(e.date) : '—'}</td>
                  <td>
                    <StatusBadge
                      label={e.type === 'invoice' ? 'Facture' : 'Paiement'}
                      tone={e.type === 'invoice' ? 'info' : 'success'}
                    />
                  </td>
                  <td className="font-mono text-xs">{e.reference}</td>
                  <td>{e.description}</td>
                  <td className="text-right">{e.debit ? formatCurrencyMad(e.debit) : '—'}</td>
                  <td className="text-right">{e.credit ? formatCurrencyMad(e.credit) : '—'}</td>
                  <td className="text-right font-bold">{formatCurrencyMad(e.running_balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 text-sm">
                <td className="px-3 py-2 font-bold" colSpan={4}>
                  Totaux
                </td>
                <td className="text-right font-bold">{formatCurrencyMad(st.total_debit)}</td>
                <td className="text-right font-bold">{formatCurrencyMad(st.total_credit)}</td>
                <td className="text-right font-black">{formatCurrencyMad(st.closing_balance)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};
