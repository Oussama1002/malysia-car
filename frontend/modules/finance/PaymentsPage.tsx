import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  allocatePayment,
  createPayment,
  listPayments,
  listInvoices,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_TYPE_LABEL,
  paymentStatusTone,
  type Payment,
  type PaymentCreatePayload,
  type PaymentListParams,
  type PaymentMethod,
  type PaymentStatus,
  type PaymentType,
  type Invoice,
} from '@/services/financeApi';
import { apiClient } from '@/services/apiClient';
import { endpoints } from '@/services/endpoints';
import { queryKeys } from '@/services/queryKeys';
import { ApiError } from '@/services/apiError';
import { DataTable } from '@/modules/shared/components/DataTable';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { formatCurrencyMad, formatDate } from '@/modules/shared/formatters';

/* ── Types used by data loading ─────────────────────────────────────── */

interface CustomerMin {
  id: string;
  display_name?: string | null;
  customer_code?: string | null;
  individual_profile?: { first_name?: string | null; last_name?: string | null } | null;
  company_profile?: { legal_name?: string | null; trade_name?: string | null } | null;
}
interface ContractMin {
  id: string | number;
  reference: string;
  type: string;
  status: string;
}
interface ReservationMin {
  id: string;
  reservation_number: string;
  status: string;
}
interface InvoiceMin {
  id: string;
  invoice_number: string;
  status: string;
  total_amount_mad: number;
}

interface ApiListResponse<T> {
  data: T[];
  meta?: unknown;
}

/* ── Page ────────────────────────────────────────────────────────────── */

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
          <p className="text-slate-500">Encaissements clients et allocations.</p>
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

      {/* ── Filters ──────────────────────────────────────────────── */}
      <div className="df-card">
        <div className="df-card__body grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          <input
            placeholder="Rechercher (numéro, référence)..."
            className="df-input md:col-span-2"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="df-input"
            value={filters.status ?? ''}
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                status: (e.target.value || undefined) as PaymentStatus | undefined,
                page: 1,
              }))
            }
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
            onChange={(e) =>
              setFilters((f) => ({
                ...f,
                payment_method: (e.target.value || undefined) as PaymentMethod | undefined,
                page: 1,
              }))
            }
          >
            <option value="">Mode: tous</option>
            {(Object.entries(PAYMENT_METHOD_LABEL) as [PaymentMethod, string][]).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────────────── */}
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
            render: (r) => r.customer?.full_name ?? r.customer?.customer_code ?? '—',
          },
          {
            key: 'type',
            header: 'Type',
            render: (r) =>
              r.payment_type ? (PAYMENT_TYPE_LABEL[r.payment_type] ?? r.payment_type) : '—',
          },
          { key: 'method', header: 'Mode', render: (r) => PAYMENT_METHOD_LABEL[r.payment_method] ?? r.payment_method },
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

      {/* ── Pagination ───────────────────────────────────────────── */}
      {meta && meta.last_page > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            className="df-btn df-btn--ghost disabled:opacity-40"
            disabled={(filters.page ?? 1) <= 1}
            onClick={() => setFilters((f) => ({ ...f, page: Math.max(1, (f.page ?? 1) - 1) }))}
          >
            &larr; Précédent
          </button>
          <span className="text-xs font-semibold text-slate-600">
            Page {meta.current_page} / {meta.last_page} &middot; {meta.total} paiements
          </span>
          <button
            className="df-btn df-btn--ghost disabled:opacity-40"
            disabled={(filters.page ?? 1) >= meta.last_page}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
          >
            Suivant &rarr;
          </button>
        </div>
      )}

      {/* ── Create drawer ────────────────────────────────────────── */}
      <DrawerPanel open={createOpen} title="Nouveau paiement client" onClose={() => setCreateOpen(false)}>
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

      {/* ── Allocate drawer ──────────────────────────────────────── */}
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
            onSubmit={(allocs) => allocateMut.mutate({ id: allocateOpenPayment.id, allocations: allocs })}
          />
        )}
      </DrawerPanel>
    </div>
  );
};

