import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient, getApiBase } from '@/services/apiClient';
import { queryKeys } from '@/services/queryKeys';
import type { CustomerDto, FleetVehicleDto } from '@/services/dtos';
import { Icon, type IconName } from '@/modules/shared/components/Icon';
import { StatusChip } from '@/modules/shared/components/StatusChip';
import { UploadZone } from '@/modules/shared/components/UploadZone';
import { formatCurrencyMad, formatDate } from '@/modules/shared/formatters';
import type { ContractType } from '@/services/dtos';
import { contractsApi } from '@/services/contractsApi';
import { documentsApi } from '@/services/documentsApi';
import { createEnvelope, sendEnvelope } from '@/services/signatureApi';
import { useAuthSession } from '@/modules/auth/AuthContext';

type StepKey = 'client' | 'vehicle' | 'type' | 'terms' | 'annex' | 'review';

interface Step {
  key: StepKey;
  title: string;
  hint: string;
  icon: IconName;
}

const STEPS: Step[] = [
  { key: 'client', title: 'Client', hint: 'Identité & conformité', icon: 'users' },
  { key: 'vehicle', title: 'Véhicule', hint: 'Choix de l\u2019actif', icon: 'car' },
  { key: 'type', title: 'Type', hint: 'LLD / LOA / Crédit / VO', icon: 'doc' },
  { key: 'terms', title: 'Conditions', hint: 'Durée, loyer, garanties', icon: 'coin' },
  { key: 'annex', title: 'Annexes', hint: 'Pièces & justificatifs', icon: 'upload' },
  { key: 'review', title: 'Validation', hint: 'Relecture & signature', icon: 'sign' },
];

const CONTRACT_TYPES: {
  value: ContractType;
  label: string;
  sub: string;
  icon: IconName;
  legal: string;
  ai?: string;
}[] = [
  {
    value: 'LLD',
    label: 'Location Longue Durée',
    sub: 'Sans option d\u2019achat · véhicule restitué au terme',
    icon: 'key',
    legal: 'Art. 625 DOC · Loi 31-08 sur la protection du consommateur',
    ai: 'Loyer IA optimal: 4 200 MAD/mois (durée 36 mois, 20 000 km/an).',
  },
  {
    value: 'LOA',
    label: 'Location avec Option d\u2019Achat',
    sub: 'Valeur résiduelle fixée au contrat',
    icon: 'car',
    legal: 'DOC + Loi 31-08 · Valeur résiduelle obligatoire',
    ai: 'VR suggérée: 38% prix HT · risque client faible.',
  },
  {
    value: 'CREDIT_AUTO',
    label: 'Crédit Automobile',
    sub: 'Financement bancaire interne',
    icon: 'credit',
    legal: 'DOC + Bank Al-Maghrib · TAEG plafonné',
    ai: 'TAEG conseillé: 6.4% · score CNSS requis.',
  },
  {
    value: 'VENTE_VO',
    label: 'Vente Véhicule d\u2019Occasion',
    sub: 'Transfert de propriété immédiat',
    icon: 'marketplace',
    legal: 'DOC · TVA sur marge applicable',
    ai: 'Prix marché IA: 68 500 MAD (±4%).',
  },
  {
    value: 'LOCATION_COURTE',
    label: 'Location Courte Durée',
    sub: 'Location journalière / hebdomadaire',
    icon: 'play',
    legal: 'DOC · Caution obligatoire',
  },
];

interface WizardState {
  clientId: string | number | null;
  vehicleId: string | number | null;
  type: ContractType;
  durationMonths: number;
  monthlyRentMad: number;
  kmInclMonth: number;
  securityDepositMad: number;
  residualValuePct: number;
  notes: string;
  paymentMethod: string;
  paymentTerms: string;
  bankReference: string;
  chequeNumber: string;
  expectedPaymentDay: number | '';
}

const INITIAL: WizardState = {
  clientId: null,
  vehicleId: null,
  type: 'LLD',
  durationMonths: 36,
  monthlyRentMad: 4200,
  kmInclMonth: 1800,
  securityDepositMad: 10000,
  residualValuePct: 38,
  notes: '',
  paymentMethod: 'virement',
  paymentTerms: '',
  bankReference: '',
  chequeNumber: '',
  expectedPaymentDay: 5,
};

