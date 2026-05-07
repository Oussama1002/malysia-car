import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/queryKeys';
import { Timeline } from '@/modules/shared/components/Timeline';
import { formatCurrencyMad, formatDate } from '@/modules/shared/formatters';
import { TabsSection } from '@/modules/shared/components/TabsSection';
import { contractsApi } from '@/services/contractsApi';
import { GeneratePdfButton } from '@/modules/shared/components/GeneratePdfButton';
import { EntityAuditTimeline } from '@/modules/shared/components/EntityAuditTimeline';
import { EntityDocuments } from '@/modules/shared/components/EntityDocuments';
import { listEnvelopes, createEnvelope } from '@/services/signatureApi';
import { listPayments } from '@/services/financeApi';
import { listArrearsCases, createArrearsCase } from '@/services/arrearsApi';
import { formatClientCode, formatVehicleCode } from '@/services/entityCode';
import {
  labelPaymentMethod,
  labelContractStatus,
  labelContractType,
  labelInstallmentStatus,
  labelPaymentStatus,
  labelEnvelopeStatus,
  labelArrearsStage,
} from '@/services/labels';

type Installment = {
  id: string;
  installment_number?: number;
  due_date?: string;
  principal_amount?: number | string;
  interest_amount?: number | string;
  tax_amount?: number | string;
  penalty_amount?: number | string;
  total_due_amount?: number | string;
  total_paid_amount?: number | string;
  balance_amount?: number | string;
  installment_status?: string;
  paid_at?: string | null;
};

const num = (v: unknown): number => (v == null ? 0 : Number(v) || 0);

export const ContractDetailPage: React.FC = () => {
  const { id } = useParams();
  const cid = id ?? '';
  const [tab, setTab] = useState('details');

  const q = useQuery({
    queryKey: queryKeys.contracts.one(cid),
    queryFn: async () => contractsApi.get(cid),
    enabled: !!cid,
  });

  const c = q.data?.contract ?? null;
  const history = q.data?.history ?? [];

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

  const customerId = String(((c as { customerId?: string }).customerId ?? c.clientId ?? ''));

  return (
    <div className="space-y-6">
      <Link to="/contracts" className="text-sm font-semibold text-indigo-600">
        ← Contrats
      </Link>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">{c.reference}</h1>
          <p className="text-sm text-slate-500">
            {labelContractType(c.type)} • {labelContractStatus(c.status)}
          </p>
        </div>
        <div className="flex items-start gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 text-right">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Montant</div>
            <div className="text-2xl font-black text-indigo-700">{formatCurrencyMad(c.amountMad)}</div>
          </div>
          <GeneratePdfButton kind="contract" entityId={String(c.id ?? id)} />
        </div>
      </div>

      <TabsSection
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'details', label: 'Détails' },
          { id: 'schedule', label: 'Échéancier' },
          { id: 'documents', label: 'Documents' },
          { id: 'signature', label: 'Signature' },
          { id: 'payments', label: 'Paiements' },
          { id: 'legal', label: 'Contentieux' },
          { id: 'history', label: 'Historique' },
        ]}
      />

      {tab === 'details' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400">Période</div>
            <div className="mt-2 text-sm font-semibold text-slate-800">
              {formatDate(c.startDate)} → {c.endDate ? formatDate(c.endDate) : '—'}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400">Parties / véhicule</div>
            <div className="mt-2 text-sm text-slate-700">
              Client {formatClientCode(customerId)} • Véhicule {formatVehicleCode(c.vehicleId)}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm md:col-span-2">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400">Paiement</div>
            <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-slate-700 md:grid-cols-2">
              <div><span className="text-slate-500">Mode:</span> {labelPaymentMethod(c.paymentMethod)}</div>
              <div><span className="text-slate-500">Échéance jour:</span> {c.expectedPaymentDay ?? '—'}</div>
              <div className="md:col-span-2"><span className="text-slate-500">Conditions:</span> {c.paymentTerms ?? '—'}</div>
              <div><span className="text-slate-500">Réf. virement:</span> {c.bankReference ?? '—'}</div>
              <div><span className="text-slate-500">N° chèque:</span> {c.chequeNumber ?? '—'}</div>
            </div>
          </div>
        </div>
      )}

      {tab === 'schedule' && <ScheduleTab contractId={cid} contractAmount={c.amountMad} startDate={c.startDate} />}
      {tab === 'documents' && <EntityDocuments entityType="contract" entityId={String(c.id ?? id)} title="Documents du contrat" />}
      {tab === 'signature' && <SignatureTab contractId={cid} reference={c.reference} />}
      {tab === 'payments' && <PaymentsTab contractId={cid} customerId={customerId} />}
      {tab === 'legal' && <LegalTab contractId={cid} customerId={customerId} />}

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
                title: String(h.action ?? 'event'),
                at: String(h.at ?? c.createdAt),
                meta: h.from_status || h.to_status ? `${h.from_status ?? '—'} → ${h.to_status ?? '—'}` : undefined,
                tone: h.action === 'activated' ? 'success' : h.action === 'terminated' ? 'danger' : 'info',
              }))}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Échéancier
