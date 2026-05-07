import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  INVOICE_STATUS_LABEL,
  invoiceStatusTone,
  listInvoices,
  createInvoice,
  type Invoice,
  type InvoiceCreatePayload,
  type InvoiceListParams,
  type InvoiceStatus,
  type InvoiceType,
} from '@/services/financeApi';
import { listBranches } from '@/services/adminApi';
import { listCustomers } from '@/services/customersApi';
import { ApiError } from '@/services/apiError';
import { DataTable } from '@/modules/shared/components/DataTable';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { formatCurrencyMad, formatDate } from '@/modules/shared/formatters';

export const InvoicesPage: React.FC = () => {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<InvoiceListParams>({ page: 1, per_page: 25 });
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['invoices', filters, search],
    queryFn: () => listInvoices({ ...filters, search: search || undefined }),
  });
  const branchesQ = useQuery({ queryKey: ['admin', 'branches'], queryFn: () => listBranches() });

  const createMut = useMutation({
    mutationFn: (p: InvoiceCreatePayload) => createInvoice(p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      setCreateOpen(false);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const rows = listQ.data?.data ?? [];
  const meta = listQ.data?.meta;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/finance" className="text-xs font-bold text-indigo-600">← Finance</Link>
          <h1 className="text-2xl font-black text-slate-900">Factures</h1>
          <p className="text-slate-500">Factures contrat, vente VO et services.</p>
        </div>
        <button
          type="button"
          className="df-btn df-btn--primary"
          onClick={() => {
            setError(null);
            setCreateOpen(true);
          }}
        >
          + Nouvelle facture
        </button>
      </header>

      <div className="df-card">
        <div className="df-card__body grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <input
            placeholder="Rechercher (numéro, client)…"
            className="df-input md:col-span-2"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="df-input"
            value={filters.status ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, status: (e.target.value || undefined) as InvoiceStatus | undefined, page: 1 }))}
          >
            <option value="">Statut: tous</option>
            {(Object.entries(INVOICE_STATUS_LABEL) as [InvoiceStatus, string][]).map(([k, lbl]) => (
              <option key={k} value={k}>
                {lbl}
              </option>
            ))}
          </select>
          <select
            className="df-input"
            value={filters.invoice_type ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, invoice_type: (e.target.value || undefined) as InvoiceType | undefined, page: 1 }))}
          >
            <option value="">Type: tous</option>
            <option value="contract">Contrat</option>
            <option value="sale">Vente</option>
            <option value="service">Service</option>
            <option value="credit_note">Avoir</option>
          </select>
          <input
            type="date"
            className="df-input"
            value={filters.from ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || undefined, page: 1 }))}
          />
          <input
            type="date"
            className="df-input"
            value={filters.to ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value || undefined, page: 1 }))}
          />
          <select
            className="df-input"
            value={filters.branch_id ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, branch_id: e.target.value || undefined, page: 1 }))}
          >
            <option value="">Toutes agences</option>
            {branchesQ.data?.data.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <DataTable<Invoice>
        loading={listQ.isLoading}
        rows={rows}
        rowKey={(r) => r.id}
        emptyTitle="Aucune facture"
        columns={[
          {
            key: 'number',
            header: 'N°',
            render: (r) => (
              <div>
                <div className="font-mono font-bold text-slate-900">{r.invoice_number}</div>
                <div className="text-xs text-slate-500">{r.invoice_type}</div>
              </div>
            ),
          },
          {
            key: 'customer',
            header: 'Client',
            render: (r) => (
              <div>
                <div className="font-semibold text-slate-800">{r.customer?.full_name ?? '—'}</div>
                <div className="text-xs text-slate-500">{r.customer?.customer_code ?? ''}</div>
              </div>
            ),
          },
          { key: 'issue', header: 'Émise', render: (r) => (r.issue_date ? formatDate(r.issue_date) : '—') },
          { key: 'due', header: 'Échéance', render: (r) => (r.due_date ? formatDate(r.due_date) : '—') },
          { key: 'total', header: 'Total', render: (r) => formatCurrencyMad(Number(r.total_amount)) },
          {
            key: 'amount_due',
            header: 'Reste dû',
            render: (r) =>
              Number(r.amount_due) > 0 ? (
                <span className="font-bold text-amber-700">{formatCurrencyMad(Number(r.amount_due))}</span>
              ) : (
                <span className="text-emerald-700">0</span>
              ),
          },
          {
            key: 'status',
            header: 'Statut',
            render: (r) => <StatusBadge label={INVOICE_STATUS_LABEL[r.status]} tone={invoiceStatusTone(r.status)} />,
          },
          {
            key: 'actions',
            header: '',
            render: (r) => (
              <Link to={`/finance/invoices/${r.id}`} className="text-sm font-black text-indigo-600">
                Détail →
              </Link>
            ),
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
            Page {meta.current_page} / {meta.last_page} · {meta.total} factures
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

      <DrawerPanel open={createOpen} title="Nouvelle facture" onClose={() => setCreateOpen(false)} widthClass="max-w-3xl">
        <InvoiceForm
          submitting={createMut.isPending}
          error={error}
          branches={branchesQ.data?.data ?? []}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(p) => {
            setError(null);
            createMut.mutate(p);
          }}
        />
      </DrawerPanel>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Invoice form
// ─────────────────────────────────────────────────────────────────────────────

type LineRow = {
  line_type: 'installment' | 'fee' | 'penalty' | 'sale' | 'adjustment';
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  tax_rate: number;
};

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, days: number) => {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
};

const InvoiceForm: React.FC<{
  submitting: boolean;
  error: string | null;
  branches: Array<{ id: string; name: string }>;
  onCancel: () => void;
  onSubmit: (p: InvoiceCreatePayload) => void;
}> = ({ submitting, error, branches, onCancel, onSubmit }) => {
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [customerLabel, setCustomerLabel] = useState('');
  const [showCustomerList, setShowCustomerList] = useState(false);

  const customersQ = useQuery({
    queryKey: ['customers-search', customerSearch],
    queryFn: () => listCustomers({ search: customerSearch, per_page: 10 }),
    enabled: customerSearch.length >= 2,
    staleTime: 10_000,
  });

  const [invoiceType, setInvoiceType] = useState<InvoiceType>('service');
  const [branchId, setBranchId] = useState('');
  const [contractId, setContractId] = useState('');
  const [issueDate, setIssueDate] = useState(today());
  const [dueDate, setDueDate] = useState(addDays(today(), 30));
  const [currency, setCurrency] = useState('MAD');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<LineRow[]>([
    { line_type: 'fee', description: '', quantity: 1, unit_price: 0, discount_amount: 0, tax_rate: 20 },
  ]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    let lineDisc = 0;
    for (const l of lines) {
      const gross = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
      const disc = Number(l.discount_amount) || 0;
      const net = Math.max(0, gross - disc);
      const t = (net * (Number(l.tax_rate) || 0)) / 100;
      subtotal += net;
      tax += t;
      lineDisc += disc;
    }
    const total = Math.max(0, subtotal + tax - (Number(discountAmount) || 0));
    return { subtotal, tax, lineDisc, total };
  }, [lines, discountAmount]);

  const setLine = (idx: number, patch: Partial<LineRow>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) return;
    const payload: InvoiceCreatePayload = {
      customer_id: customerId,
      branch_id: branchId || undefined,
      contract_id: invoiceType === 'contract' && contractId ? contractId : undefined,
      invoice_type: invoiceType,
      issue_date: issueDate,
      due_date: dueDate || undefined,
      currency_code: currency,
      discount_amount: Number(discountAmount) || 0,
      notes: notes || undefined,
      lines: lines
        .filter((l) => l.description.trim() && (Number(l.unit_price) || 0) > 0)
        .map((l) => ({
          line_type: l.line_type,
          description: l.description,
          quantity: Number(l.quantity) || 1,
          unit_price: Number(l.unit_price) || 0,
          discount_amount: Number(l.discount_amount) || 0,
          tax_rate: Number(l.tax_rate) || 0,
        })),
    };
    onSubmit(payload);
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {/* Customer search */}
      <div className="relative">
        <label className="text-xs font-bold uppercase text-slate-500">Client *</label>
        {customerId ? (
          <div className="mt-1 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-sm font-semibold text-slate-800">{customerLabel}</span>
            <button
              type="button"
              className="text-xs font-bold text-rose-600"
              onClick={() => {
                setCustomerId('');
                setCustomerLabel('');
                setCustomerSearch('');
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
                        setCustomerId(c.id);
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
          <label className="text-xs font-bold uppercase text-slate-500">Type de facture *</label>
          <select
            className="df-input mt-1"
            value={invoiceType}
            onChange={(e) => setInvoiceType(e.target.value as InvoiceType)}
          >
            <option value="service">Service</option>
            <option value="contract">Contrat</option>
            <option value="sale">Vente</option>
            <option value="credit_note">Avoir</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Agence</label>
          <select className="df-input mt-1" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            <option value="">— Aucune —</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        {invoiceType === 'contract' && (
          <div className="md:col-span-2">
            <label className="text-xs font-bold uppercase text-slate-500">ID contrat</label>
            <input
              className="df-input mt-1"
              placeholder="UUID du contrat"
              value={contractId}
              onChange={(e) => setContractId(e.target.value)}
            />
          </div>
        )}
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Date d'émission *</label>
          <input
            type="date"
            className="df-input mt-1"
            value={issueDate}
            onChange={(e) => setIssueDate(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Date d'échéance</label>
          <input
            type="date"
            className="df-input mt-1"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Devise</label>
          <select className="df-input mt-1" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="MAD">MAD</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Remise globale (MAD)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            className="df-input mt-1"
            value={discountAmount}
            onChange={(e) => setDiscountAmount(Number(e.target.value))}
          />
        </div>
      </div>

      {/* Lines */}
      <div className="rounded-xl border border-slate-200 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-700">Lignes de facture</h3>
          <button
            type="button"
            className="df-btn df-btn--ghost df-btn--sm"
            onClick={() =>
              setLines([
                ...lines,
                { line_type: 'fee', description: '', quantity: 1, unit_price: 0, discount_amount: 0, tax_rate: 20 },
              ])
            }
          >
            + Ajouter une ligne
          </button>
        </div>
        <div className="space-y-2">
          {lines.map((l, idx) => {
            const lineNet = Math.max(0, (l.quantity || 0) * (l.unit_price || 0) - (l.discount_amount || 0));
            const lineTotal = lineNet + (lineNet * (l.tax_rate || 0)) / 100;
            return (
              <div key={idx} className="grid gap-2 rounded-lg bg-slate-50 p-2 md:grid-cols-12">
                <select
                  className="df-input md:col-span-2 text-xs"
                  value={l.line_type}
                  onChange={(e) => setLine(idx, { line_type: e.target.value as LineRow['line_type'] })}
                >
                  <option value="fee">Frais</option>
                  <option value="installment">Échéance</option>
                  <option value="penalty">Pénalité</option>
                  <option value="sale">Vente</option>
                  <option value="adjustment">Ajustement</option>
                </select>
                <input
                  className="df-input md:col-span-4 text-xs"
                  placeholder="Description"
                  value={l.description}
                  onChange={(e) => setLine(idx, { description: e.target.value })}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="df-input text-xs"
                  placeholder="Qté"
                  value={l.quantity}
                  onChange={(e) => setLine(idx, { quantity: Number(e.target.value) })}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="df-input md:col-span-2 text-xs"
                  placeholder="PU"
                  value={l.unit_price}
                  onChange={(e) => setLine(idx, { unit_price: Number(e.target.value) })}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="df-input text-xs"
                  placeholder="Remise"
                  value={l.discount_amount}
                  onChange={(e) => setLine(idx, { discount_amount: Number(e.target.value) })}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="df-input text-xs"
                  placeholder="TVA %"
                  value={l.tax_rate}
                  onChange={(e) => setLine(idx, { tax_rate: Number(e.target.value) })}
                />
                <div className="md:col-span-12 flex items-center justify-between text-xs text-slate-600">
                  <span>
                    Total ligne: <b>{formatCurrencyMad(lineTotal)}</b>
                  </span>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      className="font-bold text-rose-600"
                      onClick={() => setLines(lines.filter((_, i) => i !== idx))}
                    >
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Totals */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm">
        <div className="flex justify-between">
          <span>Sous-total HT</span>
          <span className="font-bold">{formatCurrencyMad(totals.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>TVA</span>
          <span className="font-bold">{formatCurrencyMad(totals.tax)}</span>
        </div>
        {discountAmount > 0 && (
          <div className="flex justify-between text-rose-600">
            <span>Remise globale</span>
            <span className="font-bold">- {formatCurrencyMad(Number(discountAmount))}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between border-t border-indigo-300 pt-1 text-base">
          <span className="font-bold">Total TTC</span>
          <span className="font-black text-indigo-700">{formatCurrencyMad(totals.total)}</span>
        </div>
      </div>

      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Notes</label>
        <textarea
          className="df-input mt-1"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Conditions de règlement, remarques…"
        />
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" className="df-btn df-btn--ghost" onClick={onCancel}>
          Annuler
        </button>
        <button
          type="submit"
          className="df-btn df-btn--primary"
          disabled={submitting || !customerId || lines.every((l) => !l.description || l.unit_price <= 0)}
        >
          {submitting ? 'Création…' : 'Créer la facture'}
        </button>
      </div>
    </form>
  );
};
