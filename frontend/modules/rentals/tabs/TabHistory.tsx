import React from 'react';

interface AuditEntry {
  id?: string;
  // audit_logs columns
  action_type?: string;
  action_label?: string;
  before_data?: any;
  after_data?: any;
  user_name?: string | null;
  // legacy shapes kept for compatibility
  action?: string;
  event_type?: string;
  description?: string;
  changes?: any;
  user_id?: string;
  created_at?: string;
  ip_address?: string;
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

const STATUS_FR: Record<string, string> = {
  draft:               'Brouillon',
  reserved:            'Réservé',
  confirmed:           'Confirmé',
  pickup_scheduled:    'Remise planifiée',
  handed_over:         'Remis',
  active:              'En cours',
  extension_requested: 'Prolongation demandée',
  return_scheduled:    'Retour planifié',
  returned:            'Retourné',
  inspection_pending:  'Inspection en attente',
  damage_pending:      'Dommages en attente',
  billing_pending:     'Facturation en attente',
  closed:              'Clôturé',
  cancelled:           'Annulé',
  new:                 'Nouveau',
};

const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';

function parseJson(v: unknown): Record<string, unknown> | null {
  if (v == null) return null;
  if (typeof v === 'object') return v as Record<string, unknown>;
  if (typeof v === 'string') {
    try { return JSON.parse(v) as Record<string, unknown>; } catch { return null; }
  }
  return null;
}

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
              const action = entry.action_type ?? entry.action ?? entry.event_type ?? '';
              const icon = ACTION_ICONS[action] ?? '📝';
              let label = ACTION_FR[action] ?? entry.action_label ?? action ?? 'Événement';
              let detail = entry.description ?? '';

              const before = parseJson(entry.before_data) ?? parseJson(entry.changes);
              const after = parseJson(entry.after_data);

              if (action === 'status_changed') {
                const from = String(before?.status ?? before?.from_status ?? '');
                const to = String(after?.status ?? before?.to_status ?? '');
                if (from || to) {
                  detail = `${STATUS_FR[from] ?? from ?? '—'} → ${STATUS_FR[to] ?? to ?? '—'}`;
                }
              } else if (action === 'updated' && after && typeof after === 'object') {
                const keys = Object.keys(after).filter((k) => k !== 'updated_at');
                if (keys.length > 0) detail = `Champs modifiés : ${keys.join(', ')}`;
              } else if (!ACTION_FR[action] && entry.action_label) {
                label = entry.action_label;
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
                    {(entry.user_name || entry.user_id) && (
                      <div className="mt-1 text-[10px] text-slate-400">
                        Utilisateur : {entry.user_name ?? entry.user_id!.slice(0, 8).toUpperCase()}
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

interface Props {
  history: AuditEntry[];
}

export default TabHistory;
