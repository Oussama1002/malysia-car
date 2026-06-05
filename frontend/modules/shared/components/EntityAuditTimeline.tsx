import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditApi } from '@/services/auditApi';
import { formatDate, formatDateTime } from '@/modules/shared/formatters';

/** Fields that are purely technical — never surfaced in the diff view */
const HIDDEN_AUDIT_FIELDS = new Set([
  'id',
  'company_id',
  'branch_id',
  'created_at',
  'updated_at',
  'deleted_at',
  'sha256',          // file integrity hash — not human-readable
  'storage_path',    // internal disk path
  'disk',            // storage driver name
  'password',
  'remember_token',
  'two_factor_secret',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/;
const HEX_HASH_RE = /^[0-9a-f]{32,}$/i;

/** Derive a short prefix from a field key name */
function uuidPrefix(key: string): string {
  const k = key.toLowerCase();
  if (k.includes('customer'))    return 'CLT';
  if (k.includes('vehicle'))     return 'VHL';
  if (k.includes('contract'))    return 'CTR';
  if (k.includes('reservation')) return 'RSV';
  if (k.includes('invoice'))     return 'INV';
  if (k.includes('document'))    return 'DOC';
  if (k.includes('user'))        return 'USR';
  if (k.includes('company'))     return 'CMP';
  if (k.includes('branch'))      return 'BRN';
  return key.replace(/_id$/, '').slice(0, 3).toUpperCase();
}

/** French translations for known status/enum values that come from the backend in English */
const VALUE_TRANSLATIONS: Record<string, string> = {
  // Generic statuses
  draft:                    'Brouillon',
  pending:                  'En attente',
  pending_approval:         'En attente d\'approbation',
  pending_created:          'Créé · en attente',
  'pending created':        'Créé · en attente',
  approved:                 'Approuvé',
  active:                   'Actif',
  inactive:                 'Inactif',
  completed:                'Terminé',
  cancelled:                'Annulé',
  rejected:                 'Rejeté',
  expired:                  'Expiré',
  terminated:               'Résilié',
  closed:                   'Clôturé',
  suspended:                'Suspendu',
  blocked:                  'Bloqué',
  // Contract
  pending_signature:        'En attente de signature',
  signed:                   'Signé',
  sent_for_signature:       'Envoyé pour signature',
  // Reservation / rental
  reserved:                 'Réservé',
  confirmed:                'Confirmé',
  pickup_scheduled:         'Remise planifiée',
  handed_over:              'Remis',
  extension_requested:      'Prolongation demandée',
  return_scheduled:         'Retour planifié',
  returned:                 'Retourné',
  inspection_pending:       'Inspection en attente',
  damage_pending:           'Dommages en attente',
  billing_pending:          'Facturation en attente',
  // KYC
  under_review:             'En cours de vérification',
  incomplete:               'Incomplet',
  // Document
  processing:               'Traitement en cours',
  extracted:                'Extrait',
  validated:                'Validé',
  failed:                   'Échoué',
  // Boolean-like
  'true':                   'Oui',
  'false':                  'Non',
  '1':                      'Oui',
  '0':                      'Non',
  // Contract types
  LLD:                      'Location Longue Durée',
  LOA:                      'Location avec Option d\'Achat',
  CREDIT_AUTO:              'Crédit Automobile',
  VENTE_VO:                 'Vente VO',
  LOCATION_COURTE:          'Location Courte Durée',
  // Payment methods
  virement:                 'Virement',
  cheque:                   'Chèque',
  espece:                   'Espèce',
  cash:                     'Espèce',
  carte:                    'Carte bancaire',
  bank_transfer:            'Virement bancaire',
  // Ownership
  owned:                    'Propriété',
  leased:                   'Loué',
  sub_rented:               'Sous-location',
  // Missions
  planned:                  'Planifié',
  in_progress:              'En cours',
  done:                     'Terminé',
  // Damage
  open:                     'Ouvert',
  // Handover
  pickup:                   'Remise',
  return:                   'Retour',
  // Misc
  enabled:                  'Activé',
  disabled:                 'Désactivé',
};

/** French labels for audit action types */
const ACTION_LABELS: Record<string, string> = {
  created:                  'Création',
  updated:                  'Modification',
  deleted:                  'Suppression',
  status_changed:           'Changement de statut',
  approved:                 'Approbation',
  rejected:                 'Rejet',
  activated:                'Activation',
  terminated:               'Résiliation',
  signed:                   'Signature',
  sent_for_signature:       'Envoi pour signature',
  schedule_generated:       'Échéancier généré',
  pdf_generated:            'PDF généré',
  payment_recorded:         'Paiement enregistré',
  confirmed:                'Confirmation',
  cancelled:                'Annulation',
  handed_over:              'Remise véhicule',
  returned:                 'Retour véhicule',
  extended:                 'Prolongation',
  damage_reported:          'Dommage signalé',
  billing_closed:           'Facturation clôturée',
  wallet_credited:          'Crédit portefeuille',
  wallet_debited:           'Débit portefeuille',
  wallet_adjusted:          'Ajustement portefeuille',
  kyc_submitted:            'KYC soumis',
  kyc_approved:             'KYC approuvé',
  kyc_rejected:             'KYC rejeté',
  document_uploaded:        'Document téléversé',
  document_validated:       'Document validé',
  financial_action:         'Action financière',
  login:                    'Connexion',
  logout:                   'Déconnexion',
};

/** Translate a raw backend value to French if a translation exists */
function translateValue(s: string): string {
  // Exact match (case-sensitive first, then lowercase)
  if (VALUE_TRANSLATIONS[s]) return VALUE_TRANSLATIONS[s];
  const lower = s.toLowerCase();
  if (VALUE_TRANSLATIONS[lower]) return VALUE_TRANSLATIONS[lower];
  return s;
}

/** Format a raw field value into a human-friendly string */
function formatValue(key: string, raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  const s = typeof raw === 'object' ? JSON.stringify(raw) : String(raw);

  // UUID → short professional ID
  if (UUID_RE.test(s.trim())) {
    const prefix = uuidPrefix(key);
    return `${prefix}-${s.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  }

  // ISO date/datetime → localized string with time
  if (ISO_DATE_RE.test(s.trim())) {
    try {
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        return s.includes('T') && !s.endsWith('T00:00:00.000000Z') && !s.endsWith('T00:00:00Z')
          ? formatDateTime(d)
          : formatDate(d);
      }
    } catch { /* fall through */ }
  }

  // Long hex string (SHA-like) → truncate
  if (HEX_HASH_RE.test(s.trim()) && s.length > 20) {
    return `${s.slice(0, 12)}…`;
  }

  // Known status / enum → French translation
  return translateValue(s);
}

function toComparable(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const FIELD_LABELS: Record<string, string> = {
  status:               'Statut',
  customer_id:          'Client',
  vehicle_id:           'Véhicule',
  contract_id:          'Contrat',
  reservation_id:       'Réservation',
  document_id:          'Document',
  invoice_id:           'Facture',
  user_id:              'Utilisateur',
  assigned_user_id:     'Assigné à',
  start_date:           'Date de début',
  end_date:             'Date de fin',
  desired_start_at:     'Début souhaité',
  desired_end_at:       'Fin souhaitée',
  activation_date:      'Date d\'activation',
  closure_date:         'Date de clôture',
  signed_at:            'Signé le',
  terminated_reason:    'Motif résiliation',
  monthly_payment:      'Mensualité',
  base_amount:          'Montant de base',
  down_payment_amount:  'Apport',
  deposit_amount:       'Caution',
  duration_months:      'Durée (mois)',
  allowed_km:           'Km autorisés',
  excess_km_rate:       'Tarif km excédent',
  payment_method:       'Mode de paiement',
  payment_terms:        'Conditions paiement',
  bank_reference:       'Réf. virement',
  cheque_number:        'N° chèque',
  notes:                'Notes',
  legal_status:         'Statut légal',
  signature_status:     'Statut signature',
  estimated_price:      'Prix estimé',
  reservation_type:     'Type réservation',
  handover_type:        'Type remise',
  fuel_level:           'Niveau carburant',
  odometer:             'Kilométrage',
  condition_notes:      'État / observations',
};

function formatFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface DiffLine {
  label: string;
  before: string;
  after: string;
}

function summarizeChanges(
  beforeData?: Record<string, unknown> | null,
  afterData?: Record<string, unknown> | null,
): DiffLine[] {
  const before = beforeData ?? {};
  const after  = afterData  ?? {};
  const keys   = new Set([...Object.keys(before), ...Object.keys(after)]);
  const lines: DiffLine[] = [];

  keys.forEach((key) => {
    if (HIDDEN_AUDIT_FIELDS.has(key)) return;
    const rawBefore = toComparable(before[key]);
    const rawAfter  = toComparable(after[key]);
    if (rawBefore === rawAfter) return;
    lines.push({
      label:  formatFieldLabel(key),
      before: formatValue(key, before[key]),
      after:  formatValue(key, after[key]),
    });
  });

  return lines.slice(0, 10);
}

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
              <div className="text-sm font-black text-slate-900">
                {ACTION_LABELS[r.action] ?? ACTION_LABELS[r.action_label] ?? r.action_label?.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) ?? r.action}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">
                {formatDateTime(r.occurred_at)}
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
            {(r.before_data || r.after_data) && (() => {
              const diffs = summarizeChanges(
                r.before_data as Record<string, unknown> | null,
                r.after_data as Record<string, unknown> | null,
              );
              return (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] font-semibold text-indigo-600">
                    Voir les changements ({diffs.length || 'aucun détail'})
                  </summary>
                  {diffs.length > 0 ? (
                    <table className="mt-2 w-full border-collapse text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="py-1 pr-2 text-left font-bold text-slate-400 w-1/3">Champ</th>
                          <th className="py-1 pr-2 text-left font-bold text-slate-400 w-1/3">Avant</th>
                          <th className="py-1 text-left font-bold text-slate-400 w-1/3">Après</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diffs.map((d) => (
                          <tr key={d.label} className="border-b border-slate-50">
                            <td className="py-1 pr-2 font-semibold text-slate-600">{d.label}</td>
                            <td className="py-1 pr-2 font-mono text-slate-400">{d.before}</td>
                            <td className="py-1 font-mono font-semibold text-slate-800">{d.after}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="mt-1 text-[11px] text-slate-400">Changement enregistré (aucun champ visible).</p>
                  )}
                </details>
              );
            })()}
          </div>
        </li>
      ))}
    </ol>
  );
};