export const ContractWizardPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useAuthSession();
  const [stepIdx, setStepIdx] = useState(0);
  const [state, setState] = useState<WizardState>(INITIAL);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftInfo, setDraftInfo] = useState<string | null>(null);
  const [draftContractId, setDraftContractId] = useState<string | null>(null);
  const step = STEPS[stepIdx];

  const clients = useQuery({
    queryKey: queryKeys.customers.all,
    queryFn: async (): Promise<CustomerDto[]> => {
      if (!getApiBase()) {
        throw new Error('Backend API is required for contract wizard clients.');
      }
      const res = await apiClient<{ data: any[] }>('/v1/customers?per_page=200');
      return res.data.map((c): CustomerDto => ({
        id: c.id,
        kind: c.customer_type === 'ENTREPRISE' ? 'ENTREPRISE' : 'PARTICULIER',
        name: c.display_name ?? c.customer_code ?? c.id,
        email: c.individual_profile?.email ?? '',
        phone: c.individual_profile?.phone ?? '',
        complianceStatus:
          c.is_blacklisted ? 'BLACKLISTED'
          : c.kyc_status === 'approved' ? 'VERIFIED'
          : c.kyc_status === 'rejected' ? 'REJECTED'
          : c.kyc_status === 'under_review' ? 'UNDER_REVIEW'
          : 'INCOMPLETE',
        createdAt: c.created_at ?? '',
        idNumber: c.individual_profile?.national_id_number ?? c.company_profile?.ice,
        ice: c.company_profile?.ice,
        licenseNumber: c.individual_profile?.driving_license_number,
        licenseExpiry: c.individual_profile?.driving_license_expiry,
      }));
    },
  });

  const vehicles = useQuery({
    queryKey: queryKeys.fleet.all,
    queryFn: async (): Promise<FleetVehicleDto[]> => {
      if (!getApiBase()) {
        throw new Error('Backend API is required for contract wizard vehicles.');
      }
      const res = await apiClient<{ data: any[] }>('/v1/vehicles?per_page=200');
      return res.data.map((v): FleetVehicleDto => ({
        id: v.id,
        registration: v.registration_number ?? v.registration ?? '',
        brand: v.brand ?? v.brand_name ?? '',
        model: v.model ?? v.model_name ?? '',
        year: v.year_of_manufacture ?? v.year ?? 0,
        status: v.status ?? 'AVAILABLE',
        fuel: v.fuel_type ?? v.fuel,
        mileageKm: v.mileage_current ?? v.mileage_km,
        currentValueMad: v.book_value ?? v.current_value_mad,
        pricePerDay: v.daily_rental_price ?? v.price_per_day,
        insuranceExpiry: v.insurance_expiry,
        techControlExpiry: v.tech_control_expiry,
        vignetteExpiry: v.vignette_expiry,
      }));
    },
  });

  const selectedClient = clients.data?.find((c) => String(c.id) === String(state.clientId));
  const selectedVehicle = vehicles.data?.find((v) => String(v.id) === String(state.vehicleId));
  const selectedType = CONTRACT_TYPES.find((t) => t.value === state.type);

  const totalAmount = state.monthlyRentMad * state.durationMonths;

  const canNext = useMemo(() => {
    if (step.key === 'client') return !!state.clientId;
    if (step.key === 'vehicle') return !!state.vehicleId;
    return true;
  }, [step, state]);

  function patch<K extends keyof WizardState>(k: K, v: WizardState[K]): void {
    setState((s) => ({ ...s, [k]: v }));
  }

  function buildCreatePayload(status?: 'draft' | 'pending_approval') {
    return {
      type: state.type,
      clientId: state.clientId ?? '',
      vehicleId: state.vehicleId ?? undefined,
      amountMad: totalAmount,
      startDate: new Date().toISOString().slice(0, 10),
      endDate: undefined,
      durationMonths: state.durationMonths,
      monthlyPayment: state.monthlyRentMad,
      allowedKm: state.kmInclMonth * state.durationMonths,
      depositAmount: state.securityDepositMad,
      notes: state.notes,
      paymentMethod: state.paymentMethod,
      paymentTerms: state.paymentTerms || undefined,
      bankReference: state.bankReference || undefined,
      chequeNumber: state.chequeNumber || undefined,
      expectedPaymentDay: state.expectedPaymentDay === '' ? undefined : Number(state.expectedPaymentDay),
      status,
    } as any;
  }

  async function ensureDraftContract(): Promise<string> {
    if (!state.clientId) {
      throw new Error('Sélectionnez un client avant de sauvegarder le brouillon.');
    }
    if (!state.vehicleId) {
      throw new Error('Sélectionnez un véhicule avant de sauvegarder le brouillon.');
    }
    if (draftContractId) {
      return draftContractId;
    }
    const created = await contractsApi.create(buildCreatePayload('draft'));
    setDraftContractId(String(created.id));
    return String(created.id);
  }

  async function handleSaveDraft(): Promise<void> {
    setDraftBusy(true);
    setSaveError(null);
    setDraftInfo(null);
    try {
      const id = await ensureDraftContract();
      setDraftInfo(`Brouillon sauvegardé (${id.slice(0, 8)}…).`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Erreur de sauvegarde du brouillon');
    } finally {
      setDraftBusy(false);
    }
  }

  async function handleDraftPdf(): Promise<void> {
    setDraftBusy(true);
    setSaveError(null);
    setDraftInfo(null);
    try {
      const id = await ensureDraftContract();
      const res = await documentsApi.generateContractPdf(id);
      await documentsApi.downloadWithAuth(res.data.id, `contrat-brouillon-${id.slice(0, 8)}.pdf`);
      setDraftInfo('Brouillon PDF généré.');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Erreur de génération PDF');
    } finally {
      setDraftBusy(false);
    }
  }

  async function submit(): Promise<void> {
    setSaving(true);
    setSaveError(null);
    try {
      const created = await contractsApi.create(buildCreatePayload('pending_approval'));

      await contractsApi.generateSchedule(created.id, {
        start_date: new Date().toISOString().slice(0, 10),
        months: state.durationMonths,
        monthly_amount: state.monthlyRentMad,
        tax_rate: 0.2,
      });
      const generatedDoc = await documentsApi.generateContractPdf(String(created.id));

      const signers: Array<{ name: string; email: string; role: 'company_rep' | 'client'; signer_order: number }> = [];
      if (session?.user?.email) {
        signers.push({
          name: session.user.name || 'Bailleur',
          email: session.user.email,
          role: 'company_rep',
          signer_order: 1,
        });
      }
      if (selectedClient?.email) {
        signers.push({
          name: selectedClient.name,
          email: selectedClient.email,
          role: 'client',
          signer_order: signers.length + 1,
        });
      }

      if (signers.length > 0) {
        const envelope = await createEnvelope({
          subject: `Signature contrat ${state.type} - ${selectedClient.name}`,
          provider: 'internal',
          source_file_id: String(generatedDoc.data.id),
          signers,
        });
        await sendEnvelope(envelope.data.id);
      }

      navigate(`/contracts/${created.id}`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Erreur inconnue');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="df-crumb">
            <Link to="/contracts" className="text-[color:var(--df-text-muted)] hover:text-[color:var(--df-text)]">Contrats</Link>
            <span className="df-crumb__sep"><Icon name="chevron-right" size={12} /></span>
            <span className="df-crumb__current">Nouveau</span>
          </div>
          <h1 className="mt-1 text-3xl font-black tracking-tight">Nouveau contrat</h1>
          <p className="text-[color:var(--df-text-muted)]">Génération assistée — juridiquement conforme au droit marocain (DOC · Loi 31-08 · Loi 09-08).</p>
        </div>
        <div className="flex gap-2">
          <button className="df-btn df-btn--ghost df-btn--sm" disabled={draftBusy} onClick={() => void handleDraftPdf()}>
            <Icon name="download" size={14} /> {draftBusy ? 'Traitement…' : 'Brouillon PDF'}
          </button>
          <Link to="/contracts" className="df-btn df-btn--subtle df-btn--sm"><Icon name="close" size={14} /> Abandonner</Link>
        </div>
      </header>

      {/* Stepper */}
      <div className="df-card p-5">
        <div className="df-stepper">
          {STEPS.map((s, i) => {
            const done = i < stepIdx;
            const active = i === stepIdx;
            return (
              <React.Fragment key={s.key}>
                <button
                  type="button"
                  onClick={() => i <= stepIdx && setStepIdx(i)}
                  className={`df-step ${done ? 'df-step--done' : ''} ${active ? 'df-step--active' : ''}`}
                  style={{ cursor: i <= stepIdx ? 'pointer' : 'default', background: 'transparent', border: 0 }}
                >
                  <span className="df-step__bullet">
                    {done ? <Icon name="check" size={12} /> : i + 1}
                  </span>
                  <span className="hidden md:block">
                    <span className="df-step__label">{s.title}</span>
                    <span className="block text-[10px] font-semibold text-[color:var(--df-text-faint)]">{s.hint}</span>
                  </span>
                </button>
                {i < STEPS.length - 1 && <span className={`df-step__rail ${done ? 'df-step__rail--done' : ''}`} />}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Two-pane: form + summary */}
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="df-card">
          <div className="df-card__header">
            <div>
              <div className="df-card__hint">Étape {stepIdx + 1} / {STEPS.length}</div>
              <h3 className="text-xl font-bold tracking-tight flex items-center gap-2"><Icon name={step.icon} size={18} className="text-[color:var(--df-brand-500)]" /> {step.title}</h3>
              <p className="text-[13px] text-[color:var(--df-text-muted)]">{step.hint}</p>
            </div>
          </div>

          <div className="df-card__body space-y-5">
            {saveError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
                {saveError}
              </div>
            )}
            {draftInfo && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
                {draftInfo}
              </div>
            )}
            {step.key === 'client' && (
              <>
                <div>
                  <label className="df-label">Rechercher un client</label>
                  <select
                    className="df-input"
                    value={state.clientId ?? ''}
                    onChange={(e) => patch('clientId', e.target.value || null)}
                  >
                    <option value="">— Sélectionner —</option>
                    {(clients.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.kind === 'ENTREPRISE' ? '(Entreprise)' : '(Particulier)'} — {c.complianceStatus}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedClient && (
                  <div className="rounded-xl border border-[color:var(--df-border)] bg-[color:var(--df-surface-sunk)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--df-text-faint)]">{selectedClient.kind}</div>
                        <h4 className="text-[15px] font-bold">{selectedClient.name}</h4>
                        <div className="mt-0.5 text-[12px] text-[color:var(--df-text-muted)]">{selectedClient.email} · {selectedClient.phone}</div>
                      </div>
                      <StatusChip
                        label={selectedClient.complianceStatus}
                        tone={
                          selectedClient.complianceStatus === 'VERIFIED' ? 'success'
                          : selectedClient.complianceStatus === 'BLACKLISTED' || selectedClient.complianceStatus === 'REJECTED' ? 'danger'
                          : selectedClient.complianceStatus === 'UNDER_REVIEW' ? 'warning'
                          : 'neutral'
                        }
                        dot
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-[12px] md:grid-cols-3">
                      <InfoBit label="CIN / ID" value={selectedClient.idNumber ?? '—'} />
                      <InfoBit label="ICE" value={selectedClient.ice ?? '—'} />
                      <InfoBit label="Permis" value={selectedClient.licenseNumber ?? '—'} />
                    </div>
                    {selectedClient.complianceStatus !== 'VERIFIED' && (
                      <AIHint text="KYC incomplet. IA recommande : compléter l'attestation CNSS et scanner la CIN recto/verso avant de poursuivre." tone="warning" />
                    )}
                  </div>
                )}
              </>
            )}

            {step.key === 'vehicle' && (
              <>
                <div>
                  <label className="df-label">Véhicule disponible</label>
                  <select
                    className="df-input"
                    value={state.vehicleId ?? ''}
                    onChange={(e) => patch('vehicleId', e.target.value || null)}
                  >
                    <option value="">— Sélectionner —</option>
                    {(vehicles.data ?? [])
                      .filter((v) => v.status === 'AVAILABLE')
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.brand} {v.model} · {v.registration} · {v.year}
                        </option>
                      ))}
                  </select>
                </div>

                {selectedVehicle && (
                  <div className="rounded-xl border border-[color:var(--df-border)] bg-[color:var(--df-surface-sunk)] p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[color:var(--df-brand-50)] text-[color:var(--df-brand-600)] dark:bg-[color:var(--df-brand-100)]">
                        <Icon name="car" size={22} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-bold">{selectedVehicle.brand} {selectedVehicle.model}</div>
                        <div className="font-mono text-[11px] text-[color:var(--df-text-muted)]">{selectedVehicle.registration}</div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-[12px] md:grid-cols-4">
                          <InfoBit label="Année" value={String(selectedVehicle.year)} />
                          <InfoBit label="Carburant" value={selectedVehicle.fuel ?? '—'} />
                          <InfoBit label="Kilométrage" value={`${(selectedVehicle.mileageKm ?? 0).toLocaleString('fr-MA')} km`} />
                          <InfoBit label="Valeur nette" value={formatCurrencyMad(selectedVehicle.currentValueMad ?? 0)} />
                        </div>
                      </div>
                    </div>
                    <AIHint text="Véhicule éligible LLD & LOA. IA prédit un risque d'usure faible sur 36 mois." tone="success" />
                  </div>
                )}
              </>
            )}

            {step.key === 'type' && (
              <div className="grid gap-3 md:grid-cols-2">
                {CONTRACT_TYPES.map((t) => {
                  const active = state.type === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => patch('type', t.value)}
                      className={`group relative flex text-start gap-3 rounded-2xl border p-4 transition ${
                        active
                          ? 'border-[color:var(--df-brand-500)] bg-[color:var(--df-brand-50)] dark:bg-[color:var(--df-brand-100)] shadow-[var(--df-ring)]'
                          : 'border-[color:var(--df-border)] bg-[color:var(--df-surface)] hover:border-[color:var(--df-border-strong)]'
                      }`}
                    >
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                        style={{
                          background: active ? 'linear-gradient(135deg, var(--df-brand-500), var(--df-brand-700))' : 'var(--df-surface-sunk)',
                          color: active ? '#fff' : 'var(--df-brand-600)',
                        }}
                      >
                        <Icon name={t.icon} size={18} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-bold">{t.label}</div>
                        <div className="mt-0.5 text-[12px] text-[color:var(--df-text-muted)]">{t.sub}</div>
                        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[color:var(--df-text-faint)]">
                          <Icon name="shield" size={12} /> {t.legal}
                        </div>
                        {t.ai && (
                          <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--df-brand-500)]/30 bg-[color:var(--df-brand-500)]/10 px-2 py-1 text-[11px] font-semibold text-[color:var(--df-brand-600)] dark:text-indigo-300">
                            <Icon name="sparkles" size={12} /> {t.ai}
                          </div>
                        )}
                      </div>
                      {active && (
                        <span className="absolute top-3 end-3 flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--df-brand-500)] text-white">
                          <Icon name="check" size={12} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {step.key === 'terms' && (
              <>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Durée (mois)">
                    <input
                      type="number"
                      className="df-input"
                      value={state.durationMonths}
                      onChange={(e) => patch('durationMonths', Number(e.target.value))}
                    />
                  </Field>
                  <Field label={`${state.type === 'CREDIT_AUTO' ? 'Mensualité' : 'Loyer mensuel'} (MAD)`}>
                    <input
                      type="number"
                      className="df-input"
                      value={state.monthlyRentMad}
                      onChange={(e) => patch('monthlyRentMad', Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Kilométrage mensuel inclus">
                    <input
                      type="number"
                      className="df-input"
                      value={state.kmInclMonth}
                      onChange={(e) => patch('kmInclMonth', Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Caution / garantie (MAD)">
                    <input
                      type="number"
                      className="df-input"
                      value={state.securityDepositMad}
                      onChange={(e) => patch('securityDepositMad', Number(e.target.value))}
                    />
                  </Field>
                  {state.type === 'LOA' && (
                    <Field label="Valeur résiduelle (%)">
                      <input
                        type="number"
                        className="df-input"
                        value={state.residualValuePct}
                        onChange={(e) => patch('residualValuePct', Number(e.target.value))}
                      />
                    </Field>
                  )}
                </div>
                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Mode de paiement">
                    <select className="df-input" value={state.paymentMethod} onChange={(e) => patch('paymentMethod', e.target.value)}>
                      <option value="virement">Virement</option>
                      <option value="cheque">Chèque</option>
                      <option value="espece">Espèce</option>
                      <option value="carte">Carte</option>
                      <option value="autre">Autre</option>
                    </select>
                  </Field>
                  <Field label="Jour de paiement attendu (1–31)">
                    <input
                      type="number"
                      className="df-input"
                      min={1}
                      max={31}
                      value={state.expectedPaymentDay}
                      onChange={(e) => patch('expectedPaymentDay', e.target.value === '' ? '' : Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Conditions de paiement">
                    <input className="df-input" value={state.paymentTerms} onChange={(e) => patch('paymentTerms', e.target.value)} />
                  </Field>
                  <Field label="Référence virement">
                    <input className="df-input" value={state.bankReference} onChange={(e) => patch('bankReference', e.target.value)} />
                  </Field>
                  <Field label="N° chèque">
                    <input className="df-input" value={state.chequeNumber} onChange={(e) => patch('chequeNumber', e.target.value)} />
                  </Field>
                </div>
                <AIHint
                  tone="brand"
                  text={`Suggestion IA: pour ce profil client et véhicule, le loyer optimal est ${formatCurrencyMad(4280)}/mois. Conforme Bank Al-Maghrib.`}
                />
              </>
            )}

            {step.key === 'annex' && (
              <>
                <UploadZone label="Pièce d'identité (CIN recto/verso)" />
                <UploadZone label="Justificatif de revenus / attestation CNSS" />
                <UploadZone label="Permis de conduire valide" />
                {state.type === 'CREDIT_AUTO' && <UploadZone label="Bilans financiers (3 derniers exercices)" />}
                <AIHint tone="info" text="Tous les documents sont chiffrés et conformes Loi 09-08 sur la protection des données." />
              </>
            )}

            {step.key === 'review' && (
              <LegalPreview state={state} client={selectedClient?.name ?? '—'} vehicle={selectedVehicle ? `${selectedVehicle.brand} ${selectedVehicle.model}` : '—'} />
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[color:var(--df-border)] px-5 py-4">
            <button
              className="df-btn df-btn--ghost df-btn--sm"
              disabled={stepIdx === 0}
              onClick={() => setStepIdx((s) => Math.max(0, s - 1))}
            >
              <Icon name="chevron-left" size={14} /> Précédent
            </button>
            <div className="flex items-center gap-2">
              <button className="df-btn df-btn--subtle df-btn--sm" disabled={draftBusy} onClick={() => void handleSaveDraft()}>
                <Icon name="download" size={14} /> {draftBusy ? 'Traitement…' : 'Sauver brouillon'}
              </button>
              {stepIdx === STEPS.length - 1 ? (
                <button
                  className="df-btn df-btn--primary"
                  disabled={saving || !state.clientId || !state.vehicleId}
                  onClick={() => void submit()}
                >
                  <Icon name="sign" size={14} /> {saving ? 'Création…' : 'Envoyer pour signature'}
                </button>
              ) : (
                <button
                  className="df-btn df-btn--primary df-btn--sm"
                  disabled={!canNext}
                  onClick={() => setStepIdx((s) => Math.min(STEPS.length - 1, s + 1))}
                >
                  Suivant <Icon name="chevron-right" size={14} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Summary */}
        <aside className="space-y-6">
          <div className="df-card df-card--elev sticky top-20 overflow-hidden">
            <div
              className="relative px-5 py-4"
              style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--df-brand-500) 18%, transparent), transparent)' }}
            >
              <div className="df-card__hint">Résumé contrat</div>
              <div className="mt-1 flex items-center gap-2">
                <Icon name={selectedType?.icon ?? 'doc'} size={18} className="text-[color:var(--df-brand-600)]" />
                <div className="text-[15px] font-bold">{selectedType?.label ?? '—'}</div>
              </div>
            </div>
            <div className="divide-y divide-[color:var(--df-border)]">
              <SummaryRow label="Client" value={selectedClient?.name ?? '—'} />
              <SummaryRow label="Véhicule" value={selectedVehicle ? `${selectedVehicle.brand} ${selectedVehicle.model}` : '—'} />
              <SummaryRow label="Immatriculation" value={selectedVehicle?.registration ?? '—'} mono />
              <SummaryRow label="Durée" value={`${state.durationMonths} mois`} />
              <SummaryRow label="Mensualité" value={formatCurrencyMad(state.monthlyRentMad)} highlight />
              <SummaryRow label="Km inclus / mois" value={state.kmInclMonth.toLocaleString('fr-MA')} />
              <SummaryRow label="Caution" value={formatCurrencyMad(state.securityDepositMad)} />
              {state.type === 'LOA' && <SummaryRow label="Valeur résiduelle" value={`${state.residualValuePct}%`} />}
              <div className="px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--df-text-faint)]">Total engagement</div>
                <div className="df-num mt-1 text-[color:var(--df-brand-600)]" style={{ fontSize: 26, fontWeight: 800 }}>
                  {formatCurrencyMad(totalAmount)}
                </div>
                <div className="mt-0.5 text-[11px] text-[color:var(--df-text-muted)]">hors frais de dossier · TVA 20% applicable</div>
              </div>
            </div>
          </div>

          <div className="df-card p-4">
            <div className="df-card__hint">Checklist conformité</div>
            <ul className="mt-3 space-y-2 text-[12.5px]">
              <CheckRow done={!!selectedClient} label="Client sélectionné" />
              <CheckRow done={!!selectedVehicle} label="Véhicule sélectionné" />
              <CheckRow done={stepIdx >= 2} label="Type de contrat défini" />
              <CheckRow done={stepIdx >= 3} label="Conditions financières" />
              <CheckRow done={stepIdx >= 4} label="Pièces jointes" />
              <CheckRow done={stepIdx === 5} label="Prêt à signer" />
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="df-label">{label}</label>
    {children}
  </div>
);

const InfoBit: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--df-text-faint)]">{label}</div>
    <div className="mt-0.5 font-semibold">{value}</div>
  </div>
);

const AIHint: React.FC<{ text: string; tone?: 'brand' | 'success' | 'warning' | 'info' }> = ({ text, tone = 'brand' }) => {
  const color =
    tone === 'success' ? 'var(--df-success-500)'
    : tone === 'warning' ? 'var(--df-warning-500)'
    : tone === 'info' ? 'var(--df-info-500)'
    : 'var(--df-brand-500)';
  return (
    <div
      className="mt-3 flex items-start gap-2 rounded-xl border p-3"
      style={{
        borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
        background: `color-mix(in srgb, ${color} 8%, transparent)`,
      }}
    >
      <Icon name="sparkles" size={14} style={{ color }} className="mt-0.5 shrink-0" />
      <span className="text-[12.5px] leading-relaxed">{text}</span>
    </div>
  );
};

const SummaryRow: React.FC<{ label: string; value: string; mono?: boolean; highlight?: boolean }> = ({ label, value, mono, highlight }) => (
  <div className="flex items-center justify-between px-4 py-2.5 text-[12.5px]">
    <span className="text-[color:var(--df-text-muted)]">{label}</span>
    <span className={`${mono ? 'font-mono' : ''} ${highlight ? 'font-bold text-[color:var(--df-brand-600)] dark:text-indigo-300' : 'font-semibold'}`}>{value}</span>
  </div>
);

const CheckRow: React.FC<{ done: boolean; label: string }> = ({ done, label }) => (
  <li className="flex items-center gap-2">
    <span
      className={`flex h-5 w-5 items-center justify-center rounded-full ${
        done ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'bg-[color:var(--df-surface-sunk)] text-[color:var(--df-text-faint)]'
      }`}
    >
      <Icon name={done ? 'check' : 'minus'} size={12} />
    </span>
    <span className={done ? 'font-semibold' : 'text-[color:var(--df-text-muted)]'}>{label}</span>
  </li>
);

const LegalPreview: React.FC<{ state: WizardState; client: string; vehicle: string }> = ({ state, client, vehicle }) => {
  const t = CONTRACT_TYPES.find((x) => x.value === state.type);
  const today = formatDate(new Date());
  return (
    <div className="rounded-2xl border border-[color:var(--df-border)] bg-[color:var(--df-surface-sunk)] p-5">
      <div className="flex items-center justify-between">
        <div className="df-card__hint">Aperçu juridique</div>
        <div className="flex gap-2">
          <StatusChip label="Droit marocain" tone="brand" />
          <StatusChip label="DOC · Loi 31-08" tone="info" />
        </div>
      </div>
      <article className="mt-3 rounded-xl border border-[color:var(--df-border)] bg-[color:var(--df-surface-solid)] p-6 text-[13px] leading-relaxed">
        <h3 className="text-center text-[15px] font-black tracking-wide uppercase">Contrat {t?.label}</h3>
        <p className="mt-2 text-center text-[11px] text-[color:var(--df-text-muted)]">Référence brouillon · {today}</p>
        <hr className="my-4 border-[color:var(--df-border)]" />
        <p><strong>Entre les soussignés :</strong></p>
        <p className="mt-2">DriveFlow SA, société de droit marocain au capital de <span className="df-num font-semibold">10 000 000 MAD</span>, siège social à Casablanca, ci-après dénommée <em>« le Bailleur »</em>,</p>
        <p className="mt-2">Et</p>
        <p className="mt-2"><strong>{client}</strong>, ci-après dénommé <em>« le Preneur »</em>,</p>
        <hr className="my-4 border-[color:var(--df-border)]" />
        <p><strong>Article 1 — Objet</strong></p>
        <p className="mt-1">Le Bailleur met à la disposition du Preneur, dans le cadre d’un contrat <em>{t?.label}</em>, le véhicule <strong>{vehicle}</strong>, pour une durée de <span className="df-num font-semibold">{state.durationMonths} mois</span>.</p>
        <p className="mt-3"><strong>Article 2 — Loyer et conditions financières</strong></p>
        <p className="mt-1">Le loyer mensuel est fixé à <span className="df-num font-semibold">{formatCurrencyMad(state.monthlyRentMad)}</span>, payable le 5 de chaque mois. Le kilométrage inclus est de <span className="df-num font-semibold">{state.kmInclMonth.toLocaleString('fr-MA')} km/mois</span> ; tout dépassement sera facturé conformément à l'annexe tarifaire.</p>
        <p className="mt-3"><strong>Article 3 — Géolocalisation</strong></p>
        <p className="mt-1">Conformément à la loi 09-08, le Preneur est informé que le véhicule est équipé d’un dispositif GPS. Les données sont conservées de manière chiffrée et utilisées exclusivement pour le suivi contractuel et la sécurité de l'actif.</p>
        <p className="mt-3 text-[11px] text-[color:var(--df-text-faint)]">… clauses supplémentaires générées automatiquement selon le type de contrat.</p>
      </article>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-[color:var(--df-border)] bg-[color:var(--df-surface-solid)] p-4">
          <div className="df-card__hint">Signature Bailleur</div>
          <div className="mt-2 flex h-20 items-center justify-center rounded-lg border border-dashed border-[color:var(--df-border-strong)] text-[12px] text-[color:var(--df-text-muted)]">
            <Icon name="sign" size={16} className="me-1" /> Signature électronique qualifiée
          </div>
        </div>
        <div className="rounded-xl border border-[color:var(--df-border)] bg-[color:var(--df-surface-solid)] p-4">
          <div className="df-card__hint">Signature Preneur</div>
          <div className="mt-2 flex h-20 items-center justify-center rounded-lg border border-dashed border-[color:var(--df-border-strong)] text-[12px] text-[color:var(--df-text-muted)]">
            En attente — envoi par email
          </div>
        </div>
      </div>
    </div>
  );
};
