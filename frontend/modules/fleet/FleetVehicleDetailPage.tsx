import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, getApiBase } from '@/services/apiClient';
import { maintenanceApi } from '@/services/maintenanceApi';
import { complianceApi } from '@/services/complianceApi';
import { TabsSection } from '@/modules/shared/components/TabsSection';
import { Icon } from '@/modules/shared/components/Icon';
import { formatCurrencyMad, formatDate } from '@/modules/shared/formatters';
import { EntityDocuments } from '@/modules/shared/components/EntityDocuments';
import { EntityAuditTimeline } from '@/modules/shared/components/EntityAuditTimeline';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MaintenancePlan {
  id: number;
  type: string;
  intervalKm: number | null;
  intervalMonths: number | null;
  lastDoneAt: string | null;
  nextDueAt: string | null;
  nextDueKm: number | null;
  status: 'ok' | 'due_soon' | 'overdue';
  notes: string | null;
}

interface MaintenanceEvent {
  id: number;
  type: string | null;
  title: string;
  performed_at: string | null;
  odometer_km: number | null;
  vendor: string | null;
  cost_mad: number | null;
}

interface Repair {
  id: number;
  repairType: string;
  description: string;
  reportedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  downtimeDays: number | null;
  costAmount: number | null;
  vendorName: string | null;
  status: 'reported' | 'in_progress' | 'completed' | 'cancelled';
  linkedAccidentId: number | null;
}

interface InsurancePolicyRow {
  id: string;
  vehicle_id: string;
  insurer_name: string;
  policy_number: string;
  coverage_type: string | null;
  start_date: string;
  end_date: string;
  premium_amount: number | null;
  status: string;
  document_file_id: string | null;
}

interface TechnicalInspectionRow {
  id: string;
  vehicle_id: string;
  inspection_date: string;
  expiry_date: string;
  center_name: string | null;
  result: string;
  defects: string[] | null;
  document_file_id: string | null;
  next_due_date: string | null;
}

interface VehicleComplianceAlertRow {
  id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string | null;
  due_date: string | null;
}

interface Accident {
  id: number;
  accidentDate: string;
  location: string | null;
  description: string | null;
  severity: 'minor' | 'major' | 'total_loss';
  responsibleParty: string | null;
  policeReportNumber: string | null;
  insuranceClaimNumber: string | null;
  estimatedDamageCost: number | null;
  finalCost: number | null;
  status: 'declared' | 'under_review' | 'repaired' | 'closed';
  documents: { id: number; type: string; filename: string }[];
  driverName: string | null;
}

interface HistoryItem {
  type: string;
  at: string;
  title: string;
  meta: string | null;
  cost: number | null;
  tone: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
  status?: string;
}

interface CostSummary {
  costs: {
    maintenance: number;
    repairs: number;
    accidents: number;
    insurance: number;
    tax: number;
    gps: number;
    total: number;
  };
  revenue: number;
  grossMargin: number;
  marginPct: number | null;
  purchaseCost: number;
  bookValue: number;
  downtimeDays: number;
  contractsCount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MAINTENANCE_LABELS: Record<string, string> = {
  OIL_CHANGE: 'Vidange',
  TIRES: 'Pneus',
  INSPECTION: 'Inspection',
  BRAKES: 'Freins',
  FILTER: 'Filtre',
  BATTERY: 'Batterie',
  TIMING_BELT: 'Courroie de distribution',
  TECH_CONTROL: 'Contrôle technique',
  OTHER: 'Autre',
};

const REPAIR_LABELS: Record<string, string> = {
  MECANIQUE: 'Mécanique',
  ELECTRIQUE: 'Électrique',
  CARROSSERIE: 'Carrosserie',
  PNEU: 'Pneu',
  VITRE: 'Vitrage',
  OTHER: 'Autre',
};

function planStatusBadge(status: MaintenancePlan['status']) {
  if (status === 'overdue') return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">● En retard</span>;
  if (status === 'due_soon') return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">● Bientôt dû</span>;
  return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">● OK</span>;
}

function repairStatusBadge(status: Repair['status']) {
  const map: Record<string, string> = {
    reported: 'bg-slate-100 text-slate-700',
    in_progress: 'bg-amber-100 text-amber-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-slate-100 text-slate-400',
  };
  const labels: Record<string, string> = { reported: 'Déclaré', in_progress: 'En cours', completed: 'Terminé', cancelled: 'Annulé' };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${map[status] ?? ''}`}>{labels[status] ?? status}</span>;
}

function severityBadge(severity: Accident['severity']) {
  if (severity === 'total_loss') return <span className="inline-flex rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">Perte totale</span>;
  if (severity === 'major') return <span className="inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-700">Majeur</span>;
  return <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">Mineur</span>;
}

function accidentStatusBadge(status: Accident['status']) {
  const map: Record<string, string> = {
    declared: 'bg-amber-100 text-amber-700',
    under_review: 'bg-blue-100 text-blue-700',
    repaired: 'bg-emerald-100 text-emerald-700',
    closed: 'bg-slate-100 text-slate-500',
  };
  const labels: Record<string, string> = { declared: 'Déclaré', under_review: 'En révision', repaired: 'Réparé', closed: 'Clôturé' };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${map[status] ?? ''}`}>{labels[status] ?? status}</span>;
}

function toneClass(tone: HistoryItem['tone']): string {
  return { info: 'bg-blue-500', success: 'bg-emerald-500', warning: 'bg-amber-500', danger: 'bg-red-500', neutral: 'bg-slate-300' }[tone];
}

