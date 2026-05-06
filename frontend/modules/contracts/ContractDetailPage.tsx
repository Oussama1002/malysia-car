import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/services/queryKeys';
import { Timeline } from '@/modules/shared/components/Timeline';
import { formatCurrencyMad, formatDate } from '@/modules/shared/formatters';
import { TabsSection } from '@/modules/shared/components/TabsSection';
import { contractsApi } from '@/services/contractsApi';
import { GeneratePdfButton } from '@/modules/shared/components/GeneratePdfButton';
import { EntityAuditTimeline } from '@/modules/shared/components/EntityAuditTimeline';
import { EntityDocuments } from '@/modules/shared/components/EntityDocuments';

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

  return (
    <div className="space-y-6">
      <Link to="/contracts" className="text-sm font-semibold text-indigo-600">
        ← Contrats
      </Link>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">{c.reference}</h1>
          <p className="text-sm text-slate-500">
            {c.type} • {c.status}
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
              Client #{(c as { customerId?: string }).customerId ?? c.clientId ?? '—'} • Véhicule #{c.vehicleId ?? '—'}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm md:col-span-2">
            <div className="text-xs font-black uppercase tracking-widest text-slate-400">Paiement</div>
            <div className="mt-2 grid grid-cols-1 gap-2 text-sm text-slate-700 md:grid-cols-2">
              <div><span className="text-slate-500">Mode:</span> {c.paymentMethod ?? '—'}</div>
              <div><span className="text-slate-500">Échéance jour:</span> {c.expectedPaymentDay ?? '—'}</div>
              <div className="md:col-span-2"><span className="text-slate-500">Conditions:</span> {c.paymentTerms ?? '—'}</div>
              <div><span className="text-slate-500">Réf. virement:</span> {c.bankReference ?? '—'}</div>
              <div><span className="text-slate-500">N° chèque:</span> {c.chequeNumber ?? '—'}</div>
            </div>
          </div>
        </div>
      )}

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

      {tab === 'documents' && (
        <EntityDocuments entityType="contract" entityId={String(c.id ?? id)} title="Documents du contrat" />
      )}

      {tab !== 'details' && tab !== 'history' && tab !== 'documents' && (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm text-sm text-slate-600">
          À brancher: {tab} (API + UI).
        </div>
      )}
    </div>
  );
};
