import React from 'react';

interface AuditEntry {
  id?: string;
  action?: string;
  event_type?: string;
  description?: string;
  changes?: any;
  user_id?: string;
  created_at?: string;
  ip_address?: string;
}

interface Props {
  history: AuditEntry[];
}

const ACTION_ICONS: Record<string, string> = {
  created:        '🆕',
  status_changed: '🔄',
  updated:        '✏️',
  deleted:        '🗑️',
};

const ACTION_FR: Record<string, string> = {
  created:        'Création',
  status_changed: 'Changement de statut',
  updated:        'Modification',
  deleted:        'Suppression',
};

const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

const TabHistory: React.FC<Props> = ({ history }) => {
  return (
    <div className="space-y-4">
      <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">
        Journal d'audit ({history.length} entrées)
      </h3>

      {history.length > 0 ? (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200" />

          <div className="space-y-0">
            {history.map((entry, i) => {
              const action = entry.action ?? entry.event_type ?? 'unknown';
              const icon = ACTION_ICONS[action] ?? '📝';
              const label = ACTION_FR[action] ?? action;
              const changes = entry.changes;
              let detail = entry.description ?? '';

              // Parse status changes
              if (action === 'status_changed' && changes) {
                const c = typeof changes === 'string' ? JSON.parse(changes) : changes;
                if (c.from_status && c.to_status) {
                  detail = `${c.from_status} → ${c.to_status}`;
                  if (c.note) detail += ` — ${c.note}`;
                }
              }

              return (
                <div key={entry.id ?? i} className="relative flex gap-4 pb-4">
                  {/* Timeline dot */}
                  <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white border-2 border-slate-200 text-sm">
                    {icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 rounded-xl border border-slate-100 bg-white px-4 py-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-black text-slate-800">{label}</div>
                      <div className="text-[10px] text-slate-400">{fmtDate(entry.created_at)}</div>
                    </div>
                    {detail && (
                      <div className="mt-1 text-xs text-slate-600">{detail}</div>
                    )}
                    {entry.user_id && (
                      <div className="mt-1 text-[10px] text-slate-400">
                        Utilisateur : {entry.user_id.slice(0, 8).toUpperCase()}
                        {entry.ip_address ? ` · IP: ${entry.ip_address}` : ''}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
          Aucun historique disponible
        </div>
      )}
    </div>
  );
};

export default TabHistory;
