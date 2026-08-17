import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, endpoints, getApiBase, apiClient } from '@/services/apiClient';
import { queryKeys } from '@/services/queryKeys';
import { opsApi, type RentalAvailabilityDto, type ReservationDto } from '@/services/opsApi';
import type { CustomerDto, FleetVehicleDto } from '@/services/dtos';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { SearchFilterBar } from '@/modules/shared/components/SearchFilterBar';
import { ReservationCalendar } from '@/modules/rentals/ReservationCalendar';
import { Modal } from '@/modules/shared/components/Modal';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { CustomerForm } from '@/modules/customers/CustomerForm';
import type { ScannedDocument } from '@/modules/customers/CustomerIdentityScanner';
import { createCustomer, type CustomerCreatePayload } from '@/services/customersApi';
import { listBranches, listUsers } from '@/services/adminApi';
import { documentReaderApi } from '@/services/documentReaderApi';

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
  const nav = useNavigate();
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
  const [newClientDrawerOpen, setNewClientDrawerOpen] = useState(false);
  const [newClientError, setNewClientError] = useState<string | null>(null);
  const [missionModalResId, setMissionModalResId] = useState<string | null>(null);
  const [missionForm, setMissionForm] = useState({ mission_type: 'delivery', assigned_user_id: '', scheduled_start_at: '', notes: '', create_return: false, return_assigned_user_id: '', return_scheduled_at: '', return_notes: '' });
  const [missionError, setMissionError] = useState<string | null>(null);

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

  const branchesQ = useQuery({ queryKey: ['admin', 'branches'], queryFn: () => listBranches(), enabled: hasBackend() });
  const usersQ = useQuery({ queryKey: ['admin', 'users'], queryFn: () => listUsers({ per_page: 200 }), enabled: hasBackend() });

  const createCustomerMut = useMutation({
    mutationFn: async (vars: { payload: CustomerCreatePayload; scans: ScannedDocument[] }) => {
      const res = await createCustomer(vars.payload);
      for (const scan of vars.scans) {
        try { await documentReaderApi.link(scan.documentId, 'customer', String(res.data.id)); } catch { /* non-blocking */ }
      }
      return res;
    },
    onSuccess: async (res) => {
      setNewClientError(null);
      setNewClientDrawerOpen(false);
      await qc.invalidateQueries({ queryKey: queryKeys.customers.all });
      setForm((s) => ({ ...s, customer_id: String(res.data.id) }));
    },
    onError: (e) => setNewClientError(e instanceof Error ? e.message : 'Erreur de création du client'),
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
    is_draft: false,
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

  const validateRes = useMutation({
    mutationFn: async (id: string) => opsApi.validateReservation(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.reservations });
    },
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
        is_draft: form.is_draft,
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
      opsApi.createMission(reservationId, {
        mission_type: missionForm.mission_type,
        assigned_user_id: missionForm.assigned_user_id || null,
        scheduled_start_at: missionForm.scheduled_start_at || undefined,
        notes: missionForm.notes || undefined,
        create_return_mission: missionForm.create_return || undefined,
        return_assigned_user_id: missionForm.create_return ? (missionForm.return_assigned_user_id || null) : undefined,
        return_scheduled_at: missionForm.create_return ? (missionForm.return_scheduled_at || undefined) : undefined,
        return_notes: missionForm.create_return ? (missionForm.return_notes || undefined) : undefined,
      }),
    onMutate: () => setMissionError(null),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.missions });
      await qc.invalidateQueries({ queryKey: queryKeys.reservations });
      setMissionModalResId(null);
      setMissionForm({ mission_type: 'delivery', assigned_user_id: '', scheduled_start_at: '', notes: '', create_return: false, return_assigned_user_id: '', return_scheduled_at: '', return_notes: '' });
    },
    onError: (e) => setMissionError(e instanceof Error ? e.message : 'Erreur création mission'),
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
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingSuccess, setBillingSuccess] = useState<string | null>(null);
  const closeBillingM = useMutation({
    mutationFn: async (id: string) => opsApi.closeBilling(id, { issue_date: billingForm.issue_date || undefined, due_date: billingForm.due_date || undefined }),
    onSuccess: async (data) => {
      setBillingError(null);
      const invNum = data?.invoice_number ?? data?.data?.invoice_number ?? '';
      setBillingSuccess(invNum ? `Facture ${invNum} générée.` : 'Clôture effectuée.');
      await qc.invalidateQueries({ queryKey: queryKeys.reservations });
      if (selectedReservationId) await qc.invalidateQueries({ queryKey: ['reservation', selectedReservationId] });
      // Close modal after short delay so user can read the success message
      setTimeout(() => {
        setSelectedReservationId(null);
        setBillingSuccess(null);
        setBillingForm({ issue_date: '', due_date: '' });
      }, 1800);
    },
    onError: (e: unknown) => {
      setBillingError(e instanceof Error ? e.message : 'Erreur lors de la clôture.');
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

  // ── Reservations starting today or yesterday that still need a contract ──
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const urgentReservations = useMemo(() => {
    const PRE_HANDOVER = ['reserved', 'confirmed', 'pickup_scheduled'];
    return (reservationsQ.data ?? []).filter((r) => {
      if (!PRE_HANDOVER.includes(r.status)) return false;
      const start = new Date(r.desired_start_at);
      start.setHours(0, 0, 0, 0);
      return start.getTime() === today.getTime() || start.getTime() === yesterday.getTime();
    });
  }, [reservationsQ.data]);

  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const visibleUrgent = urgentReservations.filter((r) => !dismissedIds.has(r.id));

  return (
    <div className="space-y-6">

      {/* ── Urgent contract alert banner ─────────────────────────────────── */}
      {visibleUrgent.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔔</span>
            <div>
              <div className="font-black text-amber-900">
                {visibleUrgent.length} réservation{visibleUrgent.length > 1 ? 's' : ''} sans contrat — départ aujourd'hui ou hier
              </div>
              <div className="text-xs text-amber-700">Générez le contrat avant la remise des clés.</div>
            </div>
          </div>
          <div className="space-y-2">
            {visibleUrgent.map((r) => {
              const clientLabel = customerOptions.find((c) => c.id === r.customer_id)?.label.split(' (')[0]
                ?? `CLT-${r.customer_id.slice(0, 8).toUpperCase()}`;
              const vehicleLabel = vehicleOptions.find((v) => v.id === r.vehicle_id)?.label
                ?? `VHL-${r.vehicle_id.slice(0, 8).toUpperCase()}`;
              const startDate = new Date(r.desired_start_at);
              const isToday = startDate.toDateString() === new Date().toDateString();
              return (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${isToday ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                      {isToday ? "Aujourd'hui" : 'Hier'}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-black text-slate-700 truncate">{r.reservation_number}</div>
                      <div className="text-xs text-slate-500 truncate">{clientLabel} · {vehicleLabel}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => nav(`/reservations/${r.id}`)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Voir détail
                    </button>
                    <Link
                      to={`/contracts/new?from_reservation=${r.id}`}
                      className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-black text-white hover:bg-amber-700"
                    >
                      Générer contrat
                    </Link>
                    <button
                      type="button"
                      onClick={() => setDismissedIds((s) => new Set([...s, r.id]))}
                      className="rounded-lg p-1.5 text-amber-400 hover:text-amber-700 hover:bg-amber-100"
                      title="Ignorer"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <header className="flex items-center justify-end gap-2">
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

      <SearchFilterBar placeholder="Filtrer réservations…" value={q} onChange={setQ} />

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-100">
          {rows.map((r) => (
            <div
              key={r.id}
              className="p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between cursor-pointer hover:bg-slate-50 transition-colors"
              onClick={() => nav(`/reservations/${r.id}`)}
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
                {r.status === 'draft' ? (
                  <span className="inline-flex items-center gap-1 rounded-full border-2 border-dashed border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-black text-amber-700">
                    ⏳ Intention · Non validée
                  </span>
                ) : (
                  <StatusBadge
                    label={STATUS_FR[r.status] ?? r.status}
                    tone={r.status === 'closed' ? 'success' : r.status === 'cancelled' ? 'danger' : r.status === 'active' ? 'brand' : r.status === 'reserved' || r.status === 'confirmed' ? 'success' : 'info'}
                  />
                )}
                {r.status === 'draft' && (
                  <button
                    className="rounded-2xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    disabled={validateRes.isPending}
                    onClick={(e) => { e.stopPropagation(); validateRes.mutate(r.id); }}
                  >
                    ✓ Valider
                  </button>
                )}
                <button
                  className="rounded-2xl bg-indigo-600 px-4 py-2 text-xs font-black text-white hover:bg-indigo-700 transition-colors"
                  onClick={(e) => { e.stopPropagation(); nav(`/reservations/${r.id}`); }}
                >
                  Détail →
                </button>
                {(() => {
                  const missions = (r as ReservationDto & { missions?: { id: string; mission_type: string; status: string }[] }).missions ?? [];
                  const activeMissionsRaw = missions.filter((m) => m.status !== 'failed');
                  const seen = new Set<string>();
                  const activeMissions = activeMissionsRaw.filter((m) => { if (seen.has(m.mission_type)) return false; seen.add(m.mission_type); return true; });
                  const hasDelivery = activeMissions.some((m) => m.mission_type === 'delivery');
                  const hasPickup = activeMissions.some((m) => m.mission_type === 'pickup');
                  const canCreate = r.status !== 'draft' && r.status !== 'cancelled' && r.status !== 'closed' && (!hasDelivery || !hasPickup);
                  return (
                    <>
                      {activeMissions.map((m) => (
                        <span key={m.id} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black ${m.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : m.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                          {m.mission_type === 'pickup' ? 'Récup.' : 'Livrais.'} · {m.status === 'completed' ? 'Terminée' : m.status === 'in_progress' ? 'En cours' : 'Planifiée'}
                        </span>
                      ))}
                      {canCreate && (
                        <button
                          className="rounded-2xl bg-slate-900 px-4 py-2 text-xs font-black text-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMissionForm({
                              mission_type: hasDelivery ? 'pickup' : 'delivery',
                              assigned_user_id: '',
                              scheduled_start_at: hasDelivery ? (r.desired_end_at ? r.desired_end_at.slice(0, 16) : '') : (r.desired_start_at ? r.desired_start_at.slice(0, 16) : ''),
                              notes: '',
                              create_return: false,
                              return_assigned_user_id: '',
                              return_scheduled_at: r.desired_end_at ? r.desired_end_at.slice(0, 16) : '',
                              return_notes: '',
                            });
                            setMissionError(null);
                            setMissionModalResId(r.id);
                          }}
                        >
                          + Mission
                        </button>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          ))}
          {rows.length === 0 && <div className="p-10 text-center text-sm text-slate-500">Aucune réservation.</div>}
        </div>
      </div>

      <ReservationCalendar
        reservations={(reservationsQ.data ?? []) as ReservationDto[]}
        vehicles={vehicleOptions}
        customers={customerOptions}
        onCreateAt={(startISO, endISO) => {
          setForm((s) => ({ ...s, desired_start_at: startISO, desired_end_at: endISO }));
          setNewResOpen(true);
        }}
        onSelect={(id) => nav(`/reservations/${id}`)}
      />

      {/* Créer mission modal */}
      <Modal open={!!missionModalResId} title="Créer une mission" onClose={() => setMissionModalResId(null)} widthClass="max-w-xl">
        <CreateMissionModalContent
          reservationId={missionModalResId}
          reservations={reservationsQ.data ?? []}
          vehicles={vehiclesQ.data ?? []}
          customers={customersQ.data ?? []}
          agents={(usersQ.data?.data ?? []).filter((u) => u.status === 'active')}
          form={missionForm}
          setForm={setMissionForm}
          error={missionError}
          isPending={createMission.isPending}
          onSubmit={() => { if (missionModalResId) createMission.mutate(missionModalResId); }}
          onClose={() => setMissionModalResId(null)}
        />
      </Modal>

      {/* Nouvelle réservation modal */}
      <Modal open={newResOpen} title="Nouvelle réservation" onClose={() => setNewResOpen(false)} widthClass="max-w-2xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
            <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" value={form.customer_id} onChange={(e) => {
              if (e.target.value === '__new__') { setNewClientError(null); setNewClientDrawerOpen(true); e.target.value = form.customer_id; return; }
              setForm((s) => ({ ...s, customer_id: e.target.value }));
            }}>
              <option value="">Client…</option>
              {customerOptions.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
              <option value="__new__">+ Nouveau client</option>
            </select>
            <select className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" value={form.vehicle_id} onChange={(e) => setForm((s) => ({ ...s, vehicle_id: e.target.value }))}>
              <option value="">Véhicule…</option>
              {vehicleOptions.map((v) => (
                <option key={v.id} value={v.id}>{v.label}{v.status ? ` (${v.status})` : ''}</option>
              ))}
            </select>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500">Type</label>
              <select disabled className="w-full rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-500 cursor-not-allowed" value={form.reservation_type} onChange={(e) => setForm((s) => ({ ...s, reservation_type: e.target.value }))}>
                <option value="SHORT_RENTAL">Location courte durée</option>
                <option value="LONG_RENTAL">Location longue durée</option>
                <option value="LLD">LLD</option>
                <option value="LOA">LOA</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500">Début</label>
              <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" type="datetime-local" value={form.desired_start_at} onChange={(e) => setForm((s) => ({ ...s, desired_start_at: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500">Fin</label>
              <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" type="datetime-local" value={form.desired_end_at} onChange={(e) => setForm((s) => ({ ...s, desired_end_at: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500">Adresse pickup</label>
              <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" placeholder="Optionnel" value={form.pickup_address} onChange={(e) => setForm((s) => ({ ...s, pickup_address: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-500">Adresse livraison</label>
              <input className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold" placeholder="Optionnel" value={form.delivery_address} onChange={(e) => setForm((s) => ({ ...s, delivery_address: e.target.value }))} />
            </div>
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
          {/* Draft / Confirmed toggle */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="res_mode"
                  checked={!form.is_draft}
                  onChange={() => setForm((s) => ({ ...s, is_draft: false }))}
                  className="accent-indigo-600"
                />
                <div>
                  <div className="text-xs font-black text-slate-800">Réservation confirmée</div>
                  <div className="text-[10px] text-slate-500">Véhicule bloqué · créneau réservé</div>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="res_mode"
                  checked={form.is_draft}
                  onChange={() => setForm((s) => ({ ...s, is_draft: true }))}
                  className="accent-amber-600"
                />
                <div>
                  <div className="text-xs font-black text-slate-800">Intention (brouillon)</div>
                  <div className="text-[10px] text-slate-500">Véhicule non bloqué · en attente de confirmation</div>
                </div>
              </label>
            </div>
          </div>
          {createError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{createError}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-black text-slate-600 hover:bg-slate-50" onClick={() => setNewResOpen(false)}>Annuler</button>
            <button
              type="button"
              className={`inline-flex items-center justify-center rounded-2xl px-5 py-2.5 text-sm font-black text-white shadow-lg disabled:opacity-50 ${form.is_draft ? 'bg-amber-600 shadow-amber-100 hover:bg-amber-700' : 'bg-indigo-600 shadow-indigo-100 hover:bg-indigo-700'}`}
              disabled={!form.customer_id || !form.vehicle_id || !form.desired_start_at || !form.desired_end_at || createRes.isPending || (!form.is_draft && formSlotBlocked)}
              onClick={() => createRes.mutate()}
            >
              {createRes.isPending ? 'Création…' : form.is_draft ? 'Créer intention' : 'Créer réservation'}
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

      {/* ── Détail réservation popup ── */}
      <Modal
        open={!!selectedReservationId}
        title={selected?.reservation_number ?? 'Détail réservation'}
        onClose={() => { setSelectedReservationId(null); setBillingError(null); setBillingSuccess(null); }}
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

            {/* ── Generate contract alert when start date is today ── */}
            {(() => {
              if (!selected) return null;
              const startD = new Date(selected.desired_start_at);
              startD.setHours(0, 0, 0, 0);
              const nowD = new Date();
              nowD.setHours(0, 0, 0, 0);
              const isStartToday = startD.getTime() === nowD.getTime();
              const isStartPast  = startD.getTime() < nowD.getTime();
              const PRE_CONTRACT = ['reserved', 'confirmed', 'pickup_scheduled', 'draft'];
              const needsContract = PRE_CONTRACT.includes(selected.status);
              if (!needsContract || (!isStartToday && !isStartPast)) return null;
              const clientLabel = customerOptions.find((c) => c.id === selected.customer_id)?.label.split(' (')[0] ?? '—';
              const vehicleLabel = vehicleOptions.find((v) => v.id === selected.vehicle_id)?.label ?? '—';
              const price = selected.estimated_price ? `${Number(selected.estimated_price).toLocaleString('fr-MA')} MAD` : '—';
              return (
                <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl font-black">!</span>
                    <div>
                      <div className="text-sm font-black text-amber-900">
                        {isStartToday ? 'Départ prévu aujourd\'hui' : 'Départ dépassé'} — contrat requis
                      </div>
                      <div className="mt-1 text-xs text-amber-700">
                        Un contrat doit être généré avant la remise des clés. Toutes les informations de la réservation seront pré-remplies automatiquement.
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs rounded-lg bg-white/60 px-3 py-2">
                    <div><span className="font-bold text-slate-500">Client :</span> <span className="font-semibold text-slate-800">{clientLabel}</span></div>
                    <div><span className="font-bold text-slate-500">Véhicule :</span> <span className="font-semibold text-slate-800">{vehicleLabel}</span></div>
                    <div><span className="font-bold text-slate-500">Début :</span> <span className="font-semibold text-slate-800">{new Date(selected.desired_start_at).toLocaleDateString('fr-MA')}</span></div>
                    <div><span className="font-bold text-slate-500">Fin :</span> <span className="font-semibold text-slate-800">{new Date(selected.desired_end_at).toLocaleDateString('fr-MA')}</span></div>
                    <div><span className="font-bold text-slate-500">Prix estimé :</span> <span className="font-semibold text-slate-800">{price}</span></div>
                    <div><span className="font-bold text-slate-500">N° résa :</span> <span className="font-semibold text-slate-800">{selected.reservation_number}</span></div>
                  </div>
                  <Link
                    to={`/contracts/new?from_reservation=${selected.id}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-black text-white shadow-md hover:bg-amber-700 transition-colors"
                  >
                    Générer le contrat maintenant
                  </Link>
                </div>
              );
            })()}

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
                  ↑ Remise
                </button>
                <button className="rounded-xl bg-cyan-600 px-3 py-2.5 text-xs font-black text-white disabled:opacity-50 hover:bg-cyan-700 transition-colors"
                  onClick={() => returnM.mutate(selectedReservationId)} disabled={returnM.isPending}>
                  ↓ Retour
                </button>
              </div>
              {/* Always-visible Generate Contract button */}
              {selected && !['cancelled', 'closed'].includes(selected.status) && (
                <Link
                  to={`/contracts/new?from_reservation=${selected.id}`}
                  className="mt-2 inline-flex items-center gap-2 rounded-xl border-2 border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-black text-amber-800 hover:bg-amber-100 transition-colors"
                >
                  Générer contrat depuis cette réservation
                </Link>
              )}
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
              {billingSuccess ? (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4 shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  {billingSuccess}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs" type="date" placeholder="Date émission" value={billingForm.issue_date} onChange={(e) => { setBillingError(null); setBillingForm((s) => ({ ...s, issue_date: e.target.value })); }} />
                  <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs" type="date" placeholder="Date échéance" value={billingForm.due_date} onChange={(e) => { setBillingError(null); setBillingForm((s) => ({ ...s, due_date: e.target.value })); }} />
                  {billingError && (
                    <div className="col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                      {billingError}
                    </div>
                  )}
                  <button
                    className="col-span-2 rounded-xl bg-violet-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50 hover:bg-violet-800 transition-colors flex items-center justify-center gap-2"
                    onClick={() => {
                      if (!selectedReservationId) return;
                      setBillingError(null);
                      closeBillingM.mutate(selectedReservationId);
                    }}
                    disabled={closeBillingM.isPending || !selectedReservationId}
                  >
                    {closeBillingM.isPending ? (
                      <>
                        <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                        </svg>
                        Clôture en cours…
                      </>
                    ) : 'Clôturer & générer facture'}
                  </button>
                </div>
              )}
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

      {/* New client drawer */}
      <DrawerPanel
        open={newClientDrawerOpen}
        title="Nouveau client"
        onClose={() => setNewClientDrawerOpen(false)}
        widthClass="max-w-2xl"
      >
        <CustomerForm
          mode="create"
          error={newClientError}
          submitting={createCustomerMut.isPending}
          branches={branchesQ.data?.data ?? []}
          onCancel={() => setNewClientDrawerOpen(false)}
          onSubmit={(payload, scans) => {
            setNewClientError(null);
            createCustomerMut.mutate({ payload, scans });
          }}
        />
      </DrawerPanel>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Agent availability badge
// ---------------------------------------------------------------------------
const AgentAvailabilityBadge: React.FC<{ agentId: string; scheduledAt: string; excludeReservationId?: string }> = ({ agentId, scheduledAt, excludeReservationId }) => {
  const availQ = useQuery({
    queryKey: ['agentAvailability', agentId, scheduledAt],
    queryFn: () => opsApi.agentAvailability(agentId, scheduledAt, excludeReservationId),
    enabled: !!agentId && !!scheduledAt,
    staleTime: 30_000,
  });
  if (!agentId || !scheduledAt || availQ.isLoading) return null;
  if (!availQ.data) return null;
  if (availQ.data.available) return <span className="text-[10px] font-bold text-emerald-600">Disponible ce jour</span>;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 space-y-1">
      <span className="text-[10px] font-black text-amber-700">
        {availQ.data.conflicts.length} mission(s) ce jour
      </span>
      {availQ.data.conflicts.map((c) => (
        <div key={c.id} className="text-[10px] text-amber-600">
          {c.mission_type === 'pickup' ? 'Récup.' : 'Livrais.'} — {c.scheduled_start_at ? new Date(c.scheduled_start_at).toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' }) : '?'}
          {c.reservation?.reservation_number ? ` (${c.reservation.reservation_number})` : ''}
        </div>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Create Mission modal content
// ---------------------------------------------------------------------------
type MissionFormState = { mission_type: string; assigned_user_id: string; scheduled_start_at: string; notes: string; create_return: boolean; return_assigned_user_id: string; return_scheduled_at: string; return_notes: string };

const CreateMissionModalContent: React.FC<{
  reservationId: string | null;
  reservations: ReservationDto[];
  vehicles: FleetVehicleDto[];
  customers: CustomerDto[];
  agents: { id: string; name: string; first_name?: string | null; last_name?: string | null; email: string }[];
  form: MissionFormState;
  setForm: React.Dispatch<React.SetStateAction<MissionFormState>>;
  error: string | null;
  isPending: boolean;
  onSubmit: () => void;
  onClose: () => void;
}> = ({ reservationId, reservations, vehicles, customers, agents, form, setForm, error, isPending, onSubmit, onClose }) => {
  const res = reservations.find((r) => r.id === reservationId);
  if (!res) return null;
  const veh = vehicles.find((v) => String(v.id) === String(res.vehicle_id));
  const custRaw = customers.find((c) => String(c.id) === String(res.customer_id)) as unknown as { id: string | number; display_name?: string; individual_profile?: { first_name?: string; last_name?: string } | null; company_profile?: { trade_name?: string; legal_name?: string } | null } | undefined;
  const custName = custRaw?.display_name || [custRaw?.individual_profile?.first_name, custRaw?.individual_profile?.last_name].filter(Boolean).join(' ') || custRaw?.company_profile?.trade_name || custRaw?.company_profile?.legal_name || '';
  const agentName = (u: typeof agents[number]) => u.name || `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email;

  return (
    <div className="space-y-4">
      {/* Reservation context */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1 text-xs">
        <div className="flex justify-between"><span className="text-slate-500">Réservation</span><span className="font-bold text-slate-800">{res.reservation_number}</span></div>
        {veh && <div className="flex justify-between"><span className="text-slate-500">Véhicule</span><span className="font-bold text-slate-800">{[(veh as any).brand_name ?? veh.brand, (veh as any).model_name ?? veh.model].filter(Boolean).join(' ')} — {(veh as any).registration_number ?? veh.registration}</span></div>}
        {custName && <div className="flex justify-between"><span className="text-slate-500">Client</span><span className="font-bold text-slate-800">{custName}</span></div>}
        {res.pickup_address && <div className="flex justify-between items-center"><span className="text-slate-500">Départ</span><span className="font-bold text-slate-800 max-w-[55%] truncate">{res.pickup_address}</span><a href={`https://www.google.com/maps/search/${encodeURIComponent(res.pickup_address)}`} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-700" title="Carte">Carte</a></div>}
        {res.delivery_address && <div className="flex justify-between items-center"><span className="text-slate-500">Livraison</span><span className="font-bold text-slate-800 max-w-[55%] truncate">{res.delivery_address}</span><a href={`https://www.google.com/maps/search/${encodeURIComponent(res.delivery_address)}`} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-700" title="Carte">Carte</a></div>}
        {res.pickup_address && res.delivery_address && <div className="pt-1"><a href={`https://www.google.com/maps/dir/${encodeURIComponent(res.pickup_address)}/${encodeURIComponent(res.delivery_address)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800">Voir itinéraire</a></div>}
      </div>

      {/* --- Mission Livraison --- */}
      <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4 space-y-3">
        <div className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Mission Livraison</div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Type *</label>
          <select className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold" value={form.mission_type} onChange={(e) => setForm((s) => ({ ...s, mission_type: e.target.value }))}>
            <option value="delivery">Livraison</option>
            <option value="pickup">Récupération</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Agent assigné</label>
          <select className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold" value={form.assigned_user_id} onChange={(e) => setForm((s) => ({ ...s, assigned_user_id: e.target.value }))}>
            <option value="">— Non assigné —</option>
            {agents.map((u) => <option key={u.id} value={u.id}>{agentName(u)}</option>)}
          </select>
          {form.assigned_user_id && form.scheduled_start_at && (
            <div className="mt-1"><AgentAvailabilityBadge agentId={form.assigned_user_id} scheduledAt={form.scheduled_start_at} excludeReservationId={reservationId ?? undefined} /></div>
          )}
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Date & heure prévue</label>
          <input type="datetime-local" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold" value={form.scheduled_start_at} onChange={(e) => setForm((s) => ({ ...s, scheduled_start_at: e.target.value }))} />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Notes</label>
          <textarea className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm" rows={2} value={form.notes} onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} placeholder="Instructions pour l'agent…" />
        </div>
      </div>

      {/* --- Toggle return mission --- */}
      <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50 transition">
        <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600 accent-indigo-600" checked={form.create_return} onChange={(e) => setForm((s) => ({ ...s, create_return: e.target.checked }))} />
        <div>
          <span className="text-sm font-bold text-slate-700">Créer aussi la mission Récupération</span>
          <span className="block text-[10px] text-slate-400">Planifier le retour du véhicule en fin de location</span>
        </div>
      </label>

      {/* --- Mission Récupération (conditional) --- */}
      {form.create_return && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
          <div className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Mission Récupération</div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Agent assigné</label>
            <select className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold" value={form.return_assigned_user_id} onChange={(e) => setForm((s) => ({ ...s, return_assigned_user_id: e.target.value }))}>
              <option value="">— Même agent —</option>
              {agents.map((u) => <option key={u.id} value={u.id}>{agentName(u)}</option>)}
            </select>
            {(form.return_assigned_user_id || form.assigned_user_id) && form.return_scheduled_at && (
              <div className="mt-1"><AgentAvailabilityBadge agentId={form.return_assigned_user_id || form.assigned_user_id} scheduledAt={form.return_scheduled_at} excludeReservationId={reservationId ?? undefined} /></div>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Date & heure retour</label>
            <input type="datetime-local" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold" value={form.return_scheduled_at} onChange={(e) => setForm((s) => ({ ...s, return_scheduled_at: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Notes retour</label>
            <textarea className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm" rows={2} value={form.return_notes} onChange={(e) => setForm((s) => ({ ...s, return_notes: e.target.value }))} placeholder="Instructions pour la récupération…" />
          </div>
        </div>
      )}

      {error && <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-bold text-rose-700">{error}</div>}
      <div className="flex justify-end gap-3 pt-2">
        <button type="button" className="rounded-2xl border border-slate-200 px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50" onClick={onClose}>Annuler</button>
        <button type="button" className="rounded-2xl bg-slate-900 px-5 py-2.5 text-xs font-black text-white hover:bg-slate-800 disabled:opacity-50" disabled={isPending} onClick={onSubmit}>
          {isPending ? 'Création…' : form.create_return ? 'Créer 2 missions' : 'Créer la mission'}
        </button>
      </div>
    </div>
  );
};
