import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  allocatePayment,
  createPayment,
  listPayments,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  paymentStatusTone,
  type Payment,
  type PaymentCreatePayload,
  type PaymentListParams,
  type PaymentMethod,
  type PaymentStatus,
} from '@/services/financeApi';
import { ApiError } from '@/services/apiError';
import { DataTable } from '@/modules/shared/components/DataTable';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { formatCurrencyMad, formatDate } from '@/modules/shared/formatters';

export const PaymentsPage: React.FC = () => {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<PaymentListParams>({ page: 1, per_page: 25 });
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [allocateOpenPayment, setAllocateOpenPayment] = useState<Payment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['payments', filters, search],
    queryFn: () => listPayments({ ...filters, search: search || undefined }),
  });

  const createMut = useMutation({
    mutationFn: (p: PaymentCreatePayload) => createPayment(p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      setCreateOpen(false);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const allocateMut = useMutation({
    mutationFn: (p: {
      id: string;
      allocations: Array<{ invoice_id?: string; contract_installment_id?: string; amount_allocated: number }>;
    }) => allocatePayment(p.id, { allocations: p.allocations }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      setAllocateOpenPayment(null);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const rows = listQ.data?.data ?? [];
  const meta = listQ.data?.meta;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Paiements</h1>
          <p className="text-slate-500">Encaissements, allocations, décaissements.</p>
        </div>
        <button
          type="button"
          className="df-btn df-btn--primary"
          onClick={() => {
            setError(null);
            setCreateOpen(true);
          }}
        >
          + Nouveau paiement
        </button>
      </header>

      <div className="df-card">
        <div className="df-card__body grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          <input
            placeholder="Rechercher (numéro, référence)…"
            className="df-input md:col-span-2"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="df-input"
            value={filters.status ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, status: (e.target.value || undefined) as PaymentStatus | undefined, page: 1 }))}
          >
            <option value="">Statut: tous</option>
            {(Object.entries(PAYMENT_STATUS_LABEL) as [PaymentStatus, string][]).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <select
            className="df-input"
            value={filters.payment_method ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, payment_method: (e.target.value || undefined) as PaymentMethod | undefined, page: 1 }))}
          >
            <option value="">Mode: tous</option>
            {(Object.entries(PAYMENT_METHOD_LABEL) as [PaymentMethod, string][]).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <select
            className="df-input"
            value={filters.payment_direction ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, payment_direction: (e.target.value || undefined) as 'incoming' | 'outgoing' | undefined, page: 1 }))}
          >
            <option value="">Sens: tous</option>
            <option value="incoming">Entrant</option>
            <option value="outgoing">Sortant</option>
          </select>
        </div>
      </div>

      <DataTable<Payment>
        loading={listQ.isLoading}
        rows={rows}
        rowKey={(r) => r.id}
        emptyTitle="Aucun paiement"
        columns={[
          {
            key: 'number',
            header: 'N°',
            render: (r) => (
              <div>
                <div className="font-mono font-bold text-slate-900">{r.payment_number}</div>
                <div className="text-xs text-slate-500">{r.external_reference ?? ''}</div>
              </div>
            ),
          },
          {
            key: 'customer',
            header: 'Client',
            render: (r) => r.customer?.full_name ?? '—',
          },
          { key: 'method', header: 'Mode', render: (r) => PAYMENT_METHOD_LABEL[r.payment_method] },
          { key: 'date', header: 'Date', render: (r) => formatDate(r.payment_date) },
          { key: 'amount', header: 'Montant', render: (r) => formatCurrencyMad(Number(r.amount)) },
          {
            key: 'unallocated',
            header: 'Non alloué',
            render: (r) =>
              Number(r.amount_unallocated) > 0 ? (
                <span className="font-bold text-amber-700">{formatCurrencyMad(Number(r.amount_unallocated))}</span>
              ) : (
                <span className="text-emerald-700">0</span>
              ),
          },
          {
            key: 'status',
            header: 'Statut',
            render: (r) => <StatusBadge label={PAYMENT_STATUS_LABEL[r.status]} tone={paymentStatusTone(r.status)} />,
          },
          {
            key: 'actions',
            header: '',
            render: (r) =>
              Number(r.amount_unallocated) > 0 ? (
                <button
                  className="df-btn df-btn--ghost text-xs"
                  onClick={() => {
                    setError(null);
                    setAllocateOpenPayment(r);
                  }}
                >
                  Allouer
                </button>
              ) : null,
          },
        ]}
      />

      {meta && meta.last_page > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            className="df-btn df-btn--ghost disabled:opacity-40"
            disabled={(filters.page ?? 1) <= 1}
            onClick={() => setFilters((f) => ({ ...f, page: Math.max(1, (f.page ?? 1) - 1) }))}
          >
            ← Précédent
          </button>
          <span className="text-xs font-semibold text-slate-600">
            Page {meta.current_page} / {meta.last_page} · {meta.total} paiements
          </span>
          <button
            className="df-btn df-btn--ghost disabled:opacity-40"
            disabled={(filters.page ?? 1) >= meta.last_page}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
          >
            Suivant →
          </button>
        </div>
      )}

      <DrawerPanel open={createOpen} title="Nouveau paiement" onClose={() => setCreateOpen(false)}>
        <PaymentForm
          submitting={createMut.isPending}
          error={error}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(p) => {
            setError(null);
            createMut.mutate(p);
          }}
        />
      </DrawerPanel>

      <DrawerPanel
        open={!!allocateOpenPayment}
        title={`Allouer ${allocateOpenPayment?.payment_number ?? ''}`}
        onClose={() => setAllocateOpenPayment(null)}
      >
        {allocateOpenPayment && (
          <AllocateForm
            payment={allocateOpenPayment}
            submitting={allocateMut.isPending}
            error={error}
            onCancel={() => setAllocateOpenPayment(null)}
            onSubmit={(allocs) =>
              allocateMut.mutate({ id: allocateOpenPayment.id, allocations: allocs })
            }
          />
        )}
      </DrawerPanel>
    </div>
  );
};

