import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, endpoints, getApiBase, apiClient } from '@/services/apiClient';
import { queryKeys } from '@/services/queryKeys';
import { opsApi, type RentalAvailabilityDto, type ReservationDto } from '@/services/opsApi';
import { contractsApi } from '@/services/contractsApi';
import type { ContractDto, CustomerDto, FleetVehicleDto } from '@/services/dtos';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { SearchFilterBar } from '@/modules/shared/components/SearchFilterBar';
import { formatClientCode, formatVehicleCode } from '@/services/entityCode';
import { labelContractType, labelContractStatus, labelReservationStatus } from '@/services/labels';

const RENTAL_REASON_LABELS: Record<string, string> = {
  vehicle_not_found: 'Véhicule introuvable.',
  invalid_range: 'Plage de dates invalide.',
  vehicle_status_unavailable: 'Statut flotte : véhicule non louable.',
  vehicle_availability_flag: 'Véhicule marqué indisponible à la location.',
  overlapping_reservation: 'Réservation concurrente sur la même période.',
  active_contract_overlap: 'Contrat actif (crédit / LOA) en chevauchement.',
  overlapping_mission: 'Mission planifiée sur ce créneau.',
  vehicle_in_maintenance: 'Réparation / atelier en cours.',
  vehicle_accident_hold: 'Dossier sinistre ouvert.',
};

function formatRentalConflict(r: RentalAvailabilityDto): string {
  const msgs = r.messages ?? {};
  return r.reasons.map((c) => msgs[c] ?? RENTAL_REASON_LABELS[c] ?? c).join(' · ');
}

function hasBackend(): boolean {
  return !!getApiBase();
}

type ApiListResponse<T> = { data: T[]; meta?: unknown; links?: unknown };
const FLOW = ['draft', 'reserved', 'confirmed', 'pickup_scheduled', 'handed_over', 'active', 'extension_requested', 'return_scheduled', 'returned', 'inspection_pending', 'damage_pending', 'billing_pending', 'closed', 'cancelled'];

