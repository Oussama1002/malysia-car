import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createCustomer,
  listCustomers,
  type Customer,
  type CustomerCreatePayload,
  type CustomerListParams,
  type CustomerType,
  type KycStatus,
  type RiskLevel,
} from '@/services/customersApi';
import { listBranches } from '@/services/adminApi';
import { ApiError } from '@/services/apiError';
import { DataTable } from '@/modules/shared/components/DataTable';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { CustomerForm } from '@/modules/customers/CustomerForm';
import type { ScannedDocument } from '@/modules/customers/CustomerIdentityScanner';
import { documentReaderApi } from '@/services/documentReaderApi';

const kycTone: Record<KycStatus, 'success' | 'warning' | 'info' | 'danger' | 'default'> = {
  pending: 'warning',
  in_review: 'info',
  approved: 'success',
  rejected: 'danger',
  expired: 'default',
};

const kycLabel: Record<KycStatus, string> = {
  pending: 'En attente',
  in_review: 'En revue',
  approved: 'Approuvé',
  rejected: 'Rejeté',
  expired: 'Expiré',
};

const riskTone: Record<RiskLevel, 'success' | 'default' | 'warning' | 'danger'> = {
  low: 'success',
  normal: 'default',
  elevated: 'warning',
  high: 'danger',
};

const riskLabel: Record<RiskLevel, string> = {
  low: 'Faible',
  normal: 'Normal',
  elevated: 'Élevé',
  high: 'Élevé+',
};