const PaymentForm: React.FC<{
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (p: PaymentCreatePayload) => void;
}> = ({ submitting, error, onCancel, onSubmit }) => {
  const [form, setForm] = useState<PaymentCreatePayload>({
    customer_id: '',
    payment_method: 'bank_transfer',
    payment_direction: 'incoming',
    amount: 0,
    payment_date: new Date().toISOString().slice(0, 10),
  });
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">ID client</label>
        <input
          className="df-input mt-1"
          value={form.customer_id}
          onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
          required
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Mode</label>
          <select
            className="df-input mt-1"
            value={form.payment_method}
            onChange={(e) => setForm({ ...form, payment_method: e.target.value as PaymentMethod })}
          >
            {(Object.entries(PAYMENT_METHOD_LABEL) as [PaymentMethod, string][]).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Sens</label>
          <select
            className="df-input mt-1"
            value={form.payment_direction}
            onChange={(e) => setForm({ ...form, payment_direction: e.target.value as 'incoming' | 'outgoing' })}
          >
            <option value="incoming">Entrant</option>
            <option value="outgoing">Sortant</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Montant</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="df-input mt-1"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
            required
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Date</label>
          <input
            type="date"
            className="df-input mt-1"
            value={form.payment_date}
            onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
            required
          />
        </div>
      </div>
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Référence externe</label>
        <input
          className="df-input mt-1"
          value={form.external_reference ?? ''}
          onChange={(e) => setForm({ ...form, external_reference: e.target.value })}
        />
      </div>
      {form.payment_method === 'check' && (
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs font-bold uppercase text-slate-500">N° chèque</label>
            <input
              className="df-input mt-1"
              value={form.check_number ?? ''}
              onChange={(e) => setForm({ ...form, check_number: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-slate-500">Banque</label>
            <input
              className="df-input mt-1"
              value={form.check_bank ?? ''}
              onChange={(e) => setForm({ ...form, check_bank: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-slate-500">Date du chèque</label>
            <input
              type="date"
              className="df-input mt-1"
              value={form.check_date ?? ''}
              onChange={(e) => setForm({ ...form, check_date: e.target.value })}
            />
          </div>
        </div>
      )}
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Notes</label>
        <textarea
          className="df-input mt-1"
          value={form.notes ?? ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="df-btn df-btn--ghost" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="df-btn df-btn--primary" disabled={submitting}>
          Enregistrer
        </button>
      </div>
    </form>
  );
};

const AllocateForm: React.FC<{
  payment: Payment;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (
    allocs: Array<{ invoice_id?: string; contract_installment_id?: string; amount_allocated: number }>,
  ) => void;
}> = ({ payment, submitting, error, onCancel, onSubmit }) => {
  const [rows, setRows] = useState<Array<{ target: 'invoice' | 'installment'; id: string; amount: number }>>([
    { target: 'invoice', id: '', amount: Number(payment.amount_unallocated) },
  ]);
  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const remaining = Number(payment.amount_unallocated) - total;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(
          rows
            .filter((r) => r.id && r.amount > 0)
            .map((r) =>
              r.target === 'invoice'
                ? { invoice_id: r.id, amount_allocated: r.amount }
                : { contract_installment_id: r.id, amount_allocated: r.amount },
            ),
        );
      }}
    >
      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <div className="text-sm text-slate-600">
        Paiement {payment.payment_number} · Non alloué{' '}
        <b>{formatCurrencyMad(Number(payment.amount_unallocated))}</b>
      </div>
      {rows.map((r, idx) => (
        <div key={idx} className="grid gap-2 md:grid-cols-6 items-end">
          <select
            className="df-input md:col-span-1"
            value={r.target}
            onChange={(e) => {
              const next = [...rows];
              next[idx] = { ...next[idx], target: e.target.value as 'invoice' | 'installment' };
              setRows(next);
            }}
          >
            <option value="invoice">Facture</option>
            <option value="installment">Échéance</option>
          </select>
          <input
            className="df-input md:col-span-3"
            placeholder="UUID cible"
            value={r.id}
            onChange={(e) => {
              const next = [...rows];
              next[idx] = { ...next[idx], id: e.target.value };
              setRows(next);
            }}
          />
          <input
            type="number"
            min="0"
            step="0.01"
            className="df-input md:col-span-1"
            value={r.amount}
            onChange={(e) => {
              const next = [...rows];
              next[idx] = { ...next[idx], amount: Number(e.target.value) };
              setRows(next);
            }}
          />
          <button
            type="button"
            className="df-btn df-btn--ghost md:col-span-1"
            onClick={() => setRows(rows.filter((_, i) => i !== idx))}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="df-btn df-btn--ghost"
        onClick={() => setRows([...rows, { target: 'invoice', id: '', amount: 0 }])}
      >
        + Ajouter une ligne
      </button>
      <div className="text-xs text-slate-500">
        Total alloué: <b>{formatCurrencyMad(total)}</b> · Reste:{' '}
        <b className={remaining < 0 ? 'text-rose-600' : ''}>{formatCurrencyMad(remaining)}</b>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="df-btn df-btn--ghost" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="df-btn df-btn--primary" disabled={submitting || remaining < 0}>
          Allouer
        </button>
      </div>
    </form>
  );
};