// ============================================================================
const ScheduleTab: React.FC<{ contractId: string; contractAmount: number; startDate?: string }> = ({
  contractId,
  contractAmount,
  startDate,
}) => {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    start_date: startDate ?? new Date().toISOString().slice(0, 10),
    months: '12',
    monthly_amount: contractAmount ? String(Math.round(contractAmount / 12)) : '',
    tax_rate: '20',
  });

  const installmentsQ = useQuery({
    queryKey: ['contract', contractId, 'installments'],
    queryFn: async () => contractsApi.installments(contractId) as Promise<Installment[]>,
    enabled: !!contractId,
  });

  const generateMut = useMutation({
    mutationFn: async () =>
      contractsApi.generateSchedule(contractId, {
        start_date: form.start_date,
        months: form.months ? Number(form.months) : undefined,
        monthly_amount: form.monthly_amount ? Number(form.monthly_amount) : undefined,
        tax_rate: form.tax_rate ? Number(form.tax_rate) : undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['contract', contractId, 'installments'] });
    },
  });

  const items = (installmentsQ.data ?? []) as Installment[];
  const totalDue = items.reduce((s, x) => s + num(x.total_due_amount), 0);
  const totalPaid = items.reduce((s, x) => s + num(x.total_paid_amount), 0);
  const totalBalance = items.reduce((s, x) => s + num(x.balance_amount), 0);

  const statusTone = (st?: string): string => {
    switch (st) {
      case 'paid':
        return 'bg-emerald-100 text-emerald-700';
      case 'partially_paid':
        return 'bg-amber-100 text-amber-700';
      case 'overdue':
        return 'bg-rose-100 text-rose-700';
      case 'invoiced':
        return 'bg-indigo-100 text-indigo-700';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Kpi label="Lignes" value={String(items.length)} />
        <Kpi label="Dû total" value={formatCurrencyMad(totalDue)} />
        <Kpi label="Payé" value={formatCurrencyMad(totalPaid)} tone="success" />
        <Kpi label="Solde" value={formatCurrencyMad(totalBalance)} tone={totalBalance > 0 ? 'danger' : 'success'} />
      </div>

      {/* Generator */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-bold text-slate-900">Générer l'échéancier</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <Input label="Date de début" type="date" value={form.start_date} onChange={(v) => setForm({ ...form, start_date: v })} />
          <Input label="Durée (mois)" type="number" value={form.months} onChange={(v) => setForm({ ...form, months: v })} />
          <Input label="Mensualité (MAD)" type="number" value={form.monthly_amount} onChange={(v) => setForm({ ...form, monthly_amount: v })} />
          <Input label="TVA (%)" type="number" value={form.tax_rate} onChange={(v) => setForm({ ...form, tax_rate: v })} />
          <div className="flex items-end">
            <button
              type="button"
              className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              onClick={() => generateMut.mutate()}
              disabled={generateMut.isPending}
            >
              {generateMut.isPending ? 'Génération…' : 'Générer'}
            </button>
          </div>
        </div>
        {generateMut.isError && (
          <p className="mt-2 text-xs text-rose-600">Erreur lors de la génération.</p>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-900">
          Échéances ({items.length})
        </div>
        {installmentsQ.isLoading ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500">Chargement…</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">Aucune échéance générée.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">N°</th>
                  <th className="px-4 py-2 text-left">Échéance</th>
                  <th className="px-4 py-2 text-right">Capital</th>
                  <th className="px-4 py-2 text-right">Intérêts</th>
                  <th className="px-4 py-2 text-right">TVA</th>
                  <th className="px-4 py-2 text-right">Pénalités</th>
                  <th className="px-4 py-2 text-right">Dû</th>
                  <th className="px-4 py-2 text-right">Payé</th>
                  <th className="px-4 py-2 text-right">Solde</th>
                  <th className="px-4 py-2 text-left">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it) => (
                  <tr key={it.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono font-bold">{it.installment_number ?? '—'}</td>
                    <td className="px-4 py-2 text-slate-700">{it.due_date ? formatDate(it.due_date) : '—'}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatCurrencyMad(num(it.principal_amount))}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatCurrencyMad(num(it.interest_amount))}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatCurrencyMad(num(it.tax_amount))}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatCurrencyMad(num(it.penalty_amount))}</td>
                    <td className="px-4 py-2 text-right font-mono font-bold">{formatCurrencyMad(num(it.total_due_amount))}</td>
                    <td className="px-4 py-2 text-right font-mono text-emerald-700">{formatCurrencyMad(num(it.total_paid_amount))}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatCurrencyMad(num(it.balance_amount))}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusTone(it.installment_status)}`}>
                        {labelInstallmentStatus(it.installment_status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Signature
// ============================================================================
const SignatureTab: React.FC<{ contractId: string; reference: string }> = ({ contractId, reference }) => {
  const qc = useQueryClient();
  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState({
    subject: `Signature contrat ${reference}`,
    message: '',
    signer_name: '',
    signer_email: '',
    signer_phone: '',
  });

  const envelopesQ = useQuery({
    queryKey: ['signatures', 'envelopes', { signable_id: contractId }],
    queryFn: () => listEnvelopes({ signable_type: 'contract', signable_id: contractId, per_page: 50 }),
    enabled: !!contractId,
  });

  const createMut = useMutation({
    mutationFn: () =>
      createEnvelope({
        subject: form.subject,
        message: form.message || undefined,
        signable_type: 'contract',
        signable_id: contractId,
        signers: [
          {
            name: form.signer_name,
            email: form.signer_email,
            phone: form.signer_phone || undefined,
            role: 'client',
            signer_order: 1,
          },
        ],
      }),
    onSuccess: () => {
      setOpenCreate(false);
      setForm((f) => ({ ...f, signer_name: '', signer_email: '', signer_phone: '', message: '' }));
      void qc.invalidateQueries({ queryKey: ['signatures', 'envelopes', { signable_id: contractId }] });
    },
  });

  const envelopes = envelopesQ.data?.data ?? [];

  const statusTone = (st: string): string => {
    switch (st) {
      case 'completed':
        return 'bg-emerald-100 text-emerald-700';
      case 'in_progress':
      case 'sent':
        return 'bg-indigo-100 text-indigo-700';
      case 'declined':
      case 'voided':
      case 'expired':
      case 'failed':
        return 'bg-rose-100 text-rose-700';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">Enveloppes de signature</h3>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => setOpenCreate((v) => !v)}
          >
            {openCreate ? 'Fermer' : '+ Nouvelle enveloppe'}
          </button>
          <Link
            to="/signatures"
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Module signatures →
          </Link>
        </div>
      </div>

      {openCreate && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input label="Objet" value={form.subject} onChange={(v) => setForm({ ...form, subject: v })} />
            <Input label="Message (optionnel)" value={form.message} onChange={(v) => setForm({ ...form, message: v })} />
            <Input label="Nom du signataire" value={form.signer_name} onChange={(v) => setForm({ ...form, signer_name: v })} />
            <Input label="Email du signataire" type="email" value={form.signer_email} onChange={(v) => setForm({ ...form, signer_email: v })} />
            <Input label="Téléphone (optionnel)" value={form.signer_phone} onChange={(v) => setForm({ ...form, signer_phone: v })} />
          </div>
          {createMut.isError && <p className="mt-2 text-xs text-rose-600">Erreur lors de la création.</p>}
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
              disabled={createMut.isPending || !form.signer_name || !form.signer_email}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? 'Création…' : 'Créer enveloppe'}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {envelopesQ.isLoading ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500">Chargement…</div>
        ) : envelopes.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">Aucune enveloppe pour ce contrat.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">Objet</th>
                <th className="px-4 py-2 text-left">Provider</th>
                <th className="px-4 py-2 text-left">Statut</th>
                <th className="px-4 py-2 text-left">Envoyé</th>
                <th className="px-4 py-2 text-left">Complété</th>
                <th className="px-4 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {envelopes.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-semibold text-slate-800">{e.subject}</td>
                  <td className="px-4 py-2 text-slate-600">{e.provider}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusTone(e.status)}`}>
                      {labelEnvelopeStatus(e.status)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{e.sent_at ? formatDate(e.sent_at) : '—'}</td>
                  <td className="px-4 py-2 text-slate-600">{e.completed_at ? formatDate(e.completed_at) : '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <Link to={`/signatures/${e.id}`} className="text-xs font-bold text-indigo-600 hover:underline">
                      Détail →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Paiements
// ============================================================================
const PaymentsTab: React.FC<{ contractId: string; customerId: string }> = ({ contractId, customerId }) => {
  const installmentsQ = useQuery({
    queryKey: ['contract', contractId, 'installments'],
    queryFn: async () => contractsApi.installments(contractId) as Promise<Installment[]>,
    enabled: !!contractId,
  });

  const paymentsQ = useQuery({
    queryKey: ['payments', { customer_id: customerId }],
    queryFn: () => listPayments({ customer_id: customerId, per_page: 100 }),
    enabled: !!customerId,
  });

  const installments = (installmentsQ.data ?? []) as Installment[];
  const totalDue = installments.reduce((s, x) => s + num(x.total_due_amount), 0);
  const totalPaid = installments.reduce((s, x) => s + num(x.total_paid_amount), 0);
  const totalBalance = installments.reduce((s, x) => s + num(x.balance_amount), 0);

  const payments = paymentsQ.data?.data ?? [];

  const statusTone = (st: string): string => {
    switch (st) {
      case 'allocated':
        return 'bg-emerald-100 text-emerald-700';
      case 'partially_allocated':
        return 'bg-amber-100 text-amber-700';
      case 'unallocated':
        return 'bg-slate-100 text-slate-600';
      case 'reversed':
      case 'failed':
        return 'bg-rose-100 text-rose-700';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Kpi label="Dû total" value={formatCurrencyMad(totalDue)} />
        <Kpi label="Payé (échéances)" value={formatCurrencyMad(totalPaid)} tone="success" />
        <Kpi label="Solde restant" value={formatCurrencyMad(totalBalance)} tone={totalBalance > 0 ? 'danger' : 'success'} />
        <Kpi label="Paiements client" value={String(payments.length)} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-900">
          Paiements du client lié à ce contrat
        </div>
        {paymentsQ.isLoading ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500">Chargement…</div>
        ) : payments.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">Aucun paiement enregistré pour ce client.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">Numéro</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Mode</th>
                  <th className="px-4 py-2 text-right">Montant</th>
                  <th className="px-4 py-2 text-right">Alloué</th>
                  <th className="px-4 py-2 text-right">Non alloué</th>
                  <th className="px-4 py-2 text-left">Statut</th>
                  <th className="px-4 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono font-bold text-slate-800">{p.payment_number}</td>
                    <td className="px-4 py-2 text-slate-700">{formatDate(p.payment_date)}</td>
                    <td className="px-4 py-2 text-slate-700">{labelPaymentMethod(p.payment_method)}</td>
                    <td className="px-4 py-2 text-right font-mono font-bold">{formatCurrencyMad(num(p.amount))}</td>
                    <td className="px-4 py-2 text-right font-mono text-emerald-700">{formatCurrencyMad(num(p.amount_allocated))}</td>
                    <td className="px-4 py-2 text-right font-mono text-slate-500">{formatCurrencyMad(num(p.amount_unallocated))}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusTone(p.status)}`}>
                        {labelPaymentStatus(p.status)}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link to="/finance/payments" className="text-xs font-bold text-indigo-600 hover:underline">
                        Module →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Contentieux
// ============================================================================
const LegalTab: React.FC<{ contractId: string; customerId: string }> = ({ contractId, customerId }) => {
  const qc = useQueryClient();
  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState({
    total_overdue: '',
    days_overdue: '',
    notes: '',
  });

  const casesQ = useQuery({
    queryKey: ['arrears', 'cases', { contract_id: contractId }],
    queryFn: () => listArrearsCases({ contract_id: contractId, per_page: 50 }),
    enabled: !!contractId,
  });

  const createMut = useMutation({
    mutationFn: () =>
      createArrearsCase({
        contract_id: contractId,
        customer_id: customerId,
        total_overdue: form.total_overdue ? Number(form.total_overdue) : undefined,
        days_overdue: form.days_overdue ? Number(form.days_overdue) : undefined,
        notes: form.notes || undefined,
      }),
    onSuccess: () => {
      setOpenCreate(false);
      setForm({ total_overdue: '', days_overdue: '', notes: '' });
      void qc.invalidateQueries({ queryKey: ['arrears', 'cases', { contract_id: contractId }] });
    },
  });

  const cases = casesQ.data?.data ?? [];

  const stageTone = (st: string): string => {
    switch (st) {
      case 'closed':
        return 'bg-emerald-100 text-emerald-700';
      case 'legal':
      case 'escalated':
        return 'bg-rose-100 text-rose-700';
      case 'in_dunning':
        return 'bg-amber-100 text-amber-700';
      default:
        return 'bg-slate-100 text-slate-600';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900">Dossiers contentieux liés</h3>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => setOpenCreate((v) => !v)}
          >
            {openCreate ? 'Fermer' : '+ Ouvrir un dossier'}
          </button>
          <Link
            to="/arrears"
            className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Module contentieux →
          </Link>
        </div>
      </div>

      {openCreate && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Input label="Montant en retard (MAD)" type="number" value={form.total_overdue} onChange={(v) => setForm({ ...form, total_overdue: v })} />
            <Input label="Jours de retard" type="number" value={form.days_overdue} onChange={(v) => setForm({ ...form, days_overdue: v })} />
            <Input label="Notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
          </div>
          {createMut.isError && <p className="mt-2 text-xs text-rose-600">Erreur lors de l'ouverture du dossier.</p>}
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              disabled={createMut.isPending || !customerId}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? 'Ouverture…' : 'Ouvrir le dossier'}
            </button>
          </div>
          {!customerId && <p className="mt-2 text-xs text-amber-700">Le client du contrat doit être renseigné pour ouvrir un dossier.</p>}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {casesQ.isLoading ? (
          <div className="px-5 py-8 text-center text-sm text-slate-500">Chargement…</div>
        ) : cases.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-slate-400">Aucun dossier contentieux pour ce contrat.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">N° dossier</th>
                <th className="px-4 py-2 text-left">Étape</th>
                <th className="px-4 py-2 text-right">Montant en retard</th>
                <th className="px-4 py-2 text-right">Jours</th>
                <th className="px-4 py-2 text-left">Ouvert le</th>
                <th className="px-4 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cases.map((cs) => (
                <tr key={cs.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono font-bold text-slate-800">{cs.case_number}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${stageTone(cs.stage)}`}>
                      {labelArrearsStage(cs.stage)}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-bold">{formatCurrencyMad(num(cs.total_overdue))}</td>
                  <td className="px-4 py-2 text-right font-mono">{cs.days_overdue ?? '—'}</td>
                  <td className="px-4 py-2 text-slate-600">{cs.created_at ? formatDate(cs.created_at) : '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <Link to={`/arrears/${cs.id}`} className="text-xs font-bold text-indigo-600 hover:underline">
                      Détail →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// Atoms
// ============================================================================
const Kpi: React.FC<{ label: string; value: string; tone?: 'default' | 'success' | 'danger' }> = ({ label, value, tone = 'default' }) => {
  const colorClass =
    tone === 'success' ? 'text-emerald-700' : tone === 'danger' ? 'text-rose-700' : 'text-slate-900';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</div>
      <div className={`mt-1 text-xl font-black ${colorClass}`}>{value}</div>
    </div>
  );
};

const Input: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}> = ({ label, value, onChange, type = 'text' }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-500">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
    />
  </div>
);
