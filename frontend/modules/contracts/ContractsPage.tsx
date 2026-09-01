import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/queryKeys';
import { DataTable } from '@/modules/shared/components/DataTable';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { SearchFilterBar } from '@/modules/shared/components/SearchFilterBar';
import { contractsApi } from '@/services/contractsApi';
import { apiClient, endpoints } from '@/services/apiClient';

/* ── French labels ─────────────────────────────────────────────────── */

const STATUS_FR: Record<string, string> = {
  draft:              'Brouillon',
  pending_approval:   'En attente d\'approbation',
  'pending approval': 'En attente d\'approbation',
  approved:           'Approuvé',
  awaiting_signature: 'En attente de signature',
  'awaiting signature': 'En attente de signature',
  active:             'Actif',
  signed:             'Signé',
  pending:            'En attente',
  suspended:          'Suspendu',
  closed:             'Clôturé',
  terminated:         'Résilié',
  expired:            'Expiré',
  completed:          'Terminé',
  cancelled:          'Annulé',
  rejected:           'Rejeté',
};

const STATUS_TONE: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  active:             'success',
  signed:             'success',
  approved:           'success',
  completed:          'success',
  pending_approval:   'warning',
  'pending approval': 'warning',
  awaiting_signature: 'warning',
  'awaiting signature': 'warning',
  pending:            'warning',
  suspended:          'warning',
  draft:              'default',
  closed:             'info',
  expired:            'info',
  terminated:         'danger',
  cancelled:          'danger',
  rejected:           'danger',
};

const TYPE_FR: Record<string, string> = {
  LLD:              'LLD',
  LOA:              'LOA',
  CREDIT_AUTO:      'Crédit auto',
  VENTE_VO:         'Vente occasion',
  LOCATION_COURTE:  'Location courte',
};

function formatAmount(value: unknown): string {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount) || amount === 0) return '—';
  return `${amount.toLocaleString('fr-MA')} MAD`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Number of completed months + leftover days between two ISO date strings,
 * anchored on the same day-of-month. "2 mois et 5 jours" is more truthful
 * than the flat "3 mois" the DB durationMonths often carries.
 */
function durationBetween(start?: string | null, end?: string | null): { months: number; days: number } | null {
  if (!start || !end) return null;
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return null;
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  const anchor = new Date(s);
  anchor.setMonth(anchor.getMonth() + months);
  if (anchor > e) {
    months -= 1;
    anchor.setMonth(anchor.getMonth() - 1);
  }
  const days = Math.max(0, Math.round((e.getTime() - anchor.getTime()) / 86_400_000));
  return { months: Math.max(0, months), days };
}

function formatDuration(start?: string | null, end?: string | null, fallbackMonths?: number | null): string {
  const dur = durationBetween(start, end);
  if (dur && (dur.months > 0 || dur.days > 0)) {
    const parts: string[] = [];
    if (dur.months > 0) parts.push(`${dur.months} mois`);
    if (dur.days > 0) parts.push(`${dur.days} jour${dur.days > 1 ? 's' : ''}`);
    return parts.join(' et ');
  }
  if (fallbackMonths && fallbackMonths > 0) return `${fallbackMonths} mois`;
  return '';
}

