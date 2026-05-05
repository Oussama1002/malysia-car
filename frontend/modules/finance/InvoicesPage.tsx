import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  INVOICE_STATUS_LABEL,
  invoiceStatusTone,
  listInvoices,
  type Invoice,
  type InvoiceListParams,
  type InvoiceStatus,
  type InvoiceType,
} from '@/services/financeApi';
import { listBranches } from '@/services/adminApi';
import { DataTable } from '@/modules/shared/components/DataTable';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { formatCurrencyMad, formatDate } from '@/modules/shared/formatters';

export const InvoicesPage: React.FC = () => {
  const [filters, setFilters] = useState<InvoiceListParams>({ page: 1, per_page: 25 });
  const [search, setSearch] = useState('');

  const listQ = useQuery({
    queryKey: ['invoices', filters, search],
    queryFn: () => listInvoices({ ...filters, search: search || undefined }),
  });
  const branchesQ = useQuery({ queryKey: ['admin', 'branches'], queryFn: () => listBranches() });

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
    </div>
  );
};
