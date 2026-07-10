import React, { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { opsApi } from '@/services/opsApi';
import { ApiError } from '@/services/apiError';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { PaymentForm } from '@/modules/finance/PaymentsPage';
import { createPayment, type PaymentCreatePayload } from '@/services/financeApi';
import { VehicleSwapWizard } from '@/modules/rentals/VehicleSwapWizard';

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
  const [validateError, setValidateError] = useState<string | null>(null);
  const [swapWizardOpen, setSwapWizardOpen] = useState(false);

  const detailQ = useQuery({
    queryKey: ['reservation', rid],
    queryFn: () => opsApi.reservation(rid!),
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
    onSuccess: () => {
      setValidateError(null);
      qc.invalidateQueries({ queryKey: ['reservation', rid] });
      qc.invalidateQueries({ queryKey: ['reservations'] });
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.body && typeof e.body === 'object') {
        const body = e.body as any;
        const parts = body.errors?.vehicle_id ?? [];
        setValidateError(parts.length > 0 ? parts.join(' ') : body.message ?? e.message);
      } else {
        setValidateError(e instanceof Error ? e.message : 'Erreur lors de la validation');
      }
    },
  });
  const confirmM = useMutation({
    mutationFn: () => opsApi.confirmReservation(rid!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservation', rid] }),
  });
  const cancelM = useMutation({
    mutationFn: () => opsApi.cancelReservation(rid!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservation', rid] }),
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

        {/* Info cards — roomy grid so labels/values are fully readable */}
        <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { label: 'Client', value: d?.customer_name ?? '—' },
            {
              label: 'Véhicule',
              value: (() => {
                const candidates = (r.candidate_vehicle_ids ?? []) as string[];
                if (status === 'draft' && candidates.length > 1) {
                  return `${d?.vehicle_name ?? '—'} (+${candidates.length - 1} autre${candidates.length > 2 ? 's' : ''})`;
                }
                return d?.vehicle_name ?? '—';
              })(),
            },
            { label: 'Immatriculation', value: d?.vehicle_registration ?? '—' },
            { label: 'Début', value: fmtDate(r.desired_start_at) },
            { label: 'Fin', value: fmtDate(r.desired_end_at) },
            { label: 'Total', value: fmtMad(grandTotal) },
            { label: 'Solde', value: fmtMad(balance), highlight: balance > 0 },
          ].map((c, i) => (
            <div key={i} className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/60 px-5 py-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{c.label}</div>
              <div className={`mt-1.5 text-base font-black leading-snug break-words ${(c as { highlight?: boolean }).highlight ? 'text-rose-600' : 'text-slate-800'}`}>
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
              onClick={() => { setValidateError(null); validateM.mutate(); }}
              disabled={validateM.isPending}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50 shadow-lg"
            >
              {validateM.isPending ? 'Validation…' : '✓ Valider la réservation'}
            </button>
          </div>
        )}
        {validateError && (
          <div className="border-t border-rose-200 bg-rose-50 px-6 py-3 text-sm text-rose-800">
            <span className="font-black">Erreur de validation :</span> {validateError}
          </div>
        )}

        {/* No contract banner */}
        {!['cancelled', 'closed', 'draft'].includes(status) && d && !d.has_contract && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-200 bg-amber-50 px-6 py-3">
            <div className="flex items-center gap-2">
              <div>
                <div className="text-xs font-black text-amber-800">Aucun contrat associé</div>
                <div className="text-[10px] text-amber-600">Cette réservation n'a pas encore de contrat. Générez un contrat pour formaliser la location.</div>
              </div>
            </div>
            <Link
              to={`/contracts/new?from_reservation=${rid}`}
              className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-black text-white hover:bg-amber-700 shadow-lg transition-colors"
            >
              Générer contrat
            </Link>
          </div>
        )}

        {/* Quick actions bar */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-6 py-3 bg-slate-50/50">
          {status === 'draft' && (
            <button
              onClick={() => { setValidateError(null); validateM.mutate(); }}
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
              Générer contrat
            </Link>
          )}
          {!['cancelled', 'closed', 'draft'].includes(status) && (
            <button
              onClick={() => setSwapWizardOpen(true)}
              className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-black text-white hover:bg-slate-900"
            >
              Changer de véhicule
            </button>
          )}
          {status === 'reserved' && (
            <button
              onClick={() => confirmM.mutate()}
              disabled={confirmM.isPending}
              className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              Confirmer
            </button>
          )}
          {!['cancelled', 'closed'].includes(status) && (
            <>
              <button
                onClick={() => setActiveTab('checkout')}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-700"
              >
                Check-Out
              </button>
              <button
                onClick={() => setActiveTab('checkin')}
                className="rounded-xl bg-cyan-600 px-3 py-2 text-xs font-black text-white hover:bg-cyan-700"
              >
                Check-In
              </button>
              <button
                onClick={() => { setActiveTab('payments'); setTimeout(() => { setPaymentError(null); setPaymentDrawerOpen(true); }, 100); }}
                className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white hover:bg-violet-700"
              >
                Ajouter paiement
              </button>
              <button
                onClick={() => setActiveTab('invoices')}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
              >
                Générer facture
              </button>
              <button
                onClick={() => cancelM.mutate()}
                disabled={cancelM.isPending}
                className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-black text-rose-600 hover:bg-rose-50 disabled:opacity-50"
              >
                Annuler réservation
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
            {activeTab === 'drivers'    && <TabDrivers reservationId={rid!} drivers={d?.drivers ?? []} onRefresh={invalidate} />}
            {activeTab === 'contract'   && <TabContract reservation={r} detail={d} />}
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

      <VehicleSwapWizard
        open={swapWizardOpen}
        onClose={() => setSwapWizardOpen(false)}
        source={rid ? { type: 'reservation', id: rid } : null}
        reservation={r}
        currentVehicle={null}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ['reservation', rid] });
        }}
      />
    </div>
  );
};
