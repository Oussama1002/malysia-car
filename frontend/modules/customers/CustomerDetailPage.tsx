import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addCustomerNote,
  approveKycCase,
  blacklistCustomer,
  createKycCase,
  deleteKycDocument,
  getCustomerDossier,
  rejectKycCase,
  unblacklistCustomer,
  uploadKycDocument,
  verifyKycDocument,
  KYC_CHECKLIST,
  type BlacklistEntry,
  type Dossier,
  type KycCase,
  type KycDocument,
  type KycStatus,
  type RiskLevel,
} from '@/services/customersApi';
import { ApiError } from '@/services/apiError';
import { TabsSection } from '@/modules/shared/components/TabsSection';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { ConfirmModal } from '@/modules/shared/components/ConfirmModal';
import { EmptyState } from '@/modules/shared/components/EmptyState';
import { EntityDocuments } from '@/modules/shared/components/EntityDocuments';
import { EntityAuditTimeline } from '@/modules/shared/components/EntityAuditTimeline';

const kycTone: Record<KycStatus, 'success' | 'warning' | 'info' | 'danger' | 'default'> = {
  pending: 'warning',
  in_review: 'info',
  approved: 'success',
  rejected: 'danger',
  expired: 'default',
};
const kycLabel: Record<KycStatus, string> = {
  pending: 'En attente',
  in_review: 'En revue',
  approved: 'Approuvé',
  rejected: 'Rejeté',
  expired: 'Expiré',
};
const riskTone: Record<RiskLevel, 'success' | 'default' | 'warning' | 'danger'> = {
  low: 'success',
  normal: 'default',
  elevated: 'warning',
  high: 'danger',
};
const riskLabel: Record<RiskLevel, string> = {
  low: 'Risque faible',
  normal: 'Risque normal',
  elevated: 'Risque élevé',
  high: 'Risque très élevé',
};

