import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditApi, type AuditFilters, type AuditLogDto } from '@/services/auditApi';
import { getApiBase } from '@/services/apiClient';
import { DataTable } from '@/modules/shared/components/DataTable';
import { formatDate, formatDateTime } from '@/modules/shared/formatters';

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
  'rentals',
  'gps',
  'used_cars',
  'general',
  'system',
];

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

const MODULE_LABELS: Record<string, string> = {
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
  rentals: 'Réservations',
  gps: 'GPS',
  used_cars: "Véhicules d'occasion",
  general: 'Général',
  system: 'Système',
};

const ENTITY_LABELS: Record<string, string> = {
  contract: 'Contrat',
  customer: 'Client',
  vehicle: 'Véhicule',
  invoice: 'Facture',
  payment: 'Paiement',
  kyc: 'Dossier KYC',
  credit_application: 'Dossier crédit',
  legal_case: 'Dossier juridique',
  arrears_case: 'Dossier impayé',
  envelope: 'Enveloppe de signature',
  accounting_entry: 'Écriture comptable',
  document: 'Document',
};

const FIELD_LABELS: Record<string, string> = {
  status: 'Statut',
  customer_id: 'Client',
  vehicle_id: 'Véhicule',
  contract_id: 'Contrat',
  reservation_id: 'Réservation',
  document_id: 'Document',
  invoice_id: 'Facture',
  user_id: 'Utilisateur',
  actor_email: 'Acteur',
  payment_method: 'Mode de paiement',
  amount: 'Montant',
  total: 'Total',
  notes: 'Notes',
  start_date: 'Date de début',
  end_date: 'Date de fin',
  due_date: "Date d'échéance",
  created_at: 'Créé le',
  updated_at: 'Modifié le',
};

const VALUE_TRANSLATIONS: Record<string, string> = {
  draft: 'Brouillon',
  pending: 'En attente',
  pending_approval: "En attente d'approbation",
  approved: 'Approuvé',
  active: 'Actif',
  inactive: 'Inactif',
  cancelled: 'Annulé',
  rejected: 'Rejeté',
  completed: 'Terminé',
  extracted: 'Extrait',
  validated: 'Validé',
  failed: 'Échoué',
  processing: 'Traitement',
  cash: 'Espèce',
  virement: 'Virement',
  cheque: 'Chèque',
  card: 'Carte',
  true: 'Oui',
  false: 'Non',
  '1': 'Oui',
  '0': 'Non',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:.Z+-]+)?$/;

function humanModule(moduleName: string): string {
  return MODULE_LABELS[moduleName] ?? moduleName;
}

function humanEntityType(raw: string | null): string {
  if (!raw) return '—';
  const key = raw.split('\\').pop()?.toLowerCase() ?? raw.toLowerCase();
  return ENTITY_LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function entityPrefix(entityType: string | null): string {
  const k = (entityType ?? '').toLowerCase();
  if (k.includes('customer')) return 'CLT';
  if (k.includes('vehicle')) return 'VHL';
  if (k.includes('contract')) return 'CTR';
  if (k.includes('invoice')) return 'INV';
  if (k.includes('payment')) return 'PAY';
  if (k.includes('document')) return 'DOC';
  if (k.includes('kyc')) return 'KYC';
  return 'ENT';
}

function humanEntityRef(entityType: string | null, entityId: string | null): string {
  const label = humanEntityType(entityType);
  if (!entityId) return label;
  if (UUID_RE.test(entityId)) {
    return `${label} · ${entityPrefix(entityType)}-${entityId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  }
  return `${label} · ${entityId}`;
}

function humanFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const raw = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (UUID_RE.test(raw)) {
    const pfx = entityPrefix(field);
    return `${pfx}-${raw.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  }
  if (ISO_DATE_RE.test(raw)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return raw.includes('T') ? formatDateTime(d) : formatDate(d);
    }
  }
  return VALUE_TRANSLATIONS[raw] ?? VALUE_TRANSLATIONS[raw.toLowerCase()] ?? raw;
}

function computeDiffRows(log: AuditLogDto): Array<{ field: string; before: string; after: string }> {
  const before = (log.before_data ?? {}) as Record<string, unknown>;
  const after = (log.after_data ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  return [...keys]
    .filter((k) => String(before[k] ?? '') !== String(after[k] ?? ''))
    .slice(0, 80)
    .map((k) => ({
      field: humanFieldLabel(k),
      before: humanValue(k, before[k]),
      after: humanValue(k, after[k]),
    }));
}

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
            render: (r) => <span className="text-xs font-semibold">{humanModule(r.module)}</span>,
          },
          {
            key: 'a',
            header: 'Action',
            render: (r) => (
              <div className="flex flex-col">
                <span className="font-semibold">{r.action_label ?? r.action}</span>
                <span className="text-[10px] uppercase text-slate-400">{r.action}</span>
              </div>
            ),
          },
          {
            key: 'e',
            header: 'Entité',
            render: (r) => (
              <span className="text-xs font-semibold">
                {humanEntityRef(r.entity_type, r.entity_id)}
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
  const diffs = computeDiffRows(log);
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-slate-900/40" onClick={onClose} />
      <aside className="w-full max-w-2xl overflow-auto bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-mono text-slate-500">{log.id}</div>
            <h2 className="text-lg font-black">{log.action_label ?? log.action}</h2>
            <div className="text-xs text-slate-500">
              {humanModule(log.module)} · {humanEntityRef(log.entity_type, log.entity_id)} ·{' '}
              {log.actor_email ?? log.user_id ?? '—'} · {formatDate(log.occurred_at)}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        <div className="mt-6">
          <div className="mb-2 text-xs font-black uppercase text-slate-500">Modifications</div>
          {diffs.length === 0 ? (
            <div className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-500">Aucun champ lisible modifié.</div>
          ) : (
            <div className="overflow-auto rounded-xl border border-slate-100">
              <table className="min-w-full text-[11px]">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-black uppercase">Champ</th>
                    <th className="px-3 py-2 text-left font-black uppercase">Avant</th>
                    <th className="px-3 py-2 text-left font-black uppercase">Après</th>
                  </tr>
                </thead>
                <tbody>
                  {diffs.map((row) => (
                    <tr key={row.field} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-semibold text-slate-700">{row.field}</td>
                      <td className="px-3 py-2 text-slate-500">{row.before}</td>
                      <td className="px-3 py-2 font-semibold text-slate-800">{row.after}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
