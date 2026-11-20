import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/services/apiClient';
import type { AccountingEntry } from '@/services/accountingApi';
import { ENTRY_STATUS_LABEL, entryStatusTone } from '@/services/accountingApi';
import type { Paginated } from '@/services/adminApi';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';

type SourceType = 'invoice' | 'payment' | 'depreciation' | 'asset_disposal';

export const LinkedAccountingEntryBadge: React.FC<{
  sourceType: SourceType;
  sourceId: string | null | undefined;
}> = ({ sourceType, sourceId }) => {
  const enabled = !!sourceId;
  const { data, isLoading } = useQuery({
    queryKey: ['accounting', 'entry-by-source', sourceType, sourceId],
    queryFn: () => apiClient<Paginated<AccountingEntry>>(
      `/v1/accounting/entries?source_type=${sourceType}&source_id=${sourceId}&per_page=1`
    ),
    enabled,
  });
  if (!enabled) return null;
  if (isLoading) return <span className="text-xs text-slate-400">Compta : chargement…</span>;
  const entry = data?.data?.[0];
  if (!entry) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        Aucune écriture comptable générée pour l'instant.
      </div>
    );
  }
  return (
    <Link
      to={`/accounting/entries/${entry.id}`}
      className="inline-flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
    >
      <span>Écriture comptable {entry.entry_number}</span>
      <StatusBadge label={ENTRY_STATUS_LABEL[entry.status]} tone={entryStatusTone(entry.status)} />
      <span className="text-indigo-500">→</span>
    </Link>
  );
};
