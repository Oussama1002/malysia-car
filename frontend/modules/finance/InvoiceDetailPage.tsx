import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelInvoice,
  getInvoice,
  INVOICE_STATUS_LABEL,
  invoiceStatusTone,
  issueInvoice,
  createPayment,
} from '@/services/financeApi';
import { ApiError } from '@/services/apiError';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { EmptyState } from '@/modules/shared/components/EmptyState';
import { formatCurrencyMad, formatDate } from '@/modules/shared/formatters';
import { GeneratePdfButton } from '@/modules/shared/components/GeneratePdfButton';
import { EntityAuditTimeline } from '@/modules/shared/components/EntityAuditTimeline';

export const InvoiceDetailPage: React.FC = () => {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invQ = useQuery({ queryKey: ['invoice', id], queryFn: () => getInvoice(id), enabled: !!id });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['invoice', id] });
    qc.invalidateQueries({ queryKey: ['invoices'] });
  };

  const issueMut = useMutation({ mutationFn: () => issueInvoice(id), onSuccess: invalidate });
  const cancelMut = useMutation({
    mutationFn: (reason: string) => cancelInvoice(id, reason),
    onSuccess: invalidate,
  });

  const payMut = useMutation({
    mutationFn: (p: {
      amount: number;
      payment_method: 'cash' | 'bank_transfer' | 'check' | 'card' | 'compensation';
      payment_date: string;
      external_reference?: string;
    }) =>
      createPayment({
        customer_id: invQ.data?.data.customer_id ?? '',
        payment_method: p.payment_method,
        payment_direction: 'incoming',
        amount: p.amount,
        payment_date: p.payment_date,
        external_reference: p.external_reference,
        allocations: [{ invoice_id: id, amount_allocated: p.amount }],
      }),
    onSuccess: () => {
      invalidate();
      setPayOpen(false);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  if (invQ.isLoading) return <div className="text-slate-500">Chargement…</div>;
  if (!invQ.data) return <EmptyState title="Facture introuvable" />;
  const i = invQ.data.data;

  return (
    <div className="space-y-6">
      <Link to="/finance/invoices" className="text-xs font-bold text-indigo-600">
        ← Toutes les factures
      </Link>

      <div className="df-card df-card--elevated">
        <div className="df-card__body flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900">{i.invoice_number}</h1>
              <StatusBadge label={INVOICE_STATUS_LABEL[i.status]} tone={invoiceStatusTone(i.status)} />
            </div>
            <p className="text-slate-500">
              {i.customer?.full_name ?? '—'} · émise {i.issue_date ? formatDate(i.issue_date) : '—'}
              {i.due_date ? ` · échéance ${formatDate(i.due_date)}` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {i.status === 'draft' && (
              <button className="df-btn df-btn--primary" onClick={() => issueMut.mutate()} disabled={issueMut.isPending}>
                Émettre
              </button>
            )}
            {!['paid', 'cancelled'].includes(i.status) && (
              <button
                className="df-btn df-btn--danger"
                onClick={() => {
                  const reason = window.prompt('Motif de l\'annulation ?') ?? '';
                  if (reason) cancelMut.mutate(reason);
                }}
                disabled={cancelMut.isPending}
              >
                Annuler
              </button>
            )}
            {!['paid', 'cancelled', 'draft'].includes(i.status) && Number(i.amount_due) > 0 && (
              <button className="df-btn df-btn--primary" onClick={() => setPayOpen(true)}>
                Encaisser
              </button>
            )}
            <GeneratePdfButton kind="invoice" entityId={String(i.id)} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard title="Sous-total" value={formatCurrencyMad(Number(i.subtotal_amount))} />
        <SummaryCard title="TVA" value={formatCurrencyMad(Number(i.tax_amount))} />
        <SummaryCard title="Total" value={formatCurrencyMad(Number(i.total_amount))} />
        <SummaryCard title="Reste dû" value={formatCurrencyMad(Number(i.amount_due))} tone={Number(i.amount_due) > 0 ? 'amber' : 'emerald'} />
      </div>

      <div className="df-card">
        <div className="df-card__body">
          <h3 className="font-black text-slate-900">Lignes de facture</h3>
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="py-2">#</th>
                <th>Description</th>
                <th>Qté</th>
                <th className="text-right">PU</th>
                <th className="text-right">Remise</th>
                <th className="text-right">TVA</th>
                <th className="text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(i.lines ?? []).map((l) => (
                <tr key={l.id}>
                  <td className="py-2 text-xs">{l.position}</td>
                  <td>{l.description}</td>
                  <td>{Number(l.quantity)}</td>
                  <td className="text-right">{formatCurrencyMad(Number(l.unit_price))}</td>
                  <td className="text-right">{formatCurrencyMad(Number(l.discount_amount))}</td>
                  <td className="text-right">{formatCurrencyMad(Number(l.tax_amount))}</td>
                  <td className="text-right font-semibold">{formatCurrencyMad(Number(l.line_total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="df-card">
        <div className="df-card__body">
          <h3 className="font-black text-slate-900">Allocations</h3>
          {!i.allocations?.length ? (
            <p className="mt-2 text-sm text-slate-500">Aucun paiement alloué pour le moment.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {i.allocations.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <span>
                    {a.payment?.payment_number ?? a.payment_id} · {a.allocated_at ? formatDate(a.allocated_at) : '—'}
                  </span>
                  <span className="font-bold">{formatCurrencyMad(Number(a.amount_allocated))}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-3 text-sm font-black text-slate-900">Audit & traçabilité</div>
        <EntityAuditTimeline entityType="invoice" entityId={String(i.id ?? id)} />
      </div>

      <DrawerPanel open={payOpen} onClose={() => setPayOpen(false)} title="Encaisser cette facture">
        <QuickPayForm
          remaining={Number(i.amount_due)}
          submitting={payMut.isPending}
          error={error}
          onCancel={() => setPayOpen(false)}
          onSubmit={(p) => {
            setError(null);
            payMut.mutate(p);
          }}
        />
      </DrawerPanel>
    </div>
  );
};

const SummaryCard: React.FC<{ title: string; value: string; tone?: 'amber' | 'emerald' }> = ({ title, value, tone }) => (
  <div className="df-card">
    <div className="df-card__body">
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{title}</div>
      <div className={`mt-1 text-xl font-black ${tone === 'amber' ? 'text-amber-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-slate-900'}`}>
        {value}
      </div>
    </div>
  </div>
);

const QuickPayForm: React.FC<{
  remaining: number;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (p: {
    amount: number;
    payment_method: 'cash' | 'bank_transfer' | 'check' | 'card' | 'compensation';
    payment_date: string;
    external_reference?: string;
  }) => void;
}> = ({ remaining, submitting, error, onCancel, onSubmit }) => {
  const [amount, setAmount] = useState(remaining);
  const [method, setMethod] = useState<'cash' | 'bank_transfer' | 'check' | 'card' | 'compensation'>('bank_transfer');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [ref, setRef] = useState('');
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ amount, payment_method: method, payment_date: date, external_reference: ref || undefined });
      }}
    >
      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Montant ({formatCurrencyMad(remaining)} dû)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          className="df-input mt-1"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          required
        />
      </div>
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Mode</label>
        <select className="df-input mt-1" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
          <option value="bank_transfer">Virement</option>
          <option value="cash">Espèces</option>
          <option value="check">Chèque</option>
          <option value="card">Carte</option>
          <option value="compensation">Compensation</option>
        </select>
      </div>
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Date</label>
        <input
          type="date"
          className="df-input mt-1"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Référence externe</label>
        <input className="df-input mt-1" value={ref} onChange={(e) => setRef(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="df-btn df-btn--ghost" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="df-btn df-btn--primary" disabled={submitting}>
          Encaisser
        </button>
      </div>
    </form>
  );
};
