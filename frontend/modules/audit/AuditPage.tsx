import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditApi, type AuditFilters, type AuditLogDto } from '@/services/auditApi';
import { getApiBase } from '@/services/apiClient';
import { DataTable } from '@/modules/shared/components/DataTable';
import { formatDate } from '@/modules/shared/formatters';

const MODULE_OPTIONS = [
  '',
  'auth',
  'admin',
  'customers',
  'kyc',
  'fleet',
  'contracts',
  'credit',
  'finance',
  'legal',
  'signature',
  'documents',
  'document_reader',
  'rentals',
  'gps',
  'used_cars',
  'general',
  'system',
];

const MODULE_FR: Record<string, string> = {
  auth: 'Authentification',
  admin: 'Administration',
  customers: 'Clients',
  kyc: 'KYC',
  fleet: 'Flotte',
  contracts: 'Contrats',
  credit: 'Crédit',
  finance: 'Finance',
  legal: 'Juridique',
  signature: 'Signature',
  documents: 'Documents',
  document_reader: 'Lecture documents',
  rentals: 'Réservations',
  gps: 'GPS',
  used_cars: 'Véhicules occasion',
  general: 'Général',
  system: 'Système',
};

const ACTION_FR: Record<string, string> = {
  status_changed: 'Changement de statut',
  created: 'Création',
  updated: 'Modification',
  deleted: 'Suppression',
  approved: 'Approbation',
  rejected: 'Rejet',
  activated: 'Activation',
  terminated: 'Résiliation',
  login: 'Connexion',
  logout: 'Déconnexion',
  password_changed: 'Changement mot de passe',
  blacklist_added: 'Ajout liste noire',
  blacklist_removed: 'Retrait liste noire',
  document_uploaded: 'Document uploadé',
  document_extracted: 'Extraction OCR',
  vehicle_swap_requested: 'Demande changement véhicule',
  vehicle_swap_approved: 'Changement véhicule validé',
  vehicle_swap_approved_instant: 'Changement véhicule immédiat',
  reservation_deleted: 'Réservation supprimée',
  vehicle_swap_rejected: 'Changement véhicule refusé',
  critical_notification_created: 'Notification critique',
  pdf_generated: 'PDF généré',
  document_downloaded: 'Accès document',
  document_generated: 'Document généré',
  document_linked: 'Document lié',
  signature_requested: 'Signature demandée',
  signature_completed: 'Signature complétée',
  payment_received: 'Paiement reçu',
  payment_created: 'Paiement créé',
  schedule_generated: 'Échéancier généré',
};

const STATUS_FR: Record<string, string> = {
  draft: 'brouillon',
  reserved: 'réservé',
  confirmed: 'confirmé',
  pickup_scheduled: 'remise planifiée',
  handed_over: 'remis',
  active: 'en cours',
  extension_requested: 'prolongation demandée',
  return_scheduled: 'retour planifié',
  returned: 'retourné',
  inspection_pending: 'inspection en attente',
  damage_pending: 'dommages en attente',
  billing_pending: 'facturation en attente',
  closed: 'clôturé',
  cancelled: 'annulé',
  pending: 'en attente',
  pending_approval: 'en attente approbation',
  approved: 'approuvé',
  terminated: 'résilié',
  processing: 'en traitement',
  extracted: 'extrait',
  failed: 'échoué',
  validated: 'validé',
};

/** Translate an action_label that contains status transitions like "Statut reserved → cancelled" */
function translateActionLabel(label: string | null | undefined, action: string): string {
  if (!label) return ACTION_FR[action] ?? action;
  // Translate "Statut X → Y" patterns
  const m = label.match(/^Statut\s+(\w+)\s*[→→]\s*(\w+)$/i);
  if (m) {
    const from = STATUS_FR[m[1]] ?? m[1];
    const to = STATUS_FR[m[2]] ?? m[2];
    return `Statut ${from} → ${to}`;
  }
  return ACTION_FR[label] ?? label;
}