function SectionCard({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="df-card df-card--elev overflow-hidden">
      <div className="flex items-center justify-between border-b border-[color:var(--df-border)] px-5 py-3">
        <span className="text-sm font-bold text-[color:var(--df-text)]">{title}</span>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-black uppercase tracking-widest text-[color:var(--df-text-muted)]">{label}</div>
      <div className="mt-1 text-sm font-semibold text-[color:var(--df-text)]">{value ?? '—'}</div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const FleetVehicleDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [tab, setTab] = useState('overview');

  // Modals / forms
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [showRepairForm, setShowRepairForm] = useState(false);
  const [showAccidentForm, setShowAccidentForm] = useState(false);
  const [showMaintForm, setShowMaintForm] = useState(false);
  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [showInspectionForm, setShowInspectionForm] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<InsurancePolicyRow | null>(null);
  const [editingInspection, setEditingInspection] = useState<TechnicalInspectionRow | null>(null);

  // ── Vehicle data (show payload includes insurance / inspections / compliance) ──
  const vehicleQ = useQuery({
    queryKey: ['vehicle', id],
    queryFn: async () => {
      const r = await apiClient<{ data: Record<string, unknown> }>(`/v1/vehicles/${id}`);
      const d = ((r as { data?: Record<string, unknown> }).data ?? r) as Record<string, unknown>;
      const vehicle = (d.vehicle ?? d) as Record<string, unknown>;
      return {
        vehicle,
        insurancePolicies: (d.insurancePolicies as InsurancePolicyRow[]) ?? [],
        technicalInspections: (d.technicalInspections as TechnicalInspectionRow[]) ?? [],
        complianceAlerts: (d.complianceAlerts as VehicleComplianceAlertRow[]) ?? [],
      };
    },
    enabled: !!id && !!getApiBase(),
  });

  // ── Maintenance Plans ──
  const plansQ = useQuery({
    queryKey: ['vehicle', id, 'maintenance-plans'],
    queryFn: async () => {
      const r = await apiClient<{ data: MaintenancePlan[] }>(`/v1/vehicles/${id}/maintenance-plans`);
      return (r as any).data as MaintenancePlan[];
    },
    enabled: !!id && !!getApiBase() && tab === 'maintenance',
  });

  // ── Repairs ──
  const repairsQ = useQuery({
    queryKey: ['vehicle', id, 'repairs'],
    queryFn: async () => {
      const r = await apiClient<{ data: Repair[] }>(`/v1/vehicles/${id}/repairs`);
      return (r as any).data as Repair[];
    },
    enabled: !!id && !!getApiBase() && tab === 'repairs',
  });

  // ── Accidents ──
  const accidentsQ = useQuery({
    queryKey: ['vehicle', id, 'accidents'],
    queryFn: async () => {
      const r = await apiClient<{ data: Accident[] }>(`/v1/vehicles/${id}/accidents`);
      return (r as any).data as Accident[];
    },
    enabled: !!id && !!getApiBase() && tab === 'accidents',
  });

  // ── History ──
  const historyQ = useQuery({
    queryKey: ['vehicle', id, 'history'],
    queryFn: async () => {
      const r = await apiClient<{ data: HistoryItem[] }>(`/v1/vehicles/${id}/history`);
      return (r as any).data as HistoryItem[];
    },
    enabled: !!id && !!getApiBase() && tab === 'history',
  });

  // ── Costs ──
  const costsQ = useQuery({
    queryKey: ['vehicle', id, 'costs'],
    queryFn: async () => {
      const r = await apiClient<{ data: CostSummary }>(`/v1/vehicles/${id}/costs`);
      return (r as any).data as CostSummary;
    },
    enabled: !!id && !!getApiBase() && tab === 'costs',
  });

  const veh = vehicleQ.data?.vehicle as Record<string, any> | undefined;
  const maintenanceAlertsQ = useQuery({
    queryKey: ['fleet', 'maintenance', 'alerts', 'vehicle', id],
    queryFn: () => maintenanceApi.alerts(),
    enabled: !!id && !!getApiBase(),
    refetchInterval: 60000,
  });
  const maintenanceVehicleAlerts = (maintenanceAlertsQ.data?.data?.alerts ?? []).filter((a) => a.vehicle?.id === id);
  const complianceVehicleAlerts = (vehicleQ.data?.complianceAlerts ?? []).map((a) => ({
    id: a.id,
    title: a.title,
    source: 'compliance' as const,
  }));
  const vehicleAlerts = [
    ...maintenanceVehicleAlerts.map((a) => ({ id: a.id, title: a.title, source: 'maintenance' as const })),
    ...complianceVehicleAlerts,
  ];
  const invalidate = (keys: string[]) => qc.invalidateQueries({ queryKey: ['vehicle', id, ...keys] });
  const invalidateVehicle = () => qc.invalidateQueries({ queryKey: ['vehicle', id] });

  if (vehicleQ.isLoading) return <div className="text-sm text-[color:var(--df-text-muted)]">Chargement…</div>;
  if (!veh) return (
    <div className="df-card df-card--elev p-8">
      <p className="font-bold">Véhicule introuvable.</p>
      <Link className="mt-3 inline-block text-sm font-semibold text-[color:var(--df-brand-600)]" to="/fleet">← Retour flotte</Link>
    </div>
  );

  const statusColor: Record<string, string> = {
    AVAILABLE: 'bg-emerald-100 text-emerald-700',
    RENTED: 'bg-blue-100 text-blue-700',
    MAINTENANCE: 'bg-amber-100 text-amber-700',
    BLOCKED: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <Link to="/fleet" className="text-xs font-semibold text-[color:var(--df-brand-600)]">← Flotte</Link>
          <h1 className="mt-1 text-2xl font-black text-[color:var(--df-text)]">
            {veh.brand} {veh.model} <span className="text-lg font-normal text-[color:var(--df-text-muted)]">{veh.year}</span>
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[color:var(--df-text-muted)]">
            <span className="font-mono">{veh.registration}</span>
            <span>•</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusColor[veh.status] ?? 'bg-slate-100 text-slate-600'}`}>{veh.status}</span>
            {veh.mileageKm && <><span>•</span><span>{veh.mileageKm.toLocaleString('fr-MA')} km</span></>}
          </div>
        </div>
        <div className="df-card df-card--elev px-5 py-3 text-right">
          <div className="text-[10px] font-black uppercase tracking-widest text-[color:var(--df-text-muted)]">Valeur actuelle</div>
          <div className="text-xl font-black text-[color:var(--df-text)]">{formatCurrencyMad(veh.currentValueMad ?? 0)}</div>
        </div>
      </header>

      {/* ── Alerts ── */}
      {veh.status === 'MAINTENANCE' && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          <Icon name="alert" size={16} /> Véhicule actuellement immobilisé en maintenance
        </div>
      )}
      {vehicleAlerts.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="mb-1 text-sm font-bold text-red-800">Alertes automatiques</div>
          <ul className="space-y-1 text-xs text-red-700">
            {vehicleAlerts.slice(0, 5).map((alert) => (
              <li key={`${alert.source}-${alert.id}`}>• {alert.title}</li>
            ))}
          </ul>
        </div>
      )}

      <TabsSection
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Vue générale' },
          { id: 'maintenance', label: 'Entretien' },
          { id: 'repairs', label: 'Réparations' },
          { id: 'accidents', label: 'Accidents' },
          { id: 'insurance', label: 'Assurance' },
          { id: 'technical', label: 'Visite technique' },
          { id: 'history', label: 'Historique' },
          { id: 'costs', label: 'Coûts & Rentabilité' },
          { id: 'docs', label: 'Documents' },
          { id: 'audit', label: 'Audit' },
        ]}
      />

      {/* ════════════════════════════════════════════════════════
          TAB: Vue générale
      ════════════════════════════════════════════════════════ */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <SectionCard title="Identification">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Immatriculation" value={<span className="font-mono">{veh.registration}</span>} />
              <Field label="N° Carte Grise" value={veh.registrationCard} />
              <Field label="VIN" value={<span className="font-mono text-xs">{veh.vin}</span>} />
              <Field label="Carburant" value={veh.fuel} />
              <Field label="Puissance fiscale" value={veh.cv ? `${veh.cv} CV` : null} />
              <Field label="Kilométrage" value={veh.mileageKm ? `${veh.mileageKm.toLocaleString('fr-MA')} km` : null} />
            </div>
          </SectionCard>

          <SectionCard title="Documents réglementaires">
            <div className="space-y-2">
              {[
                { label: 'Assurance', date: veh.insuranceExpiry },
                { label: 'Visite technique', date: veh.techControlExpiry },
                { label: 'Vignette', date: veh.vignetteExpiry },
              ].map(({ label, date }) => {
                const expired = date && new Date(date) < new Date();
                const soon = date && !expired && (new Date(date).getTime() - Date.now()) < 30 * 86400000;
                return (
                  <div key={label} className="flex items-center justify-between rounded-lg bg-[color:var(--df-surface-2)] px-3 py-2">
                    <span className="text-sm text-[color:var(--df-text-muted)]">{label}</span>
                    <span className={`text-sm font-semibold ${expired ? 'text-red-600' : soon ? 'text-amber-600' : 'text-[color:var(--df-text)]'}`}>
                      {date ? formatDate(date) : '—'}
                      {expired && ' ⚠ Expiré'}
                      {soon && ' ⚠ Bientôt'}
                    </span>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title="Acquisition">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type" value={veh.acquisitionType} />
              <Field label="Prix d'achat" value={veh.purchaseCostMad ? formatCurrencyMad(veh.purchaseCostMad) : null} />
              <Field label="Valeur livre" value={veh.currentValueMad ? formatCurrencyMad(veh.currentValueMad) : null} />
              <Field label="Prix/jour" value={veh.pricePerDay ? formatCurrencyMad(veh.pricePerDay) : null} />
            </div>
          </SectionCard>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          TAB: Entretien
      ════════════════════════════════════════════════════════ */}
      {tab === 'maintenance' && (
        <div className="space-y-4">
          {/* Plans */}
          <SectionCard
            title="Plans d'entretien"
            action={
              <button className="df-btn df-btn--primary df-btn--sm" onClick={() => setShowPlanForm(true)}>
                <Icon name="plus" size={14} /> Nouveau plan
              </button>
            }
          >
            {plansQ.isLoading && <p className="text-sm text-[color:var(--df-text-muted)]">Chargement…</p>}
            {!plansQ.isLoading && !plansQ.data?.length && (
              <p className="text-sm text-[color:var(--df-text-muted)]">Aucun plan configuré. Planifiez les entretiens récurrents.</p>
            )}
            <div className="space-y-2">
              {plansQ.data?.map((plan) => (
                <div key={plan.id} className="flex items-center justify-between rounded-xl border border-[color:var(--df-border)] bg-[color:var(--df-surface-2)] px-4 py-3">
                  <div className="flex items-center gap-3">
                    {planStatusBadge(plan.status)}
                    <div>
                      <div className="text-sm font-semibold">{MAINTENANCE_LABELS[plan.type] ?? plan.type}</div>
                      <div className="text-xs text-[color:var(--df-text-muted)]">
                        {plan.intervalMonths && `Tous les ${plan.intervalMonths} mois`}
                        {plan.intervalMonths && plan.intervalKm && ' / '}
                        {plan.intervalKm && `${plan.intervalKm.toLocaleString('fr-MA')} km`}
                      </div>
                    </div>
                  </div>
                  <div className="text-right text-xs">
                    {plan.nextDueAt && <div className="font-semibold">Prochain: {formatDate(plan.nextDueAt)}</div>}
                    {plan.nextDueKm && <div className="text-[color:var(--df-text-muted)]">à {plan.nextDueKm.toLocaleString('fr-MA')} km</div>}
                    {plan.lastDoneAt && <div className="text-[color:var(--df-text-muted)]">Dernier: {formatDate(plan.lastDoneAt)}</div>}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Add Plan form */}
          {showPlanForm && (
            <MaintenancePlanForm
              vehicleId={id!}
              onSaved={() => { setShowPlanForm(false); invalidate(['maintenance-plans']); }}
              onCancel={() => setShowPlanForm(false)}
            />
          )}

          {/* Record a maintenance event */}
          <SectionCard
            title="Enregistrer un entretien"
            action={
              <button className="df-btn df-btn--subtle df-btn--sm" onClick={() => setShowMaintForm(!showMaintForm)}>
                {showMaintForm ? 'Fermer' : <><Icon name="plus" size={14} /> Enregistrer</>}
              </button>
            }
          >
            {showMaintForm && (
              <MaintenanceEventForm
                vehicleId={id!}
                onSaved={() => { setShowMaintForm(false); invalidate(['maintenance-plans']); }}
                onCancel={() => setShowMaintForm(false)}
              />
            )}
            {!showMaintForm && <p className="text-sm text-[color:var(--df-text-muted)]">Cliquez sur "Enregistrer" pour saisir un entretien effectué.</p>}
          </SectionCard>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          TAB: Réparations
      ════════════════════════════════════════════════════════ */}
      {tab === 'repairs' && (
        <div className="space-y-4">
          <SectionCard
            title="Réparations"
            action={
              <button className="df-btn df-btn--primary df-btn--sm" onClick={() => setShowRepairForm(!showRepairForm)}>
                <Icon name="plus" size={14} /> Déclarer
              </button>
            }
          >
            {showRepairForm && (
              <div className="mb-5 rounded-xl border border-[color:var(--df-border)] p-4">
                <RepairForm
                  vehicleId={id!}
                  onSaved={() => { setShowRepairForm(false); invalidate(['repairs']); }}
                  onCancel={() => setShowRepairForm(false)}
                />
              </div>
            )}

            {repairsQ.isLoading && <p className="text-sm text-[color:var(--df-text-muted)]">Chargement…</p>}
            {!repairsQ.isLoading && !repairsQ.data?.length && (
              <p className="text-sm text-[color:var(--df-text-muted)]">Aucune réparation enregistrée.</p>
            )}

            <div className="space-y-3">
              {repairsQ.data?.map((r) => (
                <RepairCard key={r.id} repair={r} vehicleId={id!} onUpdated={() => invalidate(['repairs'])} />
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          TAB: Accidents
      ════════════════════════════════════════════════════════ */}
      {tab === 'accidents' && (
        <div className="space-y-4">
          <SectionCard
            title="Accidents déclarés"
            action={
              <button className="df-btn df-btn--primary df-btn--sm" onClick={() => setShowAccidentForm(!showAccidentForm)}>
                <Icon name="plus" size={14} /> Déclarer un accident
              </button>
            }
          >
            {showAccidentForm && (
              <div className="mb-5 rounded-xl border border-[color:var(--df-border)] p-4">
                <AccidentForm
                  vehicleId={id!}
                  onSaved={() => { setShowAccidentForm(false); invalidate(['accidents']); }}
                  onCancel={() => setShowAccidentForm(false)}
                />
              </div>
            )}

            {accidentsQ.isLoading && <p className="text-sm text-[color:var(--df-text-muted)]">Chargement…</p>}
            {!accidentsQ.isLoading && !accidentsQ.data?.length && (
              <p className="text-sm text-[color:var(--df-text-muted)]">Aucun accident enregistré.</p>
            )}

            <div className="space-y-3">
              {accidentsQ.data?.map((a) => (
                <AccidentCard key={a.id} accident={a} vehicleId={id!} onUpdated={() => invalidate(['accidents'])} />
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          TAB: Assurance (polices)
      ════════════════════════════════════════════════════════ */}
      {tab === 'insurance' && id && (
        <div className="space-y-4">
          <SectionCard
            title="Polices d'assurance"
            action={
              <button
                className="df-btn df-btn--primary df-btn--sm"
                onClick={() => {
                  setEditingPolicy(null);
                  setShowPolicyForm(true);
                }}
              >
                <Icon name="plus" size={14} /> Nouvelle police
              </button>
            }
          >
            {(showPolicyForm || editingPolicy) && (
              <div className="mb-5 rounded-xl border border-[color:var(--df-border)] p-4">
                <InsurancePolicyForm
                  vehicleId={id}
                  initial={editingPolicy}
                  onSaved={() => {
                    setShowPolicyForm(false);
                    setEditingPolicy(null);
                    invalidateVehicle();
                  }}
                  onCancel={() => {
                    setShowPolicyForm(false);
                    setEditingPolicy(null);
                  }}
                />
              </div>
            )}
            <div className="space-y-2">
              {(vehicleQ.data?.insurancePolicies ?? []).length === 0 && !showPolicyForm && !editingPolicy && (
                <p className="text-sm text-[color:var(--df-text-muted)]">Aucune police enregistree. Les sinistres declares depuis un accident sont lies au numero de dossier assurance.</p>
              )}
              {(vehicleQ.data?.insurancePolicies ?? []).map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--df-border)] bg-[color:var(--df-surface-2)] px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold">{p.insurer_name}</div>
                    <div className="text-xs text-[color:var(--df-text-muted)]">
                      N° {p.policy_number}
                      {p.coverage_type ? ` · ${p.coverage_type}` : ''} · {formatDate(p.start_date)} → {formatDate(p.end_date)}
                    </div>
                    <div className="mt-1 text-[11px] font-bold uppercase text-[color:var(--df-text-muted)]">{p.status}</div>
                  </div>
                  <div className="text-right text-sm">
                    {p.premium_amount != null && <div>{formatCurrencyMad(p.premium_amount)}</div>}
                    <button
                      type="button"
                      className="mt-1 text-xs font-semibold text-[color:var(--df-brand-600)]"
                      onClick={() => {
                        setShowPolicyForm(false);
                        setEditingPolicy(p);
                      }}
                    >
                      Modifier
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          TAB: Visite technique
      ════════════════════════════════════════════════════════ */}
      {tab === 'technical' && id && (
        <div className="space-y-4">
          <SectionCard
            title="Controles techniques"
            action={
              <button
                className="df-btn df-btn--primary df-btn--sm"
                onClick={() => {
                  setEditingInspection(null);
                  setShowInspectionForm(true);
                }}
              >
                <Icon name="plus" size={14} /> Nouveau controle
              </button>
            }
          >
            {(showInspectionForm || editingInspection) && (
              <div className="mb-5 rounded-xl border border-[color:var(--df-border)] p-4">
                <TechnicalInspectionForm
                  vehicleId={id}
                  initial={editingInspection}
                  onSaved={() => {
                    setShowInspectionForm(false);
                    setEditingInspection(null);
                    invalidateVehicle();
                  }}
                  onCancel={() => {
                    setShowInspectionForm(false);
                    setEditingInspection(null);
                  }}
                />
              </div>
            )}
            <div className="space-y-2">
              {(vehicleQ.data?.technicalInspections ?? []).length === 0 && !showInspectionForm && !editingInspection && (
                <p className="text-sm text-[color:var(--df-text-muted)]">Aucun controle technique enregistre.</p>
              )}
              {(vehicleQ.data?.technicalInspections ?? []).map((row) => (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--df-border)] bg-[color:var(--df-surface-2)] px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold">{row.center_name ?? 'Centre non renseigne'}</div>
                    <div className="text-xs text-[color:var(--df-text-muted)]">
                      {formatDate(row.inspection_date)} · Exp. {formatDate(row.expiry_date)}
                      {row.next_due_date ? ` · Prochain: ${formatDate(row.next_due_date)}` : ''}
                    </div>
                    <div className="mt-1 text-[11px] font-bold uppercase text-[color:var(--df-text-muted)]">{row.result}</div>
                    {row.defects && row.defects.length > 0 && (
                      <ul className="mt-1 list-inside list-disc text-xs text-amber-800">
                        {row.defects.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <button
                    type="button"
                    className="text-xs font-semibold text-[color:var(--df-brand-600)]"
                    onClick={() => {
                      setShowInspectionForm(false);
                      setEditingInspection(row);
                    }}
                  >
                    Modifier
                  </button>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          TAB: Historique complet
      ════════════════════════════════════════════════════════ */}
      {tab === 'history' && (
        <SectionCard title="Historique complet du véhicule">
          {historyQ.isLoading && <p className="text-sm text-[color:var(--df-text-muted)]">Chargement…</p>}
          {!historyQ.isLoading && !historyQ.data?.length && (
            <p className="text-sm text-[color:var(--df-text-muted)]">Aucun événement enregistré.</p>
          )}
          <div className="relative ml-3 space-y-0 border-l-2 border-[color:var(--df-border)] pl-5">
            {historyQ.data?.map((item, i) => (
              <div key={i} className="relative pb-5">
                <span className={`absolute -left-[23px] top-1 h-3 w-3 rounded-full border-2 border-white ${toneClass(item.tone)}`} />
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-[color:var(--df-text)]">{item.title}</div>
                    {item.meta && <div className="text-xs text-[color:var(--df-text-muted)]">{item.meta}</div>}
                    <div className="mt-0.5 text-[11px] text-[color:var(--df-text-muted)]">{item.at}</div>
                  </div>
                  {item.cost != null && (
                    <span className="shrink-0 text-sm font-bold text-[color:var(--df-text)]">{formatCurrencyMad(item.cost)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ════════════════════════════════════════════════════════
          TAB: Coûts & Rentabilité
      ════════════════════════════════════════════════════════ */}
      {tab === 'costs' && (
        <div className="space-y-4">
          {costsQ.isLoading && <p className="text-sm text-[color:var(--df-text-muted)]">Calcul en cours…</p>}
          {costsQ.data && (
            <>
              {/* KPIs row */}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  { label: 'Revenus générés', value: costsQ.data.revenue, color: 'text-emerald-600' },
                  { label: 'Coût total', value: costsQ.data.costs.total, color: 'text-red-600' },
                  { label: 'Marge brute', value: costsQ.data.grossMargin, color: costsQ.data.grossMargin >= 0 ? 'text-emerald-600' : 'text-red-600' },
                  { label: 'Jours immobilisé', value: null, extra: `${costsQ.data.downtimeDays} j`, color: 'text-amber-600' },
                ].map(({ label, value, extra, color }) => (
                  <div key={label} className="df-card df-card--elev p-4">
                    <div className="text-[10px] font-black uppercase tracking-widest text-[color:var(--df-text-muted)]">{label}</div>
                    <div className={`mt-1 text-xl font-black ${color}`}>
                      {value != null ? formatCurrencyMad(value) : extra}
                    </div>
                    {costsQ.data.marginPct != null && label === 'Marge brute' && (
                      <div className="text-xs text-[color:var(--df-text-muted)]">{costsQ.data.marginPct}% de marge</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Cost breakdown */}
              <SectionCard title="Détail des coûts">
                <div className="space-y-2">
                  {([
                    ['Entretien', costsQ.data.costs.maintenance],
                    ['Réparations', costsQ.data.costs.repairs],
                    ['Accidents', costsQ.data.costs.accidents],
                    ['Assurance', costsQ.data.costs.insurance],
                    ['Taxes / vignette', costsQ.data.costs.tax],
                    ['GPS', costsQ.data.costs.gps],
                  ] as [string, number][]).map(([label, amount]) => {
                    const pct = costsQ.data!.costs.total > 0 ? (amount / costsQ.data!.costs.total) * 100 : 0;
                    return (
                      <div key={label}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-[color:var(--df-text-muted)]">{label}</span>
                          <span className="font-semibold">{formatCurrencyMad(amount)}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[color:var(--df-surface-2)]">
                          <div className="h-full rounded-full bg-[color:var(--df-brand-500)]" style={{ width: `${pct.toFixed(1)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>

              {/* Accounting */}
              <SectionCard title="Valeur comptable">
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Coût d'acquisition" value={formatCurrencyMad(costsQ.data.purchaseCost)} />
                  <Field label="Valeur livre" value={formatCurrencyMad(costsQ.data.bookValue)} />
                  <Field label="Contrats liés" value={`${costsQ.data.contractsCount} contrat(s)`} />
                </div>
              </SectionCard>
            </>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          TAB: Documents
      ════════════════════════════════════════════════════════ */}
      {tab === 'docs' && (
        <EntityDocuments entityType="vehicle" entityId={id!} title="Documents du véhicule" />
      )}

      {tab === 'audit' && (
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="mb-3 text-sm font-black text-slate-900">Audit & traçabilité</div>
          <EntityAuditTimeline entityType="vehicle" entityId={id!} />
        </div>
      )}
    </div>
  );
};

