import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createUsedCarListing,
  listUsedCarListings,
  type ListingCreatePayload,
  type ListingListParams,
  type UsedCarListing,
  type UsedCarStage,
  USED_CAR_STAGE_LABEL,
  usedCarStageTone,
} from '@/services/usedCarsApi';
import { listBranches } from '@/services/adminApi';
import { ApiError } from '@/services/apiError';
import { DataTable } from '@/modules/shared/components/DataTable';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { formatCurrencyMad } from '@/modules/shared/formatters';

export const UsedCarsPage: React.FC = () => {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<ListingListParams>({ page: 1, per_page: 25 });
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['used-cars', 'listings', filters, search],
    queryFn: () => listUsedCarListings({ ...filters, search: search || undefined }),
  });

  const branchesQ = useQuery({ queryKey: ['admin', 'branches'], queryFn: () => listBranches() });

  const createMut = useMutation({
    mutationFn: (p: ListingCreatePayload) => createUsedCarListing(p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['used-cars'] });
      setDrawerOpen(false);
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur de création'),
  });

  const rows = listQ.data?.data ?? [];
  const meta = listQ.data?.meta;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Véhicules d’occasion</h1>
          <p className="text-slate-500">Mise en vente → évaluation → publication → réservation → vente.</p>
        </div>
        <button
          type="button"
          className="df-btn df-btn--primary"
          onClick={() => {
            setError(null);
            setDrawerOpen(true);
          }}
        >
          + Mettre en vente
        </button>
      </header>

      <div className="df-card">
        <div className="df-card__body grid gap-3 md:grid-cols-3 lg:grid-cols-5">
          <input
            placeholder="Rechercher (code, immat., VIN)…"
            className="df-input md:col-span-2"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="df-input"
            value={filters.stage ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, stage: (e.target.value || undefined) as UsedCarStage | undefined, page: 1 }))}
          >
            <option value="">Étape: toutes</option>
            <option value="draft">Brouillon</option>
            <option value="evaluated">Évalué</option>
            <option value="published">Publié</option>
            <option value="reserved">Réservé</option>
            <option value="sold">Vendu</option>
            <option value="cancelled">Annulé</option>
          </select>
          <select
            className="df-input"
            value={filters.publication_channel ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, publication_channel: e.target.value || undefined, page: 1 }))}
          >
            <option value="">Canal: tous</option>
            <option value="internal">Interne</option>
            <option value="marketplace">Marketplace</option>
            <option value="auction">Enchère</option>
            <option value="partner">Partenaire</option>
          </select>
          <select
            className="df-input"
            value={filters.branch_id ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, branch_id: e.target.value || undefined, page: 1 }))}
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

      <DataTable<UsedCarListing>
        loading={listQ.isLoading}
        rows={rows}
        rowKey={(r) => r.id}
        emptyTitle="Aucun véhicule VO"
        emptyDescription="Créez une fiche VO depuis un véhicule sorti du parc."
        columns={[
          {
            key: 'code',
            header: 'Référence',
            render: (r) => (
              <div>
                <div className="font-mono text-xs font-bold text-slate-900">{r.listing_code}</div>
                <div className="text-xs text-slate-500">
                  {r.vehicle?.brand?.name} {r.vehicle?.model?.name}
                  {r.vehicle?.year ? ` · ${r.vehicle.year}` : ''}
                </div>
              </div>
            ),
          },
          {
            key: 'vehicle',
            header: 'Véhicule',
            render: (r) => (
              <div className="text-xs">
                <div className="font-semibold text-slate-800">{r.vehicle?.registration_number ?? '—'}</div>
                <div className="text-slate-500">VIN {r.vehicle?.vin ?? '—'}</div>
              </div>
            ),
          },
          {
            key: 'stage',
            header: 'Étape',
            render: (r) => <StatusBadge label={USED_CAR_STAGE_LABEL[r.stage]} tone={usedCarStageTone(r.stage)} />,
          },
          {
            key: 'price',
            header: 'Prix demandé',
            render: (r) => (r.asking_price ? formatCurrencyMad(Number(r.asking_price)) : '—'),
          },
          {
            key: 'estimate',
            header: 'Estimation',
            render: (r) => (r.estimated_value ? formatCurrencyMad(Number(r.estimated_value)) : '—'),
          },
          {
            key: 'actions',
            header: '',
            render: (r) => (
              <Link to={`/used-cars/${r.id}`} className="text-sm font-black text-indigo-600">
                Fiche VO →
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
            Page {meta.current_page} / {meta.last_page} · {meta.total} fiches
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
        title="Nouvelle mise en vente VO"
        onClose={() => setDrawerOpen(false)}
        widthClass="max-w-xl"
      >
        <UsedCarListingForm
          submitting={createMut.isPending}
          error={error}
          branches={branchesQ.data?.data ?? []}
          onCancel={() => setDrawerOpen(false)}
          onSubmit={(p) => {
            setError(null);
            createMut.mutate(p);
          }}
        />
      </DrawerPanel>
    </div>
  );
};

// ============================================================================
// Listing form (drawer)
// ============================================================================

const UsedCarListingForm: React.FC<{
  submitting: boolean;
  error: string | null;
  branches: Array<{ id: string; name: string }>;
  onCancel: () => void;
  onSubmit: (p: ListingCreatePayload) => void;
}> = ({ submitting, error, branches, onCancel, onSubmit }) => {
  const [form, setForm] = useState<ListingCreatePayload>({ vehicle_id: '' });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(form);
      }}
    >
      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">ID du véhicule</label>
        <input
          className="df-input mt-1"
          value={form.vehicle_id}
          onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })}
          placeholder="uuid du véhicule sortant du parc"
          required
        />
        <p className="mt-1 text-xs text-slate-500">Seuls les véhicules non déjà listés peuvent être ajoutés.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Prix demandé (MAD)</label>
          <input
            className="df-input mt-1"
            type="number"
            min="0"
            value={form.asking_price ?? ''}
            onChange={(e) => setForm({ ...form, asking_price: e.target.value ? Number(e.target.value) : undefined })}
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Prix plancher</label>
          <input
            className="df-input mt-1"
            type="number"
            min="0"
            value={form.min_acceptable_price ?? ''}
            onChange={(e) =>
              setForm({ ...form, min_acceptable_price: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Kilométrage</label>
          <input
            className="df-input mt-1"
            type="number"
            min="0"
            value={form.mileage_at_listing ?? ''}
            onChange={(e) =>
              setForm({ ...form, mileage_at_listing: e.target.value ? Number(e.target.value) : undefined })
            }
          />
        </div>
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Canal de publication</label>
          <select
            className="df-input mt-1"
            value={form.publication_channel ?? ''}
            onChange={(e) => setForm({ ...form, publication_channel: e.target.value || undefined })}
          >
            <option value="">—</option>
            <option value="internal">Interne</option>
            <option value="marketplace">Marketplace</option>
            <option value="auction">Enchère</option>
            <option value="partner">Partenaire</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Agence</label>
          <select
            className="df-input mt-1"
            value={form.branch_id ?? ''}
            onChange={(e) => setForm({ ...form, branch_id: e.target.value || undefined })}
          >
            <option value="">—</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Notes</label>
        <textarea
          className="df-input mt-1 min-h-[80px]"
          value={form.notes ?? ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="df-btn df-btn--ghost" onClick={onCancel}>
          Annuler
        </button>
        <button type="submit" className="df-btn df-btn--primary" disabled={submitting}>
          {submitting ? 'Enregistrement…' : 'Créer la fiche VO'}
        </button>
      </div>
    </form>
  );
};