const ENTITY_FR: Record<string, string> = {
  Contract: 'Contrat',
  Customer: 'Client',
  Vehicle: 'Véhicule',
  Invoice: 'Facture',
  Payment: 'Paiement',
  Reservation: 'Réservation',
  Mission: 'Mission',
  Expense: 'Dépense',
  Document: 'Document',
  CreditApplication: 'Demande crédit',
  LegalCase: 'Dossier juridique',
  ArrearsCase: 'Dossier impayé',
  Envelope: 'Enveloppe signature',
  AccountingEntry: 'Écriture comptable',
  VehicleRepair: 'Réparation',
  VehicleMaintenanceEvent: 'Maintenance',
  VehicleAccident: 'Accident',
  VehicleInsurancePolicy: 'Assurance',
  VehicleTechnicalInspection: 'Contrôle technique',
  SubRentalContract: 'Contrat sous-location',
  User: 'Utilisateur',
  // document sub-types
  pdf_generated: 'PDF généré',
  document_downloaded: 'Document téléchargé',
  entity_attachment: 'Pièce jointe',
  generated: 'Document généré',
  contract_pdf: 'PDF contrat',
  invoice_pdf: 'PDF facture',
};

function translateEntity(raw: string | null | undefined): string {
  if (!raw) return '—';
  const short = raw.includes('\\') ? raw.split('\\').pop()! : raw;
  return ENTITY_FR[short] ?? short;
}

const ENTITY_OPTIONS = [
  '',
  'contract',
  'customer',
  'vehicle',
  'invoice',
  'payment',
  'kyc',
  'credit_application',
  'legal_case',
  'arrears_case',
  'envelope',
  'accounting_entry',
  'document',
];