export const CustomerDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'identity' | 'kyc' | 'contracts' | 'payments' | 'documents' | 'notes' | 'risk' | 'audit'>('identity');
  const [confirmBlacklist, setConfirmBlacklist] = useState<'add' | 'remove' | null>(null);

  const dossierQ = useQuery({
    queryKey: ['customer', id, 'dossier'],
    queryFn: () => getCustomerDossier(id as string),
    enabled: !!id,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['customer', id] });

  const blacklistMut = useMutation({
    mutationFn: (vars: { reason: string; severity: BlacklistEntry['severity'] }) =>
      blacklistCustomer(id as string, vars.reason, vars.severity),
    onSuccess: () => {
      invalidate();
      setConfirmBlacklist(null);
    },
    onError: (e) => alert(e instanceof ApiError ? e.message : 'Erreur'),
  });
  const unblacklistMut = useMutation({
    mutationFn: (removalReason: string) => unblacklistCustomer(id as string, removalReason),
    onSuccess: () => {
      invalidate();
      setConfirmBlacklist(null);
    },
    onError: (e) => alert(e instanceof ApiError ? e.message : 'Erreur'),
  });

  if (!id) return <div className="text-sm text-rose-700">Identifiant manquant.</div>;
  if (dossierQ.isLoading) return <div className="text-sm text-slate-500">Chargement du dossier…</div>;
  if (dossierQ.isError || !dossierQ.data) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8">
        <p className="font-bold">Client introuvable.</p>
        <Link className="mt-3 inline-block text-sm font-semibold text-indigo-600" to="/customers">
          ← Retour
        </Link>
      </div>
    );
  }

  const dossier = dossierQ.data.data;
  const { customer, identity, addresses, contacts, bank_accounts, kyc, blacklist, notes, contracts, payments, risk } =
    dossier;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/customers" className="text-sm font-semibold text-indigo-600">
          ← Clients
        </Link>
        <div className="flex gap-2">
          {!customer.is_blacklisted ? (
            <button
              type="button"
              className="df-btn df-btn--danger"
              onClick={() => setConfirmBlacklist('add')}
            >
              Ajouter à la blacklist
            </button>
          ) : (
            <button
              type="button"
              className="df-btn df-btn--primary"
              onClick={() => setConfirmBlacklist('remove')}
            >
              Retirer de la blacklist
            </button>
          )}
        </div>
      </div>

      <header className="df-card df-card--elevated">
        <div className="df-card__body flex flex-wrap items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-2xl font-black text-white">
            {customer.display_name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black text-slate-900">{customer.display_name}</h1>
              {customer.is_blacklisted && <StatusBadge label="Blacklist" tone="danger" />}
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {customer.customer_code} · {customer.customer_type === 'PARTICULIER' ? 'Particulier' : 'Entreprise'}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatusBadge label={kycLabel[customer.kyc_status]} tone={kycTone[customer.kyc_status]} />
              <StatusBadge label={riskLabel[customer.risk_level]} tone={riskTone[customer.risk_level]} />
              <StatusBadge
                label={customer.status === 'active' ? 'Actif' : customer.status === 'suspended' ? 'Suspendu' : 'Inactif'}
                tone={customer.status === 'active' ? 'success' : customer.status === 'suspended' ? 'danger' : 'default'}
              />
            </div>
          </div>
        </div>
      </header>

      <TabsSection
        active={tab}
        onChange={(id) => setTab(id as typeof tab)}
        tabs={[
          { id: 'identity', label: 'Identité' },
          { id: 'kyc', label: `KYC (${kyc.cases.length})` },
          { id: 'contracts', label: `Contrats (${contracts.length})` },
          { id: 'payments', label: `Paiements (${payments.length})` },
          { id: 'documents', label: 'Documents' },
          { id: 'notes', label: `Notes (${notes.length})` },
          { id: 'risk', label: 'Risque' },
          { id: 'audit', label: 'Audit' },
        ]}
      />

      {tab === 'identity' && (
        <IdentityTab
          dossier={dossier}
          identity={identity}
          addresses={addresses}
          contacts={contacts}
          bankAccounts={bank_accounts}
        />
      )}
      {tab === 'kyc' && <KycTab customerId={customer.id} cases={kyc.cases} customerType={customer.customer_type} onChange={invalidate} />}
      {tab === 'contracts' && <ContractsTab contracts={contracts} />}
      {tab === 'payments' && <PaymentsTab payments={payments} />}
      {tab === 'documents' && (
        <div className="space-y-4">
          <EntityDocuments entityType="customer" entityId={customer.id} title="Référentiel central client" />
          <DocumentsTab cases={kyc.cases} />
        </div>
      )}
      {tab === 'notes' && <NotesTab customerId={customer.id} notes={notes} onChange={invalidate} />}
      {tab === 'audit' && (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-3 text-sm font-black text-slate-900">Audit & traçabilité</div>
          <EntityAuditTimeline entityType="customer" entityId={customer.id} />
        </div>
      )}
      {tab === 'risk' && <RiskTab dossier={dossier} blacklist={blacklist} />}

      <ConfirmModal
        open={confirmBlacklist === 'remove'}
        title="Retirer de la blacklist"
        description="Un motif est requis pour tracer la levée."
        onClose={() => setConfirmBlacklist(null)}
        onConfirm={() => {
          const reason = window.prompt('Motif de retrait de la blacklist ?') ?? '';
          if (reason.trim()) unblacklistMut.mutate(reason.trim());
        }}
        confirmLabel="Saisir un motif"
      />

      <BlacklistAddModal
        open={confirmBlacklist === 'add'}
        onClose={() => setConfirmBlacklist(null)}
        submitting={blacklistMut.isPending}
        onSubmit={(reason, severity) => blacklistMut.mutate({ reason, severity })}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Identity tab
// ---------------------------------------------------------------------------

const IdentityTab: React.FC<{
  dossier: Dossier;
  identity: Dossier['identity'];
  addresses: Dossier['addresses'];
  contacts: Dossier['contacts'];
  bankAccounts: Dossier['bank_accounts'];
}> = ({ dossier, identity, addresses, contacts, bankAccounts }) => {
  const c = dossier.customer;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="df-card">
        <div className="df-card__body space-y-3">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">Informations</h3>
          {c.customer_type === 'PARTICULIER' && identity.individual_profile && (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Info k="Prénom" v={identity.individual_profile.first_name} />
              <Info k="Nom" v={identity.individual_profile.last_name} />
              <Info k="CIN" v={identity.individual_profile.national_id_number ?? '—'} />
              <Info k="Nationalité" v={identity.individual_profile.nationality ?? '—'} />
              <Info k="Date de naissance" v={identity.individual_profile.date_of_birth ?? '—'} />
              <Info k="Profession" v={identity.individual_profile.profession ?? '—'} />
              <Info k="Employeur" v={identity.individual_profile.employer_name ?? '—'} />
              <Info
                k="Revenu mensuel"
                v={
                  identity.individual_profile.monthly_income != null
                    ? `${Number(identity.individual_profile.monthly_income).toLocaleString('fr-FR')} MAD`
                    : '—'
                }
              />
              <Info k="Permis" v={identity.individual_profile.driving_license_number ?? '—'} />
              <Info k="Permis exp." v={identity.individual_profile.driving_license_expiry ?? '—'} />
            </dl>
          )}
          {c.customer_type === 'ENTREPRISE' && identity.company_profile && (
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Info k="Raison sociale" v={identity.company_profile.legal_name} />
              <Info k="Nom commercial" v={identity.company_profile.trade_name ?? '—'} />
              <Info k="RC" v={identity.company_profile.registration_number ?? '—'} />
              <Info k="ICE" v={identity.company_profile.ice ?? '—'} />
              <Info k="IF" v={identity.company_profile.tax_identifier ?? '—'} />
              <Info k="CNSS" v={identity.company_profile.cnss_number ?? '—'} />
              <Info k="Activité" v={identity.company_profile.business_activity ?? '—'} />
              <Info
                k="CA annuel"
                v={
                  identity.company_profile.annual_turnover != null
                    ? `${Number(identity.company_profile.annual_turnover).toLocaleString('fr-FR')} MAD`
                    : '—'
                }
              />
              <Info k="Représentant" v={identity.company_profile.legal_representative_name ?? '—'} />
              <Info k="CIN repr." v={identity.company_profile.legal_representative_id_number ?? '—'} />
            </dl>
          )}
        </div>
      </div>

      <div className="df-card">
        <div className="df-card__body space-y-3">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">Contacts</h3>
          {contacts.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun contact enregistré.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {contacts.map((ct, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                    {ct.contact_type}
                  </span>
                  <span className="font-semibold">{ct.value}</span>
                  {ct.is_primary && <span className="text-xs text-amber-500">★ principal</span>}
                </li>
              ))}
            </ul>
          )}

          <h3 className="mt-5 text-sm font-black uppercase tracking-wider text-slate-700">Adresses</h3>
          {addresses.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune adresse.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {addresses.map((a, i) => (
                <li key={i} className="rounded-lg border border-slate-100 px-3 py-2">
                  <div className="text-xs font-bold uppercase text-slate-500">{a.address_type}</div>
                  <div>{a.address_line_1}</div>
                  {a.address_line_2 && <div>{a.address_line_2}</div>}
                  <div className="text-xs text-slate-500">
                    {[a.postal_code, a.city, a.region, a.country_code].filter(Boolean).join(', ')}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <h3 className="mt-5 text-sm font-black uppercase tracking-wider text-slate-700">Comptes bancaires</h3>
          {bankAccounts.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun compte bancaire.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {bankAccounts.map((b) => (
                <li key={b.id} className="rounded-lg border border-slate-100 px-3 py-2">
                  <div className="font-bold">{b.bank_name}</div>
                  <div className="font-mono text-xs">{b.iban ?? b.rib ?? '—'}</div>
                  {b.is_default && <StatusBadge label="Par défaut" tone="info" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

const Info: React.FC<{ k: string; v: string | null | undefined }> = ({ k, v }) => (
  <div>
    <dt className="text-xs font-bold uppercase tracking-wider text-slate-400">{k}</dt>
    <dd className="font-semibold text-slate-800">{v ?? '—'}</dd>
  </div>
);

// ---------------------------------------------------------------------------
// KYC tab — checklist + upload + approve/reject
// ---------------------------------------------------------------------------

const KycTab: React.FC<{
  customerId: string;
  cases: KycCase[];
  customerType: 'PARTICULIER' | 'ENTREPRISE';
  onChange: () => void;
}> = ({ customerId, cases, customerType, onChange }) => {
  const qc = useQueryClient();
  const active = cases[0] ?? null;
  const checklist = KYC_CHECKLIST[customerType];
  const [error, setError] = useState<string | null>(null);

  const refetch = () => {
    qc.invalidateQueries({ queryKey: ['customer', customerId] });
    onChange();
  };

  const createCaseMut = useMutation({
    mutationFn: () => createKycCase(customerId, 'basic'),
    onSuccess: refetch,
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const approveMut = useMutation({
    mutationFn: (vars: { caseId: string; score: number }) => approveKycCase(vars.caseId, vars.score),
    onSuccess: refetch,
  });

  const rejectMut = useMutation({
    mutationFn: (vars: { caseId: string; reason: string }) => rejectKycCase(vars.caseId, vars.reason),
    onSuccess: refetch,
  });

  const uploadMut = useMutation({
    mutationFn: (vars: { caseId: string; file: File; docType: string }) =>
      uploadKycDocument(vars.caseId, vars.file, vars.docType),
    onSuccess: refetch,
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur upload'),
  });

  const verifyMut = useMutation({
    mutationFn: (vars: { docId: string; status: 'verified' | 'rejected' | 'pending' }) =>
      verifyKycDocument(vars.docId, vars.status),
    onSuccess: refetch,
  });

  const deleteDocMut = useMutation({
    mutationFn: (docId: string) => deleteKycDocument(docId),
    onSuccess: refetch,
  });

  if (!active) {
    return (
      <div className="df-card">
        <div className="df-card__body space-y-3">
          <EmptyState
            title="Aucun dossier KYC"
            description="Démarrer une vérification KYC pour ce client."
          />
          <div className="flex justify-center">
            <button
              type="button"
              className="df-btn df-btn--primary"
              onClick={() => createCaseMut.mutate()}
              disabled={createCaseMut.isPending}
            >
              + Ouvrir un dossier KYC
            </button>
          </div>
        </div>
      </div>
    );
  }

  const documentsByType = new Map<string, KycDocument[]>();
  (active.documents ?? []).forEach((d) => {
    const list = documentsByType.get(d.document_type) ?? [];
    list.push(d);
    documentsByType.set(d.document_type, list);
  });

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
          {error}
        </div>
      )}

      <div className="df-card">
        <div className="df-card__body flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-slate-500">Dossier KYC actif</div>
            <div className="mt-1 flex items-center gap-2">
              <StatusBadge label={kycLabel[active.kyc_status]} tone={kycTone[active.kyc_status]} />
              <span className="text-xs text-slate-500">
                Niveau: {active.verification_level === 'enhanced' ? 'Renforcé' : 'Standard'}
              </span>
              {active.risk_score != null && (
                <span className="text-xs text-slate-500">· Score: {active.risk_score}</span>
              )}
            </div>
          </div>
          {active.kyc_status !== 'approved' && active.kyc_status !== 'rejected' && (
            <div className="flex gap-2">
              <button
                type="button"
                className="df-btn df-btn--primary"
                onClick={() => {
                  const s = window.prompt('Score de risque (0-100) ?', '80');
                  if (s === null) return;
                  const score = Number(s);
                  if (Number.isNaN(score)) return;
                  approveMut.mutate({ caseId: active.id, score });
                }}
                disabled={approveMut.isPending}
              >
                ✓ Approuver
              </button>
              <button
                type="button"
                className="df-btn df-btn--danger"
                onClick={() => {
                  const reason = window.prompt('Motif du rejet ?') ?? '';
                  if (reason.trim()) rejectMut.mutate({ caseId: active.id, reason: reason.trim() });
                }}
                disabled={rejectMut.isPending}
              >
                ✗ Rejeter
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="df-card">
        <div className="df-card__body space-y-3">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">Liste des documents requis</h3>
          <div className="space-y-2">
            {checklist.map((item) => {
              const docs = documentsByType.get(item.key) ?? [];
              const done = docs.some((d) => d.verification_status === 'verified');
              const pending = docs.some((d) => d.verification_status === 'pending');
              return (
                <div
                  key={item.key}
                  className={`rounded-xl border px-3 py-2 ${
                    done ? 'border-emerald-200 bg-emerald-50' : pending ? 'border-amber-200 bg-amber-50' : 'border-slate-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-bold text-slate-800">
                        {item.label}
                        {item.required && <span className="ml-1 text-rose-600">*</span>}
                      </div>
                      <div className="text-xs text-slate-500">
                        {docs.length} document(s) · {item.required ? 'obligatoire' : 'optionnel'}
                      </div>
                    </div>
                    <label className="df-btn df-btn--ghost cursor-pointer text-xs">
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadMut.mutate({ caseId: active.id, file, docType: item.key });
                          e.target.value = '';
                        }}
                      />
                      + Téléverser
                    </label>
                  </div>
                  {docs.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs">
                      {docs.map((d) => (
                        <li
                          key={d.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white/80 px-2 py-1"
                        >
                          <span className="flex items-center gap-2">
                            <StatusBadge
                              label={
                                d.verification_status === 'verified'
                                  ? 'Vérifié'
                                  : d.verification_status === 'rejected'
                                    ? 'Rejeté'
                                    : 'En attente'
                              }
                              tone={
                                d.verification_status === 'verified'
                                  ? 'success'
                                  : d.verification_status === 'rejected'
                                    ? 'danger'
                                    : 'warning'
                              }
                            />
                            <span className="font-semibold">{d.file_name}</span>
                            {d.file_size && <span className="text-slate-400">· {(d.file_size / 1024).toFixed(0)} Ko</span>}
                          </span>
                          <span className="flex gap-1">
                            <button
                              type="button"
                              className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800 hover:bg-emerald-200"
                              onClick={() => verifyMut.mutate({ docId: d.id, status: 'verified' })}
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              className="rounded bg-rose-100 px-2 py-0.5 text-rose-800 hover:bg-rose-200"
                              onClick={() => verifyMut.mutate({ docId: d.id, status: 'rejected' })}
                            >
                              ✗
                            </button>
                            <button
                              type="button"
                              className="rounded bg-slate-100 px-2 py-0.5 text-slate-700 hover:bg-slate-200"
                              onClick={() => {
                                if (window.confirm('Supprimer ce document ?')) deleteDocMut.mutate(d.id);
                              }}
                            >
                              🗑
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {cases.length > 1 && (
        <div className="df-card">
          <div className="df-card__body space-y-2">
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">Historique des dossiers</h3>
            <ul className="space-y-1 text-xs">
              {cases.slice(1).map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-1">
                  <span>{c.created_at ? new Date(c.created_at).toLocaleDateString('fr-FR') : '—'}</span>
                  <StatusBadge label={kycLabel[c.kyc_status]} tone={kycTone[c.kyc_status]} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Contracts / Payments stubs (joined later)
// ---------------------------------------------------------------------------

const ContractsTab: React.FC<{ contracts: unknown[] }> = ({ contracts }) => (
  <div className="df-card">
    <div className="df-card__body">
      {contracts.length === 0 ? (
        <EmptyState title="Aucun contrat" description="Ce client n'a pas encore de contrat signé." />
      ) : (
        <ul className="space-y-2 text-sm">
          {contracts.map((c, i) => {
            const item = c as Record<string, unknown>;
            return (
              <li key={i} className="rounded-lg border border-slate-100 px-3 py-2 font-mono text-xs">
                {JSON.stringify(item)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  </div>
);

const PaymentsTab: React.FC<{ payments: unknown[] }> = ({ payments }) => (
  <div className="df-card">
    <div className="df-card__body">
      {payments.length === 0 ? (
        <EmptyState title="Aucun paiement" description="Aucun mouvement financier pour ce client." />
      ) : (
        <ul className="space-y-1 text-xs font-mono">
          {payments.map((p, i) => (
            <li key={i} className="rounded border border-slate-100 px-3 py-1">
              {JSON.stringify(p)}
            </li>
          ))}
        </ul>
      )}
    </div>
  </div>
);

const DocumentsTab: React.FC<{ cases: KycCase[] }> = ({ cases }) => {
  const allDocs = cases.flatMap((c) => c.documents ?? []);
  return (
    <div className="df-card">
      <div className="df-card__body">
        {allDocs.length === 0 ? (
          <EmptyState title="Aucun document" description="Tous les documents KYC apparaîtront ici." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {allDocs.map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <span className="font-bold">{d.file_name}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {d.document_type} · {d.mime_type}
                  </span>
                </span>
                <StatusBadge
                  label={
                    d.verification_status === 'verified'
                      ? 'Vérifié'
                      : d.verification_status === 'rejected'
                        ? 'Rejeté'
                        : 'En attente'
                  }
                  tone={
                    d.verification_status === 'verified'
                      ? 'success'
                      : d.verification_status === 'rejected'
                        ? 'danger'
                        : 'warning'
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Notes tab
// ---------------------------------------------------------------------------

const NotesTab: React.FC<{
  customerId: string;
  notes: Dossier['notes'];
  onChange: () => void;
}> = ({ customerId, notes, onChange }) => {
  const [text, setText] = useState('');
  const [noteType, setNoteType] = useState('general');
  const addMut = useMutation({
    mutationFn: () => addCustomerNote(customerId, text, noteType),
    onSuccess: () => {
      setText('');
      onChange();
    },
  });

  return (
    <div className="df-card">
      <div className="df-card__body space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) addMut.mutate();
          }}
          className="space-y-2"
        >
          <div className="flex gap-2">
            <select
              className="df-input max-w-[180px]"
              value={noteType}
              onChange={(e) => setNoteType(e.target.value)}
            >
              <option value="general">Général</option>
              <option value="kyc">KYC</option>
              <option value="commercial">Commercial</option>
              <option value="contentieux">Contentieux</option>
              <option value="finance">Finance</option>
            </select>
            <input
              className="df-input flex-1"
              placeholder="Ajouter une note interne…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit" disabled={addMut.isPending || !text.trim()} className="df-btn df-btn--primary disabled:opacity-60">
              Ajouter
            </button>
          </div>
        </form>
        {notes.length === 0 ? (
          <EmptyState title="Aucune note" description="Partagez une note avec vos équipes." />
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-xl border border-slate-100 px-3 py-2">
                <div className="flex items-center justify-between">
                  <StatusBadge label={n.note_type} tone="info" />
                  <span className="text-xs text-slate-500">
                    {n.created_at ? new Date(n.created_at).toLocaleString('fr-FR') : ''}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{n.note_text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Risk tab — score + blacklist history
// ---------------------------------------------------------------------------

const RiskTab: React.FC<{ dossier: Dossier; blacklist: Dossier['blacklist'] }> = ({ dossier, blacklist }) => {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="df-card">
        <div className="df-card__body space-y-3">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">Évaluation du risque</h3>
          <div className="flex items-center gap-3">
            <StatusBadge label={riskLabel[dossier.risk.level]} tone={riskTone[dossier.risk.level]} />
            {dossier.risk.score != null && (
              <span className="text-sm font-bold text-slate-700">Score: {dossier.risk.score}/100</span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Le niveau de risque est recalculé automatiquement à chaque approbation KYC à partir du score saisi.
          </p>
        </div>
      </div>

      <div className="df-card">
        <div className="df-card__body space-y-3">
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">Blacklist</h3>
          {blacklist.active.length === 0 && blacklist.history.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun incident enregistré.</p>
          ) : (
            <div className="space-y-3">
              {blacklist.active.length > 0 && (
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-rose-700">Entrées actives</div>
                  <ul className="mt-1 space-y-1 text-sm">
                    {blacklist.active.map((b) => (
                      <li key={b.id} className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                        <div className="flex items-center justify-between">
                          <StatusBadge label={b.severity} tone="danger" />
                          <span className="text-xs">{new Date(b.added_at).toLocaleDateString('fr-FR')}</span>
                        </div>
                        <div className="mt-1 font-semibold">{b.reason}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {blacklist.history.length > 0 && (
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-slate-500">Historique</div>
                  <ul className="mt-1 space-y-1 text-xs">
                    {blacklist.history.map((b) => (
                      <li key={b.id} className="rounded-lg border border-slate-100 px-3 py-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold">{b.reason}</span>
                          <span>
                            {new Date(b.added_at).toLocaleDateString('fr-FR')} →{' '}
                            {b.removed_at ? new Date(b.removed_at).toLocaleDateString('fr-FR') : '—'}
                          </span>
                        </div>
                        {b.removal_reason && (
                          <div className="text-slate-500">Levée: {b.removal_reason}</div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Blacklist-add modal (reason + severity)
// ---------------------------------------------------------------------------

const BlacklistAddModal: React.FC<{
  open: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (reason: string, severity: BlacklistEntry['severity']) => void;
}> = ({ open, submitting, onClose, onSubmit }) => {
  const [reason, setReason] = useState('');
  const [severity, setSeverity] = useState<BlacklistEntry['severity']>('high');
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 bg-slate-900/60" onClick={onClose} aria-label="backdrop" />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (reason.trim()) onSubmit(reason.trim(), severity);
        }}
        className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
      >
        <h3 className="text-lg font-black text-slate-900">Ajouter à la blacklist</h3>
        <p className="mt-1 text-sm text-slate-500">Cette action est auditée. Le motif est obligatoire.</p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Motif</label>
            <textarea
              className="df-input min-h-[80px]"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Détails de l'incident…"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Gravité</label>
            <select
              className="df-input"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as BlacklistEntry['severity'])}
            >
              <option value="low">Faible</option>
              <option value="medium">Moyenne</option>
              <option value="high">Élevée</option>
              <option value="critical">Critique</option>
            </select>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="df-btn df-btn--ghost">
            Annuler
          </button>
          <button type="submit" disabled={submitting} className="df-btn df-btn--danger disabled:opacity-60">
            {submitting ? 'Enregistrement…' : 'Ajouter à la blacklist'}
          </button>
        </div>
      </form>
    </div>
  );
};
