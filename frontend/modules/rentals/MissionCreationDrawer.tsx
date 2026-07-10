import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { opsApi } from '@/services/opsApi';
import { listUsers, type AdminUser } from '@/services/adminApi';
import { getCustomer } from '@/services/customersApi';
import { queryKeys } from '@/services/queryKeys';
import type { CustomerDto, FleetVehicleDto } from '@/services/dtos';

/* ── Types ─────────────────────────────────────────────────────────── */

interface ReservationRow {
  id: string;
  reservation_number?: string;
  customer_id: string;
  vehicle_id: string;
  branch_id?: string;
  status: string;
  desired_start_at: string;
  desired_end_at: string;
  pickup_address?: string | null;
  delivery_address?: string | null;
  has_contract?: boolean;
  contract_id?: string;
  contract_number?: string;
}

interface BranchRow {
  id: string;
  code: string;
  name: string;
  city?: string | null;
  phone?: string | null;
}

export interface MissionCreationDrawerProps {
  open: boolean;
  onClose: () => void;
  reservation: ReservationRow | null;
  customers: CustomerDto[];
  vehicles: FleetVehicleDto[];
  branches: BranchRow[];
  onSuccess?: () => void;
}

/* ── Constants ─────────────────────────────────────────────────────── */

const MISSION_TYPES = [
  { value: 'delivery', label: 'Livraison' },
  { value: 'pickup', label: 'Récupération' },
  { value: 'transfer', label: 'Transfert' },
  { value: 'convoy', label: 'Convoyage' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'cleaning', label: 'Nettoyage' },
  { value: 'workshop', label: 'Atelier' },
  { value: 'fuel', label: 'Carburant' },
  { value: 'other', label: 'Autre' },
];

const PRIORITIES = [
  { value: 'low', label: 'Faible', cls: 'bg-slate-100 text-slate-600' },
  { value: 'normal', label: 'Normale', cls: 'bg-blue-100 text-blue-700' },
  { value: 'high', label: 'Haute', cls: 'bg-amber-100 text-amber-700' },
  { value: 'urgent', label: 'Urgente', cls: 'bg-red-100 text-red-700' },
];

const DURATION_PRESETS = [
  { value: 30, label: '30 min' },
  { value: 60, label: '1 h' },
  { value: 90, label: '1h30' },
  { value: 120, label: '2 h' },
  { value: 180, label: '3 h' },
];

const TOLERANCE_PRESETS = [
  { value: 15, label: '± 15 min' },
  { value: 30, label: '± 30 min' },
  { value: 60, label: '± 1 h' },
];

const PREP_ITEMS = [
  'Documents préparés',
  'Double clé',
  'Contrat imprimé',
  'Véhicule nettoyé',
  'Plein effectué',
  'Inspection réalisée',
];

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

const STATUS_BADGE_CLS: Record<string, string> = {
  draft:               'bg-slate-100 text-slate-600',
  reserved:            'bg-emerald-100 text-emerald-700',
  confirmed:           'bg-emerald-100 text-emerald-700',
  pickup_scheduled:    'bg-indigo-100 text-indigo-700',
  handed_over:         'bg-blue-100 text-blue-700',
  active:              'bg-blue-100 text-blue-700',
  extension_requested: 'bg-amber-100 text-amber-700',
  return_scheduled:    'bg-indigo-100 text-indigo-700',
  returned:            'bg-cyan-100 text-cyan-700',
  inspection_pending:  'bg-amber-100 text-amber-700',
  damage_pending:      'bg-orange-100 text-orange-700',
  billing_pending:     'bg-purple-100 text-purple-700',
  cancelled:           'bg-red-100 text-red-700',
  closed:              'bg-slate-200 text-slate-700',
};

const INPUT = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-colors';
const LABEL = 'mb-1 block text-xs font-bold text-slate-500 uppercase tracking-wide';
const SECTION_TITLE = 'text-sm font-black text-slate-800 mb-3';

/* ── Helpers ───────────────────────────────────────────────────────── */

function inferMissionType(status: string): string {
  if (['confirmed', 'reserved', 'pickup_scheduled'].includes(status)) return 'delivery';
  if (['active', 'returned', 'return_scheduled'].includes(status)) return 'pickup';
  return 'delivery';
}

