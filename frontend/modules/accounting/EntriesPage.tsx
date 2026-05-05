import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  deleteEntry,
  ENTRY_STATUS_LABEL,
  entryStatusTone,
  listEntries,
  listJournals,
  type EntryListParams,
  type EntryStatus,
} from '@/services/accountingApi';
import { ApiError } from '@/services/apiError';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { EmptyState } from '@/modules/shared/components/EmptyState';
import { formatCurrencyMad } from '@/modules/shared/formatters';

export const EntriesPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<EntryListParams>({
    status: (searchParams.get('status') as EntryStatus) || undefined,
    journal_id: searchParams.get('journal_id') || undefined,
    from: '',
    to: '',
    search: '',
    page: 1,
    per_page: 30,
  });

  const journalsQ = useQuery({ queryKey: ['accounting', 'journals'], queryFn: () => listJournals() });
  const entriesQ = useQuery({
    queryKey: ['accounting', 'entries', filters],
    queryFn: () => listEntries(filters),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['accounting', 'entries'] });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteEntry(id),
    onSuccess: () => invalidate(),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const entries = entriesQ.data?.data ?? [];
  const meta = entriesQ.data?.meta;
  const journals = journalsQ.data?.data ?? [];

  const setFilter = (patch: Partial<EntryListParams>) =>
    setFilters((f) => ({ ...f, ...patch, page: 1 }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/accounting" className="text-xs font-bold text-indigo-600">← Comptabilité</Link>
          <h1 className="text-2xl font-black text-slate-900">Écritures comptables</h1>
        </div>
        <Link to="/accounting/entries/new" className="df-btn df-btn--primary">+ Nouvelle écriture</Link>
      </header>

      <div className="df-card">
        <div className="df-card__body flex flex-wrap gap-3">
          <input
            placeholder="N° écriture / description…"
            className="df-input flex-1"
            value={filters.search ?? ''}
            onChange={(e) => setFilter({ search: e.target.value })}
          />
          <select className="df-input" value={filters.status ?? ''} onChange={(e) => setFilter({ status: (e.target.value as EntryStatus) || undefined })}>
            <option value="">Tous les statuts</option>
            {(Object.entries(ENTRY_STATUS_LABEL) as [EntryStatus, string][]).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
          <select className="df-input" value={filters.journal_id ?? ''} onChange={(e) => setFilter({ journal_id: e.target.value || undefined })}>
            <option value="">Tous les journaux</option>
            {journals.map((j) => <option key={j.id} value={j.id}>{j.code} — {j.name}</option>)}
          </select>
          <input type="date" className="df-input" value={filters.from ?? ''} onChange={(e) => setFilter({ from: e.target.value || undefined })} />
          <input type="date" className="df-input" value={filters.to ?? ''} onChange={(e) => setFilter({ to: e.target.value || undefined })} />
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {entriesQ.isLoading ? (
        <div className="text-slate-500">Chargement…</div>
      ) : !entries.length ? (
        <EmptyState title="Aucune écriture" description="Créez une écriture manuellement ou utilisez les ponts automatiques." />
      ) : (
        <div className="df-card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">N° écriture</th>
                <th>Date</th>
                <th>Description</th>
                <th>Journal</th>
                <th className="text-right">Total débit</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono font-bold text-slate-900">{e.entry_number}</td>
                  <td className="text-slate-700">{e.entry_date}</td>
                  <td>
                    <div className="font-semibold text-slate-800">{e.description}</div>
                    {e.reference && <div className="text-xs text-slate-500">Réf: {e.reference}</div>}
                  </td>
                  <td className="text-slate-600">{e.journal?.code ?? '—'}</td>
                  <td className="text-right font-mono">{formatCurrencyMad(Number(e.total_debit))}</td>
                  <td><StatusBadge label={ENTRY_STATUS_LABEL[e.status]} tone={entryStatusTone(e.status)} /></td>
                  <td className="px-2">
                    <div className="flex gap-1">
                      <Link to={`/accounting/entries/${e.id}`} className="df-btn df-btn--ghost text-xs">Détail</Link>
                      {e.status === 'draft' && (
                        <button className="df-btn df-btn--ghost text-xs text-rose-600" onClick={() => { if (confirm('Supprimer cette écriture ?')) deleteMut.mutate(e.id); }}>✕</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {meta && meta.last_page > 1 && (
            <div className="flex items-center justify-between px-4 py-3 text-sm text-slate-600">
              <span>Page {meta.current_page} / {meta.last_page} — {meta.total} écritures</span>
              <div className="flex gap-2">
                <button className="df-btn df-btn--ghost text-xs" disabled={meta.current_page <= 1} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}>← Préc.</button>
                <button className="df-btn df-btn--ghost text-xs" disabled={meta.current_page >= meta.last_page} onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}>Suiv. →</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