export const AuditPage: React.FC = () => {
  const apiReady = !!getApiBase();
  const [filters, setFilters] = useState<AuditFilters>({ per_page: 50 });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [selected, setSelected] = useState<AuditLogDto | null>(null);

  const q = useQuery({
    queryKey: ['audit', filters],
    queryFn: () => auditApi.list(filters),
    enabled: apiReady,
  });

  if (!apiReady) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Backend non configuré. Renseignez <span className="font-mono">VITE_API_BASE</span> pour activer le journal d'audit.
      </div>
    );
  }

  const rows = q.data?.data ?? [];

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await auditApi.exportCsv(filters);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : 'Échec export');
    } finally {
      setExporting(false);
    }
  };

  const setField = <K extends keyof AuditFilters>(k: K, v: AuditFilters[K]) =>
    setFilters((s) => ({ ...s, [k]: (v as AuditFilters[K]) || undefined }));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Audit & traçabilité</h1>
          <p className="text-slate-500">
            Journal des changements sensibles ({q.data?.meta?.total ?? rows.length} entrée(s)).
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
          >
            {exporting ? 'Export…' : 'Exporter CSV'}
          </button>
          {exportError && <span className="text-[11px] text-rose-600">{exportError}</span>}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <input
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold md:col-span-2"
          placeholder="Recherche libre (libellé ou type d'action)"
          value={filters.q ?? ''}
          onChange={(e) => setField('q', e.target.value)}
        />
        <select
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold"
          value={filters.module ?? ''}
          onChange={(e) => setField('module', e.target.value)}
        >
          {MODULE_OPTIONS.map((m) => (
            <option key={m || 'all'} value={m}>
              {m ? m : 'Tous modules'}
            </option>
          ))}
        </select>
        <input
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold"
          placeholder="Action (ex. updated)"
          value={filters.action ?? ''}
          onChange={(e) => setField('action', e.target.value)}
        />
        <select
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold"
          value={filters.entity_type ?? ''}
          onChange={(e) => setField('entity_type', e.target.value)}
        >
          {ENTITY_OPTIONS.map((m) => (
            <option key={m || 'all'} value={m}>
              {m ? `Entité: ${m}` : 'Toutes entités'}
            </option>
          ))}
        </select>
        <input
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold"
          placeholder="ID entité (UUID)"
          value={filters.entity_id ?? ''}
          onChange={(e) => setField('entity_id', e.target.value)}
        />
        <input
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold"
          placeholder="Utilisateur (UUID)"
          value={filters.user_id ?? ''}
          onChange={(e) => setField('user_id', e.target.value)}
        />
        <input
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold"
          type="date"
          value={filters.from ?? ''}
          onChange={(e) => setField('from', e.target.value)}
        />
        <input
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold"
          type="date"
          value={filters.to ?? ''}
          onChange={(e) => setField('to', e.target.value)}
        />
        <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={!!filters.legal_only}
            onChange={(e) => setFilters((s) => ({ ...s, legal_only: e.target.checked || undefined }))}
          />
          Significatif juridiquement
        </label>
      </div>

      <DataTable
        loading={q.isLoading}
        columns={[
          {
            key: 'm',
            header: 'Module',
            render: (r) => <span className="text-xs font-semibold">{MODULE_FR[r.module] ?? r.module}</span>,
          },
          {
            key: 'a',
            header: 'Action',
            render: (r) => (
              <div className="flex flex-col">
                <span className="font-semibold">{translateActionLabel(r.action_label, r.action)}</span>
                <span className="text-[10px] uppercase text-slate-400">{ACTION_FR[r.action] ?? r.action}</span>
              </div>
            ),
          },
          {
            key: 'e',
            header: 'Entité',
            render: (r) => (
              <span className="font-mono text-xs">
                {translateEntity(r.entity_type)}{' '}
                {r.entity_id ? `· ${r.entity_id.slice(0, 8)}` : ''}
              </span>
            ),
          },
          {
            key: 'actor',
            header: 'Acteur',
            render: (r) => r.actor_email ?? r.user_id ?? '—',
          },
          {
            key: 'legal',
            header: 'Légal',
            render: (r) =>
              r.legal_significance ? (
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-black uppercase text-amber-800">
                  Légal
                </span>
              ) : (
                <span className="text-slate-300">—</span>
              ),
          },
          {
            key: 'ip',
            header: 'IP',
            render: (r) => (
              <span className="font-mono text-xs text-slate-500">{r.ip_address ?? '—'}</span>
            ),
          },
          { key: 't', header: 'Date', render: (r) => formatDate(r.occurred_at) },
          {
            key: 'open',
            header: '',
            render: (r) => (
              <button
                type="button"
                onClick={() => setSelected(r)}
                className="text-xs font-bold text-indigo-600"
              >
                Diff →
              </button>
            ),
          },
        ]}
        rows={rows}
        rowKey={(r) => r.id}
        emptyTitle="Aucun log"
      />

      {selected && <DiffDrawer log={selected} onClose={() => setSelected(null)} />}
    </div>
  );
};

const DiffDrawer: React.FC<{ log: AuditLogDto; onClose: () => void }> = ({ log, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-slate-900/40" onClick={onClose} />
      <aside className="w-full max-w-2xl overflow-auto bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-mono text-slate-500">{log.id}</div>
            <h2 className="text-lg font-black">{translateActionLabel(log.action_label, log.action)}</h2>
            <div className="text-xs text-slate-500">
              {MODULE_FR[log.module] ?? log.module} · {translateEntity(log.entity_type)} ·{' '}
              {log.actor_email ?? log.user_id ?? '—'} · {formatDate(log.occurred_at)}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-black uppercase text-slate-500">Avant</div>
            <pre className="overflow-auto rounded-xl bg-slate-50 p-3 text-[11px]">
              {log.before_data ? JSON.stringify(log.before_data, null, 2) : '—'}
            </pre>
          </div>
          <div>
            <div className="mb-1 text-xs font-black uppercase text-slate-500">Après</div>
            <pre className="overflow-auto rounded-xl bg-slate-50 p-3 text-[11px]">
              {log.after_data ? JSON.stringify(log.after_data, null, 2) : '—'}
            </pre>
          </div>
        </div>
      </aside>
    </div>
  );
};