// ─── Sub-forms ────────────────────────────────────────────────────────────────

function InsurancePolicyForm({
  vehicleId,
  initial,
  onSaved,
  onCancel,
}: {
  vehicleId: string;
  initial: InsurancePolicyRow | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    insurer_name: '',
    policy_number: '',
    coverage_type: '',
    start_date: '',
    end_date: '',
    premium_amount: '',
    status: 'active',
    document_file_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setForm({
      insurer_name: initial?.insurer_name ?? '',
      policy_number: initial?.policy_number ?? '',
      coverage_type: initial?.coverage_type ?? '',
      start_date: initial?.start_date?.slice(0, 10) ?? '',
      end_date: initial?.end_date?.slice(0, 10) ?? '',
      premium_amount: initial?.premium_amount != null ? String(initial.premium_amount) : '',
      status: initial?.status ?? 'active',
      document_file_id: initial?.document_file_id ?? '',
    });
  }, [initial]);

  const submit = async () => {
    if (!form.insurer_name.trim() || !form.policy_number.trim() || !form.start_date || !form.end_date) {
      setErr('Assureur, numero de police et dates sont requis.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const body: Record<string, unknown> = {
        insurer_name: form.insurer_name.trim(),
        policy_number: form.policy_number.trim(),
        coverage_type: form.coverage_type.trim() || null,
        start_date: form.start_date,
        end_date: form.end_date,
        premium_amount: form.premium_amount ? Number(form.premium_amount) : null,
        status: form.status,
        document_file_id: form.document_file_id.trim() || null,
      };
      if (initial) {
        await complianceApi.updateInsurancePolicy(initial.id, body);
      } else {
        await complianceApi.createInsurancePolicy(vehicleId, body);
      }
      onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Erreur enregistrement');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="df-label">Assureur *</label>
        <input className="df-input" value={form.insurer_name} onChange={(e) => setForm((f) => ({ ...f, insurer_name: e.target.value }))} />
      </div>
      <div>
        <label className="df-label">N° police *</label>
        <input className="df-input" value={form.policy_number} onChange={(e) => setForm((f) => ({ ...f, policy_number: e.target.value }))} disabled={!!initial} />
      </div>
      <div className="col-span-2">
        <label className="df-label">Type de couverture</label>
        <input className="df-input" value={form.coverage_type} onChange={(e) => setForm((f) => ({ ...f, coverage_type: e.target.value }))} />
      </div>
      <div>
        <label className="df-label">Debut *</label>
        <input className="df-input" type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
      </div>
      <div>
        <label className="df-label">Fin *</label>
        <input className="df-input" type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
      </div>
      <div>
        <label className="df-label">Prime (MAD)</label>
        <input className="df-input" type="number" value={form.premium_amount} onChange={(e) => setForm((f) => ({ ...f, premium_amount: e.target.value }))} />
      </div>
      <div>
        <label className="df-label">Statut</label>
        <select className="df-input" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
          <option value="draft">Brouillon</option>
          <option value="active">Active</option>
          <option value="expired">Expiree</option>
          <option value="cancelled">Annulee</option>
        </select>
      </div>
      <div className="col-span-2">
        <label className="df-label">ID document (fichier UUID, optionnel)</label>
        <input className="df-input font-mono text-xs" value={form.document_file_id} onChange={(e) => setForm((f) => ({ ...f, document_file_id: e.target.value }))} />
      </div>
      {err && <p className="col-span-2 text-xs text-red-600">{err}</p>}
      <div className="col-span-2 flex gap-2">
        <button className="df-btn df-btn--primary df-btn--sm" type="button" disabled={saving} onClick={submit}>
          {saving ? 'Enregistrement…' : initial ? 'Mettre a jour' : 'Creer la police'}
        </button>
        <button className="df-btn df-btn--ghost df-btn--sm" type="button" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  );
}

