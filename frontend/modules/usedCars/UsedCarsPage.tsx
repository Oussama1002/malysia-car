import React, { useMemo, useState } from 'react';
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
import { apiClient, endpoints } from '@/services/apiClient';
import { ApiError } from '@/services/apiError';
import { DataTable } from '@/modules/shared/components/DataTable';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { formatCurrencyMad } from '@/modules/shared/formatters';

// Lightweight DTO for fleet dropdown (the /v1/vehicles endpoint returns rich rows)
type FleetVehicleRow = {
  id: string;
  registration_number?: string | null;
  vin?: string | null;
  year?: number | null;
  color?: string | null;
  mileage_current?: number | null;
  availability_status?: string | null;
  ownership_status?: string | null;
  brand?: { id?: string; name?: string } | null;
  model?: { id?: string; name?: string } | null;
};

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
        widthClass="max-w-3xl"
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

type ExtraFields = {
  condition_overall: '' | 'excellent' | 'good' | 'fair' | 'poor';
  fuel_type: string;
  transmission: '' | 'manual' | 'automatic';
  body_type: string;
  doors: string;
  seats: string;
  exterior_color: string;
  interior_color: string;
  num_keys: string;
  service_book: 'yes' | 'no' | '';
  accident_history: 'none' | 'minor' | 'major' | '';
  features: string; // comma-separated
  damages: string;
  inspection_score: string;
  estimated_value: string;
  available_from: string;
};

const EMPTY_EXTRA: ExtraFields = {
  condition_overall: '',
  fuel_type: '',
  transmission: '',
  body_type: '',
  doors: '',
  seats: '',
  exterior_color: '',
  interior_color: '',
  num_keys: '',
  service_book: '',
  accident_history: '',
  features: '',
  damages: '',
  inspection_score: '',
  estimated_value: '',
  available_from: '',
};

