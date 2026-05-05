import React from 'react';
import { EmptyState } from '@/modules/shared/components/EmptyState';
import { SkeletonTable } from '@/modules/shared/components/Skeleton';

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
};

export function DataTable<T>(props: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}): React.ReactElement {
  const { columns, rows, rowKey, loading, emptyTitle, emptyDescription } = props;
  if (loading) return <SkeletonTable cols={columns.length} rows={6} />;
  if (!rows.length) return <EmptyState title={emptyTitle ?? 'Aucune ligne'} description={emptyDescription} />;
  return (
    <div className="df-card overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-slate-900/5 bg-white/40">
            {columns.map((c) => (
              <th key={c.key} className={`px-4 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 ${c.className ?? ''}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-900/5">
          {rows.map((row) => (
            <tr key={String(rowKey(row))} className="hover:bg-white/60 transition-colors">
              {columns.map((c) => (
                <td key={c.key} className={`px-4 py-3 align-middle ${c.className ?? ''}`}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