function TechnicalInspectionForm({
  vehicleId,
  initial,
  onSaved,
  onCancel,
}: {
  vehicleId: string;
  initial: TechnicalInspectionRow | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    inspection_date: '',
    expiry_date: '',
    center_name: '',
    result: 'passed',
    defectsText: '',
    next_due_date: '',
    document_file_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const defects = initial?.defects?.filter(Boolean).join('\n') ?? '';
    setForm({
      inspection_date: initial?.inspection_date?.slice(0, 10) ?? '',
      expiry_date: initial?.expiry_date?.slice(0, 10) ?? '',
      center_name: initial?.center_name ?? '',
      result: initial?.result ?? 'passed',
      defectsText: defects,
      next_due_date: initial?.next_due_date?.slice(0, 10) ?? '',
      document_file_id: initial?.document_file_id ?? '',
    });
  }, [initial]);

  const submit = async () => {
    if (!form.inspection_date || !form.expiry_date) {
      setErr('Dates inspection et expiration requises.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const defects = form.defectsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const body: Record<string, unknown> = {
        inspection_date: form.inspection_date,
        expiry_date: form.expiry_date,
        center_name: form.center_name.trim() || null,
        result: form.result,
        defects: defects.length ? defects : null,
        next_due_date: form.next_due_date || null,
        document_file_id: form.document_file_id.trim() || null,
      };
      if (initial) {
        await complianceApi.updateTechnicalInspection(initial.id, body);
      } else {
        await complianceApi.createTechnicalInspection(vehicleId, body);
      }
      onSaved();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Erreur enregistrement');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="df-label">Date controle *</label>
        <input className="df-input" type="date" value={form.inspection_date} onChange={(e) => setForm((f) => ({ ...f, inspection_date: e.target.value }))} />
      </div>
      <div>
        <label className="df-label">Date expiration *</label>
        <input className="df-input" type="date" value={form.expiry_date} onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))} />
      </div>
      <div className="col-span-2">
        <label className="df-label">Centre</label>
        <input className="df-input" value={form.center_name} onChange={(e) => setForm((f) => ({ ...f, center_name: e.target.value }))} />
      </div>
      <div>
        <label className="df-label">Resultat *</label>
        <select className="df-input" value={form.result} onChange={(e) => setForm((f) => ({ ...f, result: e.target.value }))}>
          <option value="passed">Favorable</option>
          <option value="conditional">Contre-visite</option>
          <option value="failed">Defavorable</option>
        </select>
      </div>
      <div>
        <label className="df-label">Prochaine echeance</label>
        <input className="df-input" type="date" value={form.next_due_date} onChange={(e) => setForm((f) => ({ ...f, next_due_date: e.target.value }))} />
      </div>
      <div className="col-span-2">
        <label className="df-label">Defauts (une ligne par defaut)</label>
        <textarea className="df-input" rows={3} value={form.defectsText} onChange={(e) => setForm((f) => ({ ...f, defectsText: e.target.value }))} />
      </div>
      <div className="col-span-2">
        <label className="df-label">ID document (UUID, optionnel)</label>
        <input className="df-input font-mono text-xs" value={form.document_file_id} onChange={(e) => setForm((f) => ({ ...f, document_file_id: e.target.value }))} />
      </div>
      {err && <p className="col-span-2 text-xs text-red-600">{err}</p>}
      <div className="col-span-2 flex gap-2">
        <button className="df-btn df-btn--primary df-btn--sm" type="button" disabled={saving} onClick={submit}>
          {saving ? 'Enregistrement…' : initial ? 'Mettre a jour' : 'Enregistrer'}
        </button>
        <button className="df-btn df-btn--ghost df-btn--sm" type="button" onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  );
}

