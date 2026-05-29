import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/queryKeys';
import { Timeline } from '@/modules/shared/components/Timeline';
import { formatCurrencyMad, formatDate } from '@/modules/shared/formatters';
import { TabsSection } from '@/modules/shared/components/TabsSection';
import { contractsApi } from '@/services/contractsApi';
import { contractSignatureApi, type SignatureRequestStatus } from '@/services/contractSignatureApi';
import { ApiError } from '@/services/apiClient';
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

      {tab === 'signature' && <SignatureTab contractId={String(c.id ?? id)} />}

      {tab !== 'details' && tab !== 'history' && tab !== 'documents' && tab !== 'signature' && (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm text-sm text-slate-600">
          À brancher: {tab} (API + UI).
        </div>
      )}
    </div>
  );
};

// ── Signature tab: send for signature + track status ──────────────────────
const STATUS_LABEL: Record<SignatureRequestStatus, { label: string; cls: string }> = {
  sent_for_signature: { label: 'En attente de signature', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  signed: { label: 'Signé', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Refusé', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
  expired: { label: 'Expiré', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
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
