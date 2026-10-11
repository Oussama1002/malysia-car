import React from 'react';

/** Une entrée du journal, telle que le serveur la présente désormais. */
interface AuditEntry {
  id?: string;
  action?: string;
  label?: string;
  detail?: string | null;
  changes?: Array<{ field: string; from?: string | null; to?: string | null }>;
  userName?: string | null;
  module?: string | null;
  ip?: string | null;
  createdAt?: string | null;
}

interface Props {
  history: AuditEntry[];
}

const ACTION_ICONS: Record<string, string> = {
  created: '🆕',
  status_changed: '🔄',
  updated: '✏️',
  deleted: '🗑️',
  pdf_generated: '📄',
  payment_recorded: '💰',
  vehicle_swapped: '🚗',
  reader_document_uploaded: '📎',
};

const fmtDate = (v: string | null | undefined) =>
  v
    ? new Date(v).toLocaleString('fr-MA', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    : '—';

const TabHistory: React.FC<Props> = ({ history }) => (
  <div className="space-y-4">
    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">
      Journal d'audit ({history.length} entrée{history.length > 1 ? 's' : ''})
    </h3>

    {history.length > 0 ? (
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />

        <div className="space-y-0">
          {history.map((entry, i) => (
            <div key={entry.id ?? i} className="relative flex gap-4 pb-4">
              <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-slate-200 bg-white text-sm">
                {ACTION_ICONS[entry.action ?? ''] ?? '📝'}
              </div>

              <div className="flex-1 rounded-xl border border-slate-100 bg-white px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-black text-slate-800">{entry.label ?? 'Action'}</div>
                  <div className="text-[10px] text-slate-400">{fmtDate(entry.createdAt)}</div>
                </div>

                {entry.detail && <div className="mt-1 text-xs font-semibold text-slate-700">{entry.detail}</div>}

                {(entry.changes?.length ?? 0) > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {entry.changes!.map((change, idx) => (
                      <li key={idx} className="text-xs text-slate-600">
                        <span className="font-semibold text-slate-700">{change.field}</span>
                        {' : '}
                        <span className="text-slate-400 line-through">{change.from ?? '—'}</span>
                        {' → '}
                        <span className="font-semibold">{change.to ?? '—'}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-1.5 text-[10px] text-slate-400">
                  Par {entry.userName ?? 'le système'}
                  {entry.ip ? ` · ${entry.ip}` : ''}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    ) : (
      <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
        Aucun historique disponible
      </div>
    )}
  </div>
);

export default TabHistory;
