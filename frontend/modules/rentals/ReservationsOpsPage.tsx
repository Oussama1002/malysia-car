import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, endpoints, getApiBase, apiClient } from '@/services/apiClient';
import { queryKeys } from '@/services/queryKeys';
import { opsApi, type RentalAvailabilityDto, type ReservationDto } from '@/services/opsApi';
import type { CustomerDto, FleetVehicleDto } from '@/services/dtos';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { SearchFilterBar } from '@/modules/shared/components/SearchFilterBar';
import { ReservationCalendar } from '@/modules/rentals/ReservationCalendar';
import { Modal } from '@/modules/shared/components/Modal';

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
  return r.reasons.map((c) => RENTAL_REASON_LABELS[c] ?? msgs[c] ?? c).join(' · ');
}

function hasBackend(): boolean {
  return !!getApiBase();
}

type ApiListResponse<T> = { data: T[]; meta?: unknown; links?: unknown };
const FLOW = ['draft', 'reserved', 'confirmed', 'pickup_scheduled', 'handed_over', 'active', 'extension_requested', 'return_scheduled', 'returned', 'inspection_pending', 'damage_pending', 'billing_pending', 'closed', 'cancelled'];

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
};

export const ReservationsOpsPage: React.FC = () => {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
  const [pickupForm, setPickupForm] = useState({ odometer: '', fuel_level: '', condition_notes: '', signature: '' });
  const [returnForm, setReturnForm] = useState({ odometer: '', fuel_level: '', condition_notes: '', signature: '' });
  const [extensionForm, setExtensionForm] = useState({ new_end_at: '', additional_amount: '' });
  const [damageForm, setDamageForm] = useState({ damage_type: 'body', description: '', estimated_cost: '', responsible_party: 'customer' });
  const [billingForm, setBillingForm] = useState({ issue_date: '', due_date: '' });
  const [createError, setCreateError] = useState<string | null>(null);
  const [newResOpen, setNewResOpen] = useState(false);
  const [availCheckOpen, setAvailCheckOpen] = useState(false);
  const [availForm, setAvailForm] = useState({ vehicle_id: '', start_at: '', end_at: '' });

  const reservationsQ = useQuery({
    queryKey: queryKeys.reservations,
    queryFn: async () => opsApi.reservations(),
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

  const availCheckQ = useQuery({
    queryKey: ['rentalAvailability', 'check', availForm.vehicle_id, availForm.start_at, availForm.end_at],
    queryFn: () => opsApi.rentalAvailability(availForm.vehicle_id, availForm.start_at, availForm.end_at),
    enabled: availCheckOpen && !!availForm.vehicle_id && !!availForm.start_at && !!availForm.end_at,
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
      setNewResOpen(false);
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
  // NOTE: endpoints.customers.list returns the raw API shape (display_name /
  // customer_type / customer_code), NOT the mapped CustomerDto (name / kind).
  // Reading c.name / c.kind here produced "undefined (undefined)" in the
  // dropdown. Read the actual API fields with sensible fallbacks instead.
  const customerOptions = useMemo(
    () =>
      (customersQ.data ?? []).map((raw) => {
        const c = raw as unknown as {
          id: string | number;
          display_name?: string;
          customer_code?: string;
          customer_type?: string;
        };
        const name = c.display_name || c.customer_code || String(c.id);
        const kind = c.customer_type === 'ENTREPRISE' ? 'Entreprise' : 'Particulier';
        return { id: String(c.id), label: `${name} (${kind})` };
      }),
    [customersQ.data],
  );
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
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900">Réservations</h2>
          <p className="text-slate-500">Lifecycle complet location: disponibilité, handover, retour, dommage, extension, clôture.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={() => setAvailCheckOpen(true)}
          >
            🔍 Vérifier disponibilité
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-indigo-100 hover:bg-indigo-700"
            onClick={() => setNewResOpen(true)}
          >
            + Nouvelle réservation
          </button>
        </div>
      </header>

      <ReservationCalendar
        reservations={(reservationsQ.data ?? []) as ReservationDto[]}
        vehicles={vehicleOptions}
        customers={customerOptions}
        onCreateAt={(startISO, endISO) => {
          setForm((s) => ({ ...s, desired_start_at: startISO, desired_end_at: endISO }));
          setNewResOpen(true);
        }}
        onSelect={(id) => setSelectedReservationId(id)}
      />

      {/* Nouvelle réservation modal */}
      <Modal open={newResOpen} title="Nouvelle réservation" onClose={() => setNewResOpen(false)} widthClass="max-w-2xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" value={form.customer_id} onChange={(e) => setForm((s) => ({ ...s, customer_id: e.target.value }))}>
              <option value="">Client…</option>
              {customerOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
            <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" value={form.vehicle_id} onChange={(e) => setForm((s) => ({ ...s, vehicle_id: e.target.value }))}>
              <option value="">Véhicule…</option>
              {vehicleOptions.map((v) => (
                <option key={v.id} value={v.id}>{v.label}{v.status ? ` (${v.status})` : ''}</option>
              ))}
            </select>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500">Début</label>
              <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" type="datetime-local" value={form.desired_start_at} onChange={(e) => setForm((s) => ({ ...s, desired_start_at: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500">Fin</label>
              <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" type="datetime-local" value={form.desired_end_at} onChange={(e) => setForm((s) => ({ ...s, desired_end_at: e.target.value }))} />
            </div>
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
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-600 hover:bg-slate-50" onClick={() => setNewResOpen(false)}>Annuler</button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-indigo-100 disabled:opacity-50"
              disabled={!form.customer_id || !form.vehicle_id || !form.desired_start_at || !form.desired_end_at || createRes.isPending || formSlotBlocked}
              onClick={() => createRes.mutate()}
            >
              {createRes.isPending ? 'Création…' : 'Créer réservation'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Vérifications de disponibilité modal */}
      <Modal open={availCheckOpen} title="Vérifications de disponibilité" onClose={() => setAvailCheckOpen(false)} widthClass="max-w-lg">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Sélectionnez un véhicule et une plage de dates pour vérifier la disponibilité en temps réel.</p>
          <select className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" value={availForm.vehicle_id} onChange={(e) => setAvailForm((s) => ({ ...s, vehicle_id: e.target.value }))}>
            <option value="">Véhicule…</option>
            {vehicleOptions.map((v) => (
              <option key={v.id} value={v.id}>{v.label}{v.status ? ` (${v.status})` : ''}</option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500">Début</label>
              <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" type="datetime-local" value={availForm.start_at} onChange={(e) => setAvailForm((s) => ({ ...s, start_at: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500">Fin</label>
              <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" type="datetime-local" value={availForm.end_at} onChange={(e) => setAvailForm((s) => ({ ...s, end_at: e.target.value }))} />
            </div>
          </div>
          {availCheckQ.isFetching && (
            <div className="text-xs font-semibold text-slate-500">Vérification en cours…</div>
          )}
          {availCheckQ.data?.available === true && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm">
              <div className="font-black text-emerald-800">✓ Véhicule disponible</div>
              <div className="mt-1 text-emerald-700">Ce véhicule est libre sur la période sélectionnée.</div>
            </div>
          )}
          {availCheckQ.data?.available === false && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm">
              <div className="font-black text-rose-800">✗ Véhicule indisponible</div>
              <div className="mt-1 text-rose-700">{formatRentalConflict(availCheckQ.data)}</div>
            </div>
          )}
          {availCheckQ.data && availCheckQ.data.available && (
            <div className="flex justify-end">
              <button
                type="button"
                className="rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-black text-white hover:bg-indigo-700"
                onClick={() => {
                  setForm((s) => ({ ...s, vehicle_id: availForm.vehicle_id, desired_start_at: availForm.start_at, desired_end_at: availForm.end_at }));
                  setAvailCheckOpen(false);
                  setNewResOpen(true);
                }}
              >
                Créer une réservation sur ce créneau →
              </button>
            </div>
          )}
        </div>
      </Modal>

      <SearchFilterBar placeholder="Filtrer…" value={q} onChange={setQ} />

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-100">
          {rows.map((r) => (
            <div
              key={r.id}
              className="p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => setSelectedReservationId(r.id)}
            >
              <div>
                <div className="text-xs font-black text-slate-400 uppercase tracking-widest">{r.reservation_number}</div>
                <div className="mt-1 text-sm font-bold text-slate-900">
                  {customerOptions.find((c) => c.id === r.customer_id)?.label.split(' (')[0]
                    ?? <span className="font-mono text-xs">CLT-{r.customer_id.slice(0, 8).toUpperCase()}</span>}
                  <span className="mx-1.5 text-slate-300">·</span>
                  {vehicleOptions.find((v) => v.id === r.vehicle_id)?.label
                    ?? <span className="font-mono text-xs">VHL-{r.vehicle_id.slice(0, 8).toUpperCase()}</span>}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {new Date(r.desired_start_at).toLocaleString('fr-MA')} → {new Date(r.desired_end_at).toLocaleString('fr-MA')}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge
                  label={STATUS_FR[r.status] ?? r.status}
                  tone={r.status === 'closed' ? 'success' : r.status === 'cancelled' ? 'danger' : r.status === 'active' ? 'brand' : 'info'}
                />
                <button
                  className="rounded-2xl bg-indigo-600 px-4 py-2 text-xs font-black text-white hover:bg-indigo-700 transition-colors"
                  onClick={(e) => { e.stopPropagation(); setSelectedReservationId(r.id); }}
                >
                  Détail →
                </button>
                <button
                  className="rounded-2xl bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
                  disabled={createMission.isPending}
                  onClick={(e) => { e.stopPropagation(); createMission.mutate(r.id); }}
                >
                  Créer mission
                </button>
              </div>
            </div>
          ))}
          {rows.length === 0 && <div className="p-10 text-center text-sm text-slate-500">Aucune réservation.</div>}
        </div>
      </div>

      {/* ── Détail réservation popup ── */}
      <Modal
        open={!!selectedReservationId}
        title={selected?.reservation_number ?? 'Détail réservation'}
        onClose={() => setSelectedReservationId(null)}
        widthClass="max-w-2xl"
      >
        {reservationDetailQ.isLoading ? (
          <div className="py-8 text-center text-sm text-slate-500">Chargement…</div>
        ) : selectedReservationId ? (
          <div className="space-y-5">

            {/* Summary row */}
            <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <div className="font-bold text-slate-900">
                {customerOptions.find((c) => c.id === selected?.customer_id)?.label.split(' (')[0] ?? '—'}
                <span className="mx-2 text-slate-300">·</span>
                {vehicleOptions.find((v) => v.id === selected?.vehicle_id)?.label ?? '—'}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {selected ? `${new Date(selected.desired_start_at).toLocaleString('fr-MA')} → ${new Date(selected.desired_end_at).toLocaleString('fr-MA')}` : '—'}
              </div>
            </div>

            {/* Status timeline */}
            <div>
              <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Statut</div>
              <div className="flex flex-wrap gap-2">
                {FLOW.map((step) => (
                  <span key={step} className={`rounded-full px-3 py-1 text-[11px] font-bold ${step === timelineStatus ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    {STATUS_FR[step] ?? step}
                  </span>
                ))}
              </div>
            </div>

            {/* Availability notices */}
            {confirmAvailabilityQ.isFetching && <div className="text-xs font-semibold text-slate-500">Vérification disponibilité…</div>}
            {confirmSlotBlocked && confirmAvailabilityQ.data && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
                <span className="font-black">Confirmation bloquée.</span> {formatRentalConflict(confirmAvailabilityQ.data)}
              </div>
            )}
            {confirmAvailabilityQ.data?.available && detail?.status === 'reserved' && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800">Véhicule disponible sur la période.</div>
            )}

            {/* Primary actions */}
            <div>
              <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Actions</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button className="rounded-xl bg-indigo-600 px-3 py-2.5 text-xs font-black text-white disabled:opacity-50 hover:bg-indigo-700 transition-colors"
                  onClick={() => selectedReservationId && confirmRes.mutate(selectedReservationId)}
                  disabled={confirmRes.isPending || confirmSlotBlocked}>
                  ✓ Confirmer
                </button>
                <button className="rounded-xl bg-slate-700 px-3 py-2.5 text-xs font-black text-white disabled:opacity-50 hover:bg-slate-800 transition-colors"
                  onClick={() => cancelRes.mutate(selectedReservationId)} disabled={cancelRes.isPending}>
                  ✕ Annuler
                </button>
                <button className="rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-black text-white disabled:opacity-50 hover:bg-emerald-700 transition-colors"
                  onClick={() => pickupM.mutate(selectedReservationId)} disabled={pickupM.isPending}>
                  ↑ Pickup
                </button>
                <button className="rounded-xl bg-cyan-600 px-3 py-2.5 text-xs font-black text-white disabled:opacity-50 hover:bg-cyan-700 transition-colors"
                  onClick={() => returnM.mutate(selectedReservationId)} disabled={returnM.isPending}>
                  ↓ Retour
                </button>
              </div>
            </div>

            {/* Pickup / Return forms */}
            <div>
              <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Handover pickup</div>
              <div className="grid grid-cols-2 gap-2">
                <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs" placeholder="Km départ" value={pickupForm.odometer} onChange={(e) => setPickupForm((s) => ({ ...s, odometer: e.target.value }))} />
                <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs" placeholder="Carburant %" value={pickupForm.fuel_level} onChange={(e) => setPickupForm((s) => ({ ...s, fuel_level: e.target.value }))} />
                <input className="col-span-2 rounded-xl border border-slate-200 px-3 py-2 text-xs" placeholder="Observations / signature" value={pickupForm.condition_notes} onChange={(e) => setPickupForm((s) => ({ ...s, condition_notes: e.target.value }))} />
              </div>
            </div>
            <div>
              <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Handover retour</div>
              <div className="grid grid-cols-2 gap-2">
                <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs" placeholder="Km retour" value={returnForm.odometer} onChange={(e) => setReturnForm((s) => ({ ...s, odometer: e.target.value }))} />
                <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs" placeholder="Carburant %" value={returnForm.fuel_level} onChange={(e) => setReturnForm((s) => ({ ...s, fuel_level: e.target.value }))} />
                <input className="col-span-2 rounded-xl border border-slate-200 px-3 py-2 text-xs" placeholder="Observations / signature" value={returnForm.condition_notes} onChange={(e) => setReturnForm((s) => ({ ...s, condition_notes: e.target.value }))} />
              </div>
            </div>

            {/* Extension */}
            <div>
              <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Prolongation</div>
              <div className="grid grid-cols-2 gap-2">
                <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs" type="datetime-local" value={extensionForm.new_end_at} onChange={(e) => setExtensionForm((s) => ({ ...s, new_end_at: e.target.value }))} />
                <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs" placeholder="Montant additionnel" value={extensionForm.additional_amount} onChange={(e) => setExtensionForm((s) => ({ ...s, additional_amount: e.target.value }))} />
                <button className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50 hover:bg-amber-700 transition-colors"
                  onClick={() => extensionM.mutate(selectedReservationId)} disabled={extensionM.isPending || !extensionForm.new_end_at}>
                  Appliquer prolongation
                </button>
              </div>
            </div>

            {/* Damage report */}
            <div>
              <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Rapport de dommages</div>
              <div className="grid grid-cols-2 gap-2">
                <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs" placeholder="Type de dommage" value={damageForm.damage_type} onChange={(e) => setDamageForm((s) => ({ ...s, damage_type: e.target.value }))} />
                <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs" placeholder="Partie responsable" value={damageForm.responsible_party} onChange={(e) => setDamageForm((s) => ({ ...s, responsible_party: e.target.value }))} />
                <input className="col-span-2 rounded-xl border border-slate-200 px-3 py-2 text-xs" placeholder="Description" value={damageForm.description} onChange={(e) => setDamageForm((s) => ({ ...s, description: e.target.value }))} />
                <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs" placeholder="Coût estimé (MAD)" value={damageForm.estimated_cost} onChange={(e) => setDamageForm((s) => ({ ...s, estimated_cost: e.target.value }))} />
                <button className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white disabled:opacity-50 hover:bg-rose-700 transition-colors"
                  onClick={() => damageM.mutate(selectedReservationId)} disabled={damageM.isPending}>
                  Enregistrer dommage
                </button>
              </div>
            </div>

            {/* Close billing */}
            <div>
              <div className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Clôture & facturation</div>
              <div className="grid grid-cols-2 gap-2">
                <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs" type="date" placeholder="Date émission" value={billingForm.issue_date} onChange={(e) => setBillingForm((s) => ({ ...s, issue_date: e.target.value }))} />
                <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs" type="date" placeholder="Date échéance" value={billingForm.due_date} onChange={(e) => setBillingForm((s) => ({ ...s, due_date: e.target.value }))} />
                <button className="col-span-2 rounded-xl bg-violet-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50 hover:bg-violet-800 transition-colors"
                  onClick={() => closeBillingM.mutate(selectedReservationId)} disabled={closeBillingM.isPending}>
                  Clôturer & générer facture
                </button>
              </div>
            </div>

            {/* Summary counts */}
            <div className="flex gap-4 text-xs text-slate-400 border-t border-slate-100 pt-3">
              <span>Handovers : <strong className="text-slate-600">{(reservationDetailQ.data?.handover_reports ?? []).length}</strong></span>
              <span>Prolongations : <strong className="text-slate-600">{(reservationDetailQ.data?.extensions ?? []).length}</strong></span>
              <span>Dommages : <strong className="text-slate-600">{(reservationDetailQ.data?.damage_reports ?? []).length}</strong></span>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

