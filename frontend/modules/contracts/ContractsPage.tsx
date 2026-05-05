import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/queryKeys';
import { DataTable } from '@/modules/shared/components/DataTable';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { SearchFilterBar } from '@/modules/shared/components/SearchFilterBar';
import { contractsApi } from '@/services/contractsApi';

export const ContractsPage: React.FC = () => {
  const [filters, setFilters] = React.useState<{ q: string; type: string; status: string }>({ q: '', type: '', status: '' });
  const q = useQuery({
    queryKey: [...queryKeys.contracts.all, filters],
    queryFn: async () => contractsApi.list({ type: filters.type || undefined, status: filters.status || undefined }),
  });
  const rows = (q.data ?? []).filter((c) => {
    const s = `${c.reference} ${c.type} ${c.status}`.toLowerCase();
    return !filters.q || s.includes(filters.q.toLowerCase());
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Contrats</h1>
          <p className="text-slate-500">LLD, LOA, crédit auto, vente VO — liste.</p>
        </div>
        <Link
          to="/contracts/new"
          className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-100"
        >
          Nouveau (assistant)
        </Link>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex-1">
          <SearchFilterBar
            placeholder="Filtrer (référence, type, statut)…"
            value={filters.q}
            onChange={(v) => setFilters((s) => ({ ...s, q: v }))}
          />
        </div>
        <select
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold"
          value={filters.type}
          onChange={(e) => setFilters((s) => ({ ...s, type: e.target.value }))}
        >
          <option value="">Tous types</option>
          <option value="LLD">LLD</option>
          <option value="LOA">LOA</option>
          <option value="CREDIT_AUTO">Crédit</option>
          <option value="VENTE_VO">VO</option>
          <option value="LOCATION_COURTE">Courte durée</option>
        </select>
        <select
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold"
          value={filters.status}
          onChange={(e) => setFilters((s) => ({ ...s, status: e.target.value }))}
        >
          <option value="">Tous statuts</option>
          <option value="draft">draft</option>
          <option value="pending approval">pending approval</option>
          <option value="approved">approved</option>
          <option value="awaiting signature">awaiting signature</option>
          <option value="active">active</option>
          <option value="suspended">suspended</option>
          <option value="closed">closed</option>
          <option value="terminated">terminated</option>
        </select>
      </div>

      <DataTable
        loading={q.isLoading}
        columns={[
          { key: 'ref', header: 'Référence', render: (r) => <span className="font-mono text-xs font-bold">{r.reference}</span> },
          { key: 'type', header: 'Type', render: (r) => <StatusBadge label={r.type} tone="info" /> },
          { key: 'status', header: 'Statut', render: (r) => <span className="text-sm font-bold">{r.status}</span> },
          {
            key: 'amt',
            header: 'Montant',
            render: (r) => <span className="font-black text-indigo-700">{r.amountMad.toLocaleString('fr-MA')} MAD</span>,
          },
          {
            key: 'a',
            header: '',
            render: (r) => (
              <Link className="text-sm font-black text-indigo-600" to={`/contracts/${r.id}`}>
                Détail
              </Link>
            ),
          },
        ]}
        rows={rows}
        rowKey={(r) => r.id}
        emptyTitle="Aucun contrat"
      />
    </div>
  );
};