const UsedCarListingForm: React.FC<{
  submitting: boolean;
  error: string | null;
  branches: Array<{ id: string; name: string }>;
  onCancel: () => void;
  onSubmit: (p: ListingCreatePayload) => void;
}> = ({ submitting, error, branches, onCancel, onSubmit }) => {
  const [form, setForm] = useState<ListingCreatePayload>({ vehicle_id: '' });
  const [extra, setExtra] = useState<ExtraFields>(EMPTY_EXTRA);
  const [vehicleSearch, setVehicleSearch] = useState('');

  // Pull a generous page of vehicles for the dropdown
  const vehiclesQ = useQuery({
    queryKey: ['fleet', 'vehicles', 'for-sale-picker'],
    queryFn: async () => {
      const r = await apiClient<{ data: FleetVehicleRow[] }>(`${endpoints.fleet.list}?per_page=500`);
      return r.data;
    },
  });

  const allVehicles = vehiclesQ.data ?? [];

  // Filter out vehicles already sold or sub-rented; allow available, in_use, returned, etc.
  const eligible = useMemo(
    () =>
      allVehicles.filter((v) => {
        const own = String(v.ownership_status ?? 'owned').toLowerCase();
        return own !== 'sub_rented' && own !== 'sold';
      }),
    [allVehicles],
  );

  const filteredVehicles = useMemo(() => {
    const s = vehicleSearch.trim().toLowerCase();
    if (!s) return eligible.slice(0, 200);
    return eligible
      .filter((v) =>
        [v.registration_number, v.vin, v.brand?.name, v.model?.name, String(v.year ?? '')]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(s)),
      )
      .slice(0, 200);
  }, [eligible, vehicleSearch]);

  const selectedVehicle = useMemo(
    () => allVehicles.find((v) => v.id === form.vehicle_id),
    [allVehicles, form.vehicle_id],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vehicle_id) return;

    // Pack extra fields into inspection_notes (typed as array on the backend)
    const inspectionNotes: Record<string, unknown> = {};
    if (extra.condition_overall) inspectionNotes.condition_overall = extra.condition_overall;
    if (extra.fuel_type) inspectionNotes.fuel_type = extra.fuel_type;
    if (extra.transmission) inspectionNotes.transmission = extra.transmission;
    if (extra.body_type) inspectionNotes.body_type = extra.body_type;
    if (extra.doors) inspectionNotes.doors = Number(extra.doors);
    if (extra.seats) inspectionNotes.seats = Number(extra.seats);
    if (extra.exterior_color) inspectionNotes.exterior_color = extra.exterior_color;
    if (extra.interior_color) inspectionNotes.interior_color = extra.interior_color;
    if (extra.num_keys) inspectionNotes.num_keys = Number(extra.num_keys);
    if (extra.service_book) inspectionNotes.service_book = extra.service_book === 'yes';
    if (extra.accident_history) inspectionNotes.accident_history = extra.accident_history;
    if (extra.features.trim()) {
      inspectionNotes.features = extra.features
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (extra.damages.trim()) inspectionNotes.damages = extra.damages.trim();
    if (extra.estimated_value) inspectionNotes.estimated_value = Number(extra.estimated_value);
    if (extra.available_from) inspectionNotes.available_from = extra.available_from;

    const payload: ListingCreatePayload = {
      ...form,
      inspection_score: extra.inspection_score ? Number(extra.inspection_score) : undefined,
      inspection_notes: Object.keys(inspectionNotes).length ? inspectionNotes : undefined,
    };
    onSubmit(payload);
  };

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {/* ─── Vehicle selection ───────────────────────────────────────────── */}
      <fieldset className="rounded-xl border border-slate-200 p-4">
        <legend className="px-2 text-xs font-bold uppercase tracking-wide text-slate-600">Véhicule du parc *</legend>

        {!form.vehicle_id ? (
          <>
            <input
              className="df-input"
              placeholder="Filtrer par immatriculation, VIN, marque, modèle…"
              value={vehicleSearch}
              onChange={(e) => setVehicleSearch(e.target.value)}
            />
            <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-slate-200">
              {vehiclesQ.isLoading ? (
                <div className="p-3 text-sm text-slate-500">Chargement des véhicules…</div>
              ) : filteredVehicles.length === 0 ? (
                <div className="p-3 text-sm text-slate-500">Aucun véhicule éligible.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {filteredVehicles.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        className="block w-full px-3 py-2 text-left hover:bg-indigo-50"
                        onClick={() => {
                          setForm((f) => ({
                            ...f,
                            vehicle_id: v.id,
                            mileage_at_listing: v.mileage_current ?? f.mileage_at_listing,
                          }));
                          setExtra((p) => ({
                            ...p,
                            exterior_color: p.exterior_color || (v.color ?? ''),
                          }));
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-mono text-xs font-bold text-slate-900">
                              {v.registration_number ?? '—'}
                            </div>
                            <div className="text-sm font-semibold text-slate-700">
                              {v.brand?.name} {v.model?.name}
                              {v.year ? ` · ${v.year}` : ''}
                            </div>
                            <div className="text-xs text-slate-500">
                              {v.color ? `${v.color} · ` : ''}
                              {v.mileage_current ? `${v.mileage_current.toLocaleString('fr-MA')} km` : 'km n/a'}
                              {v.vin ? ` · VIN ${v.vin.slice(0, 12)}…` : ''}
                            </div>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              v.availability_status === 'available'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {v.availability_status ?? '—'}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Sélectionnez un véhicule existant du parc. Les véhicules sous-loués ou déjà vendus sont masqués.
            </p>
          </>
        ) : (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-mono text-xs font-bold text-slate-900">
                  {selectedVehicle?.registration_number ?? form.vehicle_id}
                </div>
                <div className="text-sm font-semibold text-slate-800">
                  {selectedVehicle?.brand?.name} {selectedVehicle?.model?.name}
                  {selectedVehicle?.year ? ` · ${selectedVehicle.year}` : ''}
                </div>
                <div className="text-xs text-slate-500">
                  {selectedVehicle?.vin ? `VIN ${selectedVehicle.vin}` : ''}
                  {selectedVehicle?.mileage_current
                    ? ` · ${selectedVehicle.mileage_current.toLocaleString('fr-MA')} km au compteur`
                    : ''}
                </div>
              </div>
              <button
                type="button"
                className="text-xs font-bold text-rose-600 hover:underline"
                onClick={() => {
                  setForm((f) => ({ ...f, vehicle_id: '' }));
                  setVehicleSearch('');
                }}
              >
                Changer
              </button>
            </div>
          </div>
        )}
      </fieldset>

      {/* ─── Pricing ─────────────────────────────────────────────────────── */}
      <fieldset className="rounded-xl border border-slate-200 p-4">
        <legend className="px-2 text-xs font-bold uppercase tracking-wide text-slate-600">Prix</legend>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs font-semibold text-slate-500">Prix demandé (MAD)</label>
            <input
              className="df-input mt-1"
              type="number"
              min="0"
              step="100"
              value={form.asking_price ?? ''}
              onChange={(e) =>
                setForm({ ...form, asking_price: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Prix plancher (MAD)</label>
            <input
              className="df-input mt-1"
              type="number"
              min="0"
              step="100"
              value={form.min_acceptable_price ?? ''}
              onChange={(e) =>
                setForm({ ...form, min_acceptable_price: e.target.value ? Number(e.target.value) : undefined })
              }
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Estimation interne (MAD)</label>
            <input
              className="df-input mt-1"
              type="number"
              min="0"
              step="100"
              value={extra.estimated_value}
              onChange={(e) => setExtra({ ...extra, estimated_value: e.target.value })}
            />
          </div>
        </div>
      </fieldset>

      {/* ─── Caractéristiques ────────────────────────────────────────────── */}
      <fieldset className="rounded-xl border border-slate-200 p-4">
        <legend className="px-2 text-xs font-bold uppercase tracking-wide text-slate-600">Caractéristiques</legend>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs font-semibold text-slate-500">Carburant</label>
            <select
              className="df-input mt-1"
              value={extra.fuel_type}
              onChange={(e) => setExtra({ ...extra, fuel_type: e.target.value })}
            >
              <option value="">—</option>
              <option value="diesel">Diesel</option>
              <option value="essence">Essence</option>
              <option value="hybrid">Hybride</option>
              <option value="electric">Électrique</option>
              <option value="lpg">GPL</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Transmission</label>
            <select
              className="df-input mt-1"
              value={extra.transmission}
              onChange={(e) =>
                setExtra({ ...extra, transmission: e.target.value as ExtraFields['transmission'] })
              }
            >
              <option value="">—</option>
              <option value="manual">Manuelle</option>
              <option value="automatic">Automatique</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Carrosserie</label>
            <select
              className="df-input mt-1"
              value={extra.body_type}
              onChange={(e) => setExtra({ ...extra, body_type: e.target.value })}
            >
              <option value="">—</option>
              <option value="sedan">Berline</option>
              <option value="hatchback">Citadine</option>
              <option value="suv">SUV</option>
              <option value="break">Break</option>
              <option value="coupe">Coupé</option>
              <option value="pickup">Pickup</option>
              <option value="utility">Utilitaire</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Portes</label>
            <input
              type="number"
              min="2"
              max="6"
              className="df-input mt-1"
              value={extra.doors}
              onChange={(e) => setExtra({ ...extra, doors: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Sièges</label>
            <input
              type="number"
              min="2"
              max="9"
              className="df-input mt-1"
              value={extra.seats}
              onChange={(e) => setExtra({ ...extra, seats: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Kilométrage à la mise en vente</label>
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
            <label className="text-xs font-semibold text-slate-500">Couleur extérieure</label>
            <input
              className="df-input mt-1"
              value={extra.exterior_color}
              onChange={(e) => setExtra({ ...extra, exterior_color: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Couleur intérieure</label>
            <input
              className="df-input mt-1"
              value={extra.interior_color}
              onChange={(e) => setExtra({ ...extra, interior_color: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Nombre de clés</label>
            <input
              type="number"
              min="0"
              max="5"
              className="df-input mt-1"
              value={extra.num_keys}
              onChange={(e) => setExtra({ ...extra, num_keys: e.target.value })}
            />
          </div>
        </div>
      </fieldset>

      {/* ─── État du véhicule ────────────────────────────────────────────── */}
      <fieldset className="rounded-xl border border-slate-200 p-4">
        <legend className="px-2 text-xs font-bold uppercase tracking-wide text-slate-600">État du véhicule</legend>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs font-semibold text-slate-500">État général</label>
            <select
              className="df-input mt-1"
              value={extra.condition_overall}
              onChange={(e) =>
                setExtra({ ...extra, condition_overall: e.target.value as ExtraFields['condition_overall'] })
              }
            >
              <option value="">—</option>
              <option value="excellent">Excellent</option>
              <option value="good">Bon</option>
              <option value="fair">Moyen</option>
              <option value="poor">À rénover</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Score d'inspection (0–100)</label>
            <input
              type="number"
              min="0"
              max="100"
              className="df-input mt-1"
              value={extra.inspection_score}
              onChange={(e) => setExtra({ ...extra, inspection_score: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Carnet d'entretien</label>
            <select
              className="df-input mt-1"
              value={extra.service_book}
              onChange={(e) =>
                setExtra({ ...extra, service_book: e.target.value as ExtraFields['service_book'] })
              }
            >
              <option value="">—</option>
              <option value="yes">Disponible</option>
              <option value="no">Absent</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500">Sinistralité</label>
            <select
              className="df-input mt-1"
              value={extra.accident_history}
              onChange={(e) =>
                setExtra({ ...extra, accident_history: e.target.value as ExtraFields['accident_history'] })
              }
            >
              <option value="">—</option>
              <option value="none">Aucun sinistre</option>
              <option value="minor">Sinistre mineur</option>
              <option value="major">Sinistre majeur</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold text-slate-500">
              Équipements (séparés par des virgules)
            </label>
            <input
              className="df-input mt-1"
              placeholder="Ex: Climatisation, GPS, Caméra de recul, Cuir, Toit ouvrant"
              value={extra.features}
              onChange={(e) => setExtra({ ...extra, features: e.target.value })}
            />
          </div>
          <div className="md:col-span-3">
            <label className="text-xs font-semibold text-slate-500">Défauts / dommages constatés</label>
            <textarea
              className="df-input mt-1"
              rows={2}
              value={extra.damages}
              onChange={(e) => setExtra({ ...extra, damages: e.target.value })}
            />
          </div>
        </div>
      </fieldset>

      {/* ─── Mise en marché ──────────────────────────────────────────────── */}
      <fieldset className="rounded-xl border border-slate-200 p-4">
        <legend className="px-2 text-xs font-bold uppercase tracking-wide text-slate-600">Mise en marché</legend>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs font-semibold text-slate-500">Canal de publication</label>
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
          <div>
            <label className="text-xs font-semibold text-slate-500">Agence</label>
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
          <div>
            <label className="text-xs font-semibold text-slate-500">Disponible à partir du</label>
            <input
              type="date"
              className="df-input mt-1"
              value={extra.available_from}
              onChange={(e) => setExtra({ ...extra, available_from: e.target.value })}
            />
          </div>
        </div>
      </fieldset>

      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Notes commerciales</label>
        <textarea
          className="df-input mt-1 min-h-[80px]"
          placeholder="Argumentaire de vente, historique propriétaire, conditions particulières…"
          value={form.notes ?? ''}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" className="df-btn df-btn--ghost" onClick={onCancel}>
          Annuler
        </button>
        <button
          type="submit"
          className="df-btn df-btn--primary"
          disabled={submitting || !form.vehicle_id}
        >
          {submitting ? 'Enregistrement…' : 'Créer la fiche VO'}
        </button>
      </div>
    </form>
  );
};