function MaintenancePlanForm({ vehicleId, onSaved, onCancel }: { vehicleId: string; onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ maintenance_type: 'OIL_CHANGE', interval_km: '', interval_months: '', last_done_at: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true); setErr(null);
    try {
      await apiClient(`/v1/vehicles/${vehicleId}/maintenance-plans`, {
        method: 'POST',
        body: JSON.stringify({
          maintenance_type: form.maintenance_type,
          interval_km: form.interval_km ? Number(form.interval_km) : null,
          interval_months: form.interval_months ? Number(form.interval_months) : null,
          last_done_at: form.last_done_at || null,
          notes: form.notes || null,
        }),
      });
      onSaved();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="df-card df-card--elev p-4">
      <div className="mb-3 text-sm font-bold">Nouveau plan d'entretien</div>
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="df-label">Type d'entretien</label>
          <select className="df-input" value={form.maintenance_type} onChange={e => setForm(f => ({ ...f, maintenance_type: e.target.value }))}>
            {Object.entries(MAINTENANCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="df-label">Intervalle (mois)</label>
          <input className="df-input" type="number" min="1" max="120" placeholder="12" value={form.interval_months} onChange={e => setForm(f => ({ ...f, interval_months: e.target.value }))} />
        </div>
        <div>
          <label className="df-label">Intervalle (km)</label>
          <input className="df-input" type="number" min="100" placeholder="10000" value={form.interval_km} onChange={e => setForm(f => ({ ...f, interval_km: e.target.value }))} />
        </div>
        <div>
          <label className="df-label">Dernier fait le</label>
          <input className="df-input" type="date" value={form.last_done_at} onChange={e => setForm(f => ({ ...f, last_done_at: e.target.value }))} />
        </div>
        <div>
          <label className="df-label">Notes</label>
          <input className="df-input" type="text" placeholder="Optionnel" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
      <div className="mt-3 flex gap-2">
        <button className="df-btn df-btn--primary df-btn--sm" disabled={saving} onClick={submit}>{saving ? 'Enregistrement…' : 'Créer le plan'}</button>
        <button className="df-btn df-btn--ghost df-btn--sm" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );
}

function MaintenanceEventForm({ vehicleId, onSaved, onCancel }: { vehicleId: string; onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ type: 'OIL_CHANGE', title: '', performed_at: '', odometer_km: '', vendor: '', cost_mad: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!form.title.trim()) { setErr('Le titre est requis.'); return; }
    setSaving(true); setErr(null);
    try {
      await apiClient(`/v1/vehicles/${vehicleId}/maintenance-events`, {
        method: 'POST',
        body: JSON.stringify({
          type: form.type,
          title: form.title,
          performed_at: form.performed_at || null,
          odometer_km: form.odometer_km ? Number(form.odometer_km) : null,
          vendor: form.vendor || null,
          cost_mad: form.cost_mad ? Number(form.cost_mad) : null,
        }),
      });
      onSaved();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="df-label">Type</label>
        <select className="df-input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
          {Object.entries(MAINTENANCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div>
        <label className="df-label">Titre *</label>
        <input className="df-input" placeholder="Ex: Vidange huile moteur" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
      </div>
      <div>
        <label className="df-label">Date d'exécution</label>
        <input className="df-input" type="date" value={form.performed_at} onChange={e => setForm(f => ({ ...f, performed_at: e.target.value }))} />
      </div>
      <div>
        <label className="df-label">Kilométrage</label>
        <input className="df-input" type="number" placeholder="75000" value={form.odometer_km} onChange={e => setForm(f => ({ ...f, odometer_km: e.target.value }))} />
      </div>
      <div>
        <label className="df-label">Prestataire</label>
        <input className="df-input" placeholder="Nom du garage" value={form.vendor} onChange={e => setForm(f => ({ ...f, vendor: e.target.value }))} />
      </div>
      <div>
        <label className="df-label">Coût (MAD)</label>
        <input className="df-input" type="number" placeholder="0.00" value={form.cost_mad} onChange={e => setForm(f => ({ ...f, cost_mad: e.target.value }))} />
      </div>
      {err && <p className="col-span-2 text-xs text-red-600">{err}</p>}
      <div className="col-span-2 flex gap-2">
        <button className="df-btn df-btn--primary df-btn--sm" disabled={saving} onClick={submit}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        <button className="df-btn df-btn--ghost df-btn--sm" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );
}

function RepairForm({ vehicleId, onSaved, onCancel }: { vehicleId: string; onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ repair_type: 'MECANIQUE', description: '', vendor_name: '', cost_amount: '', started_at: '', status: 'reported' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!form.description.trim()) { setErr('La description est requise.'); return; }
    setSaving(true); setErr(null);
    try {
      await apiClient(`/v1/vehicles/${vehicleId}/repairs`, {
        method: 'POST',
        body: JSON.stringify({
          repair_type: form.repair_type,
          description: form.description,
          vendor_name: form.vendor_name || null,
          cost_amount: form.cost_amount ? Number(form.cost_amount) : null,
          started_at: form.started_at || null,
          status: form.status,
        }),
      });
      onSaved();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="df-label">Type</label>
        <select className="df-input" value={form.repair_type} onChange={e => setForm(f => ({ ...f, repair_type: e.target.value }))}>
          {Object.entries(REPAIR_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div>
        <label className="df-label">Statut</label>
        <select className="df-input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
          <option value="reported">Déclaré</option>
          <option value="in_progress">En cours</option>
          <option value="completed">Terminé</option>
        </select>
      </div>
      <div className="col-span-2">
        <label className="df-label">Description *</label>
        <textarea className="df-input" rows={2} placeholder="Décrivez la panne ou le problème…" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
      </div>
      <div>
        <label className="df-label">Prestataire</label>
        <input className="df-input" placeholder="Nom du garage" value={form.vendor_name} onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))} />
      </div>
      <div>
        <label className="df-label">Coût estimé (MAD)</label>
        <input className="df-input" type="number" placeholder="0.00" value={form.cost_amount} onChange={e => setForm(f => ({ ...f, cost_amount: e.target.value }))} />
      </div>
      <div>
        <label className="df-label">Date de début</label>
        <input className="df-input" type="date" value={form.started_at} onChange={e => setForm(f => ({ ...f, started_at: e.target.value }))} />
      </div>
      {err && <p className="col-span-2 text-xs text-red-600">{err}</p>}
      <div className="col-span-2 flex gap-2">
        <button className="df-btn df-btn--primary df-btn--sm" disabled={saving} onClick={submit}>{saving ? 'Enregistrement…' : 'Déclarer la réparation'}</button>
        <button className="df-btn df-btn--ghost df-btn--sm" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );
}

function RepairCard({ repair, vehicleId, onUpdated }: { repair: Repair; vehicleId: string; onUpdated: () => void }) {
  const [updating, setUpdating] = useState(false);

  const markCompleted = async () => {
    setUpdating(true);
    try {
      await apiClient(`/v1/repairs/${repair.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed', completed_at: new Date().toISOString().slice(0, 10) }),
      });
      onUpdated();
    } finally { setUpdating(false); }
  };

  return (
    <div className="rounded-xl border border-[color:var(--df-border)] bg-[color:var(--df-surface-2)] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            {repairStatusBadge(repair.status)}
            <span className="text-xs text-[color:var(--df-text-muted)]">{REPAIR_LABELS[repair.repairType] ?? repair.repairType}</span>
          </div>
          <div className="mt-1 text-sm text-[color:var(--df-text)]">{repair.description}</div>
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-[color:var(--df-text-muted)]">
            {repair.vendorName && <span>🔧 {repair.vendorName}</span>}
            {repair.downtimeDays != null && <span>⏱ {repair.downtimeDays} j d'immobilisation</span>}
            {repair.reportedAt && <span>📅 {repair.reportedAt.slice(0, 10)}</span>}
          </div>
        </div>
        <div className="text-right">
          {repair.costAmount != null && <div className="text-sm font-bold">{formatCurrencyMad(repair.costAmount)}</div>}
          {repair.status === 'in_progress' && (
            <button className="mt-1 df-btn df-btn--subtle df-btn--sm text-xs" disabled={updating} onClick={markCompleted}>
              {updating ? '…' : '✓ Terminé'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AccidentForm({ vehicleId, onSaved, onCancel }: { vehicleId: string; onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    accident_date: '', location: '', description: '', severity: 'minor',
    responsible_party: '', police_report_number: '', insurance_claim_number: '',
    estimated_damage_cost: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!form.accident_date) { setErr('La date est requise.'); return; }
    setSaving(true); setErr(null);
    try {
      await apiClient(`/v1/vehicles/${vehicleId}/accidents`, {
        method: 'POST',
        body: JSON.stringify({
          accident_date: form.accident_date,
          location: form.location || null,
          description: form.description || null,
          severity: form.severity,
          responsible_party: form.responsible_party || null,
          police_report_number: form.police_report_number || null,
          insurance_claim_number: form.insurance_claim_number || null,
          estimated_damage_cost: form.estimated_damage_cost ? Number(form.estimated_damage_cost) : null,
        }),
      });
      onSaved();
    } catch (e: any) { setErr(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="df-label">Date de l'accident *</label>
        <input className="df-input" type="date" value={form.accident_date} onChange={e => setForm(f => ({ ...f, accident_date: e.target.value }))} />
      </div>
      <div>
        <label className="df-label">Gravité</label>
        <select className="df-input" value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
          <option value="minor">Mineur</option>
          <option value="major">Majeur</option>
          <option value="total_loss">Perte totale</option>
        </select>
      </div>
      <div className="col-span-2">
        <label className="df-label">Lieu</label>
        <input className="df-input" placeholder="Ex: Avenue Mohammed V, Casablanca" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
      </div>
      <div className="col-span-2">
        <label className="df-label">Description</label>
        <textarea className="df-input" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
      </div>
      <div>
        <label className="df-label">Partie responsable</label>
        <select className="df-input" value={form.responsible_party} onChange={e => setForm(f => ({ ...f, responsible_party: e.target.value }))}>
          <option value="">—</option>
          <option value="client">Client</option>
          <option value="third_party">Tiers</option>
          <option value="company">Société</option>
        </select>
      </div>
      <div>
        <label className="df-label">Dommage estimé (MAD)</label>
        <input className="df-input" type="number" value={form.estimated_damage_cost} onChange={e => setForm(f => ({ ...f, estimated_damage_cost: e.target.value }))} />
      </div>
      <div>
        <label className="df-label">N° PV Police</label>
        <input className="df-input" value={form.police_report_number} onChange={e => setForm(f => ({ ...f, police_report_number: e.target.value }))} />
      </div>
      <div>
        <label className="df-label">N° Dossier assurance</label>
        <input className="df-input" value={form.insurance_claim_number} onChange={e => setForm(f => ({ ...f, insurance_claim_number: e.target.value }))} />
      </div>
      {err && <p className="col-span-2 text-xs text-red-600">{err}</p>}
      <div className="col-span-2 flex gap-2">
        <button className="df-btn df-btn--primary df-btn--sm" disabled={saving} onClick={submit}>{saving ? 'Enregistrement…' : "Déclarer l'accident"}</button>
        <button className="df-btn df-btn--ghost df-btn--sm" onClick={onCancel}>Annuler</button>
      </div>
    </div>
  );
}

function AccidentCard({ accident, vehicleId, onUpdated }: { accident: Accident; vehicleId: string; onUpdated: () => void }) {
  const [transitioning, setTransitioning] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState('photo');
  const [uploading, setUploading] = useState(false);

  const transition = async (newStatus: string) => {
    setTransitioning(true);
    try {
      await apiClient(`/v1/accidents/${accident.id}/transition`, {
        method: 'POST',
        body: JSON.stringify({ status: newStatus }),
      });
      onUpdated();
    } finally { setTransitioning(false); }
  };

  const uploadDoc = async () => {
    if (!uploadFile) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', uploadFile);
      fd.append('type', uploadType);
      await fetch(`${import.meta.env.VITE_API_BASE}/v1/accidents/${accident.id}/documents`, {
        method: 'POST',
        headers: { Accept: 'application/json', Authorization: `Bearer ${JSON.parse(localStorage.getItem('df_session') ?? '{}').token ?? ''}` },
        body: fd,
      });
      setUploadFile(null);
      onUpdated();
    } finally { setUploading(false); }
  };

  const nextStatuses: Record<string, string[]> = {
    declared: ['under_review'],
    under_review: ['repaired', 'closed'],
    repaired: ['closed'],
    closed: [],
  };

  const statusLabels: Record<string, string> = { under_review: 'Passer en révision', repaired: 'Marquer réparé', closed: 'Clôturer' };

  return (
    <div className="rounded-xl border border-[color:var(--df-border)] bg-[color:var(--df-surface-2)] px-4 py-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            {severityBadge(accident.severity)}
            {accidentStatusBadge(accident.status)}
            <span className="text-xs text-[color:var(--df-text-muted)]">{accident.accidentDate}</span>
          </div>
          {accident.location && <div className="mt-1 text-sm text-[color:var(--df-text)]">📍 {accident.location}</div>}
          {accident.description && <div className="mt-0.5 text-xs text-[color:var(--df-text-muted)]">{accident.description}</div>}
          <div className="mt-1 flex flex-wrap gap-3 text-xs text-[color:var(--df-text-muted)]">
            {accident.policeReportNumber && <span>PV: {accident.policeReportNumber}</span>}
            {accident.insuranceClaimNumber && <span>Assurance: {accident.insuranceClaimNumber}</span>}
            {accident.responsibleParty && <span>Responsable: {accident.responsibleParty}</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          {accident.finalCost != null && <div className="text-sm font-bold text-red-600">{formatCurrencyMad(accident.finalCost)}</div>}
          {accident.estimatedDamageCost != null && accident.finalCost == null && (
            <div className="text-xs text-[color:var(--df-text-muted)]">Estimé: {formatCurrencyMad(accident.estimatedDamageCost)}</div>
          )}
        </div>
      </div>

      {/* Documents */}
      {accident.documents.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {accident.documents.map(d => (
            <span key={d.id} className="inline-flex items-center gap-1 rounded-lg bg-[color:var(--df-surface-3)] px-2 py-1 text-xs">
              📎 {d.filename}
            </span>
          ))}
        </div>
      )}

      {/* Upload doc + workflow */}
      <div className="flex flex-wrap items-center gap-2 border-t border-[color:var(--df-border)] pt-2">
        {/* File upload */}
        <select className="df-input df-input--sm text-xs" style={{ width: 'auto' }} value={uploadType} onChange={e => setUploadType(e.target.value)}>
          <option value="photo">Photo</option>
          <option value="rapport">Rapport</option>
          <option value="assurance">Assurance</option>
          <option value="expertise">Expertise</option>
          <option value="constat">Constat</option>
        </select>
        <input type="file" accept="image/*,.pdf" className="text-xs" onChange={e => setUploadFile(e.target.files?.[0] ?? null)} />
        {uploadFile && (
          <button className="df-btn df-btn--subtle df-btn--sm text-xs" disabled={uploading} onClick={uploadDoc}>
            {uploading ? '…' : '⬆ Envoyer'}
          </button>
        )}

        {/* Workflow transitions */}
        {nextStatuses[accident.status]?.map(s => (
          <button key={s} className="df-btn df-btn--primary df-btn--sm text-xs ml-auto" disabled={transitioning} onClick={() => transition(s)}>
            {transitioning ? '…' : statusLabels[s]}
          </button>
        ))}
      </div>

      <div className="border-t border-[color:var(--df-border)] pt-3">
        <EntityDocuments entityType="accident" entityId={String(accident.id)} title="Documents du sinistre" />
      </div>
    </div>
  );
}