/* ════════════════════════════════════════════════════════════════════════ */
/* Payment creation form                                                   */
/* ════════════════════════════════════════════════════════════════════════ */

const PaymentForm: React.FC<{
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (p: PaymentCreatePayload) => void;
}> = ({ submitting, error, onCancel, onSubmit }) => {
  const [form, setForm] = useState<PaymentCreatePayload>({
    customer_id: '',
    payment_method: 'cash',
    payment_type: undefined,
    amount: 0,
    payment_date: new Date().toISOString().slice(0, 10),
  });

  /* ── Load catalogue data ──────────────────────────────────────── */

  const customersQ = useQuery({
    queryKey: queryKeys.customers.all,
    queryFn: async () =>
      (await apiClient<ApiListResponse<CustomerMin>>(endpoints.customers.list)).data,
  });

  const contractsQ = useQuery({
    queryKey: queryKeys.contracts.all,
    queryFn: async () =>
      (await apiClient<ApiListResponse<ContractMin>>(endpoints.contracts.list)).data,
  });

  const reservationsQ = useQuery({
    queryKey: queryKeys.reservations,
    queryFn: async () =>
      (await apiClient<ApiListResponse<ReservationMin>>(endpoints.reservations.list)).data,
  });

  const invoicesQ = useQuery({
    queryKey: ['invoices', 'all'],
    queryFn: async () => {
      const r = await listInvoices({ per_page: 200 });
      return r.data;
    },
  });

  const customers = customersQ.data ?? [];
  const contracts = contractsQ.data ?? [];
  const reservations = reservationsQ.data ?? [];
  const invoices = invoicesQ.data ?? [];

  /* Filter contracts/reservations/invoices by selected customer */
  const filteredContracts = useMemo(() => {
    if (!form.customer_id) return contracts;
    return contracts.filter(
      (c) =>
        (c as unknown as { customerId?: string; clientId?: string; customer_id?: string }).customerId === form.customer_id ||
        (c as unknown as { customerId?: string; clientId?: string; customer_id?: string }).clientId === form.customer_id ||
        (c as unknown as { customerId?: string; clientId?: string; customer_id?: string }).customer_id === form.customer_id,
    );
  }, [contracts, form.customer_id]);

  const filteredReservations = useMemo(() => {
    if (!form.customer_id) return reservations;
    return reservations.filter((r) => r.id && (r as unknown as { customer_id?: string }).customer_id === form.customer_id);
  }, [reservations, form.customer_id]);

  const filteredInvoices = useMemo(() => {
    if (!form.customer_id) return invoices;
    return invoices.filter(
      (inv) => (inv as unknown as { customer_id?: string }).customer_id === form.customer_id,
    );
  }, [invoices, form.customer_id]);

  const set = <K extends keyof PaymentCreatePayload>(field: K, value: PaymentCreatePayload[K]) =>
    setForm((f) => ({ ...f, [field]: value }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          ...form,
          payment_direction: 'incoming',
        });
      }}
    >
      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {/* ── Client ───────────────────────────────────────────── */}
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Client *</label>
        <select
          className="df-input mt-1 w-full"
          value={form.customer_id}
          onChange={(e) => set('customer_id', e.target.value)}
          required
        >
          <option value="">-- Sélectionner un client --</option>
          {customers.map((c) => {
            const name = c.display_name
              ?? (c.individual_profile ? `${c.individual_profile.first_name ?? ''} ${c.individual_profile.last_name ?? ''}`.trim() : null)
              ?? c.company_profile?.trade_name
              ?? c.company_profile?.legal_name
              ?? '—';
            return (
              <option key={c.id} value={c.id}>
                {c.customer_code ?? '—'} — {name}
              </option>
            );
          })}
        </select>
      </div>

      {/* ── Contrat / Réservation / Facture ──────────────────── */}
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Contrat</label>
          <select
            className="df-input mt-1 w-full"
            value={form.contract_id ?? ''}
            onChange={(e) => set('contract_id', e.target.value || undefined)}
          >
            <option value="">-- Aucun --</option>
            {filteredContracts.map((c) => (
              <option key={String(c.id)} value={String(c.id)}>
                {c.reference} ({c.type})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Réservation</label>
          <select
            className="df-input mt-1 w-full"
            value={form.reservation_id ?? ''}
            onChange={(e) => set('reservation_id', e.target.value || undefined)}
          >
            <option value="">-- Aucune --</option>
            {filteredReservations.map((r) => (
              <option key={r.id} value={r.id}>
                {r.reservation_number} ({r.status})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Facture</label>
          <select
            className="df-input mt-1 w-full"
            value={form.invoice_id ?? ''}
            onChange={(e) => set('invoice_id', e.target.value || undefined)}
          >
            <option value="">-- Aucune --</option>
            {filteredInvoices.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.invoice_number} ({formatCurrencyMad(Number(inv.total_amount_mad))})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Type paiement ────────────────────────────────────── */}
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Type paiement</label>
        <select
          className="df-input mt-1 w-full"
          value={form.payment_type ?? ''}
          onChange={(e) => set('payment_type', (e.target.value || undefined) as PaymentType | undefined)}
        >
          <option value="">-- Sélectionner --</option>
          {(Object.entries(PAYMENT_TYPE_LABEL) as [PaymentType, string][]).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {/* ── Mode paiement ────────────────────────────────────── */}
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Mode paiement *</label>
        <select
          className="df-input mt-1 w-full"
          value={form.payment_method}
          onChange={(e) => set('payment_method', e.target.value as PaymentMethod)}
          required
        >
          {(Object.entries(PAYMENT_METHOD_LABEL) as [PaymentMethod, string][]).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>

      {/* ── Montant + Date ───────────────────────────────────── */}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Montant (MAD) *</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="df-input mt-1 w-full"
            value={form.amount}
            onChange={(e) => set('amount', Number(e.target.value))}
            required
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Date paiement *</label>
          <input
            type="date"
            className="df-input mt-1 w-full"
            value={form.payment_date}
            onChange={(e) => set('payment_date', e.target.value)}
            required
          />
        </div>
      </div>

      {/* ── Référence ────────────────────────────────────────── */}
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Référence</label>
        <input
          className="df-input mt-1 w-full"
          value={form.external_reference ?? ''}
          onChange={(e) => set('external_reference', e.target.value)}
          placeholder="Référence externe, n° reçu..."
        />
      </div>

      {/* ── Chèque fields ────────────────────────────────────── */}
      {form.payment_method === 'check' && (
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs font-bold uppercase text-slate-500">N° chèque</label>
            <input
              className="df-input mt-1 w-full"
              value={form.check_number ?? ''}
              onChange={(e) => set('check_number', e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-slate-500">Banque</label>
            <input
              className="df-input mt-1 w-full"
              value={form.check_bank ?? ''}
              onChange={(e) => set('check_bank', e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-slate-500">Date du chèque</label>
            <input
              type="date"
              className="df-input mt-1 w-full"
              value={form.check_date ?? ''}
              onChange={(e) => set('check_date', e.target.value)}
            />
          </div>
        </div>
      )}

      {/* ── Notes ────────────────────────────────────────────── */}
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Notes</label>
        <textarea
          className="df-input mt-1 w-full"
          rows={3}
          value={form.notes ?? ''}
          onChange={(e) => set('notes', e.target.value)}
          placeholder="Commentaires ou informations complémentaires..."
        />
      </div>

      {/* ── Actions ──────────────────────────────────────────── */}
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <button type="button" className="df-btn df-btn--ghost" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="df-btn df-btn--primary" disabled={submitting}>
          {submitting ? 'Enregistrement...' : 'Enregistrer le paiement'}
        </button>
      </div>
    </form>
  );
};

/* ════════════════════════════════════════════════════════════════════════ */
/* Allocate form                                                           */
/* ════════════════════════════════════════════════════════════════════════ */

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
        Paiement {payment.payment_number} &middot; Non alloué{' '}
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
            &times;
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
        Total alloué: <b>{formatCurrencyMad(total)}</b> &middot; Reste:{' '}
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
