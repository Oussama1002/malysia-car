import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditApi } from '@/services/auditApi';
import { formatDate } from '@/modules/shared/formatters';

/**
 * Drop into any detail page (contract, customer, invoice, vehicle, …).
 * Calls `GET /api/v1/entities/{entityType}/{entityId}/audit`.
 *
 * `entityType` accepts an alias (`contract`, `customer`, `invoice`, …) or a full FQCN
 * (e.g. `App\\Models\\Contract`). The backend resolves aliases to one or more FQCNs.
 */
export const EntityAuditTimeline: React.FC<{
  entityType: string;
  entityId: string | number;
  perPage?: number;
  className?: string;
}> = ({ entityType, entityId, perPage = 100, className }) => {
  const id = String(entityId);
  const q = useQuery({
    queryKey: ['audit', 'entity', entityType, id, perPage],
    queryFn: () => auditApi.forEntity(entityType, id, { per_page: perPage }),
    enabled: !!entityType && !!id,
  });

  if (q.isLoading) return <div className="text-xs text-slate-400">Chargement de l'historique…</div>;
  const rows = q.data?.data ?? [];

  if (!rows.length) {
    return <div className="text-xs text-slate-400">Aucune action enregistrée pour cette entité.</div>;
  }

  return (
    <ol className={`relative space-y-3 border-l border-slate-200 pl-4 ${className ?? ''}`}>
      {rows.map((r) => (
        <li key={r.id} className="relative">
          <span
            className={`absolute -left-[7px] top-2 h-3 w-3 rounded-full ${
              r.legal_significance ? 'bg-amber-500' : 'bg-indigo-500'
            }`}
          />
          <div className="rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-black text-slate-900">{r.action_label ?? r.action}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">
                {formatDate(r.occurred_at)}
              </div>
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {r.actor_email ?? r.user_id ?? 'Système'}
              {r.ip_address ? <span className="font-mono"> · {r.ip_address}</span> : null}
              {r.legal_significance && (
                <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-black uppercase text-amber-800">
                  Légal
                </span>
              )}
            </div>
            {(r.before_data || r.after_data) && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[11px] font-semibold text-indigo-600">
                  Voir le diff
                </summary>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <div>
                    <div className="text-[10px] font-black uppercase text-slate-500">Avant</div>
                    <pre className="overflow-auto rounded bg-slate-50 p-2 text-[10px]">
                      {r.before_data ? JSON.stringify(r.before_data, null, 2) : '—'}
                    </pre>
                  </div>
                  <div>
                    <div className="text-[10px] font-black uppercase text-slate-500">Après</div>
                    <pre className="overflow-auto rounded bg-slate-50 p-2 text-[10px]">
                      {r.after_data ? JSON.stringify(r.after_data, null, 2) : '—'}
                    </pre>
                  </div>
                </div>
              </details>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
};