export const ReservationsOpsPage: React.FC = () => {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
  const [availabilityRange, setAvailabilityRange] = useState({ vehicle_id: '', start_at: '', end_at: '' });
  const [availabilityResult, setAvailabilityResult] = useState<{ available: boolean; reasons: string[] } | null>(null);
  const [pickupForm, setPickupForm] = useState({ odometer: '', fuel_level: '', condition_notes: '', signature: '' });
  const [returnForm, setReturnForm] = useState({ odometer: '', fuel_level: '', condition_notes: '', signature: '' });
  const [extensionForm, setExtensionForm] = useState({ new_end_at: '', additional_amount: '' });
  const [damageForm, setDamageForm] = useState({ damage_type: 'body', description: '', estimated_cost: '', responsible_party: 'customer' });
  const [billingForm, setBillingForm] = useState({ issue_date: '', due_date: '' });
  const [createError, setCreateError] = useState<string | null>(null);

  const reservationsQ = useQuery({
    queryKey: queryKeys.reservations,
    queryFn: async () => opsApi.reservations(),
    enabled: hasBackend(),
  });

  const contractsQ = useQuery({
    queryKey: ['contracts', 'rental-relevant'],
    queryFn: async () => contractsApi.list(),
    enabled: hasBackend(),
  });

  const customersQ = useQuery({
    queryKey: queryKeys.customers.all,
    queryFn: async () => (await apiClient<ApiListResponse<CustomerDto>>(endpoints.customers.list)).data,
    enabled: hasBackend(),
  });

  const vehiclesQ = useQuery({
    queryKey: queryKeys.fleet.all,
    queryFn: async () => (await apiClient<ApiListResponse<FleetVehicleDto>>(endpoints.fleet.list)).data,
    enabled: hasBackend(),
  });

  const [form, setForm] = useState({
    customer_id: '',
    vehicle_id: '',
    reservation_type: 'SHORT_RENTAL',
    desired_start_at: '',
    desired_end_at: '',
    pickup_address: '',
    delivery_address: '',
    estimated_price: '',
  });

  const reservationDetailQ = useQuery({
    queryKey: ['reservation', selectedReservationId],
    queryFn: async () => (selectedReservationId ? opsApi.reservation(selectedReservationId) : null),
    enabled: !!selectedReservationId,
  });

  const formAvailabilityQ = useQuery({
    queryKey: ['rentalAvailability', 'form', form.vehicle_id, form.desired_start_at, form.desired_end_at],
    queryFn: async () => opsApi.rentalAvailability(form.vehicle_id, form.desired_start_at, form.desired_end_at),
    enabled: hasBackend() && !!form.vehicle_id && !!form.desired_start_at && !!form.desired_end_at,
    staleTime: 10_000,
  });

  const detail = reservationDetailQ.data?.reservation;
  const confirmAvailabilityQ = useQuery({
    queryKey: [
      'rentalAvailability',
      'confirm',
      selectedReservationId,
      detail?.vehicle_id,
      detail?.desired_start_at,
      detail?.desired_end_at,
    ],
    queryFn: async () =>
      opsApi.rentalAvailability(
        String(detail?.vehicle_id ?? ''),
        String(detail?.desired_start_at ?? ''),
        String(detail?.desired_end_at ?? ''),
        selectedReservationId ?? undefined
      ),
    enabled:
      hasBackend() &&
      !!selectedReservationId &&
      !!detail?.vehicle_id &&
      !!detail?.desired_start_at &&
      !!detail?.desired_end_at,
    staleTime: 10_000,
  });

  const createRes = useMutation({
    mutationFn: async () =>
      opsApi.createReservation({
        customer_id: form.customer_id,
        vehicle_id: form.vehicle_id,
        reservation_type: form.reservation_type,
        desired_start_at: form.desired_start_at,
        desired_end_at: form.desired_end_at,
        pickup_address: form.pickup_address || undefined,
        delivery_address: form.delivery_address || undefined,
        estimated_price: form.estimated_price ? Number(form.estimated_price) : undefined,
      }),
    onMutate: () => setCreateError(null),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.reservations });
      setForm((s) => ({ ...s, desired_start_at: '', desired_end_at: '', estimated_price: '' }));
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.body && typeof e.body === 'object') {
        const err = e.body as { errors?: { vehicle_id?: string[]; rental?: string[] } };
        const parts = [...(err.errors?.vehicle_id ?? []), ...(err.errors?.rental?.map((c) => RENTAL_REASON_LABELS[c] ?? c) ?? [])];
        setCreateError(parts.join(' ') || e.message);
        return;
      }
      setCreateError(e instanceof Error ? e.message : 'Erreur création réservation');
    },
  });

  const createMission = useMutation({
    mutationFn: async (reservationId: string) =>
      opsApi.createMission(reservationId, { mission_type: 'delivery' }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.missions });
    },
  });

  const confirmRes = useMutation({
    mutationFn: async (id: string) => opsApi.confirmReservation(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.reservations });
      await qc.invalidateQueries({ queryKey: ['rentalAvailability'] });
      if (selectedReservationId) await qc.invalidateQueries({ queryKey: ['reservation', selectedReservationId] });
    },
  });
  const cancelRes = useMutation({
    mutationFn: async (id: string) => opsApi.cancelReservation(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.reservations });
      if (selectedReservationId) await qc.invalidateQueries({ queryKey: ['reservation', selectedReservationId] });
    },
  });
  const pickupM = useMutation({
    mutationFn: async (id: string) =>
      opsApi.handoverPickup(id, {
        odometer: pickupForm.odometer ? Number(pickupForm.odometer) : undefined,
        fuel_level: pickupForm.fuel_level ? Number(pickupForm.fuel_level) : undefined,
        condition_notes: pickupForm.condition_notes || undefined,
        signature: pickupForm.signature || undefined,
        checklist: [{ key: 'keys', ok: true }],
        photos: [],
      }),
    onSuccess: async () => {
      if (selectedReservationId) await qc.invalidateQueries({ queryKey: ['reservation', selectedReservationId] });
      await qc.invalidateQueries({ queryKey: queryKeys.reservations });
    },
  });
  const returnM = useMutation({
    mutationFn: async (id: string) =>
      opsApi.handoverReturn(id, {
        odometer: returnForm.odometer ? Number(returnForm.odometer) : undefined,
        fuel_level: returnForm.fuel_level ? Number(returnForm.fuel_level) : undefined,
        condition_notes: returnForm.condition_notes || undefined,
        signature: returnForm.signature || undefined,
        checklist: [{ key: 'body', ok: true }],
        photos: [],
      }),
    onSuccess: async () => {
      if (selectedReservationId) await qc.invalidateQueries({ queryKey: ['reservation', selectedReservationId] });
      await qc.invalidateQueries({ queryKey: queryKeys.reservations });
    },
  });
  const extensionM = useMutation({
    mutationFn: async (id: string) =>
      opsApi.requestExtension(id, {
        new_end_at: extensionForm.new_end_at,
        additional_amount: extensionForm.additional_amount ? Number(extensionForm.additional_amount) : 0,
      }),
    onSuccess: async () => {
      if (selectedReservationId) await qc.invalidateQueries({ queryKey: ['reservation', selectedReservationId] });
      await qc.invalidateQueries({ queryKey: queryKeys.reservations });
      await qc.invalidateQueries({ queryKey: ['rentalAvailability'] });
    },
  });
  const damageM = useMutation({
    mutationFn: async (id: string) =>
      opsApi.damageReport(id, {
        damage_type: damageForm.damage_type,
        description: damageForm.description,
        estimated_cost: damageForm.estimated_cost ? Number(damageForm.estimated_cost) : 0,
        responsible_party: damageForm.responsible_party,
      }),
    onSuccess: async () => {
      if (selectedReservationId) await qc.invalidateQueries({ queryKey: ['reservation', selectedReservationId] });
    },
  });
  const closeBillingM = useMutation({
    mutationFn: async (id: string) => opsApi.closeBilling(id, { issue_date: billingForm.issue_date || undefined, due_date: billingForm.due_date || undefined }),
    onSuccess: async () => {
      if (selectedReservationId) await qc.invalidateQueries({ queryKey: ['reservation', selectedReservationId] });
      await qc.invalidateQueries({ queryKey: queryKeys.reservations });
    },
  });

  const rows = useMemo(() => {
    const data = (reservationsQ.data ?? []) as ReservationDto[];
    if (!q.trim()) return data;
    const qq = q.toLowerCase();
    return data.filter((r) => `${r.reservation_number} ${r.status} ${r.customer_id} ${r.vehicle_id}`.toLowerCase().includes(qq));
  }, [reservationsQ.data, q]);

  const selected = useMemo(() => rows.find((r) => r.id === selectedReservationId) ?? null, [rows, selectedReservationId]);
  const timelineStatus = String(detail?.status ?? selected?.status ?? '');
  const customerOptions = useMemo(() => (customersQ.data ?? []).map((c) => ({ id: String(c.id), label: `${c.name} (${c.kind})` })), [customersQ.data]);
  const formSlotBlocked = Boolean(formAvailabilityQ.data && formAvailabilityQ.data.available === false);
  const confirmSlotBlocked = Boolean(confirmAvailabilityQ.data && confirmAvailabilityQ.data.available === false);

  const vehicleOptions = useMemo(
    () =>
      (vehiclesQ.data ?? []).map((v) => ({
        id: String(v.id),
        label: `${v.brand} ${v.model} · ${v.registration}`,
        status: String((v as any).status ?? ''),
      })),
    [vehiclesQ.data]
  );

  if (!hasBackend()) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Backend non configuré. Renseignez <span className="font-mono">VITE_API_BASE</span> pour activer les réservations/missions.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-xl font-black text-slate-900">Réservations</h2>
        <p className="text-slate-500">Lifecycle complet location: disponibilité, handover, retour, dommage, extension, clôture.</p>
      </header>

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm space-y-3">
        <div className="text-sm font-black text-slate-900">Disponibilité / calendrier</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <select
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold"
            value={availabilityRange.vehicle_id}
            onChange={(e) => setAvailabilityRange((s) => ({ ...s, vehicle_id: e.target.value }))}
          >
            <option value="">Véhicule…</option>
            {vehicleOptions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} {v.status ? `(${v.status})` : ''}
              </option>
            ))}
          </select>
          <input className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" type="datetime-local" value={availabilityRange.start_at} onChange={(e) => setAvailabilityRange((s) => ({ ...s, start_at: e.target.value }))} />
          <input className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" type="datetime-local" value={availabilityRange.end_at} onChange={(e) => setAvailabilityRange((s) => ({ ...s, end_at: e.target.value }))} />
          <button
            className="rounded-2xl bg-slate-900 px-4 py-3 text-xs font-black text-white disabled:opacity-50"
            disabled={!availabilityRange.vehicle_id || !availabilityRange.start_at || !availabilityRange.end_at}
            onClick={async () => {
              const r = await opsApi.rentalAvailability(availabilityRange.vehicle_id, availabilityRange.start_at, availabilityRange.end_at);
              setAvailabilityResult(r);
            }}
          >
            Vérifier disponibilité
          </button>
        </div>
        {availabilityResult && (
          <div className={`rounded-xl border p-3 text-sm ${availabilityResult.available ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'}`}>
            {availabilityResult.available ? 'Véhicule disponible' : `Indisponible : ${formatRentalConflict(availabilityResult)}`}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
        <div className="text-sm font-black text-slate-900">Nouvelle réservation</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" value={form.customer_id} onChange={(e) => setForm((s) => ({ ...s, customer_id: e.target.value }))}>
            <option value="">Client…</option>
            {customerOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" value={form.vehicle_id} onChange={(e) => setForm((s) => ({ ...s, vehicle_id: e.target.value }))}>
            <option value="">Véhicule…</option>
            {vehicleOptions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label} {v.status ? `(${v.status})` : ''}
              </option>
            ))}
          </select>
          <input
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold"
            type="datetime-local"
            value={form.desired_start_at}
            onChange={(e) => setForm((s) => ({ ...s, desired_start_at: e.target.value }))}
          />
          <input
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold"
            type="datetime-local"
            value={form.desired_end_at}
            onChange={(e) => setForm((s) => ({ ...s, desired_end_at: e.target.value }))}
          />
          <input className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" placeholder="Adresse pickup (optionnel)" value={form.pickup_address} onChange={(e) => setForm((s) => ({ ...s, pickup_address: e.target.value }))} />
          <input className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" placeholder="Adresse livraison (optionnel)" value={form.delivery_address} onChange={(e) => setForm((s) => ({ ...s, delivery_address: e.target.value }))} />
          <input className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold md:col-span-2" placeholder="Prix estimé (MAD)" value={form.estimated_price} onChange={(e) => setForm((s) => ({ ...s, estimated_price: e.target.value }))} />
        </div>
        {formAvailabilityQ.isFetching && form.vehicle_id && form.desired_start_at && form.desired_end_at && (
          <div className="text-xs font-semibold text-slate-500">Vérification disponibilité…</div>
        )}
        {formSlotBlocked && formAvailabilityQ.data && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <span className="font-black">Créneau indisponible.</span> {formatRentalConflict(formAvailabilityQ.data)}
          </div>
        )}
        {formAvailabilityQ.data?.available && form.vehicle_id && form.desired_start_at && form.desired_end_at && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800">Créneau disponible pour ce véhicule.</div>
        )}
        {createError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{createError}</div>}
        <button
          className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-100 disabled:opacity-50"
          disabled={
            !form.customer_id ||
            !form.vehicle_id ||
            !form.desired_start_at ||
            !form.desired_end_at ||
            createRes.isPending ||
            formSlotBlocked
          }
          onClick={() => createRes.mutate()}
        >
          {createRes.isPending ? 'Création…' : 'Créer réservation'}
        </button>
      </div>

      {/* Contracts created in the contracts module — surfaced here for rental management */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-black text-slate-900">Contrats actifs</div>
            <div className="text-xs text-slate-500">
              Contrats créés dans le module Contrats (LLD, LOA, location courte durée…). Cliquez pour gérer.
            </div>
          </div>
          <Link
            to="/contracts"
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
          >
            Module contrats →
          </Link>
        </div>
        {contractsQ.isLoading ? (
          <div className="text-sm text-slate-500">Chargement des contrats…</div>
        ) : contractsQ.isError ? (
          <div className="text-sm text-rose-600">Erreur lors du chargement des contrats.</div>
        ) : (() => {
          const all = (contractsQ.data ?? []) as ContractDto[];
          const rentalTypes = ['LLD', 'LOA', 'LOCATION_COURTE'];
          const list = all.filter((c) => rentalTypes.includes(String(c.type)));
          if (list.length === 0) {
            return <div className="text-sm text-slate-500">Aucun contrat de location à afficher.</div>;
          }
          return (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Référence</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Client</th>
                    <th className="px-3 py-2 text-left">Véhicule</th>
                    <th className="px-3 py-2 text-left">Période</th>
                    <th className="px-3 py-2 text-right">Montant</th>
                    <th className="px-3 py-2 text-left">Statut</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {list.map((c) => (
                    <tr key={String(c.id)} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono font-bold text-slate-900">{c.reference}</td>
                      <td className="px-3 py-2">
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                          {labelContractType(c.type)}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">
                        {formatClientCode(c.customerId ?? c.clientId)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">
                        {formatVehicleCode(c.vehicleId)}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {c.startDate ? new Date(c.startDate).toLocaleDateString('fr-MA') : '—'}
                        {' → '}
                        {c.endDate ? new Date(c.endDate).toLocaleDateString('fr-MA') : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {Number(c.amountMad ?? 0).toLocaleString('fr-MA')} MAD
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge
                          label={labelContractStatus(c.status)}
                          tone={
                            c.status === 'ACTIVE' || c.status === 'active'
                              ? 'success'
                              : c.status === 'TERMINATED' || c.status === 'cancelled'
                              ? 'danger'
                              : 'info'
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          to={`/contracts/${c.id}`}
                          className="text-xs font-black text-indigo-600 hover:underline"
                        >
                          Gérer →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>

      <SearchFilterBar placeholder="Filtrer…" value={q} onChange={setQ} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-100">
          {rows.map((r) => (
            <div key={r.id} className={`p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between cursor-pointer ${selectedReservationId === r.id ? 'bg-indigo-50' : ''}`} onClick={() => setSelectedReservationId(r.id)}>
              <div>
                <div className="text-xs font-black text-slate-400 uppercase tracking-widest">{r.reservation_number}</div>
                <div className="mt-1 text-sm font-bold text-slate-900">
                  Client <span className="font-mono">{formatClientCode(r.customer_id)}</span> · Véhicule <span className="font-mono">{formatVehicleCode(r.vehicle_id)}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {new Date(r.desired_start_at).toLocaleString('fr-MA')} → {new Date(r.desired_end_at).toLocaleString('fr-MA')}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge label={labelReservationStatus(r.status)} tone={r.status === 'closed' ? 'success' : r.status === 'cancelled' ? 'danger' : 'info'} />
                <button
                  className="rounded-2xl bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
                  disabled={createMission.isPending}
                  onClick={() => createMission.mutate(r.id)}
                >
                  Créer mission
                </button>
              </div>
            </div>
          ))}
          {rows.length === 0 && <div className="p-10 text-center text-sm text-slate-500">Aucune réservation.</div>}
        </div>
      </div>
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm p-5 space-y-4">
        <div className="text-sm font-black text-slate-900">Détail réservation</div>
        {!selectedReservationId ? (
          <div className="text-sm text-slate-500">Sélectionnez une réservation pour afficher la timeline et les actions.</div>
        ) : reservationDetailQ.isLoading ? (
          <div className="text-sm text-slate-500">Chargement…</div>
        ) : (
          <>
            <div className="text-xs text-slate-500 font-mono">{selectedReservationId}</div>
            <div className="flex flex-wrap gap-2">
              {FLOW.map((step) => (
                <span key={step} className={`rounded-full px-2 py-1 text-[11px] font-bold ${step === timelineStatus ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {step}
                </span>
              ))}
            </div>
            {confirmAvailabilityQ.isFetching && <div className="text-xs text-slate-500">Vérification disponibilité avant confirmation…</div>}
            {confirmSlotBlocked && confirmAvailabilityQ.data && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                <span className="font-black">Confirmation bloquée.</span> {formatRentalConflict(confirmAvailabilityQ.data)}
              </div>
            )}
            {confirmAvailabilityQ.data?.available && detail?.status === 'reserved' && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">Véhicule disponible sur la période de cette réservation.</div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <button
                className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50"
                onClick={() => selectedReservationId && confirmRes.mutate(selectedReservationId)}
                disabled={confirmRes.isPending || !selectedReservationId || confirmSlotBlocked}
              >
                Confirmer
              </button>
              <button className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-black text-white disabled:opacity-50" onClick={() => cancelRes.mutate(selectedReservationId)} disabled={cancelRes.isPending}>Annuler</button>
              <button className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50" onClick={() => pickupM.mutate(selectedReservationId)} disabled={pickupM.isPending}>Handover pickup</button>
              <button className="rounded-xl bg-cyan-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50" onClick={() => returnM.mutate(selectedReservationId)} disabled={returnM.isPending}>Handover return</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs" placeholder="Pickup km" value={pickupForm.odometer} onChange={(e) => setPickupForm((s) => ({ ...s, odometer: e.target.value }))} />
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs" placeholder="Pickup fuel %" value={pickupForm.fuel_level} onChange={(e) => setPickupForm((s) => ({ ...s, fuel_level: e.target.value }))} />
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs col-span-2" placeholder="Pickup condition/signature" value={pickupForm.condition_notes} onChange={(e) => setPickupForm((s) => ({ ...s, condition_notes: e.target.value }))} />
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs" placeholder="Return km" value={returnForm.odometer} onChange={(e) => setReturnForm((s) => ({ ...s, odometer: e.target.value }))} />
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs" placeholder="Return fuel %" value={returnForm.fuel_level} onChange={(e) => setReturnForm((s) => ({ ...s, fuel_level: e.target.value }))} />
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs col-span-2" placeholder="Return condition/signature" value={returnForm.condition_notes} onChange={(e) => setReturnForm((s) => ({ ...s, condition_notes: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs" type="datetime-local" value={extensionForm.new_end_at} onChange={(e) => setExtensionForm((s) => ({ ...s, new_end_at: e.target.value }))} />
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs" placeholder="Additional amount" value={extensionForm.additional_amount} onChange={(e) => setExtensionForm((s) => ({ ...s, additional_amount: e.target.value }))} />
              <button className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50" onClick={() => extensionM.mutate(selectedReservationId)} disabled={extensionM.isPending || !extensionForm.new_end_at}>Extension</button>
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs" value={damageForm.damage_type} onChange={(e) => setDamageForm((s) => ({ ...s, damage_type: e.target.value }))} />
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs col-span-2" placeholder="Damage description" value={damageForm.description} onChange={(e) => setDamageForm((s) => ({ ...s, description: e.target.value }))} />
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs" placeholder="Estimated cost" value={damageForm.estimated_cost} onChange={(e) => setDamageForm((s) => ({ ...s, estimated_cost: e.target.value }))} />
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs" placeholder="Responsible party" value={damageForm.responsible_party} onChange={(e) => setDamageForm((s) => ({ ...s, responsible_party: e.target.value }))} />
              <button className="col-span-2 rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50" onClick={() => damageM.mutate(selectedReservationId)} disabled={damageM.isPending}>Damage report</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs" type="date" value={billingForm.issue_date} onChange={(e) => setBillingForm((s) => ({ ...s, issue_date: e.target.value }))} />
              <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs" type="date" value={billingForm.due_date} onChange={(e) => setBillingForm((s) => ({ ...s, due_date: e.target.value }))} />
              <button className="col-span-2 rounded-xl bg-violet-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50" onClick={() => closeBillingM.mutate(selectedReservationId)} disabled={closeBillingM.isPending}>Close billing & generate invoice</button>
            </div>
            <div className="text-xs text-slate-500">
              Handovers: {(reservationDetailQ.data?.handover_reports ?? []).length} · Extensions: {(reservationDetailQ.data?.extensions ?? []).length} · Damages: {(reservationDetailQ.data?.damage_reports ?? []).length}
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  );
};