export const CustomersPage: React.FC = () => {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<CustomerListParams>({ page: 1, per_page: 20 });
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['customers', filters, search],
    queryFn: () =>
      listCustomers({
        ...filters,
        search: search || undefined,
      }),
  });

  const branchesQ = useQuery({ queryKey: ['admin', 'branches'], queryFn: () => listBranches() });

  const createMut = useMutation({
    mutationFn: async (vars: { payload: CustomerCreatePayload; scans: ScannedDocument[] }) => {
      const res = await createCustomer(vars.payload);
      // Attach every CIN / Permis the admin scanned to the new customer so it
      // shows under the customer's Documents tab.
      for (const scan of vars.scans) {
        try {
          await documentReaderApi.link(scan.documentId, 'customer', String(res.data.id));
        } catch {
          /* don't block the create on attachment failures */
        }
      }
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
      setDrawerOpen(false);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur de création'),
  });

  const rows = listQ.data?.data ?? [];
  const meta = listQ.data?.meta;

  const setFilter = <K extends keyof CustomerListParams>(key: K, value: CustomerListParams[K]) => {
    setFilters((f) => ({ ...f, [key]: value, page: 1 }));
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Clients</h1>
          <p className="text-slate-500">Particuliers et entreprises — KYC, risque, blacklist.</p>
        </div>
        <button
          type="button"
          className="df-btn df-btn--primary"
          onClick={() => {
            setError(null);
            setDrawerOpen(true);
          }}
        >
          + Nouveau client
        </button>
      </header>

      {/* Filters */}
      <div className="df-card">
        <div className="df-card__body grid gap-3 md:grid-cols-3 lg:grid-cols-6">
          <input
            placeholder="Rechercher (nom, code, email, téléphone)…"
            className="df-input md:col-span-2"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="df-input"
            value={filters.type ?? ''}
            onChange={(e) => setFilter('type', (e.target.value || undefined) as CustomerType | undefined)}
          >
            <option value="">Tous les types</option>
            <option value="PARTICULIER">Particulier</option>
            <option value="ENTREPRISE">Entreprise</option>
          </select>
          <select
            className="df-input"
            value={filters.kyc_status ?? ''}
            onChange={(e) => setFilter('kyc_status', (e.target.value || undefined) as KycStatus | undefined)}
          >
            <option value="">KYC: tous</option>
            <option value="pending">En attente</option>
            <option value="in_review">En revue</option>
            <option value="approved">Approuvé</option>
            <option value="rejected">Rejeté</option>
            <option value="expired">Expiré</option>
          </select>
          <select
            className="df-input"
            value={filters.risk_level ?? ''}
            onChange={(e) => setFilter('risk_level', (e.target.value || undefined) as RiskLevel | undefined)}
          >
            <option value="">Risque: tous</option>
            <option value="low">Faible</option>
            <option value="normal">Normal</option>
            <option value="elevated">Élevé</option>
            <option value="high">Élevé+</option>
          </select>
          <select
            className="df-input"
            value={filters.is_blacklisted === undefined ? '' : String(filters.is_blacklisted)}
            onChange={(e) =>
              setFilter(
                'is_blacklisted',
                e.target.value === '' ? undefined : e.target.value === 'true',
              )
            }
          >
            <option value="">Blacklist: tous</option>
            <option value="false">Actifs</option>
            <option value="true">Blacklistés</option>
          </select>
          <select
            className="df-input md:col-span-2"
            value={filters.branch_id ?? ''}
            onChange={(e) => setFilter('branch_id', e.target.value || undefined)}
          >
            <option value="">Toutes les agences</option>
            {branchesQ.data?.data.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <DataTable<Customer>
        loading={listQ.isLoading}
        rows={rows}
        rowKey={(r) => r.id}
        emptyTitle="Aucun client"
        emptyDescription="Modifiez les filtres ou créez votre premier client."
        columns={[
          {
            key: 'name',
            header: 'Client',
            render: (r) => {
              const ip: any = r.individual_profile;
              const cp: any = r.company_profile;
              const initials = (r.display_name ?? '?')
                .split(' ').filter(Boolean).slice(0, 2)
                .map((w) => w[0]?.toUpperCase()).join('') || '?';
              return (
                <div className="flex items-start gap-3">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black text-white ${r.customer_type === 'ENTREPRISE' ? 'bg-indigo-600' : 'bg-slate-500'}`}>
                    {initials}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-bold text-slate-900">{r.display_name}</span>
                      {r.is_blacklisted && <StatusBadge label="Blacklist" tone="danger" />}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500">
                      <span className="font-mono font-bold">{r.customer_code}</span>
                      <span>·</span>
                      <span>{r.customer_type === 'PARTICULIER' ? 'Particulier' : 'Entreprise'}</span>
                    </div>
                    {ip?.cin_number && (
                      <div className="text-[10px] text-slate-400">CIN <span className="font-mono">{ip.cin_number}</span></div>
                    )}
                    {cp?.ice_number && (
                      <div className="text-[10px] text-slate-400">ICE <span className="font-mono">{cp.ice_number}</span></div>
                    )}
                  </div>
                </div>
              );
            },
          },
          {
            key: 'contact',
            header: 'Contact',
            render: (r) => {
              const contacts = (r.contacts ?? []) as any[];
              const phone = contacts.find((c) => c.contact_type === 'mobile' || c.contact_type === 'phone');
              const email = contacts.find((c) => c.contact_type === 'email');
              if (!phone && !email) return <span className="text-xs text-slate-300">—</span>;
              return (
                <div className="space-y-0.5 text-xs">
                  {phone && (
                    <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                      <span className="text-slate-400">📞</span>
                      <span className="font-mono">{phone.value}</span>
                    </div>
                  )}
                  {email && (
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <span className="text-slate-400">✉</span>
                      <span className="truncate max-w-[180px]">{email.value}</span>
                    </div>
                  )}
                </div>
              );
            },
          },
          {
            key: 'city',
            header: 'Ville',
            render: (r) => {
              const primary = (r.addresses ?? []).find((a: any) => a.is_primary) ?? (r.addresses ?? [])[0];
              if (!primary) return <span className="text-xs text-slate-300">—</span>;
              return (
                <div className="text-xs">
                  <div className="font-semibold text-slate-700">{primary.city ?? '—'}</div>
                  {primary.country && <div className="text-[10px] text-slate-400">{primary.country}</div>}
                </div>
              );
            },
          },
          {
            key: 'kyc',
            header: 'KYC',
            render: (r) => <StatusBadge label={kycLabel[r.kyc_status]} tone={kycTone[r.kyc_status]} />,
          },
          {
            key: 'risk',
            header: 'Risque',
            render: (r) => <StatusBadge label={riskLabel[r.risk_level]} tone={riskTone[r.risk_level]} />,
          },
          {
            key: 'status',
            header: 'Statut',
            render: (r) =>
              r.status === 'active' ? (
                <StatusBadge label="Actif" tone="success" />
              ) : r.status === 'suspended' ? (
                <StatusBadge label="Suspendu" tone="danger" />
              ) : (
                <StatusBadge label="Inactif" tone="default" />
              ),
          },
          {
            key: 'created',
            header: 'Créé le',
            render: (r) => {
              if (!r.created_at) return <span className="text-xs text-slate-300">—</span>;
              const d = new Date(r.created_at);
              if (isNaN(d.getTime())) return <span className="text-xs text-slate-300">—</span>;
              return <span className="text-xs font-semibold text-slate-600">{d.toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>;
            },
          },
          {
            key: 'actions',
            header: '',
            render: (r) => (
              <Link className="text-sm font-black text-indigo-600 hover:underline" to={`/customers/${r.id}`}>
                Dossier →
              </Link>
            ),
          },
        ]}
      />

      {meta && meta.last_page > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            className="df-btn df-btn--ghost disabled:opacity-40"
            disabled={(filters.page ?? 1) <= 1}
            onClick={() => setFilters((f) => ({ ...f, page: Math.max(1, (f.page ?? 1) - 1) }))}
          >
            ← Précédent
          </button>
          <span className="text-xs font-semibold text-slate-600">
            Page {meta.current_page} / {meta.last_page} · {meta.total} clients
          </span>
          <button
            className="df-btn df-btn--ghost disabled:opacity-40"
            disabled={(filters.page ?? 1) >= meta.last_page}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
          >
            Suivant →
          </button>
        </div>
      )}

      <DrawerPanel
        open={drawerOpen}
        title="Nouveau client"
        onClose={() => setDrawerOpen(false)}
        widthClass="max-w-2xl"
      >
        <CustomerForm
          mode="create"
          error={error}
          submitting={createMut.isPending}
          branches={branchesQ.data?.data ?? []}
          onCancel={() => setDrawerOpen(false)}
          onSubmit={(payload, scans) => {
            setError(null);
            createMut.mutate({ payload, scans });
          }}
        />
      </DrawerPanel>
    </div>
  );
};
