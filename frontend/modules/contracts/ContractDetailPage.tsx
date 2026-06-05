import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/queryKeys';
import { Timeline } from '@/modules/shared/components/Timeline';
import { formatCurrencyMad, formatDate } from '@/modules/shared/formatters';
import { TabsSection } from '@/modules/shared/components/TabsSection';
import { contractsApi } from '@/services/contractsApi';
import { contractSignatureApi, type SignatureRequestStatus } from '@/services/contractSignatureApi';
import { ApiError, apiClient, endpoints } from '@/services/apiClient';
import { GeneratePdfButton } from '@/modules/shared/components/GeneratePdfButton';
import { EntityAuditTimeline } from '@/modules/shared/components/EntityAuditTimeline';
import { EntityDocuments } from '@/modules/shared/components/EntityDocuments';
import { walletApi } from '@/services/walletApi';
import { createPortal } from 'react-dom';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Add N months to an ISO date string → ISO date string */
function addMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

/** Return a short professional ID label from a raw UUID + prefix */
function shortId(raw: string | number | undefined | null, prefix: string): string {
  if (!raw) return '—';
  const hex = String(raw).replace(/-/g, '').slice(0, 8).toUpperCase();
  return `${prefix}-${hex}`;
}

/** French labels for contract statuses */
const STATUS_FR: Record<string, string> = {
  draft: 'Brouillon',
  pending: 'En attente',
  pending_approval: 'En attente d\'approbation',
  pending_created: 'Créé · en attente',
  pending_signature: 'En attente de signature',
  approved: 'Approuvé',
  active: 'Actif',
  signed: 'Signé',
  sent_for_signature: 'Envoyé pour signature',
  terminated: 'Résilié',
  expired: 'Expiré',
  cancelled: 'Annulé',
  closed: 'Clôturé',
  suspended: 'Suspendu',
  completed: 'Terminé',
  rejected: 'Rejeté',
};

const ACTION_FR: Record<string, string> = {
  created:              'Création',
  updated:              'Modification',
  deleted:              'Suppression',
  status_changed:       'Changement de statut',
  approved:             'Approbation',
  rejected:             'Rejet',
  activated:            'Activation',
  terminated:           'Résiliation',
  signed:               'Signature',
  sent_for_signature:   'Envoi pour signature',
  schedule_generated:   'Échéancier généré',
  pdf_generated:        'PDF généré',
  payment_recorded:     'Paiement enregistré',
  confirmed:            'Confirmation',
  cancelled:            'Annulation',
  handed_over:          'Remise véhicule',
  returned:             'Retour véhicule',
  extended:             'Prolongation',
  damage_reported:      'Dommage signalé',
  billing_closed:       'Facturation clôturée',
};

const PAYMENT_METHOD_FR: Record<string, string> = {
  virement:      'Virement bancaire',
  bank_transfer: 'Virement bancaire',
  cheque:        'Chèque',
  espece:        'Espèce',
  cash:          'Espèce',
  carte:         'Carte bancaire',
  card:          'Carte bancaire',
  autre:         'Autre',
  other:         'Autre',
};

