import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { opsApi } from '@/services/opsApi';

interface Props {
  reservationId: string;
  invoices: any[];
  data: any;
  onRefresh: () => void;
}

const fmtMad = (v: number) => `${v.toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} MAD`;
const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString('fr-MA') : '—';

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  draft:    { label: 'Brouillon', cls: 'bg-slate-100 text-slate-600' },
  issued:   { label: 'Émise', cls: 'bg-indigo-100 text-indigo-700' },
  sent:     { label: 'Envoyée', cls: 'bg-cyan-100 text-cyan-700' },
  partial:  { label: 'Partielle', cls: 'bg-amber-100 text-amber-700' },
  paid:     { label: 'Payée', cls: 'bg-emerald-100 text-emerald-700' },
  overdue:  { label: 'Impayée', cls: 'bg-rose-100 text-rose-700' },
};

const TabInvoices: React.FC<Props> = ({ reservationId, invoices, data, onRefresh }) => {
  const totals = data?.totals ?? { estimated_price: 0, extensions_total: 0, damages_total: 0, paid: 0 };
  const [billingForm, setBillingForm] = useState({ issue_date: '', due_date: '' });
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingSuccess, setBillingSuccess] = useState<string | null>(null);

  const closeBillingM = useMutation({
    mutationFn: () => opsApi.closeBilling(reservationId, {
      issue_date: billingForm.issue_date || undefined,
      due_date: billingForm.due_date || undefined,
    }),
    onSuccess: (result: any) => {
      setBillingError(null);
      const invNum = result?.invoice_number ?? '';
      setBillingSuccess(invNum ? `Facture ${invNum} generee.` : 'Facture generee.');
      onRefresh();
      setTimeout(() => setBillingSuccess(null), 3000);
    },
    onError: (e: unknown) => {
      setBillingError(e instanceof Error ? e.message : 'Erreur lors de la generation.');
    },
  });

  return (
    <div className="space-y-6">
      {/* Cost breakdown */}
      <div className="rounded-xl border border-slate-100 p-5">
        <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">Ventilation des charges</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Location de base</span>
            <span className="font-bold text-slate-800">{fmtMad(totals.estimated_price)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Prolongations</span>
            <span className="font-bold text-slate-800">{fmtMad(totals.extensions_total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Dommages</span>
            <span className="font-bold text-slate-800">{fmtMad(totals.damages_total)}</span>
          </div>
          <div className="border-t border-slate-200 pt-2 flex justify-between">
            <span className="font-black text-slate-900">Total</span>
            <span className="font-black text-slate-900 text-base">
              {fmtMad(totals.estimated_price + totals.extensions_total + totals.damages_total)}
            </span>
          </div>
        </div>
      </div>

      {/* Invoices list */}
      <div>
        <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">
          Factures ({invoices.length})
        </h3>
        {invoices.length > 0 ? (
          <div className="space-y-3">
            {invoices.map((inv: any) => {
              const badge = STATUS_BADGE[inv.status] ?? { label: inv.status ?? '—', cls: 'bg-slate-100 text-slate-600' };
              return (
                <div key={inv.id} className="rounded-xl border border-slate-100 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-slate-800">{inv.invoice_number}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        Emise le {fmtDate(inv.issue_date)} — Echeance {fmtDate(inv.due_date)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-black text-slate-800">{fmtMad(Number(inv.total_amount ?? 0))}</div>
                    </div>
                  </div>

                  {/* Invoice lines */}
                  {inv.lines?.length > 0 && (
                    <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs">
                      {inv.lines.map((line: any, i: number) => (
                        <div key={i} className="flex justify-between py-1">
                          <span className="text-slate-600">{line.description}</span>
                          <span className="font-bold text-slate-700">{fmtMad(Number(line.line_total ?? 0))}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Invoice actions */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50" disabled>
                      📥 PDF
                    </button>
                    <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50" disabled>
                      📱 WhatsApp
                    </button>
                    <button className="rounded-lg border border-slate-200 px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50" disabled>
                      📧 Email
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
            Aucune facture generee
          </div>
        )}
      </div>

      {/* Generate invoice */}
      <div className="rounded-xl border border-slate-100 p-5">
        <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Generer facture</h3>
        {billingSuccess ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
            {billingSuccess}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[10px] font-bold text-slate-400">Date emission</label>
                <input
                  type="date"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  value={billingForm.issue_date}
                  onChange={(e) => { setBillingError(null); setBillingForm((s) => ({ ...s, issue_date: e.target.value })); }}
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold text-slate-400">Date echeance</label>
                <input
                  type="date"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  value={billingForm.due_date}
                  onChange={(e) => { setBillingError(null); setBillingForm((s) => ({ ...s, due_date: e.target.value })); }}
                />
              </div>
            </div>
            {billingError && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
                {billingError}
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => closeBillingM.mutate()}
                disabled={closeBillingM.isPending}
                className="rounded-xl bg-violet-700 px-5 py-2.5 text-sm font-black text-white hover:bg-violet-800 disabled:opacity-50"
              >
                {closeBillingM.isPending ? 'Generation…' : 'Cloturer & generer facture'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TabInvoices;