function toDateInput(iso?: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function toTimeInput(iso?: string | null): string {
  if (!iso) return '';
  const m = iso.match(/T(\d{2}:\d{2})/);
  return m?.[1] ?? '09:00';
}

/* ── Component ─────────────────────────────────────────────────────── */

export const MissionCreationDrawer: React.FC<MissionCreationDrawerProps> = ({
  open,
  onClose,
  reservation,
  customers,
  vehicles,
  branches,
  onSuccess,
}) => {
  const nav = useNavigate();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── Derived reservation context ─────────────────────────────── */
  // NOTE: the customers prop may hold the raw API shape (display_name,
  // customer_code) rather than the mapped CustomerDto (name). Support both.
  const customerRow = useMemo(
    () => (reservation ? customers.find((c) => String(c.id) === String(reservation.customer_id)) : null),
    [reservation, customers],
  );
  const vehicle = useMemo(
    () => (reservation ? vehicles.find((v) => String(v.id) === String(reservation.vehicle_id)) : null),
    [reservation, vehicles],
  );

  // Reservation detail is the authoritative source for the header info: it
  // resolves customer_name server-side, includes the primary driver (phone),
  // and the persisted reservation row (branch_id) — none of which are
  // guaranteed to be present in the list row or the customers list page.
  const reservationDetailQ = useQuery({
    queryKey: ['reservation', 'mission-drawer', reservation?.id],
    queryFn: async () => opsApi.reservation(reservation!.id),
    enabled: open && !!reservation?.id,
    staleTime: 30_000,
  });
  const detail = reservationDetailQ.data as {
    reservation?: { branch_id?: string | null; customer?: { branch_id?: string | null } | null };
    customer_name?: string | null;
    drivers?: Array<{ driver_type?: string; first_name?: string; last_name?: string; phone?: string | null }>;
  } | undefined;

  // Customer detail (loads contacts → phone, and branch_id) since the list
  // endpoint does not include contact information.
  const customerDetailQ = useQuery({
    queryKey: ['customer', 'detail', reservation?.customer_id],
    queryFn: async () => (await getCustomer(String(reservation!.customer_id))).data,
    enabled: open && !!reservation?.customer_id,
    staleTime: 60_000,
  });
  const customerDetail = customerDetailQ.data;

  const primaryDriver = useMemo(() => {
    const drivers = detail?.drivers ?? [];
    return drivers.find((d) => d.driver_type === 'primary') ?? drivers[0] ?? null;
  }, [detail]);

  const customerName = useMemo(() => {
    const raw = customerRow as unknown as { name?: string; display_name?: string; customer_code?: string } | null;
    const driverName = primaryDriver ? [primaryDriver.first_name, primaryDriver.last_name].filter(Boolean).join(' ').trim() : '';
    return detail?.customer_name || raw?.name || raw?.display_name || customerDetail?.display_name || driverName || raw?.customer_code || null;
  }, [detail, customerRow, customerDetail, primaryDriver]);

  const customerPhone = useMemo(() => {
    const raw = customerRow as unknown as { phone?: string } | null;
    if (raw?.phone) return raw.phone;
    const contacts = customerDetail?.contacts ?? [];
    const phones = contacts.filter((c) => ['phone', 'mobile', 'tel', 'gsm'].includes(String(c.contact_type ?? '').toLowerCase()));
    return phones.find((c) => c.is_primary)?.value ?? phones[0]?.value ?? primaryDriver?.phone ?? null;
  }, [customerRow, customerDetail, primaryDriver]);

  // Agence: reservation (detail then list row) → customer → vehicle,
  // whichever is set first.
  const branch = useMemo(() => {
    const candidates = [
      detail?.reservation?.branch_id,
      reservation?.branch_id,
      detail?.reservation?.customer?.branch_id,
      customerDetail?.branch_id,
      (vehicle as unknown as { branchId?: number | string } | null)?.branchId,
    ];
    for (const id of candidates) {
      if (id == null || id === '') continue;
      const found = branches.find((b) => String(b.id) === String(id));
      if (found) return found;
    }
    return null;
  }, [detail, reservation, customerDetail, vehicle, branches]);

  /* ── Form state ──────────────────────────────────────────────── */
  const defaultForm = useCallback(() => ({
    mission_type: inferMissionType(reservation?.status ?? ''),
    priority: 'normal',
    date: toDateInput(reservation?.desired_start_at),
    time: toTimeInput(reservation?.desired_start_at) || '09:00',
    duration: 60,
    customDuration: '',
    tolerance: 30,
    assigned_user_id: '',
    assignLater: false,
    origin_address: branch?.name ?? '',
    destination_address: reservation?.delivery_address ?? '',
    pickup_address: reservation?.pickup_address ?? '',
    dropoff_address: reservation?.delivery_address ?? '',
    alt_contact: '',
    client_instructions: '',
    notes: '',
    prepChecked: new Set<string>(),
    checklistItems: [] as string[],
    notifyAgent: true,
    notifyEmail: true,
    notifyPush: true,
    notifyClient: false,
  }), [reservation, branch]);

  const [form, setForm] = useState(defaultForm);
  const [agentSearch, setAgentSearch] = useState('');
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [newCheckItem, setNewCheckItem] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The agence can resolve after the form was initialised (customer detail
  // loads asynchronously) — backfill the origin address if still empty.
  useEffect(() => {
    if (branch?.name) {
      setForm((s) => (s.origin_address ? s : { ...s, origin_address: branch.name }));
    }
  }, [branch]);

  // Reset form when reservation changes
  const prevResId = useRef<string | null>(null);
  if (reservation && reservation.id !== prevResId.current) {
    prevResId.current = reservation.id;
    setForm(defaultForm());
    setFiles([]);
    setError(null);
    setAgentSearch('');
    setNewCheckItem('');
  }

  /* ── Agents query ────────────────────────────────────────────── */
  const agentsQ = useQuery({
    queryKey: ['users', 'agents', 'AGENT_LIVRAISON'],
    queryFn: async () => {
      const res = await listUsers({ role: 'AGENT_LIVRAISON', status: 'active', per_page: 100 });
      return res.data;
    },
    enabled: open,
    staleTime: 2 * 60_000,
  });

  const agents = useMemo(() => {
    const list = agentsQ.data ?? [];
    if (!agentSearch.trim()) return list;
    const q = agentSearch.toLowerCase();
    return list.filter((a) => a.name?.toLowerCase().includes(q) || a.email?.toLowerCase().includes(q));
  }, [agentsQ.data, agentSearch]);

  const selectedAgent = useMemo(
    () => (form.assigned_user_id ? (agentsQ.data ?? []).find((a) => a.id === form.assigned_user_id) : null),
    [form.assigned_user_id, agentsQ.data],
  );

  /* ── File handling ───────────────────────────────────────────── */
  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...dropped]);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...selected]);
    e.target.value = '';
  }, []);

  /* ── Submit ──────────────────────────────────────────────────── */
  const handleSubmit = useCallback(async (action: 'create' | 'assign' | 'open') => {
    if (!reservation) return;
    setBusy(true);
    setError(null);

    try {
      const scheduledStart = form.date && form.time ? `${form.date}T${form.time}:00` : undefined;
      const durationMin = form.customDuration ? Number(form.customDuration) : form.duration;

      const mission = await opsApi.createMission(reservation.id, {
        mission_type: form.mission_type,
        priority: form.priority,
        assigned_user_id: (action === 'assign' || !form.assignLater) ? (form.assigned_user_id || undefined) : undefined,
        scheduled_start_at: scheduledStart,
        estimated_duration_minutes: durationMin || undefined,
        origin_address: form.origin_address || undefined,
        destination_address: form.destination_address || undefined,
        pickup_address: form.pickup_address || undefined,
        dropoff_address: form.dropoff_address || undefined,
        client_id: reservation.customer_id,
        contract_id: reservation.contract_id || undefined,
        client_instructions: form.client_instructions || undefined,
        notes: form.notes || undefined,
        status: (action === 'assign' && form.assigned_user_id) ? 'assigned' : undefined,
      });

      const missionId = mission.id;

      // Post-creation: checklist items + files
      const postOps: Promise<unknown>[] = [];

      // Preparation items
      for (const item of PREP_ITEMS) {
        if (form.prepChecked.has(item)) {
          postOps.push(opsApi.addChecklistItem(missionId, { checklist_phase: 'preparation', item_label: item, item_status: 'DONE' }));
        }
      }

      // Custom checklist items
      for (const item of form.checklistItems) {
        if (item.trim()) {
          postOps.push(opsApi.addChecklistItem(missionId, { checklist_phase: 'custom', item_label: item.trim(), item_status: 'PENDING' }));
        }
      }

      // File uploads
      for (const file of files) {
        postOps.push(opsApi.uploadPhoto(missionId, file, { phase: 'attachment', label: file.name }));
      }

      if (postOps.length > 0) {
        await Promise.allSettled(postOps);
      }

      await qc.invalidateQueries({ queryKey: queryKeys.missions });
      await qc.invalidateQueries({ queryKey: queryKeys.reservations });

      onSuccess?.();
      onClose();

      if (action === 'open') {
        nav(`/missions/${missionId}`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur lors de la création de la mission');
    } finally {
      setBusy(false);
    }
  }, [reservation, form, files, nav, qc, onClose, onSuccess]);

  if (!reservation) return null;

  const resNum = reservation.reservation_number ?? reservation.id.slice(0, 8);

  return (
    <DrawerPanel open={open} title="Créer une mission" onClose={onClose} widthClass="max-w-3xl">
      <div className="space-y-6 pb-24">

        {/* ── Section 1: Informations générales ──────────────────── */}
        <section>
          <h3 className={SECTION_TITLE}>1 — Informations générales</h3>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 mb-4">
            <p className="text-xs font-bold text-slate-400 uppercase mb-2">Réservation</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              <InfoRow label="N° Réservation" value={resNum} />
              <InfoRow label="Client" value={customerName ?? (reservationDetailQ.isLoading || customerDetailQ.isLoading ? 'Chargement…' : reservation.customer_id.slice(0, 8))} />
              <InfoRow label="Téléphone" value={customerPhone ?? (reservationDetailQ.isLoading || customerDetailQ.isLoading ? 'Chargement…' : '—')} />
              <InfoRow label="Véhicule" value={vehicle ? `${vehicle.brand} ${vehicle.model}` : '—'} />
              <InfoRow label="Plaque" value={vehicle?.registration ?? '—'} />
              <InfoRow label="Contrat" value={reservation.contract_number ?? (reservation.has_contract ? 'Oui' : 'Aucun')} />
              <InfoRow label="Agence" value={branch?.name ?? (reservationDetailQ.isLoading || customerDetailQ.isLoading ? 'Chargement…' : '—')} />
              <div className="flex items-baseline gap-2">
                <span className="text-xs text-slate-400 shrink-0">Statut</span>
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${STATUS_BADGE_CLS[reservation.status] ?? 'bg-slate-100 text-slate-600'}`}>
                  {STATUS_FR[reservation.status] ?? reservation.status}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Type de mission *</label>
              <select className={INPUT} value={form.mission_type} onChange={(e) => setForm((s) => ({ ...s, mission_type: e.target.value }))}>
                {MISSION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={LABEL}>Priorité</label>
              <select className={INPUT} value={form.priority} onChange={(e) => setForm((s) => ({ ...s, priority: e.target.value }))}>
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              <div className="mt-1.5">
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${PRIORITIES.find((p) => p.value === form.priority)?.cls ?? ''}`}>
                  {PRIORITIES.find((p) => p.value === form.priority)?.label}
                </span>
              </div>
            </div>
          </div>
        </section>

        <hr className="border-slate-100" />

        {/* ── Section 2: Planification ───────────────────────────── */}
        <section>
          <h3 className={SECTION_TITLE}>2 — Planification</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Date prévue</label>
              <input type="date" className={INPUT} value={form.date} onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))} />
            </div>
            <div>
              <label className={LABEL}>Heure prévue</label>
              <input type="time" className={INPUT} value={form.time} onChange={(e) => setForm((s) => ({ ...s, time: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-3">
            <div>
              <label className={LABEL}>Durée estimée</label>
              <div className="flex flex-wrap gap-1.5">
                {DURATION_PRESETS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${form.duration === d.value && !form.customDuration ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    onClick={() => setForm((s) => ({ ...s, duration: d.value, customDuration: '' }))}
                  >
                    {d.label}
                  </button>
                ))}
                <input
                  type="number"
                  placeholder="Autre (min)"
                  className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                  value={form.customDuration}
                  onChange={(e) => setForm((s) => ({ ...s, customDuration: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <label className={LABEL}>Fenêtre de tolérance</label>
              <div className="flex gap-1.5">
                {TOLERANCE_PRESETS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${form.tolerance === t.value ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    onClick={() => setForm((s) => ({ ...s, tolerance: t.value }))}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <hr className="border-slate-100" />

        {/* ── Section 3: Affectation ────────────────────────────── */}
        <section>
          <h3 className={SECTION_TITLE}>3 — Affectation</h3>
          <label className="mb-3 flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-slate-300"
              checked={form.assignLater}
              onChange={(e) => setForm((s) => ({ ...s, assignLater: e.target.checked, assigned_user_id: e.target.checked ? '' : s.assigned_user_id }))}
            />
            <span className="text-slate-600 font-semibold">Affecter plus tard</span>
          </label>

          {!form.assignLater && (
            <div className="relative">
              <label className={LABEL}>Agent</label>
              <input
                type="text"
                className={INPUT}
                placeholder="Rechercher un agent…"
                value={selectedAgent ? (selectedAgent.name || selectedAgent.email) : agentSearch}
                onChange={(e) => { setAgentSearch(e.target.value); setForm((s) => ({ ...s, assigned_user_id: '' })); setAgentDropdownOpen(true); }}
                onFocus={() => setAgentDropdownOpen(true)}
              />
              {agentDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setAgentDropdownOpen(false)} />
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                    {agentsQ.isLoading && <p className="p-3 text-xs text-slate-400">Chargement…</p>}
                    {agents.length === 0 && !agentsQ.isLoading && <p className="p-3 text-xs text-slate-400">Aucun agent trouvé</p>}
                    {agents.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-indigo-50 transition-colors"
                        onClick={() => {
                          setForm((s) => ({ ...s, assigned_user_id: a.id }));
                          setAgentSearch('');
                          setAgentDropdownOpen(false);
                        }}
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                          {(a.name || a.email).slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-800 truncate">{a.name || a.email}</p>
                          <p className="text-xs text-slate-400">{a.email}{a.phone ? ` · ${a.phone}` : ''}</p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${a.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {a.status === 'active' ? 'Disponible' : 'Inactif'}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {selectedAgent && (
                <div className="mt-2 flex items-center gap-3 rounded-xl border border-indigo-100 bg-indigo-50 p-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-200 text-sm font-bold text-indigo-700">
                    {(selectedAgent.name || selectedAgent.email).slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-slate-800">{selectedAgent.name || selectedAgent.email}</p>
                    <p className="text-xs text-slate-500">{selectedAgent.email}{selectedAgent.phone ? ` · ${selectedAgent.phone}` : ''}</p>
                  </div>
                  <button
                    type="button"
                    className="text-slate-400 hover:text-red-500 text-lg"
                    onClick={() => setForm((s) => ({ ...s, assigned_user_id: '' }))}
                  >
                    &times;
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <hr className="border-slate-100" />

        {/* ── Section 4: Localisation ───────────────────────────── */}
        <section>
          <h3 className={SECTION_TITLE}>4 — Localisation</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Adresse d'origine</label>
              <select
                className={INPUT}
                value={branches.some((b) => b.name === form.origin_address) ? form.origin_address : '__custom__'}
                onChange={(e) => {
                  if (e.target.value !== '__custom__') setForm((s) => ({ ...s, origin_address: e.target.value }));
                }}
              >
                {branches.map((b) => <option key={b.id} value={b.name}>{b.name}{b.city ? ` — ${b.city}` : ''}</option>)}
                <option value="__custom__">Personnalisée…</option>
              </select>
              {!branches.some((b) => b.name === form.origin_address) && (
                <input
                  type="text"
                  className={`${INPUT} mt-2`}
                  placeholder="Adresse personnalisée"
                  value={form.origin_address}
                  onChange={(e) => setForm((s) => ({ ...s, origin_address: e.target.value }))}
                />
              )}
            </div>
            <div>
              <label className={LABEL}>Adresse de destination</label>
              <input type="text" className={INPUT} placeholder="Adresse de destination" value={form.destination_address} onChange={(e) => setForm((s) => ({ ...s, destination_address: e.target.value }))} />
            </div>
            <div>
              <label className={LABEL}>Adresse Pickup</label>
              <input type="text" className={INPUT} placeholder="Adresse Pickup" value={form.pickup_address} onChange={(e) => setForm((s) => ({ ...s, pickup_address: e.target.value }))} />
            </div>
            <div>
              <label className={LABEL}>Adresse Drop-off</label>
              <input type="text" className={INPUT} placeholder="Adresse Drop-off" value={form.dropoff_address} onChange={(e) => setForm((s) => ({ ...s, dropoff_address: e.target.value }))} />
            </div>
          </div>
        </section>

        <hr className="border-slate-100" />

        {/* ── Section 5: Contact ────────────────────────────────── */}
        <section>
          <h3 className={SECTION_TITLE}>5 — Contact</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Client</label>
              <p className="text-sm text-slate-700 font-semibold">{customerName ?? '—'}</p>
            </div>
            <div>
              <label className={LABEL}>Téléphone</label>
              <p className="text-sm text-slate-700">
                {customerPhone ?? (customerDetailQ.isLoading ? 'Chargement…' : '—')}
              </p>
            </div>
            <div>
              <label className={LABEL}>Contact alternatif</label>
              <input type="text" className={INPUT} placeholder="Nom ou téléphone alternatif" value={form.alt_contact} onChange={(e) => setForm((s) => ({ ...s, alt_contact: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className={LABEL}>Instructions client</label>
              <textarea
                className={INPUT}
                rows={2}
                placeholder="Appeler avant d'arriver, portail bleu, appartement 5…"
                value={form.client_instructions}
                onChange={(e) => setForm((s) => ({ ...s, client_instructions: e.target.value }))}
              />
            </div>
          </div>
        </section>

        <hr className="border-slate-100" />

        {/* ── Section 6: Véhicule ───────────────────────────────── */}
        <section>
          <h3 className={SECTION_TITLE}>6 — Véhicule</h3>
          {vehicle ? (
            <div className="flex items-center gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
              {vehicle.image ? (
                <img src={vehicle.image} alt="" className="h-16 w-24 rounded-lg object-cover" />
              ) : (
                <div className="flex h-16 w-24 items-center justify-center rounded-lg bg-slate-200 text-2xl">🚗</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-slate-800">{vehicle.brand} {vehicle.model}</p>
                <p className="text-xs text-slate-500">{vehicle.registration}{vehicle.color ? ` · ${vehicle.color}` : ''}{vehicle.year ? ` · ${vehicle.year}` : ''}</p>
                <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                  {vehicle.mileageKm != null && <span>{vehicle.mileageKm.toLocaleString()} km</span>}
                  {vehicle.fuel && <span>{vehicle.fuel}</span>}
                  {branch && <span>{branch.name}</span>}
                </div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${vehicle.status === 'available' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {vehicle.status === 'available' ? 'Disponible' : vehicle.status}
              </span>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Véhicule non trouvé</p>
          )}
        </section>

        <hr className="border-slate-100" />

        {/* ── Section 7: Préparation ────────────────────────────── */}
        <section>
          <h3 className={SECTION_TITLE}>7 — Préparation</h3>
          <div className="grid grid-cols-2 gap-2">
            {PREP_ITEMS.map((item) => (
              <label key={item} className="flex items-center gap-2.5 rounded-lg border border-slate-100 px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-indigo-600"
                  checked={form.prepChecked.has(item)}
                  onChange={(e) => {
                    setForm((s) => {
                      const next = new Set(s.prepChecked);
                      e.target.checked ? next.add(item) : next.delete(item);
                      return { ...s, prepChecked: next };
                    });
                  }}
                />
                <span className="text-sm text-slate-700">{item}</span>
              </label>
            ))}
          </div>
        </section>

        <hr className="border-slate-100" />

        {/* ── Section 8: Checklist ──────────────────────────────── */}
        <section>
          <h3 className={SECTION_TITLE}>8 — Checklist</h3>
          <div className="space-y-2 mb-3">
            {form.checklistItems.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 text-xs text-slate-400">☐</span>
                <span className="flex-1 text-sm text-slate-700">{item}</span>
                <button
                  type="button"
                  className="text-slate-300 hover:text-red-500 text-sm"
                  onClick={() => setForm((s) => ({ ...s, checklistItems: s.checklistItems.filter((_, idx) => idx !== i) }))}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              className={`${INPUT} flex-1`}
              placeholder="Ajouter un item…"
              value={newCheckItem}
              onChange={(e) => setNewCheckItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newCheckItem.trim()) {
                  e.preventDefault();
                  setForm((s) => ({ ...s, checklistItems: [...s.checklistItems, newCheckItem.trim()] }));
                  setNewCheckItem('');
                }
              }}
            />
            <button
              type="button"
              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200"
              onClick={() => {
                if (newCheckItem.trim()) {
                  setForm((s) => ({ ...s, checklistItems: [...s.checklistItems, newCheckItem.trim()] }));
                  setNewCheckItem('');
                }
              }}
            >
              + Ajouter
            </button>
          </div>
        </section>

        <hr className="border-slate-100" />

        {/* ── Section 9: Notes ──────────────────────────────────── */}
        <section>
          <h3 className={SECTION_TITLE}>9 — Notes</h3>
          <textarea
            className={INPUT}
            rows={4}
            placeholder="Informations importantes concernant cette mission…"
            value={form.notes}
            onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
          />
        </section>

        <hr className="border-slate-100" />

        {/* ── Section 10: Pièces jointes ────────────────────────── */}
        <section>
          <h3 className={SECTION_TITLE}>10 — Pièces jointes</h3>
          <div
            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-6 cursor-pointer hover:border-indigo-300 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleFileDrop}
          >
            <p className="text-sm text-slate-500">Glisser-déposer ou <span className="font-bold text-indigo-600">parcourir</span></p>
            <p className="text-xs text-slate-400 mt-1">PDF, images, documents</p>
            <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="hidden" onChange={handleFileSelect} />
          </div>
          {files.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-white border border-slate-100 px-3 py-2">
                  <span className="text-xs text-slate-400">{f.name.endsWith('.pdf') ? '📄' : '🖼️'}</span>
                  <span className="flex-1 text-sm text-slate-700 truncate">{f.name}</span>
                  <span className="text-xs text-slate-400">{(f.size / 1024).toFixed(0)} Ko</span>
                  <button type="button" className="text-slate-300 hover:text-red-500" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}>&times;</button>
                </div>
              ))}
            </div>
          )}
        </section>

        <hr className="border-slate-100" />

        {/* ── Section 11: Notifications ─────────────────────────── */}
        <section>
          <h3 className={SECTION_TITLE}>11 — Notifications</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { key: 'notifyAgent' as const, label: "Notifier l'agent" },
              { key: 'notifyEmail' as const, label: 'Envoyer un email' },
              { key: 'notifyPush' as const, label: 'Notification Push' },
              { key: 'notifyClient' as const, label: 'Informer le client' },
            ].map((n) => (
              <label key={n.key} className="flex items-center gap-2.5 rounded-lg border border-slate-100 px-3 py-2.5 cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-indigo-600"
                  checked={form[n.key]}
                  onChange={(e) => setForm((s) => ({ ...s, [n.key]: e.target.checked }))}
                />
                <span className="text-sm text-slate-700">{n.label}</span>
              </label>
            ))}
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-semibold">
            {error}
          </div>
        )}
      </div>

      {/* ── Sticky footer ──────────────────────────────────────── */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4">
        <button type="button" className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600 hover:bg-slate-50" onClick={onClose} disabled={busy}>
          Annuler
        </button>
        <button
          type="button"
          className="rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-black text-white hover:bg-slate-700 disabled:opacity-50"
          disabled={busy}
          onClick={() => handleSubmit('create')}
        >
          {busy ? 'Création…' : 'Créer'}
        </button>
        {form.assigned_user_id && !form.assignLater && (
          <button
            type="button"
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-50"
            disabled={busy}
            onClick={() => handleSubmit('assign')}
          >
            {busy ? 'Création…' : 'Créer et affecter'}
          </button>
        )}
        <button
          type="button"
          className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
          disabled={busy}
          onClick={() => handleSubmit('open')}
        >
          {busy ? 'Création…' : 'Créer & ouvrir'}
        </button>
      </div>
    </DrawerPanel>
  );
};

/* ── Sub-components ────────────────────────────────────────────────── */

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-baseline gap-2">
    <span className="text-xs text-slate-400 shrink-0">{label}</span>
    <span className="text-sm font-semibold text-slate-700 truncate">{value}</span>
  </div>
);
