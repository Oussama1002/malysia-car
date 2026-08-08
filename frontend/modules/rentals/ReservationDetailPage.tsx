import React, { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { opsApi } from '@/services/opsApi';
import { apiClient, getApiBase } from '@/services/apiClient';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { PaymentForm } from '@/modules/finance/PaymentsPage';
import { createPayment, type PaymentCreatePayload } from '@/services/financeApi';

/* ─── lazy tab components ─────────────────────────────────────────── */
const TabSummary      = lazy(() => import('./tabs/TabSummary'));
const TabDrivers      = lazy(() => import('./tabs/TabDrivers'));
const TabContract     = lazy(() => import('./tabs/TabContract'));
const TabCheckOut     = lazy(() => import('./tabs/TabCheckOut'));
const TabCheckIn      = lazy(() => import('./tabs/TabCheckIn'));
const TabExtensions   = lazy(() => import('./tabs/TabExtensions'));
const TabDamages      = lazy(() => import('./tabs/TabDamages'));
const TabPayments     = lazy(() => import('./tabs/TabPayments'));
const TabInvoices     = lazy(() => import('./tabs/TabInvoices'));
const TabHistory      = lazy(() => import('./tabs/TabHistory'));

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

function statusTone(s: string): 'success' | 'danger' | 'brand' | 'info' | 'warning' {
  if (s === 'closed') return 'success';
  if (s === 'cancelled') return 'danger';
  if (s === 'active' || s === 'handed_over') return 'brand';
  if (s.includes('pending') || s === 'extension_requested') return 'warning';
  return 'info';
}

const TABS = [
  { id: 'summary',    label: 'Résumé' },
  { id: 'missions',   label: 'Missions' },
  { id: 'drivers',    label: 'Conducteurs' },
  { id: 'contract',   label: 'Contrat' },
  { id: 'checkout',   label: 'Check-Out' },
  { id: 'checkin',    label: 'Check-In' },
  { id: 'extensions', label: 'Prolongations' },
  { id: 'damages',    label: 'Dommages' },
  { id: 'payments',   label: 'Paiements' },
  { id: 'invoices',   label: 'Factures' },
  { id: 'history',    label: 'Historique' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const TabFallback = () => (
  <div className="flex items-center justify-center py-16 text-sm text-slate-400 font-semibold">
    Chargement…
  </div>
);

export const ReservationDetailPage: React.FC = () => {
  const { id: rid } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('summary');
  const [paymentDrawerOpen, setPaymentDrawerOpen] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapVehicleId, setSwapVehicleId] = useState('');
  const [swapReason, setSwapReason] = useState('');
  const [swapError, setSwapError] = useState<string | null>(null);
  const [swapMode, setSwapMode] = useState<'instant' | 'request'>('instant');

  const detailQ = useQuery({
    queryKey: ['reservation', rid],
    queryFn: () => opsApi.reservation(rid!),
    enabled: !!rid,
  });

  const vehiclesQ = useQuery({
    queryKey: ['fleet', 'all-vehicles'],
    queryFn: async () => (await apiClient<{ data: any[] }>('/v1/vehicles?per_page=200')).data,
    enabled: swapOpen && !!getApiBase(),
  });

  const swapsQ = useQuery({
    queryKey: ['vehicle-swaps', rid],
    queryFn: () => opsApi.vehicleSwaps({ reservation_id: rid }),
    enabled: !!rid,
  });

  const d = detailQ.data;
  const r = d?.reservation;
  const status = String(r?.status ?? '');
  const totals = d?.totals ?? { estimated_price: 0, extensions_total: 0, damages_total: 0, paid: 0 };
  const grandTotal = totals.estimated_price + totals.extensions_total + totals.damages_total;
  const balance = grandTotal - totals.paid;

  const validateM = useMutation({
    mutationFn: () => opsApi.validateReservation(rid!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservation', rid] }),
  });
  const confirmM = useMutation({
    mutationFn: () => opsApi.confirmReservation(rid!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservation', rid] }),
  });
  const cancelM = useMutation({
    mutationFn: () => opsApi.cancelReservation(rid!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservation', rid] }),
  });
  const [statusChangeTarget, setStatusChangeTarget] = useState('');
  const changeStatusM = useMutation({
    mutationFn: (newStatus: string) => opsApi.changeReservationStatus(rid!, newStatus),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reservation', rid] }); setStatusChangeTarget(''); },
  });
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const deleteM = useMutation({
    mutationFn: () => opsApi.deleteReservation(rid!),
    onSuccess: () => navigate('/contracts'),
    onError: (e) => alert(e instanceof Error ? e.message : 'Erreur de suppression'),
  });
  const paymentM = useMutation({
    mutationFn: (p: PaymentCreatePayload) => createPayment(p),
    onSuccess: () => {
      setPaymentDrawerOpen(false);
      setPaymentError(null);
      qc.invalidateQueries({ queryKey: ['reservation', rid] });
    },
    onError: (e) => setPaymentError(e instanceof Error ? e.message : 'Erreur de création du paiement'),
  });

  const swapInstantM = useMutation({
    mutationFn: () => opsApi.instantVehicleSwap({ reservation_id: rid!, new_vehicle_id: swapVehicleId, reason: swapReason || undefined }),
    onSuccess: () => {
      setSwapOpen(false); setSwapError(null); setSwapVehicleId(''); setSwapReason('');
      qc.invalidateQueries({ queryKey: ['reservation', rid] });
      qc.invalidateQueries({ queryKey: ['vehicle-swaps', rid] });
    },
    onError: (e) => setSwapError(e instanceof Error ? e.message : 'Erreur lors du changement'),
  });
  const swapRequestM = useMutation({
    mutationFn: () => opsApi.requestVehicleSwap({ reservation_id: rid!, new_vehicle_id: swapVehicleId, reason: swapReason || undefined }),
    onSuccess: () => {
      setSwapOpen(false); setSwapError(null); setSwapVehicleId(''); setSwapReason('');
      qc.invalidateQueries({ queryKey: ['vehicle-swaps', rid] });
    },
    onError: (e) => setSwapError(e instanceof Error ? e.message : 'Erreur lors de la demande'),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['reservation', rid] });

  if (detailQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-slate-500 font-semibold">
        Chargement de la réservation…
      </div>
    );
  }

  if (!r) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Réservation introuvable.
      </div>
    );
  }

  const fmtDate = (v: string | null | undefined) =>
    v ? new Date(v).toLocaleString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const fmtMad = (v: number) => `${v.toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} MAD`;

  return (
    <div className="space-y-6">

      {/* ── Back link ── */}
      <Link
        to="/contracts"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-800"
      >
        ← Retour aux réservations
      </Link>

      {/* ══════════════════════════════════════════════════════════════
          HEADER — always visible
         ══════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        {/* Top bar: reservation number + status */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-black text-slate-900 tracking-tight">{r.reservation_number}</h1>
            {status === 'draft' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-amber-300 bg-amber-50 px-3 py-1 text-[11px] font-black text-amber-700">
                ⏳ Intention · Non validée
              </span>
            ) : (
              <StatusBadge
                label={STATUS_FR[status] ?? status}
                tone={statusTone(status)}
              />
            )}
          </div>
          <div className="text-xs text-slate-400">
            Créé le {fmtDate(r.created_at)}
          </div>
        </div>

        {/* Info cards row */}
        <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-3 lg:grid-cols-7">
          {[
            { label: 'Client', value: d?.customer_name ?? '—' },
            { label: 'Véhicule', value: d?.vehicle_name ?? '—' },
            { label: 'Immatriculation', value: d?.vehicle_registration ?? '—' },
            { label: 'Début', value: fmtDate(r.desired_start_at) },
            { label: 'Fin', value: fmtDate(r.desired_end_at) },
            { label: 'Total', value: fmtMad(grandTotal) },
            { label: 'Solde', value: fmtMad(balance), highlight: balance > 0 },
          ].map((c, i) => (
            <div key={i} className="bg-white px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{c.label}</div>
              <div className={`mt-0.5 text-sm font-black truncate ${(c as any).highlight ? 'text-rose-600' : 'text-slate-800'}`}>
                {c.value}
              </div>
            </div>
          ))}
        </div>

        {/* Draft intent banner */}
        {status === 'draft' && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-200 bg-amber-50 px-6 py-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">⏳</span>
              <div>
                <div className="text-xs font-black text-amber-800">Intention de réservation — non validée</div>
                <div className="text-[10px] text-amber-600">Le véhicule n'est pas bloqué. Validez pour confirmer et réserver le créneau.</div>
              </div>
            </div>
            <button
              onClick={() => validateM.mutate()}
              disabled={validateM.isPending}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50 shadow-lg"
            >
              {validateM.isPending ? 'Validation…' : '✓ Valider la réservation'}
            </button>
          </div>
        )}

        {/* Status change + Quick actions bar */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-6 py-3 bg-slate-50/50">
          <div className="flex items-center gap-2 mr-4">
            <select
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"
              value={statusChangeTarget || status}
              onChange={(e) => setStatusChangeTarget(e.target.value === status ? '' : e.target.value)}
            >
              {Object.entries(STATUS_FR).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            {statusChangeTarget && statusChangeTarget !== status && (
              <button
                onClick={() => changeStatusM.mutate(statusChangeTarget)}
                disabled={changeStatusM.isPending}
                className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {changeStatusM.isPending ? 'Changement...' : 'Appliquer'}
              </button>
            )}
          </div>
          {status === 'draft' && (
            <button
              onClick={() => validateM.mutate()}
              disabled={validateM.isPending}
              className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              ✓ Valider réservation
            </button>
          )}
          {!['cancelled', 'closed'].includes(status) && (
            <Link
              to={`/contracts/new?from_reservation=${rid}`}
              className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-black text-white hover:bg-amber-700 transition-colors"
            >
              📄 Générer contrat
            </Link>
          )}
          {!['cancelled', 'closed', 'draft'].includes(status) && (
            <button
              onClick={() => { setSwapError(null); setSwapOpen(true); }}
              className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-black text-white hover:bg-slate-900"
            >
              🔁 Changer de véhicule
            </button>
          )}
          {status === 'reserved' && (
            <button
              onClick={() => confirmM.mutate()}
              disabled={confirmM.isPending}
              className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              ✓ Confirmer
            </button>
          )}
          {!['cancelled', 'closed'].includes(status) && (
            <>
              <button
                onClick={() => setActiveTab('checkout')}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700"
              >
                🚗 Check-Out
              </button>
              <button
                onClick={() => setActiveTab('checkin')}
                className="rounded-xl bg-cyan-600 px-3 py-2 text-xs font-black text-white hover:bg-cyan-700"
              >
                🏁 Check-In
              </button>
              <button
                onClick={() => { setActiveTab('payments'); setTimeout(() => { setPaymentError(null); setPaymentDrawerOpen(true); }, 100); }}
                className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white hover:bg-violet-700"
              >
                💳 Ajouter paiement
              </button>
              <button
                onClick={() => setActiveTab('invoices')}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
              >
                🧾 Générer facture
              </button>
              <button
                onClick={() => cancelM.mutate()}
                disabled={cancelM.isPending}
                className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-black text-rose-600 hover:bg-rose-50 disabled:opacity-50 ml-auto"
              >
                ✕ Annuler réservation
              </button>
            </>
          )}
          {status === 'cancelled' && !deleteConfirm && (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-black text-white hover:bg-rose-700"
            >
              Supprimer
            </button>
          )}
          {status === 'cancelled' && deleteConfirm && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs font-bold text-rose-600">Confirmer la suppression ?</span>
              <button
                onClick={() => deleteM.mutate()}
                disabled={deleteM.isPending}
                className="rounded-xl bg-rose-700 px-3 py-2 text-xs font-black text-white hover:bg-rose-800 disabled:opacity-50"
              >
                {deleteM.isPending ? 'Suppression…' : 'Oui, supprimer'}
              </button>
              <button
                onClick={() => setDeleteConfirm(false)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
              >
                Annuler
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════
          TABS
         ══════════════════════════════════════════════════════════════ */}
      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        {/* Tab bar */}
        <div className="flex flex-wrap gap-0 border-b border-slate-100 bg-slate-50/60 overflow-x-auto" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-4 py-3 text-xs font-black whitespace-nowrap transition-colors border-b-2 ${
                activeTab === t.id
                  ? 'border-indigo-600 text-indigo-700 bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/60'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-6">
          <Suspense fallback={<TabFallback />}>
            {activeTab === 'summary'    && <TabSummary data={d} />}
            {activeTab === 'missions'   && <TabMissions missions={d?.missions ?? []} reservation={r} />}
            {activeTab === 'drivers'    && <TabDrivers reservationId={rid!} drivers={d?.drivers ?? []} onRefresh={invalidate} />}
            {activeTab === 'contract'   && <TabContract reservation={r} />}
            {activeTab === 'checkout'   && <TabCheckOut reservationId={rid!} reports={d?.handover_reports ?? []} onRefresh={invalidate} />}
            {activeTab === 'checkin'    && <TabCheckIn reservationId={rid!} reports={d?.handover_reports ?? []} onRefresh={invalidate} />}
            {activeTab === 'extensions' && <TabExtensions reservationId={rid!} extensions={d?.extensions ?? []} onRefresh={invalidate} />}
            {activeTab === 'damages'    && <TabDamages reservationId={rid!} damages={d?.damage_reports ?? []} onRefresh={invalidate} />}
            {activeTab === 'payments'   && <TabPayments data={d} onAddPayment={() => { setPaymentError(null); setPaymentDrawerOpen(true); }} />}
            {activeTab === 'invoices'   && <TabInvoices reservationId={rid!} invoices={d?.invoices ?? []} data={d} onRefresh={invalidate} />}
            {activeTab === 'history'    && <TabHistory history={d?.history ?? []} />}
          </Suspense>
        </div>
      </div>

      {/* ── Payment creation drawer ── */}
      <DrawerPanel
        open={paymentDrawerOpen}
        title="Nouveau paiement client"
        onClose={() => setPaymentDrawerOpen(false)}
      >
        <PaymentForm
          submitting={paymentM.isPending}
          error={paymentError}
          onCancel={() => setPaymentDrawerOpen(false)}
          onSubmit={(p) => {
            setPaymentError(null);
            paymentM.mutate(p);
          }}
          initialValues={{
            customer_id: r?.customer_id ?? '',
            reservation_id: rid ?? '',
          }}
        />
      </DrawerPanel>

      {/* ── Vehicle swap modal ── */}
      {swapOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setSwapOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-sm font-black text-slate-900">🔁 Changer de véhicule</h3>
            <p className="mb-4 text-xs text-slate-500">
              Véhicule actuel : <span className="font-bold text-slate-700">{d?.vehicle_name ?? '—'}</span> ({d?.vehicle_registration ?? '—'})
            </p>

            {/* Mode toggle */}
            <div className="mb-4 flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={swapMode === 'instant'} onChange={() => setSwapMode('instant')} className="accent-indigo-600" />
                <div>
                  <div className="text-xs font-black text-slate-800">Changement immédiat</div>
                  <div className="text-[10px] text-slate-500">Approuver et appliquer maintenant</div>
                </div>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={swapMode === 'request'} onChange={() => setSwapMode('request')} className="accent-amber-600" />
                <div>
                  <div className="text-xs font-black text-slate-800">Demande (approbation requise)</div>
                  <div className="text-[10px] text-slate-500">En attente de validation</div>
                </div>
              </label>
            </div>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[10px] font-bold text-slate-400">Nouveau véhicule *</label>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  value={swapVehicleId}
                  onChange={(e) => setSwapVehicleId(e.target.value)}
                >
                  <option value="">— Sélectionner un véhicule —</option>
                  {(vehiclesQ.data ?? [])
                    .filter((v: any) => v.id !== r?.vehicle_id)
                    .map((v: any) => {
                      const brand = v.brand?.name ?? v.brand_name ?? '';
                      const model = v.model?.model_name ?? v.model?.name ?? v.model_name ?? '';
                      const reg = v.registration_number ?? v.registration ?? '';
                      return (
                        <option key={v.id} value={v.id}>
                          {brand} {model} · {reg} {v.availability_status === 'available' ? '✓' : `(${v.availability_status})`}
                        </option>
                      );
                    })}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold text-slate-400">Motif (optionnel)</label>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  placeholder="Ex: panne, demande client, upgrade…"
                  value={swapReason}
                  onChange={(e) => setSwapReason(e.target.value)}
                />
              </div>
            </div>

            {swapError && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
                {swapError}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setSwapOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600">Annuler</button>
              <button
                onClick={() => swapMode === 'instant' ? swapInstantM.mutate() : swapRequestM.mutate()}
                disabled={!swapVehicleId || swapInstantM.isPending || swapRequestM.isPending}
                className={`rounded-xl px-5 py-2.5 text-xs font-black text-white disabled:opacity-50 ${swapMode === 'instant' ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-amber-600 hover:bg-amber-700'}`}
              >
                {(swapInstantM.isPending || swapRequestM.isPending)
                  ? 'Traitement…'
                  : swapMode === 'instant' ? 'Appliquer le changement' : 'Envoyer la demande'}
              </button>
            </div>

            {/* Swap history */}
            {(swapsQ.data ?? []).length > 0 && (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Historique des changements</div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {(swapsQ.data ?? []).map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <div>
                        <span className="font-bold text-slate-700">
                          {s.old_vehicle?.brand?.name ?? ''} {s.old_vehicle?.model?.model_name ?? s.old_vehicle?.model?.name ?? ''}
                        </span>
                        <span className="mx-1 text-slate-400">→</span>
                        <span className="font-bold text-slate-900">
                          {s.new_vehicle?.brand?.name ?? ''} {s.new_vehicle?.model?.model_name ?? s.new_vehicle?.model?.name ?? ''}
                        </span>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${s.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : s.status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                        {s.status === 'approved' ? 'Validé' : s.status === 'rejected' ? 'Refusé' : 'En attente'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Missions tab with timeline
// ---------------------------------------------------------------------------
const MISSION_STATUS_FR: Record<string, string> = { planned: 'Planifiée', in_progress: 'En cours', completed: 'Terminée', failed: 'Échouée' };
const MISSION_TYPE_FR: Record<string, string> = { delivery: 'Livraison', pickup: 'Récupération' };

const TabMissions: React.FC<{ missions: MissionRow[]; reservation: Record<string, unknown> | null }> = ({ missions, reservation }) => {
  if (!missions.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-4xl mb-3 text-slate-300">—</div>
        <div className="text-sm font-bold text-slate-500">Aucune mission créée</div>
        <div className="text-xs text-slate-400 mt-1">Utilisez le bouton « + Mission » sur la liste des réservations</div>
      </div>
    );
  }

  const FLOW_STEPS = [
    { key: 'reserved', label: 'Réservé' },
    { key: 'mission_delivery', label: 'Livraison' },
    { key: 'active', label: 'En cours' },
    { key: 'mission_pickup', label: 'Récupération' },
    { key: 'closed', label: 'Clôturé' },
  ];

  const resStatus = String(reservation?.status ?? 'draft');
  const deliveryMission = missions.find((m) => m.mission_type === 'delivery');
  const pickupMission = missions.find((m) => m.mission_type === 'pickup');

  const stepDone = (key: string) => {
    if (key === 'reserved') return resStatus !== 'draft';
    if (key === 'mission_delivery') return deliveryMission?.status === 'completed';
    if (key === 'active') return ['active', 'extension_requested', 'return_scheduled', 'returned', 'inspection_pending', 'damage_pending', 'billing_pending', 'closed'].includes(resStatus);
    if (key === 'mission_pickup') return pickupMission?.status === 'completed';
    if (key === 'closed') return resStatus === 'closed';
    return false;
  };
  const stepActive = (key: string) => {
    if (key === 'mission_delivery') return deliveryMission?.status === 'in_progress';
    if (key === 'mission_pickup') return pickupMission?.status === 'in_progress';
    if (key === 'active') return resStatus === 'active';
    return false;
  };

  return (
    <div className="space-y-6">
      {/* Timeline */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Timeline</div>
        <div className="flex items-center justify-between">
          {FLOW_STEPS.map((step, i) => {
            const done = stepDone(step.key);
            const active = stepActive(step.key);
            return (
              <React.Fragment key={step.key}>
                {i > 0 && <div className={`flex-1 h-0.5 mx-1 ${done ? 'bg-emerald-400' : active ? 'bg-indigo-300' : 'bg-slate-200'}`} />}
                <div className="flex flex-col items-center gap-1">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${done ? 'bg-emerald-500 text-white' : active ? 'bg-indigo-500 text-white ring-4 ring-indigo-100' : 'bg-slate-100 text-slate-400'}`}>
                    {done ? 'OK' : i + 1}
                  </div>
                  <span className={`text-[10px] font-bold ${done ? 'text-emerald-600' : active ? 'text-indigo-600' : 'text-slate-400'}`}>{step.label}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Mission cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {missions.map((m) => (
          <div key={m.id} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-black ${m.mission_type === 'pickup' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>{m.mission_type === 'pickup' ? 'R' : 'L'}</span>
                <span className="text-sm font-black text-slate-800">{MISSION_TYPE_FR[m.mission_type] ?? m.mission_type}</span>
              </div>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black ${m.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : m.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : m.status === 'failed' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                {MISSION_STATUS_FR[m.status] ?? m.status}
              </span>
            </div>
            {m.mission_number && <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{m.mission_number}</div>}
            <div className="grid grid-cols-2 gap-2 text-xs">
              {m.scheduled_start_at && (
                <div><span className="text-slate-400">Prévu</span><div className="font-bold text-slate-700">{new Date(m.scheduled_start_at).toLocaleString('fr-MA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div>
              )}
              {m.actual_start_at && (
                <div><span className="text-slate-400">Début réel</span><div className="font-bold text-slate-700">{new Date(m.actual_start_at).toLocaleString('fr-MA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div>
              )}
              {m.actual_end_at && (
                <div><span className="text-slate-400">Fin réelle</span><div className="font-bold text-emerald-700">{new Date(m.actual_end_at).toLocaleString('fr-MA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div></div>
              )}
            </div>
            {m.assigned_agent && (
              <div className="flex items-center gap-2 text-xs">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-black text-indigo-600">
                  {(m.assigned_agent.name?.[0] ?? m.assigned_agent.first_name?.[0] ?? '?').toUpperCase()}
                </span>
                <span className="font-bold text-slate-700">{m.assigned_agent.name || `${m.assigned_agent.first_name ?? ''} ${m.assigned_agent.last_name ?? ''}`.trim()}</span>
              </div>
            )}
            {(m.origin_address || m.destination_address) && (
              <div className="space-y-1">
                {m.origin_address && (
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="text-slate-400 font-bold">De :</span>
                    <span className="text-slate-600">{m.origin_address}</span>
                    <a href={`https://www.google.com/maps/search/${encodeURIComponent(m.origin_address)}`} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-700 font-bold" title="Voir sur la carte">Carte</a>
                  </div>
                )}
                {m.destination_address && (
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="text-slate-400 font-bold">À :</span>
                    <span className="text-slate-600">{m.destination_address}</span>
                    <a href={`https://www.google.com/maps/search/${encodeURIComponent(m.destination_address)}`} target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-700 font-bold" title="Voir sur la carte">Carte</a>
                  </div>
                )}
                {m.origin_address && m.destination_address && (
                  <a href={`https://www.google.com/maps/dir/${encodeURIComponent(m.origin_address)}/${encodeURIComponent(m.destination_address)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2 py-1 text-[10px] font-bold text-indigo-600 hover:bg-indigo-100 transition">
                    Itinéraire Google Maps
                  </a>
                )}
              </div>
            )}
            {m.notes && <div className="text-[10px] text-slate-500 italic">{m.notes}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

type MissionRow = {
  id: string;
  mission_number?: string;
  mission_type: string;
  status: string;
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
  actual_start_at?: string | null;
  actual_end_at?: string | null;
  origin_address?: string | null;
  destination_address?: string | null;
  notes?: string | null;
  assigned_user_id?: string | null;
  assigned_agent?: { id: string; name?: string; first_name?: string; last_name?: string; email?: string } | null;
};
