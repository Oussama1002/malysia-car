import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, getApiBase } from '@/services/apiClient';
import { queryKeys } from '@/services/queryKeys';
import type { CustomerDto, FleetVehicleDto } from '@/services/dtos';
import { Icon, type IconName } from '@/modules/shared/components/Icon';
import { StatusChip } from '@/modules/shared/components/StatusChip';
import { UploadZone } from '@/modules/shared/components/UploadZone';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { formatCurrencyMad, formatDate } from '@/modules/shared/formatters';
import type { ContractType } from '@/services/dtos';
import { contractsApi } from '@/services/contractsApi';
import { documentsApi } from '@/services/documentsApi';
import { createEnvelope, sendEnvelope } from '@/services/signatureApi';
import { useAuthSession } from '@/modules/auth/AuthContext';
import { CustomerForm } from '@/modules/customers/CustomerForm';
import type { ScannedDocument } from '@/modules/customers/CustomerIdentityScanner';
import { createCustomer, type CustomerCreatePayload } from '@/services/customersApi';
import { listBranches, listUsers, type AdminUser } from '@/services/adminApi';
import { ApiError } from '@/services/apiError';
import { documentReaderApi } from '@/services/documentReaderApi';
import { documentCenterApi, type DocumentCenterItem } from '@/services/documentCenterApi';

type StepKey = 'client' | 'assignment' | 'vehicle' | 'type' | 'terms' | 'annex' | 'review';

interface PaymentEntry {
  id: string;
  method: string;
  amount: number | '';
  reference: string;
  chequeNumber: string;
}

interface Step {
  key: StepKey;
  title: string;
  hint: string;
  icon: IconName;
}

const STEPS: Step[] = [
  { key: 'client', title: 'Client', hint: 'Locataire 1 & 2', icon: 'users' },
  { key: 'assignment', title: 'Agent', hint: 'Commercial', icon: 'users' },
  { key: 'vehicle', title: 'Véhicule', hint: 'Choix de l\u2019actif', icon: 'car' },
  { key: 'type', title: 'Type', hint: 'LLD / LOA / VO', icon: 'doc' },
  { key: 'terms', title: 'Conditions', hint: 'Loyer & durée', icon: 'coin' },
  { key: 'annex', title: 'Annexes', hint: 'Justificatifs', icon: 'upload' },
  { key: 'review', title: 'Validation', hint: 'Signature', icon: 'sign' },
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
  secondaryClientId: string | number | null;
  secondaryClientSearch: string;
  assignedAgentId: string | null;
  vehicleId: string | number | null;
  type: ContractType;
  durationMonths: number;
  monthlyRentMad: number;
  kmInclMonth: number;
  securityDepositMad: number;
  residualValuePct: number;
  notes: string;
  payments: PaymentEntry[];
  paymentTerms: string;
  expectedPaymentDay: number | '';
  startDate: string | null;
  endDate: string | null;
  secondDriverName: string;
  assignedAgent: string;
}

const INITIAL: WizardState = {
  clientId: null,
  secondaryClientId: null,
  secondaryClientSearch: '',
  assignedAgentId: null,
  vehicleId: null,
  type: 'LLD',
  durationMonths: 0,
  monthlyRentMad: 0,
  kmInclMonth: 0,
  securityDepositMad: 0,
  residualValuePct: 38,
  notes: '',
  payments: [{ id: String(Date.now()), method: 'virement', amount: '', reference: '', chequeNumber: '' }],
  paymentTerms: '',
  expectedPaymentDay: 5,
  startDate: null,
  endDate: null,
  secondDriverName: '',
  assignedAgent: '',
};

function friendlyError(e: unknown, fallback: string): string {
  const raw = e instanceof Error ? e.message : String(e ?? '');
  if (raw.includes('No query results for model') || raw.includes('ModelNotFoundException')) {
    return 'Ressource introuvable sur le serveur. Veuillez réessayer.';
  }
  return raw || fallback;
}