export const ContractsPage: React.FC = () => {
  const [filters, setFilters] = React.useState<{ q: string; type: string; status: string }>({ q: '', type: '', status: '' });

  const q = useQuery({
    queryKey: [...queryKeys.contracts.all, filters],
    queryFn: async () => contractsApi.list({ type: filters.type || undefined, status: filters.status || undefined }),
  });

  // Customers + vehicles for display (name / plate resolution).
  const customersQ = useQuery({
    queryKey: ['contracts-page', 'customers'],
    queryFn: async () => (await apiClient<{ data: any[] }>(endpoints.customers.list)).data ?? [],
    staleTime: 60_000,
  });
  const vehiclesQ = useQuery({
    queryKey: ['contracts-page', 'vehicles'],
    queryFn: async () => (await apiClient<{ data: any[] }>('/v1/vehicles?per_page=200')).data ?? [],
    staleTime: 60_000,
  });

  const customerById = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of customersQ.data ?? []) m.set(String(c.id), c);
    return m;
  }, [customersQ.data]);
  const vehicleById = useMemo(() => {
    const m = new Map<string, any>();
    for (const v of vehiclesQ.data ?? []) m.set(String(v.id), v);
    return m;
  }, [vehiclesQ.data]);

  const customerLabel = (id: string | number | undefined): string => {
    if (!id) return '—';
    const c: any = customerById.get(String(id));
    if (!c) return '—';
    return (
      c.display_name
      ?? c.legal_name
      ?? [c?.individual_profile?.first_name, c?.individual_profile?.last_name].filter(Boolean).join(' ').trim()
      ?? c?.company_profile?.trade_name
      ?? c?.company_profile?.legal_name
      ?? c.customer_code
      ?? '—'
    );
  };
  const vehicleLabel = (id: string | number | undefined): { name: string; plate: string } => {
    if (!id) return { name: '—', plate: '—' };
    const v: any = vehicleById.get(String(id));
    if (!v) return { name: '—', plate: '—' };
    const name = [v.brand, v.model].filter(Boolean).join(' ').trim() || 'Véhicule';
    return { name, plate: v.registration ?? v.registration_number ?? '—' };
  };

  const rows = useMemo(() => {
    return (q.data ?? []).filter((c: any) => {
      if (!filters.q) return true;
      const cust = customerLabel(c.customerId ?? c.customer_id).toLowerCase();
      const veh = vehicleLabel(c.vehicleId ?? c.vehicle_id);
      const hay = [
        c.reference,
        c.type,
        c.status,
        cust,
        veh.name,
        veh.plate,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(filters.q.toLowerCase());
    });
  }, [q.data, filters.q, customerById, vehicleById]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Contrats</h1>
          <p className="text-slate-500">LLD, LOA, crédit auto, vente occasion, location courte durée.</p>
        </div>
        <Link
          to="/contracts/new"
          className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-100"
        >
          + Nouveau contrat
        </Link>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="flex-1">
          <SearchFilterBar
            placeholder="Filtrer (référence, client, véhicule, plaque, type, statut)…"
            value={filters.q}
            onChange={(v) => setFilters((s) => ({ ...s, q: v }))}
          />
        </div>
        <select
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold"
          value={filters.type}
          onChange={(e) => setFilters((s) => ({ ...s, type: e.target.value }))}
        >
          <option value="">Tous types</option>
          {Object.entries(TYPE_FR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select
          className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold"
          value={filters.status}
          onChange={(e) => setFilters((s) => ({ ...s, status: e.target.value }))}
        >
          <option value="">Tous statuts</option>
          <option value="draft">Brouillon</option>
          <option value="pending_approval">En attente d'approbation</option>
          <option value="approved">Approuvé</option>
          <option value="awaiting_signature">En attente de signature</option>
          <option value="active">Actif</option>
          <option value="suspended">Suspendu</option>
          <option value="closed">Clôturé</option>
          <option value="terminated">Résilié</option>
          <option value="cancelled">Annulé</option>
        </select>
      </div>

      <DataTable
        loading={q.isLoading}
        columns={[
          {
            key: 'ref',
            header: 'Référence',
            render: (r: any) => (
              <div>
                <div className="font-mono text-xs font-black text-slate-900">{r.reference}</div>
                <div className="text-[10px] font-semibold text-slate-400">{formatDate(r.createdAt)}</div>
              </div>
            ),
          },
          {
            key: 'type',
            header: 'Type',
            render: (r: any) => <StatusBadge label={TYPE_FR[r.type] ?? r.type} tone="info" />,
          },
          {
            key: 'client',
            header: 'Client',
            render: (r: any) => {
              const label = customerLabel(r.customerId ?? r.customer_id);
              return (
                <span className="font-semibold text-slate-800">{label}</span>
              );
            },
          },
          {
            key: 'vehicle',
            header: 'Véhicule',
            render: (r: any) => {
              const v = vehicleLabel(r.vehicleId ?? r.vehicle_id);
              return (
                <div>
                  <div className="text-sm font-semibold text-slate-800">{v.name}</div>
                  <div className="font-mono text-[10px] text-slate-500">{v.plate}</div>
                </div>
              );
            },
          },
          {
            key: 'period',
            header: 'Période',
            render: (r: any) => {
              const start = r.startDate ?? r.start_date;
              const end = r.endDate ?? r.end_date;
              const duration = formatDuration(start, end, r.durationMonths ?? r.duration_months);
              return (
                <div>
                  <div className="text-xs font-semibold text-slate-700">
                    {formatDate(start)} → {formatDate(end)}
                  </div>
                  {duration && (
                    <div className="text-[10px] font-semibold text-slate-400">{duration}</div>
                  )}
                </div>
              );
            },
          },
          {
            key: 'monthly',
            header: 'Mensualité',
            render: (r: any) => (
              <span className="text-xs font-semibold text-slate-700">
                {formatAmount(r.monthlyPayment ?? r.monthly_payment)}
              </span>
            ),
          },
          {
            key: 'total',
            header: 'Montant total',
            render: (r: any) => (
              <span className="font-black text-indigo-700">
                {formatAmount(r.baseAmount ?? r.amountMad ?? r.base_amount)}
              </span>
            ),
          },
          {
            key: 'status',
            header: 'Statut',
            render: (r: any) => {
              const s = String(r.status ?? '').toLowerCase();
              return (
                <StatusBadge
                  label={STATUS_FR[s] ?? r.status ?? '—'}
                  tone={STATUS_TONE[s] ?? 'default'}
                />
              );
            },
          },
          {
            key: 'action',
            header: '',
            render: (r: any) => (
              <Link className="text-sm font-black text-indigo-600 hover:underline" to={`/contracts/${r.id}`}>
                Détail →
              </Link>
            ),
          },
        ]}
        rows={rows}
        rowKey={(r: any) => r.id}
        emptyTitle="Aucun contrat"
      />
    </div>
  );
};
