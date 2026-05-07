import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  allocatePayment,
  createPayment,
  listInvoices,
  listBankAccounts,
  listPayments,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  paymentStatusTone,
  type Invoice,
  type Payment,
  type PaymentCreatePayload,
  type PaymentListParams,
  type PaymentMethod,
  type PaymentStatus,
} from '@/services/financeApi';
import { listCustomers } from '@/services/customersApi';
import { listBranches } from '@/services/adminApi';
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

      <DrawerPanel open={createOpen} title="Nouveau paiement" onClose={() => setCreateOpen(false)} widthClass="max-w-2xl">
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
    currency_code: 'MAD',
    payment_date: new Date().toISOString().slice(0, 10),
  });
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerLabel, setCustomerLabel] = useState('');
  const [showCustomerList, setShowCustomerList] = useState(false);
  const [linkInvoice, setLinkInvoice] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');

  const customersQ = useQuery({
    queryKey: ['customers-search', customerSearch],
    queryFn: () => listCustomers({ search: customerSearch, per_page: 10 }),
    enabled: customerSearch.length >= 2,
    staleTime: 10_000,
  });

  const branchesQ = useQuery({ queryKey: ['admin', 'branches'], queryFn: () => listBranches() });

  const banksQ = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: () => listBankAccounts({ is_active: true }),
  });

  const invoicesQ = useQuery({
    queryKey: ['invoices-due', form.customer_id],
    queryFn: () =>
      listInvoices({
        customer_id: form.customer_id,
        status: 'issued',
        per_page: 50,
      }),
    enabled: !!form.customer_id && linkInvoice,
  });

  const dueInvoices = useMemo<Invoice[]>(
    () => (invoicesQ.data?.data ?? []).filter((i) => Number(i.amount_due) > 0),
    [invoicesQ.data],
  );

  const selectedInvoice = dueInvoices.find((i) => i.id === selectedInvoiceId);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const payload: PaymentCreatePayload = { ...form };
        if (linkInvoice && selectedInvoiceId && form.amount > 0) {
          payload.allocations = [
            {
              invoice_id: selectedInvoiceId,
              amount_allocated: Math.min(form.amount, Number(selectedInvoice?.amount_due ?? form.amount)),
            },
          ];
        }
        onSubmit(payload);
      }}
    >
      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {/* Direction toggle */}
      <div className="flex gap-2">
        {(['incoming', 'outgoing'] as const).map((d) => (
          <button
            type="button"
            key={d}
            onClick={() => setForm({ ...form, payment_direction: d })}
            className={`flex-1 rounded-xl border px-4 py-2 text-sm font-bold transition ${
              form.payment_direction === d
                ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {d === 'incoming' ? '↓ Encaissement' : '↑ Décaissement'}
          </button>
        ))}
      </div>

      {/* Customer search */}
      <div className="relative">
        <label className="text-xs font-bold uppercase text-slate-500">Client *</label>
        {form.customer_id ? (
          <div className="mt-1 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-sm font-semibold text-slate-800">{customerLabel}</span>
            <button
              type="button"
              className="text-xs font-bold text-rose-600"
              onClick={() => {
                setForm({ ...form, customer_id: '' });
                setCustomerLabel('');
                setCustomerSearch('');
                setLinkInvoice(false);
                setSelectedInvoiceId('');
              }}
            >
              Changer
            </button>
          </div>
        ) : (
          <>
            <input
              className="df-input mt-1"
              placeholder="Tapez le nom ou le code client (≥ 2 caractères)…"
              value={customerSearch}
              onChange={(e) => {
                setCustomerSearch(e.target.value);
                setShowCustomerList(true);
              }}
              onFocus={() => setShowCustomerList(true)}
              onBlur={() => setTimeout(() => setShowCustomerList(false), 200)}
            />
            {showCustomerList && customerSearch.length >= 2 && (
              <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                {customersQ.isLoading ? (
                  <div className="p-3 text-sm text-slate-500">Recherche…</div>
                ) : (customersQ.data?.data ?? []).length === 0 ? (
                  <div className="p-3 text-sm text-slate-500">Aucun client</div>
                ) : (
                  customersQ.data!.data.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setForm({ ...form, customer_id: c.id });
                        setCustomerLabel(`${c.display_name ?? c.customer_code} · ${c.customer_code}`);
                        setShowCustomerList(false);
                      }}
                    >
                      <div className="font-semibold text-slate-800">{c.display_name ?? c.customer_code}</div>
                      <div className="text-xs text-slate-500">
                        {c.customer_code} · {c.customer_type}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Montant *</label>
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
          <label className="text-xs font-bold uppercase text-slate-500">Devise</label>
          <select
            className="df-input mt-1"
            value={form.currency_code ?? 'MAD'}
            onChange={(e) => setForm({ ...form, currency_code: e.target.value })}
          >
            <option value="MAD">MAD</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Mode de paiement *</label>
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
          <label className="text-xs font-bold uppercase text-slate-500">Date du paiement *</label>
          <input
            type="date"
            className="df-input mt-1"
            value={form.payment_date}
            onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Agence</label>
          <select
            className="df-input mt-1"
            value={form.branch_id ?? ''}
            onChange={(e) => setForm({ ...form, branch_id: e.target.value || undefined })}
          >
            <option value="">— Aucune —</option>
            {branchesQ.data?.data.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        {(form.payment_method === 'bank_transfer' || form.payment_method === 'check' || form.payment_method === 'card') && (
          <div>
            <label className="text-xs font-bold uppercase text-slate-500">Compte bancaire</label>
            <select
              className="df-input mt-1"
              value={form.bank_account_id ?? ''}
              onChange={(e) => setForm({ ...form, bank_account_id: e.target.value || undefined })}
            >
              <option value="">— Sélectionner —</option>
              {(banksQ.data?.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bank_name} · {b.account_name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div>
        <label className="text-xs font-bold uppercase text-slate-500">
          {form.payment_method === 'bank_transfer' ? 'Référence du virement' : 'Référence externe'}
        </label>
        <input
          className="df-input mt-1"
          placeholder={form.payment_method === 'bank_transfer' ? 'Ex: TRF-202605-0042' : 'Référence transaction'}
          value={form.external_reference ?? ''}
          onChange={(e) => setForm({ ...form, external_reference: e.target.value })}
        />
      </div>

      {form.payment_method === 'check' && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
          <div className="mb-2 text-xs font-bold uppercase text-indigo-700">Détails du chèque</div>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className="text-xs font-bold uppercase text-slate-500">N° chèque *</label>
              <input
                className="df-input mt-1"
                value={form.check_number ?? ''}
                onChange={(e) => setForm({ ...form, check_number: e.target.value })}
                required={form.payment_method === 'check'}
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase text-slate-500">Banque émettrice *</label>
              <input
                className="df-input mt-1"
                placeholder="Ex: Attijariwafa"
                value={form.check_bank ?? ''}
                onChange={(e) => setForm({ ...form, check_bank: e.target.value })}
                required={form.payment_method === 'check'}
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
        </div>
      )}

      {/* Optional invoice allocation */}
      {form.customer_id && form.payment_direction === 'incoming' && (
        <div className="rounded-xl border border-slate-200 p-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={linkInvoice}
              onChange={(e) => {
                setLinkInvoice(e.target.checked);
                if (!e.target.checked) setSelectedInvoiceId('');
              }}
            />
            Allouer ce paiement à une facture du client
          </label>
          {linkInvoice && (
            <div className="mt-3">
              {invoicesQ.isLoading ? (
                <div className="text-sm text-slate-500">Chargement des factures…</div>
              ) : dueInvoices.length === 0 ? (
                <div className="text-sm text-slate-500">Aucune facture due pour ce client.</div>
              ) : (
                <select
                  className="df-input"
                  value={selectedInvoiceId}
                  onChange={(e) => setSelectedInvoiceId(e.target.value)}
                >
                  <option value="">— Sélectionner une facture —</option>
                  {dueInvoices.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.invoice_number} · Reste dû {formatCurrencyMad(Number(i.amount_due))} ·{' '}
                      {i.due_date ? `Échéance ${formatDate(i.due_date)}` : ''}
                    </option>
                  ))}
                </select>
              )}
              {selectedInvoice && form.amount > Number(selectedInvoice.amount_due) && (
                <p className="mt-2 text-xs text-amber-700">
                  Le montant dépasse le reste dû ({formatCurrencyMad(Number(selectedInvoice.amount_due))}). Le surplus
                  restera non alloué.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Notes</label>
        <textarea
          className="df-input mt-1"
          rows={2}
          value={form.notes ?? ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          placeholder="Observations, contexte du paiement…"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" className="df-btn df-btn--ghost" onClick={onCancel}>
          Annuler
        </button>
        <button
          type="submit"
          className="df-btn df-btn--primary"
          disabled={submitting || !form.customer_id || form.amount <= 0}
        >
          {submitting ? 'Enregistrement…' : 'Enregistrer le paiement'}
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
