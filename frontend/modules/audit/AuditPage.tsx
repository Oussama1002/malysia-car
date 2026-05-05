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
            render: (r) => <span className="font-mono text-xs">{r.module}</span>,
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
              <span className="font-mono text-xs">
                {r.entity_type ? r.entity_type.split('\\').pop() : '—'}{' '}
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
            <h2 className="text-lg font-black">{log.action_label ?? log.action}</h2>
            <div className="text-xs text-slate-500">
              {log.module} · {log.entity_type ? log.entity_type.split('\\').pop() : '—'} ·{' '}
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