/** Calculate the number of days between two ISO date strings. */
function daysBetween(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000));
}

export const ContractWizardPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { session } = useAuthSession();
  const [stepIdx, setStepIdx] = useState(0);
  const [state, setState] = useState<WizardState>(INITIAL);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftInfo, setDraftInfo] = useState<string | null>(null);
  const [draftContractId, setDraftContractId] = useState<string | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const autoSaveRef = useRef(false);
  const [newClientDrawerOpen, setNewClientDrawerOpen] = useState(false);
  const [newClientError, setNewClientError] = useState<string | null>(null);
  const [prefillBanner, setPrefillBanner] = useState<string | null>(null);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const prefillDoneRef = useRef(false);
  const step = STEPS[stepIdx];

  // Pre-fill wizard from a reservation when ?from_reservation=UUID is present
  useEffect(() => {
    const reservationId = searchParams.get('from_reservation');
    if (!reservationId || prefillDoneRef.current) return;
    prefillDoneRef.current = true;
    setPrefillLoading(true);
    (async () => {
      try {
        const res = await apiClient<{ data: { reservation: any } }>(`/v1/reservations/${reservationId}`);
        const r = res.data?.reservation ?? res.data ?? res;
        const startDate: string | null = r.desired_start_at
          ? String(r.desired_start_at).slice(0, 10)
          : null;
        const endDate: string | null = r.desired_end_at
          ? String(r.desired_end_at).slice(0, 10)
          : null;
        const durationMonths =
          startDate && endDate ? daysBetween(startDate, endDate) : 0;
        // Normalise payment method to wizard options
        const methodMap: Record<string, string> = {
          virement: 'virement',
          bank_transfer: 'virement',
          cheque: 'cheque',
          chèque: 'cheque',
          espece: 'espece',
          cash: 'espece',
          carte: 'carte',
          card: 'carte',
        };
        const rawMethod = String(r.payment_method ?? '').toLowerCase();
        const paymentMethod = methodMap[rawMethod] ?? 'virement';

        // Map reservation_type to contract type
        const typeMap: Record<string, ContractType> = {
          SHORT_RENTAL: 'LOCATION_COURTE',
          short_rental: 'LOCATION_COURTE',
          LONG_RENTAL:  'LLD',
          long_rental:  'LLD',
          LLD:          'LLD',
          LOA:          'LOA',
          CREDIT_AUTO:  'CREDIT_AUTO',
          VENTE_VO:     'VENTE_VO',
        };
        const contractType: ContractType = typeMap[r.reservation_type ?? ''] ?? 'LOCATION_COURTE';

        setState((prev) => ({
          ...prev,
          clientId: r.customer_id ?? null,
          vehicleId: r.vehicle_id ?? null,
          type: contractType,
          startDate,
          endDate,
          durationMonths,
          monthlyRentMad: r.estimated_price ? Math.round(Number(r.estimated_price) / Math.max(1, durationMonths)) : prev.monthlyRentMad,
          securityDepositMad: r.deposit_amount ? Number(r.deposit_amount) : prev.securityDepositMad,
          payments: [{ id: String(Date.now()), method: paymentMethod, amount: '', reference: '', chequeNumber: '' }],
        }));

        // Record the reservation number for the banner
        const rsvNumber: string = r.reservation_number ?? `RSV-${String(reservationId).slice(0, 8).toUpperCase()}`;
        setPrefillBanner(rsvNumber);

        // Advance to type step (assignment remains optional for now).
        setStepIdx(3);
      } catch (e) {
        // Non-blocking: just log, don't block the wizard
        console.warn('[ContractWizard] Pre-fill from reservation failed:', e);
      } finally {
        setPrefillLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save draft when the user reaches Step 6 (review), once per wizard session
  useEffect(() => {
    if (stepIdx !== 5) return;
    if (autoSaveRef.current) return; // already triggered
    if (!state.clientId || !state.vehicleId) return; // not enough data yet
    autoSaveRef.current = true;
    setAutoSaveStatus('saving');
    (async () => {
      try {
        if (!draftContractId) {
          const created = await contractsApi.create(buildCreatePayload('draft'));
          setDraftContractId(String(created.id));
        }
        setAutoSaveStatus('saved');
        // Reset after 4 s so the indicator fades away naturally
        setTimeout(() => setAutoSaveStatus('idle'), 4000);
      } catch {
        setAutoSaveStatus('error');
        autoSaveRef.current = false; // allow retry on re-entry
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx]);

  const qc = useQueryClient();
  const branchesQ = useQuery({ queryKey: ['admin', 'branches'], queryFn: () => listBranches() });
  const createCustomerMut = useMutation({
    mutationFn: async (vars: { payload: CustomerCreatePayload; scans: ScannedDocument[] }) => {
      const res = await createCustomer(vars.payload);
      for (const scan of vars.scans) {
        try {
          await documentReaderApi.link(scan.documentId, 'customer', String(res.data.id));
        } catch {
          /* don't block on attachment failures */
        }
      }
      return res;
    },
    onSuccess: async (res) => {
      setNewClientError(null);
      setNewClientDrawerOpen(false);
      await qc.invalidateQueries({ queryKey: queryKeys.customers.all });
      patch('clientId', String(res.data.id));
    },
    onError: (e) => setNewClientError(e instanceof ApiError ? e.message : 'Erreur de création du client'),
  });

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
        ownershipStatus: v.ownership_status,
      }));
    },
  });

  const agents = useQuery({
    queryKey: ['admin', 'users', 'contract-assignees'],
    queryFn: async (): Promise<AdminUser[]> => {
      try {
        const res = await listUsers({ status: 'active', per_page: 200 });
        return res.data ?? [];
      } catch {
        // Non-admin profiles may not have access to users listing.
        return [];
      }
    },
  });

  const customerDocs = useQuery({
    queryKey: ['customer-docs', state.clientId],
    queryFn: () => documentCenterApi.byEntity('customer', state.clientId!),
    enabled: !!state.clientId,
  });

  const allClientDocs: DocumentCenterItem[] = [
    ...(customerDocs.data?.data?.attachments ?? []),
    ...(customerDocs.data?.data?.generated ?? []),
  ];
  const cinDoc = allClientDocs.find((d) =>
    ['cin', 'national_id', 'identit', 'cni'].some((k) => d.category?.toLowerCase().includes(k) || d.title?.toLowerCase().includes(k))
  );
  const permisDoc = allClientDocs.find((d) =>
    ['permis', 'driving', 'license', 'licence'].some((k) => d.category?.toLowerCase().includes(k) || d.title?.toLowerCase().includes(k))
  );

  const selectedClient = clients.data?.find((c) => String(c.id) === String(state.clientId));
  const selectedSecondaryClient = clients.data?.find((c) => String(c.id) === String(state.secondaryClientId));
  const selectedAgent = agents.data?.find((u) => String(u.id) === String(state.assignedAgentId));
  const selectedVehicle = vehicles.data?.find((v) => String(v.id) === String(state.vehicleId));
  const selectedType = CONTRACT_TYPES.find((t) => t.value === state.type);

  const isShortRental = state.type === 'LOCATION_COURTE';
  const totalAmount = state.monthlyRentMad * state.durationMonths;

  const canNext = useMemo(() => {
    if (step.key === 'client') return !!state.clientId;
    if (step.key === 'assignment') return true;
    if (step.key === 'vehicle') return !!state.vehicleId;
    return true;
  }, [step, state]);

  function patch<K extends keyof WizardState>(k: K, v: WizardState[K]): void {
    setState((s) => ({ ...s, [k]: v }));
  }

  function addPayment(): void {
    setState((s) => ({
      ...s,
      payments: [...s.payments, { id: String(Date.now()), method: 'virement', amount: '', reference: '', chequeNumber: '' }],
    }));
  }

  function removePayment(id: string): void {
    setState((s) => ({ ...s, payments: s.payments.filter((p) => p.id !== id) }));
  }

  function updatePayment(id: string, key: keyof Omit<PaymentEntry, 'id'>, value: string | number | ''): void {
    setState((s) => ({ ...s, payments: s.payments.map((p) => p.id === id ? { ...p, [key]: value } : p) }));
  }

  function buildCreatePayload(status?: 'draft' | 'pending_approval') {
    const primary = state.payments[0];
    const assignmentNotes = [
      state.assignedAgentId && selectedAgent
        ? `Agent assigné: ${selectedAgent.name} (${selectedAgent.email})`
        : null,
      state.secondaryClientId && selectedSecondaryClient
        ? `Locataire 2: ${selectedSecondaryClient.name}`
        : state.secondaryClientSearch
          ? `Locataire 2: ${state.secondaryClientSearch}`
          : null,
    ].filter(Boolean).join('\n');
    const mergedNotes = [assignmentNotes, state.notes].filter(Boolean).join('\n');
    return {
      type: state.type,
      clientId: state.clientId ?? '',
      vehicleId: state.vehicleId ?? undefined,
      amountMad: totalAmount,
      startDate: state.startDate ?? new Date().toISOString().slice(0, 10),
      endDate: state.endDate ?? undefined,
      durationMonths: state.durationMonths,
      monthlyPayment: state.monthlyRentMad,
      allowedKm: state.kmInclMonth * state.durationMonths,
      depositAmount: state.securityDepositMad,
      notes: mergedNotes,
      paymentMethod: primary?.method ?? 'virement',
      paymentTerms: state.paymentTerms || undefined,
      bankReference: state.payments.map((p) => p.reference).filter(Boolean).join(', ') || undefined,
      chequeNumber: state.payments.map((p) => p.chequeNumber).filter(Boolean).join(', ') || undefined,
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
      setSaveError(friendlyError(e, 'Erreur de sauvegarde du brouillon'));
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
      setSaveError(friendlyError(e, 'Erreur de génération PDF'));
    } finally {
      setDraftBusy(false);
    }
  }

  async function submit(): Promise<void> {
    setSaving(true);
    setSaveError(null);
    let createdId: string | null = null;
    try {
      const created = await contractsApi.create(buildCreatePayload('draft'));
      createdId = String(created.id);

      // Generate payment schedule
      try {
        await contractsApi.generateSchedule(created.id, {
          start_date: state.startDate ?? new Date().toISOString().slice(0, 10),
          months: state.durationMonths,
          monthly_amount: state.monthlyRentMad,
          tax_rate: 0.2,
        });
      } catch {
        // Non-blocking — schedule can be generated later
      }

      // Generate and download PDF
      try {
        const generatedDoc = await documentsApi.generateContractPdf(String(created.id));
        await documentsApi.downloadWithAuth(generatedDoc.data.id, `contrat-${created.contract_number ?? createdId.slice(0, 8)}.pdf`);
      } catch (pdfErr) {
        console.warn('[ContractWizard] PDF generation error (non-blocking):', pdfErr);
      }

      navigate(`/contracts/${createdId}`);
    } catch (e) {
      const raw = e instanceof Error ? e.message : '';
      if (raw.includes('No query results for model') || raw.includes('ModelNotFoundException')) {
        setSaveError('Le contrat a été créé mais une ressource associée est introuvable sur le serveur. Vérifiez la fiche contrat.');
      } else {
        setSaveError(raw || 'Erreur inconnue lors de la création du contrat.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Pre-fill loading indicator */}
      {prefillLoading && (
        <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          <svg className="h-4 w-4 animate-spin shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          Chargement des informations de la réservation…
        </div>
      )}

      {/* Pre-fill success banner */}
      {prefillBanner && !prefillLoading && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/40">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Pré-rempli depuis la réservation <span className="font-mono">{prefillBanner}</span> — vérifiez les informations et complétez le contrat.
          </div>
          <button
            type="button"
            className="ml-4 shrink-0 text-emerald-600 hover:text-emerald-800 dark:text-emerald-400"
            onClick={() => setPrefillBanner(null)}
            aria-label="Fermer"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

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
        <div className="flex items-center gap-2">
          {/* Auto-save indicator — visible on step 6 */}
          {autoSaveStatus === 'saving' && (
            <span className="flex items-center gap-1.5 text-xs text-slate-400 animate-pulse">
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
              Sauvegarde…
            </span>
          )}
          {autoSaveStatus === 'saved' && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Brouillon sauvegardé
            </span>
          )}
          {autoSaveStatus === 'error' && (
            <span className="flex items-center gap-1.5 text-xs text-red-500">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 8v4m0 4h.01" />
              </svg>
              Échec sauvegarde
            </span>
          )}
          <button className="df-btn df-btn--ghost df-btn--sm" disabled={draftBusy} onClick={() => void handleDraftPdf()}>
            <Icon name="download" size={14} /> {draftBusy ? 'Traitement…' : 'Brouillon PDF'}
          </button>
          <Link to="/contracts" className="df-btn df-btn--subtle df-btn--sm"><Icon name="close" size={14} /> Abandonner</Link>
        </div>
      </header>

      {/* Stepper */}
      <div className="df-card px-4 py-5 md:px-6">
        <div className="df-stepper">
          {STEPS.map((s, i) => {
            const done = i < stepIdx;
            const active = i === stepIdx;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => i <= stepIdx && setStepIdx(i)}
                className={`df-step ${done ? 'df-step--done' : ''} ${active ? 'df-step--active' : ''}`}
                style={{ cursor: i <= stepIdx ? 'pointer' : 'default', background: 'transparent', border: 0 }}
              >
                {i < STEPS.length - 1 && (
                  <span className={`df-step__rail ${done ? 'df-step__rail--done' : active ? 'df-step__rail--active' : ''}`} />
                )}
                <span className="df-step__bullet">
                  {done ? <Icon name="check" size={14} /> : i + 1}
                </span>
                <span className="df-step__text">
                  <span className="df-step__label">{s.title}</span>
                  <span className="df-step__hint">{s.hint}</span>
                </span>
              </button>
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
                  <label className="df-label">Client locataire 1</label>
                  <div className="flex items-stretch gap-2">
                    <select
                      className="df-input flex-1"
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
                    <button
                      type="button"
                      className="df-btn df-btn--primary whitespace-nowrap"
                      onClick={() => {
                        setNewClientError(null);
                        setNewClientDrawerOpen(true);
                      }}
                    >
                      + Nouveau client
                    </button>
                  </div>
                </div>
                <ClientAutocomplete
                  label="Client locataire 2 (optionnel)"
                  placeholder="Tapez un nom…"
                  value={state.secondaryClientSearch}
                  clients={(clients.data ?? []).filter((c) => String(c.id) !== String(state.clientId))}
                  onChange={(search, id) => {
                    setState((s) => ({ ...s, secondaryClientSearch: search, secondaryClientId: id, secondDriverName: id ? '' : search }));
                  }}
                />

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

            {step.key === 'assignment' && (
              <>
                <div>
                  <label className="df-label">Assigned agent</label>
                  <select
                    className="df-input"
                    value={state.assignedAgentId ?? ''}
                    onChange={(e) => patch('assignedAgentId', e.target.value || null)}
                  >
                    <option value="">— Non assigné —</option>
                    {(agents.data ?? []).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} · {u.role}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedAgent && (
                  <div className="rounded-xl border border-[color:var(--df-border)] bg-[color:var(--df-surface-sunk)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[color:var(--df-text-faint)]">Agent assigné</div>
                        <div className="text-[15px] font-bold">{selectedAgent.name}</div>
                        <div className="text-[12px] text-[color:var(--df-text-muted)]">{selectedAgent.email}</div>
                      </div>
                      <StatusChip label={selectedAgent.role} tone="info" />
                    </div>
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
                      .filter((v) => String(v.status).toUpperCase() === 'AVAILABLE')
                      .map((v) => {
                        // Build the human label. Fall back to "Véhicule" when
                        // both brand and model are empty so the option never
                        // collapses to just the registration.
                        const brandModel = [v.brand, v.model].filter(Boolean).join(' ').trim();
                        const label = brandModel || 'Véhicule';
                        const isSL = v.ownershipStatus === 'sub_rented';
                        return (
                          <option key={v.id} value={v.id}>
                            {isSL ? '[SL] ' : ''}{label} · {v.registration}{v.year ? ` · ${v.year}` : ''}
                          </option>
                        );
                      })}
                  </select>
                  {selectedVehicle?.ownershipStatus === 'sub_rented' && (
                    <p className="mt-1 text-[11px] font-semibold text-amber-700">
                      ⚠️ Véhicule en sous-location (SL) — vérifiez les conditions de re-location.
                    </p>
                  )}
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
                {/* Date & heure de création (auto, non modifiable) */}
                <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Date & heure de création">
                    <input
                      type="datetime-local"
                      className="df-input bg-slate-50 text-slate-500"
                      value={(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; })()}
                      disabled
                    />
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Durée (jours)">
                    <input
                      type="number"
                      className="df-input"
                      value={state.durationMonths}
                      onChange={(e) => patch('durationMonths', Number(e.target.value))}
                    />
                  </Field>
                  <Field label={`${state.type === 'CREDIT_AUTO' ? 'Mensualité' : isShortRental ? 'Prix par jour' : 'Loyer mensuel'} (MAD)`}>
                    <input
                      type="number"
                      className="df-input"
                      value={state.monthlyRentMad}
                      onChange={(e) => patch('monthlyRentMad', Number(e.target.value))}
                    />
                  </Field>
                  <Field label={isShortRental ? 'Kilométrage journalier inclus' : 'Kilométrage mensuel inclus'}>
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
                <div className="mt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="df-label mb-0">Modes de paiement</span>
                    <button type="button" className="df-btn df-btn--subtle df-btn--sm" onClick={addPayment}>
                      <Icon name="plus" size={13} /> Ajouter un mode
                    </button>
                  </div>
                  {state.payments.map((p, i) => (
                    <div key={p.id} className="rounded-xl border border-[color:var(--df-border)] p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-bold text-[color:var(--df-text-muted)]">Paiement {i + 1}</span>
                        {state.payments.length > 1 && (
                          <button type="button" className="df-btn df-btn--ghost df-btn--sm text-rose-600" onClick={() => removePayment(p.id)}>
                            <Icon name="close" size={12} /> Supprimer
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <Field label="Mode">
                          <select className="df-input" value={p.method} onChange={(e) => updatePayment(p.id, 'method', e.target.value)}>
                            <option value="virement">Virement</option>
                            <option value="cheque">Chèque</option>
                            <option value="espece">Espèce</option>
                            <option value="carte">Carte</option>
                            <option value="autre">Autre</option>
                          </select>
                        </Field>
                        <Field label="Montant (MAD) — optionnel">
                          <input
                            type="number"
                            className="df-input"
                            placeholder="—"
                            value={p.amount}
                            onChange={(e) => updatePayment(p.id, 'amount', e.target.value === '' ? '' : Number(e.target.value))}
                          />
                        </Field>
                        {(p.method === 'virement' || p.method === 'carte' || p.method === 'autre') && (
                          <Field label="Référence">
                            <input className="df-input" value={p.reference} onChange={(e) => updatePayment(p.id, 'reference', e.target.value)} />
                          </Field>
                        )}
                        {p.method === 'cheque' && (
                          <Field label="N° chèque">
                            <input className="df-input" value={p.chequeNumber} onChange={(e) => updatePayment(p.id, 'chequeNumber', e.target.value)} />
                          </Field>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 pt-2">
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
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Agent assigné">
                    <select
                      className="df-input"
                      value={state.assignedAgentId ?? ''}
                      onChange={(e) => patch('assignedAgentId', e.target.value || null)}
                    >
                      <option value="">— Non assigné —</option>
                      {(agents.data ?? []).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} · {u.role}
                        </option>
                      ))}
                    </select>
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
                <div className="space-y-3">
                  <div className="text-[12px] font-bold uppercase tracking-[0.12em] text-[color:var(--df-text-faint)]">Documents client</div>
                  {cinDoc
                    ? <ExistingDocRow doc={cinDoc} label="Pièce d'identité (CIN)" />
                    : <UploadZone label="Pièce d'identité (CIN recto/verso)" />
                  }
                  {permisDoc
                    ? <ExistingDocRow doc={permisDoc} label="Permis de conduire" />
                    : <UploadZone label="Permis de conduire valide" />
                  }
                  <UploadZone label="Justificatif de revenus / attestation CNSS" />
                  {state.type === 'CREDIT_AUTO' && <UploadZone label="Bilans financiers (3 derniers exercices)" />}
                </div>
                <div className="mt-5 space-y-3">
                  <div className="text-[12px] font-bold uppercase tracking-[0.12em] text-[color:var(--df-text-faint)]">Photos véhicule avant livraison</div>
                  <div className="grid grid-cols-2 gap-3">
                    <UploadZone label="Avant" hint="JPG / PNG" />
                    <UploadZone label="Arrière" hint="JPG / PNG" />
                    <UploadZone label="Côté gauche" hint="JPG / PNG" />
                    <UploadZone label="Côté droit" hint="JPG / PNG" />
                  </div>
                  <UploadZone label="Intérieur / tableau de bord" hint="JPG / PNG" />
                </div>
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
                  <Icon name="download" size={14} /> {saving ? 'Création…' : 'Sauvegarder & télécharger PDF'}
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
              <SummaryRow label="Client locataire 2" value={(selectedSecondaryClient?.name ?? state.secondaryClientSearch) || '—'} />
              <SummaryRow label="Agent assigné" value={selectedAgent?.name ?? '—'} />
              <SummaryRow label="Véhicule" value={selectedVehicle ? `${selectedVehicle.brand} ${selectedVehicle.model}` : '—'} />
              <SummaryRow label="Immatriculation" value={selectedVehicle?.registration ?? '—'} mono />
              <SummaryRow label="Durée" value={`${state.durationMonths} jour${state.durationMonths > 1 ? 's' : ''}`} />
              <SummaryRow label={isShortRental ? 'Prix / jour' : 'Mensualité'} value={formatCurrencyMad(state.monthlyRentMad)} highlight />
              <SummaryRow label={isShortRental ? 'Km inclus / jour' : 'Km inclus / mois'} value={state.kmInclMonth.toLocaleString('fr-MA')} />
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
              <CheckRow done={!state.secondaryClientId || !!selectedSecondaryClient} label="Locataire 2 renseigné" />
              <CheckRow done={!state.assignedAgentId || !!selectedAgent} label="Agent assigné" />
              <CheckRow done={!!selectedVehicle} label="Véhicule sélectionné" />
              <CheckRow done={stepIdx >= 3} label="Type de contrat défini" />
              <CheckRow done={stepIdx >= 4} label="Conditions financières" />
              <CheckRow done={stepIdx >= 5} label="Pièces jointes" />
              <CheckRow done={stepIdx === 6} label="Prêt à signer" />
            </ul>
          </div>
        </aside>
      </section>

      <DrawerPanel
        open={newClientDrawerOpen}
        title="Nouveau client"
        onClose={() => setNewClientDrawerOpen(false)}
        widthClass="max-w-2xl"
      >
        <CustomerForm
          mode="create"
          error={newClientError}
          submitting={createCustomerMut.isPending}
          branches={branchesQ.data?.data ?? []}
          onCancel={() => setNewClientDrawerOpen(false)}
          onSubmit={(payload, scans) => {
            setNewClientError(null);
            createCustomerMut.mutate({ payload, scans });
          }}
        />
      </DrawerPanel>
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="df-label">{label}</label>
    {children}
  </div>
);

const ClientAutocomplete: React.FC<{
  label: string;
  placeholder?: string;
  value: string;
  clients: CustomerDto[];
  onChange: (search: string, selectedId: string | null) => void;
}> = ({ label, placeholder, value, clients, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = value.trim()
    ? clients.filter((c) => c.name.toLowerCase().includes(value.toLowerCase()))
    : [];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <label className="df-label">{label}</label>
      <input
        type="text"
        className="df-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value, null);
          setOpen(true);
        }}
        onFocus={() => { if (value.trim()) setOpen(true); }}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-[color:var(--df-border)] bg-[color:var(--df-surface-elev)] shadow-lg">
          {filtered.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-start text-sm hover:bg-[color:var(--df-surface-sunk)]"
                onClick={() => {
                  onChange(c.name, String(c.id));
                  setOpen(false);
                }}
              >
                <span className="font-semibold">{c.name}</span>
                <span className="text-[11px] text-[color:var(--df-text-muted)]">
                  {c.kind === 'ENTREPRISE' ? 'Entreprise' : 'Particulier'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

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

const ExistingDocRow: React.FC<{ doc: DocumentCenterItem; label: string }> = ({ doc, label }) => (
  <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/40">
    <div className="flex items-center gap-2">
      <Icon name="check" size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
      <div>
        <div className="text-[12px] font-bold text-emerald-800 dark:text-emerald-300">{label}</div>
        <div className="text-[11px] text-emerald-700 dark:text-emerald-400">{doc.title}{doc.createdAt ? ` · ${formatDate(new Date(doc.createdAt))}` : ''}</div>
      </div>
    </div>
    <button
      type="button"
      className="df-btn df-btn--ghost df-btn--sm text-emerald-700 dark:text-emerald-400"
      onClick={() => void documentCenterApi.openInNewTab(doc.id)}
    >
      <Icon name="download" size={12} /> Voir
    </button>
  </div>
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
        <p className="mt-1">
          {`Le Bailleur met à la disposition du Preneur, dans le cadre d’un contrat `}
          <em>{t?.label}</em>
          {`, le véhicule `}<strong>{vehicle}</strong>
          {`, pour une durée de `}
          <span className="df-num font-semibold">
            {`${state.durationMonths} jour${state.durationMonths > 1 ? "s" : ""}`}
          </span>.
        </p>
        <p className="mt-3"><strong>Article 2 — {isShortRental ? "Tarif et conditions financières" : "Loyer et conditions financières"}</strong></p>
        {isShortRental ? (
          <p className="mt-1">{`Le tarif journalier est fixé à `}<span className="df-num font-semibold">{formatCurrencyMad(state.monthlyRentMad)}</span>{`, payable à la prise en charge. Le kilométrage inclus est de `}<span className="df-num font-semibold">{state.kmInclMonth.toLocaleString("fr-MA")} km/jour</span>{` ; tout dépassement sera facturé conformément à l’annexe tarifaire.`}</p>
        ) : (
          <p className="mt-1">{`Le loyer mensuel est fixé à `}<span className="df-num font-semibold">{formatCurrencyMad(state.monthlyRentMad)}</span>{`, payable le 5 de chaque mois. Le kilométrage inclus est de `}<span className="df-num font-semibold">{state.kmInclMonth.toLocaleString("fr-MA")} km/mois</span>{` ; tout dépassement sera facturé conformément à l’annexe tarifaire.`}</p>
        )}
        <p className="mt-3"><strong>Article 3 — Géolocalisation</strong></p>
        <p className="mt-1">{`Conformément à la loi 09-08, le Preneur est informé que le véhicule est équipé d’un dispositif GPS. Les données sont conservées de manière chiffrée et utilisées exclusivement pour le suivi contractuel et la sécurité de l’actif.`}</p>
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