/** French labels for installment statuses */
const INSTALLMENT_STATUS_FR: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'En attente',  cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  paid:      { label: 'Payé',        cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  overdue:   { label: 'En retard',   cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  cancelled: { label: 'Annulé',      cls: 'bg-slate-100 text-slate-500 border-slate-200' },
  partial:   { label: 'Partiel',     cls: 'bg-blue-50 text-blue-700 border-blue-200' },
};

// ── main component ────────────────────────────────────────────────────────────

export const ContractDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const cid = id ?? '';
  const [tab, setTab] = useState('details');
  const [showEarlyReturn, setShowEarlyReturn] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: queryKeys.contracts.one(cid),
    queryFn: async () => contractsApi.get(cid),
    enabled: !!cid,
  });

  const c = q.data?.contract ?? null;
  const history = q.data?.history ?? [];

  // Resolve raw IDs → names by fetching customer + vehicle
  const raw = c as any;
  const customerId: string | null = raw?.customerId ?? raw?.customer_id ?? null;
  const vehicleId: string | null   = raw?.vehicleId  ?? raw?.vehicle_id  ?? null;

  const customerQ = useQuery({
    queryKey: ['customer-brief', customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const res = await apiClient<{ data: any }>(endpoints.customers.one(customerId!));
      return res.data;
    },
  });

  const vehicleQ = useQuery({
    queryKey: ['vehicle-brief', vehicleId],
    enabled: !!vehicleId,
    queryFn: async () => {
      const res = await apiClient<{ data: any }>(endpoints.fleet.one(vehicleId!));
      return res.data;
    },
  });

  const clientName: string = customerQ.data
    ? (customerQ.data.display_name ?? customerQ.data.name ?? shortId(customerId, 'CLT'))
    : shortId(customerId, 'CLT');

  const vehicleName: string = vehicleQ.data
    ? [vehicleQ.data.brand?.name ?? vehicleQ.data.brand, vehicleQ.data.model?.name ?? vehicleQ.data.model, vehicleQ.data.plate ?? vehicleQ.data.registration]
        .filter(Boolean).join(' ')
    : shortId(vehicleId, 'VHL');

  // Compute end date if missing: startDate + duration_months
  const durationMonths: number | null = raw?.durationMonths ?? raw?.duration_months ?? null;
  const startDate: string | null = raw?.startDate ?? raw?.start_date ?? null;
  const endDate: string | null   = raw?.endDate   ?? raw?.end_date   ?? null;
  const computedEndDate: string | null =
    endDate ?? (startDate && durationMonths ? addMonths(startDate, durationMonths) : null);

  if (!cid) return <div className="text-sm text-slate-600">Identifiant invalide.</div>;
  if (q.isLoading) return <div className="text-sm text-slate-500">Chargement…</div>;
  if (!c) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8">
        <p className="font-bold">Contrat introuvable.</p>
        <Link className="mt-3 inline-block text-sm font-semibold text-indigo-600" to="/contracts">
          ← Retour
        </Link>
      </div>
    );
  }

  const statusLabel = STATUS_FR[c.status] ?? c.status;

  return (
    <div className="space-y-6">
      <Link to="/contracts" className="text-sm font-semibold text-indigo-600">
        ← Contrats
      </Link>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">
            {c.reference ?? shortId(c.id, 'CTR')}
          </h1>
          <p className="text-sm text-slate-500">
            {c.type} •{' '}
            <span className="font-semibold">{statusLabel}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-right">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Montant</div>
            <div className="text-2xl font-black text-indigo-700">{formatCurrencyMad((raw?.baseAmount ?? raw?.amountMad ?? raw?.base_amount ?? 0) as number)}</div>
          </div>
          <GeneratePdfButton kind="contract" entityId={String(c.id ?? id)} />
          {/* Early return button — only for active contracts with a future end date */}
          {(c.status === 'active' || c.status === 'approved') && computedEndDate && (
            <button
              type="button"
              onClick={() => setShowEarlyReturn(true)}
              className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 hover:bg-amber-100 transition-colors"
            >
              ↩ Retour anticipé
            </button>
          )}
        </div>
      </div>

      <TabsSection
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'details',   label: 'Détails' },
          { id: 'schedule',  label: 'Échéancier' },
          { id: 'documents', label: 'Documents' },
          { id: 'signature', label: 'Signature' },
          { id: 'payments',  label: 'Paiements' },
          { id: 'legal',     label: 'Contentieux' },
          { id: 'history',   label: 'Historique' },
          { id: 'actions',   label: 'Actions' },
        ]}
      />

      {/* ── DÉTAILS ───────────────────────────────────────────────────────── */}
      {tab === 'details' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Période */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400">Période</div>
            <div className="mt-2 text-sm font-semibold text-slate-800">
              {startDate ? formatDate(startDate) : '—'}
              {' → '}
              {computedEndDate ? formatDate(computedEndDate) : '—'}
            </div>
            {durationMonths && (
              <div className="mt-1 text-xs text-slate-500">{durationMonths} mois</div>
            )}
          </div>

          {/* Parties / véhicule */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400">Parties / véhicule</div>
            <div className="mt-2 space-y-1 text-sm text-slate-700">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Client</span>
                {customerId ? (
                  <Link
                    to={`/customers/${customerId}`}
                    className="font-semibold text-indigo-700 hover:underline"
                  >
                    {clientName}
                  </Link>
                ) : (
                  <span className="font-semibold">—</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Véhicule</span>
                {vehicleId ? (
                  <Link
                    to={`/fleet/${vehicleId}`}
                    className="font-semibold text-indigo-700 hover:underline"
                  >
                    {vehicleName}
                  </Link>
                ) : (
                  <span className="font-semibold">—</span>
                )}
              </div>
            </div>
          </div>

          {/* Paiement */}
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm md:col-span-2">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400">Paiement</div>
            <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-slate-700 md:grid-cols-2">
              <div><span className="text-slate-500">Mode:</span> {PAYMENT_METHOD_FR[c.paymentMethod ?? ''] ?? c.paymentMethod ?? '—'}</div>
              <div><span className="text-slate-500">Échéance jour:</span> {c.expectedPaymentDay ?? '—'}</div>
              <div className="md:col-span-2"><span className="text-slate-500">Conditions:</span> {c.paymentTerms ?? '—'}</div>
              <div><span className="text-slate-500">Réf. virement:</span> {c.bankReference ?? '—'}</div>
              <div><span className="text-slate-500">N° chèque:</span> {c.chequeNumber ?? '—'}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── ÉCHÉANCIER ────────────────────────────────────────────────────── */}
      {tab === 'schedule' && <ScheduleTab contractId={String(c.id ?? id)} />}

      {/* ── DOCUMENTS ────────────────────────────────────────────────────── */}
      {tab === 'documents' && (
        <div className="space-y-6">
          <EntityDocuments entityType="contract" entityId={String(c.id ?? id)} title="Documents du contrat" />
          {customerId && (
            <EntityDocuments entityType="customer" entityId={customerId} title="Documents du client (CIN, Permis, etc.)" />
          )}
        </div>
      )}

      {/* ── SIGNATURE ────────────────────────────────────────────────────── */}
      {tab === 'signature' && <SignatureTab contractId={String(c.id ?? id)} />}

      {/* ── PAIEMENTS ────────────────────────────────────────────────────── */}
      {tab === 'payments' && <PaymentsTab contractId={String(c.id ?? id)} />}

      {/* ── CONTENTIEUX ──────────────────────────────────────────────────── */}
      {tab === 'legal' && <LegalTab />}

      {/* ── HISTORIQUE ───────────────────────────────────────────────────── */}
      {tab === 'history' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-3 text-sm font-black text-slate-900">Audit & traçabilité</div>
            <EntityAuditTimeline entityType="contract" entityId={String(c.id ?? id)} />
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="mb-3 text-sm font-black text-slate-900">Historique métier</div>
            <Timeline
              items={(history.length ? history : [{ id: 'mock', action: 'created', at: c.createdAt }]).map((h: any) => ({
                id: String(h.id ?? h.at),
                title: ACTION_FR[h.action] ?? String(h.action ?? 'event'),
                at: String(h.at ?? c.createdAt),
                meta: h.from_status || h.to_status ? `${STATUS_FR[h.from_status] ?? h.from_status ?? '—'} → ${STATUS_FR[h.to_status] ?? h.to_status ?? '—'}` : undefined,
                tone: h.action === 'activated' ? 'success' : h.action === 'terminated' ? 'danger' : 'info',
              }))}
            />
          </div>
        </div>
      )}

      {/* ── ACTIONS ─────────────────────────────────────────────────────── */}
      {tab === 'actions' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
            <div className="text-sm font-black text-rose-700">Zone dangereuse</div>
            <p className="mt-2 text-sm text-slate-600">
              La suppression d'un contrat est irréversible. Les échéances et l'historique associés seront également supprimés.
            </p>
            {deleteError && (
              <div className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{deleteError}</div>
            )}
            {!deleteConfirm ? (
              <button
                type="button"
                className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-5 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-100 transition-colors"
                onClick={() => setDeleteConfirm(true)}
              >
                Supprimer ce contrat
              </button>
            ) : (
              <div className="mt-4 flex items-center gap-3">
                <span className="text-sm font-semibold text-rose-700">Confirmer la suppression ?</span>
                <button
                  type="button"
                  className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                  disabled={deleteLoading}
                  onClick={async () => {
                    setDeleteLoading(true);
                    setDeleteError(null);
                    try {
                      await contractsApi.destroy(cid);
                      navigate('/contracts');
                    } catch (e) {
                      setDeleteError(e instanceof ApiError ? e.message : 'Erreur lors de la suppression');
                      setDeleteConfirm(false);
                    } finally {
                      setDeleteLoading(false);
                    }
                  }}
                >
                  {deleteLoading ? 'Suppression...' : 'Oui, supprimer'}
                </button>
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
                  onClick={() => setDeleteConfirm(false)}
                >
                  Annuler
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── EARLY RETURN MODAL ───────────────────────────────────────────── */}
      {showEarlyReturn && customerId && (
        <EarlyReturnModal
          contractId={String(c.id ?? id)}
          customerId={customerId}
          contractNumber={raw?.contract_number ?? c.reference}
          plannedEndDate={computedEndDate}
          onClose={() => setShowEarlyReturn(false)}
          onDone={() => {
            setShowEarlyReturn(false);
            q.refetch();
          }}
        />
      )}
    </div>
  );
};

// ── Échéancier tab ─────────────────────────────────────────────────────────────
const ScheduleTab: React.FC<{ contractId: string }> = ({ contractId }) => {
  const q = useQuery({
    queryKey: ['contract-installments', contractId],
    queryFn: async () => contractsApi.installments(contractId),
  });

  const installments = (q.data ?? []) as any[];

  const totalDue  = installments.reduce((s, i) => s + Number(i.amount_due  ?? i.amountDue  ?? 0), 0);
  const totalPaid = installments.reduce((s, i) => s + Number(i.amount_paid ?? i.amountPaid ?? 0), 0);
  const remaining = totalDue - totalPaid;

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard label="Total dû" value={formatCurrencyMad(totalDue)} tone="neutral" />
        <SummaryCard label="Total payé" value={formatCurrencyMad(totalPaid)} tone="success" />
        <SummaryCard label="Reste à payer" value={formatCurrencyMad(remaining)} tone={remaining > 0 ? 'warn' : 'success'} />
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <div className="text-sm font-black text-slate-900">Tableau de bord des échéances</div>
        </div>
        {q.isLoading ? (
          <div className="p-6 text-sm text-slate-500">Chargement de l'échéancier…</div>
        ) : installments.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">Aucune échéance générée pour ce contrat.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-[11px] font-black uppercase tracking-wider text-slate-400">
                  <th className="px-5 py-3 text-left">#</th>
                  <th className="px-5 py-3 text-left">Date échéance</th>
                  <th className="px-5 py-3 text-right">Montant dû</th>
                  <th className="px-5 py-3 text-right">Payé</th>
                  <th className="px-5 py-3 text-right">Reste</th>
                  <th className="px-5 py-3 text-left">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {installments.map((inst: any, idx: number) => {
                  const due    = Number(inst.amount_due  ?? inst.amountDue  ?? 0);
                  const paid   = Number(inst.amount_paid ?? inst.amountPaid ?? 0);
                  const rest   = due - paid;
                  const status = inst.status ?? (paid >= due ? 'paid' : new Date(inst.due_date ?? inst.dueDate ?? '') < new Date() ? 'overdue' : 'pending');
                  const s      = INSTALLMENT_STATUS_FR[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
                  return (
                    <tr key={inst.id ?? idx} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs text-slate-400">{idx + 1}</td>
                      <td className="px-5 py-3 font-semibold text-slate-700">
                        {inst.due_date ?? inst.dueDate ? formatDate(inst.due_date ?? inst.dueDate) : '—'}
                      </td>
                      <td className="px-5 py-3 text-right font-semibold text-slate-800">{formatCurrencyMad(due)}</td>
                      <td className="px-5 py-3 text-right text-emerald-700 font-semibold">{formatCurrencyMad(paid)}</td>
                      <td className="px-5 py-3 text-right font-bold text-slate-700">{formatCurrencyMad(rest)}</td>
                      <td className="px-5 py-3">
                        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${s.cls}`}>{s.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ── Paiements tab ──────────────────────────────────────────────────────────────
const PaymentsTab: React.FC<{ contractId: string }> = ({ contractId }) => {
  const q = useQuery({
    queryKey: ['contract-installments-payments', contractId],
    queryFn: async () => contractsApi.installments(contractId),
  });

  const all = (q.data ?? []) as any[];
  const paid    = all.filter((i: any) => (i.status ?? '') === 'paid' || Number(i.amount_paid ?? i.amountPaid ?? 0) > 0);
  const pending = all.filter((i: any) => (i.status ?? '') !== 'paid' && Number(i.amount_paid ?? i.amountPaid ?? 0) === 0);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-4 text-sm font-black text-slate-900">Paiements reçus</div>
        {q.isLoading ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : paid.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun paiement enregistré pour ce contrat.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {paid.map((inst: any, idx: number) => {
              const amount = Number(inst.amount_paid ?? inst.amountPaid ?? inst.amount_due ?? 0);
              const date   = inst.paid_at ?? inst.paidAt ?? inst.due_date ?? inst.dueDate;
              return (
                <li key={inst.id ?? idx} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800">Échéance {idx + 1}</div>
                      <div className="text-xs text-slate-500">{date ? formatDate(date) : '—'}</div>
                    </div>
                  </div>
                  <div className="font-black text-emerald-700">{formatCurrencyMad(amount)}</div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pending.length > 0 && (
        <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-6">
          <div className="mb-3 text-sm font-black text-amber-800">
            {pending.length} échéance{pending.length > 1 ? 's' : ''} en attente
          </div>
          <ul className="space-y-2">
            {pending.slice(0, 5).map((inst: any, idx: number) => {
              const due  = Number(inst.amount_due ?? inst.amountDue ?? 0);
              const date = inst.due_date ?? inst.dueDate;
              const overdue = date && new Date(date) < new Date();
              return (
                <li key={inst.id ?? idx} className="flex items-center justify-between text-sm">
                  <span className={`font-semibold ${overdue ? 'text-rose-700' : 'text-amber-800'}`}>
                    {date ? formatDate(date) : `Échéance ${idx + 1}`}
                    {overdue && ' · En retard'}
                  </span>
                  <span className="font-bold text-slate-800">{formatCurrencyMad(due)}</span>
                </li>
              );
            })}
            {pending.length > 5 && (
              <li className="text-xs text-slate-500">+ {pending.length - 5} autres…</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

// ── Contentieux tab ────────────────────────────────────────────────────────────
const LegalTab: React.FC = () => (
  <div className="space-y-4">
    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </div>
        <div>
          <div className="font-black text-slate-900">Aucun dossier contentieux</div>
          <p className="mt-1 text-sm text-slate-500">
            Ce contrat ne présente aucune procédure contentieuse active.
            Les litiges, impayés récurrents et mises en demeure apparaîtront ici si un dossier est ouvert.
          </p>
        </div>
      </div>
    </div>

    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="mb-4 text-sm font-black text-slate-900">Indicateurs de risque</div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm">
        <RiskCard label="Retards de paiement" value="0" icon="✅" />
        <RiskCard label="Litiges enregistrés" value="0" icon="✅" />
        <RiskCard label="Mises en demeure" value="0" icon="✅" />
      </div>
    </div>

    <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm opacity-60">
      <div className="mb-1 text-sm font-black text-slate-900">Ouvrir un dossier contentieux</div>
      <p className="text-sm text-slate-500 mb-4">Fonctionnalité disponible prochainement. Permet d'initier une procédure de recouvrement ou de résiliation pour faute.</p>
      <button disabled className="rounded-xl bg-slate-200 px-4 py-2 text-sm font-bold text-slate-500 cursor-not-allowed">
        Initier une procédure
      </button>
    </div>
  </div>
);

// ── small shared sub-components ────────────────────────────────────────────────
const SummaryCard: React.FC<{ label: string; value: string; tone: 'neutral' | 'success' | 'warn' }> = ({ label, value, tone }) => {
  const cls = tone === 'success' ? 'text-emerald-700' : tone === 'warn' ? 'text-amber-700' : 'text-slate-800';
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm text-center">
      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</div>
      <div className={`mt-1 text-lg font-black ${cls}`}>{value}</div>
    </div>
  );
};

const RiskCard: React.FC<{ label: string; value: string; icon: string }> = ({ label, value, icon }) => (
  <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
    <span className="text-lg">{icon}</span>
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-black text-slate-900">{value}</div>
    </div>
  </div>
);

// ── Signature tab: send for signature + track status ──────────────────────
const STATUS_LABEL: Record<SignatureRequestStatus, { label: string; cls: string }> = {
  sent_for_signature: { label: 'En attente de signature', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  signed:   { label: 'Signé',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Refusé',  cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  expired:  { label: 'Expiré',  cls: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const SignatureTab: React.FC<{ contractId: string }> = ({ contractId }) => {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);

  const q = useQuery({
    queryKey: ['contract-signature-requests', contractId],
    queryFn: async () => (await contractSignatureApi.list(contractId)).data,
  });

  const create = useMutation({
    mutationFn: () => contractSignatureApi.create(contractId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contract-signature-requests', contractId] }),
  });

  const requests = q.data ?? [];
  const latest = requests[0] ?? null;
  const live = latest && latest.status === 'sent_for_signature' ? latest : null;

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-sm font-black text-slate-900">Signature électronique</div>
          <p className="text-sm text-slate-500">
            Envoyez un lien sécurisé au client pour signer le contrat à distance.
          </p>
        </div>
        <button
          type="button"
          onClick={() => create.mutate()}
          disabled={create.isPending}
          className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-60"
        >
          {create.isPending ? 'Génération…' : live ? 'Renvoyer pour signature' : 'Envoyer pour signature'}
        </button>
      </div>

      {create.isError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {create.error instanceof ApiError ? create.error.message : 'Erreur lors de la création de la demande.'}
        </div>
      )}

      {/* Live signing link */}
      {live?.signing_url && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
          <div className="text-[11px] font-black uppercase tracking-widest text-indigo-500">Lien de signature</div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              readOnly
              value={live.signing_url}
              className="flex-1 rounded-xl border border-indigo-200 bg-white px-3 py-2 font-mono text-xs text-slate-700"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={() => copyLink(live.signing_url!)}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white hover:bg-indigo-700"
            >
              {copied ? 'Copié ✓' : 'Copier'}
            </button>
            <a
              href={live.signing_url}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-indigo-200 bg-white px-4 py-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
            >
              Ouvrir
            </a>
          </div>
          {live.expires_at && (
            <p className="mt-2 text-xs text-indigo-700/80">Expire le {formatDate(live.expires_at)}.</p>
          )}
        </div>
      )}

      {/* History of requests */}
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-3 text-sm font-black text-slate-900">Demandes de signature</div>
        {q.isLoading ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune demande pour ce contrat.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {requests.map((r) => {
              const s = STATUS_LABEL[r.status];
              return (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${s.cls}`}>{s.label}</span>
                    <span className="ml-2 font-semibold text-slate-700">{r.signer_name ?? '—'}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {r.status === 'signed' && r.signature?.signed_at
                      ? `Signé le ${formatDate(r.signature.signed_at)}${r.signature.ip_address ? ` · IP ${r.signature.ip_address}` : ''}`
                      : r.status === 'sent_for_signature' && r.expires_at
                      ? `Expire le ${formatDate(r.expires_at)}`
                      : r.sent_at
                      ? `Envoyé le ${formatDate(r.sent_at)}`
                      : ''}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

// ── Early Return Modal ─────────────────────────────────────────────────────────
const EarlyReturnModal: React.FC<{
  contractId: string;
  customerId: string;
  contractNumber: string;
  plannedEndDate: string | null;
  onClose: () => void;
  onDone: () => void;
}> = ({ contractId, customerId, contractNumber, plannedEndDate, onClose, onDone }) => {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ credit: number; balanceAfter: number } | null>(null);

  const previewQ = useQuery({
    queryKey: ['early-return-preview', contractId],
    queryFn: () => walletApi.previewEarlyReturn(customerId, contractId),
  });

  const preview = previewQ.data;

  const confirm = async () => {
    if (!reason.trim()) { setError('Le motif de retour anticipé est requis.'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await apiClient<any>(
        `/v1/contracts/${contractId}/terminate`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: reason.trim(), early_return: true }),
        },
      );
      const credit = res?.data?.early_return_credit;
      setSuccess({
        credit: credit?.amount ?? 0,
        balanceAfter: credit?.balance_after ?? 0,
      });
    } catch (e: any) {
      setError(e?.message ?? 'Erreur lors de la résiliation.');
    } finally {
      setBusy(false);
    }
  };

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <div className="font-black text-slate-900">Retour anticipé</div>
            <div className="text-xs text-slate-500">Contrat {contractNumber}</div>
          </div>
          <button onClick={onClose} className="rounded-xl p-2 hover:bg-slate-100 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {success ? (
            /* ── Success state ── */
            <div className="text-center space-y-4">
              <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-8 w-8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <div className="font-black text-slate-900 text-lg">Contrat résilié</div>
                <p className="text-sm text-slate-500 mt-1">Le retour anticipé a été enregistré avec succès.</p>
              </div>
              {success.credit > 0 ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="text-[11px] font-black uppercase tracking-widest text-emerald-500">Avoir crédité</div>
                  <div className="text-3xl font-black text-emerald-700 mt-1">{formatCurrencyMad(success.credit)}</div>
                  <div className="text-xs text-emerald-600 mt-1">
                    Nouveau solde portefeuille: <strong>{formatCurrencyMad(success.balanceAfter)}</strong>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    L'avoir est disponible immédiatement sur le portefeuille du client pour une prochaine réservation ou contrat.
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  Aucun avoir calculé (pas de jours restants ou loyer mensuel manquant).
                </div>
              )}
              <button onClick={onDone} className="df-btn df-btn--primary w-full">
                Fermer
              </button>
            </div>
          ) : (
            /* ── Confirmation form ── */
            <>
              {/* Preview */}
              {previewQ.isLoading ? (
                <div className="text-sm text-slate-500">Calcul de l'avoir en cours…</div>
              ) : preview ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                  <div className="text-[11px] font-black uppercase tracking-widest text-amber-500">Simulation avoir</div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-slate-500">Date prévue fin</div>
                      <div className="font-semibold text-slate-800">{preview.planned_end_date ? formatDate(preview.planned_end_date) : '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Retour aujourd'hui</div>
                      <div className="font-semibold text-slate-800">{formatDate(preview.return_date)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Jours non utilisés</div>
                      <div className="font-semibold text-slate-800">{preview.unused_days} jours</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500">Taux journalier</div>
                      <div className="font-semibold text-slate-800">{formatCurrencyMad(preview.daily_rate)}/j</div>
                    </div>
                  </div>
                  <div className="border-t border-amber-200 pt-3 flex items-center justify-between">
                    <span className="text-sm font-black text-amber-900">Avoir à créditer</span>
                    <span className="text-xl font-black text-emerald-700">{formatCurrencyMad(preview.credit_amount)}</span>
                  </div>
                  {preview.credit_amount === 0 && (
                    <p className="text-xs text-amber-700">Aucun avoir (retour après la date prévue ou loyer mensuel non renseigné).</p>
                  )}
                  <div className="text-xs text-slate-500">
                    Solde actuel: {formatCurrencyMad(preview.current_balance)} →
                    après crédit: <strong>{formatCurrencyMad(preview.balance_after_credit)}</strong>
                  </div>
                </div>
              ) : null}

              {/* Info banner */}
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800">
                ℹ️ L'avoir sera crédité automatiquement sur le portefeuille du client.
                Aucun remboursement en espèces ne sera effectué. Le solde peut être utilisé sur un futur contrat ou réservation.
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Motif du retour anticipé <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  placeholder="Ex: Client déménage, fin anticipée d'activité…"
                />
              </div>

              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>
              )}

              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="flex-1 df-btn df-btn--ghost">Annuler</button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={busy}
                  className="flex-1 rounded-xl bg-amber-600 px-4 py-2 text-sm font-black text-white hover:bg-amber-700 disabled:opacity-60"
                >
                  {busy ? 'Résiliation…' : 'Confirmer le retour anticipé'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};
