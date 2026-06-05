import React from 'react';
import { Link } from 'react-router-dom';

interface Props {
  data: any;
}

const fmtMad = (v: number) => `${v.toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} MAD`;
const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const METHOD_FR: Record<string, string> = {
  cash: 'Espèces',
  cheque: 'Chèque',
  bank_transfer: 'Virement',
  card: 'Carte',
  mobile: 'Mobile',
};

const STATUS_FR: Record<string, { label: string; cls: string }> = {
  received:  { label: 'Reçu', cls: 'bg-emerald-100 text-emerald-700' },
  allocated: { label: 'Alloué', cls: 'bg-indigo-100 text-indigo-700' },
  pending:   { label: 'En attente', cls: 'bg-amber-100 text-amber-700' },
};

const TabPayments: React.FC<Props> = ({ data }) => {
  if (!data) return null;
  const payments = data.payments ?? [];
  const totals = data.totals ?? { estimated_price: 0, extensions_total: 0, damages_total: 0, paid: 0 };
  const grandTotal = totals.estimated_price + totals.extensions_total + totals.damages_total;
  const balance = grandTotal - totals.paid;

  return (
    <div className="space-y-6">
      {/* Financial summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl bg-slate-50 px-4 py-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Montant location</div>
          <div className="mt-1 text-lg font-black text-slate-800">{fmtMad(totals.estimated_price)}</div>
        </div>
        <div className="rounded-xl bg-violet-50 px-4 py-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-violet-400">Caution</div>
          <div className="mt-1 text-lg font-black text-violet-700">—</div>
        </div>
        <div className="rounded-xl bg-emerald-50 px-4 py-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Payé</div>
          <div className="mt-1 text-lg font-black text-emerald-700">{fmtMad(totals.paid)}</div>
        </div>
        <div className={`rounded-xl px-4 py-4 ${balance > 0 ? 'bg-rose-50' : 'bg-emerald-50'}`}>
          <div className={`text-[10px] font-bold uppercase tracking-widest ${balance > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>Restant</div>
          <div className={`mt-1 text-lg font-black ${balance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{fmtMad(balance)}</div>
        </div>
      </div>

      {/* Payment table */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">
            Paiements ({payments.length})
          </h3>
          <Link
            to={`/finance/payments`}
            className="rounded-xl bg-violet-600 px-4 py-2 text-xs font-black text-white hover:bg-violet-700"
          >
            + Ajouter paiement
          </Link>
        </div>

        {payments.length > 0 ? (
          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-right">Montant</th>
                  <th className="px-4 py-2.5 text-left">Mode</th>
                  <th className="px-4 py-2.5 text-left">Référence</th>
                  <th className="px-4 py-2.5 text-center">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p: any) => {
                  const badge = STATUS_FR[p.status] ?? { label: p.status ?? '—', cls: 'bg-slate-100 text-slate-600' };
                  return (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-600">{fmtDate(p.payment_date)}</td>
                      <td className="px-4 py-3 text-right font-black text-slate-800">{fmtMad(Number(p.amount ?? 0))}</td>
                      <td className="px-4 py-3 text-slate-600">{METHOD_FR[p.payment_method] ?? p.payment_method ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-xs">{p.external_reference || p.check_number || p.payment_number || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
            Aucun paiement enregistré pour cette réservation
          </div>
        )}
      </div>
    </div>
  );
};

export default TabPayments;
