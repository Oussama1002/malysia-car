import React, { lazy, Suspense, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { opsApi } from '@/services/opsApi';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';

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
  { id: 'summary',    label: 'Résumé',       icon: '📊' },
  { id: 'drivers',    label: 'Conducteurs',   icon: '👤' },
  { id: 'contract',   label: 'Contrat',       icon: '📄' },
  { id: 'checkout',   label: 'Check-Out',     icon: '🚗' },
  { id: 'checkin',    label: 'Check-In',      icon: '🏁' },
  { id: 'extensions', label: 'Prolongations',  icon: '⏰' },
  { id: 'damages',    label: 'Dommages',      icon: '⚠️' },
  { id: 'payments',   label: 'Paiements',     icon: '💳' },
  { id: 'invoices',   label: 'Factures',      icon: '🧾' },
  { id: 'history',    label: 'Historique',     icon: '📜' },
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

  const confirmM = useMutation({
    mutationFn: () => opsApi.confirmReservation(rid!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservation', rid] }),
  });
  const cancelM = useMutation({
    mutationFn: () => opsApi.cancelReservation(rid!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservation', rid] }),
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
            <StatusBadge
              label={STATUS_FR[status] ?? status}
              tone={statusTone(status)}
            />
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

        {/* Quick actions bar */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-6 py-3 bg-slate-50/50">
          {!['cancelled', 'closed'].includes(status) && (
            <Link
              to={`/contracts/new?from_reservation=${rid}`}
              className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-black text-white hover:bg-amber-700 transition-colors"
            >
              📄 Générer contrat
            </Link>
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
                onClick={() => setActiveTab('payments')}
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
              <span className="mr-1.5">{t.icon}</span>{t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-6">
          <Suspense fallback={<TabFallback />}>
            {activeTab === 'summary'    && <TabSummary data={d} />}
            {activeTab === 'drivers'    && <TabDrivers reservationId={rid!} drivers={d?.drivers ?? []} onRefresh={invalidate} />}
            {activeTab === 'contract'   && <TabContract reservation={r} />}
            {activeTab === 'checkout'   && <TabCheckOut reservationId={rid!} reports={d?.handover_reports ?? []} onRefresh={invalidate} />}
            {activeTab === 'checkin'    && <TabCheckIn reservationId={rid!} reports={d?.handover_reports ?? []} onRefresh={invalidate} />}
            {activeTab === 'extensions' && <TabExtensions reservationId={rid!} extensions={d?.extensions ?? []} onRefresh={invalidate} />}
            {activeTab === 'damages'    && <TabDamages reservationId={rid!} damages={d?.damage_reports ?? []} onRefresh={invalidate} />}
            {activeTab === 'payments'   && <TabPayments data={d} />}
            {activeTab === 'invoices'   && <TabInvoices reservationId={rid!} invoices={d?.invoices ?? []} data={d} onRefresh={invalidate} />}
            {activeTab === 'history'    && <TabHistory history={d?.history ?? []} />}
          </Suspense>
        </div>
      </div>
    </div>
  );
};
