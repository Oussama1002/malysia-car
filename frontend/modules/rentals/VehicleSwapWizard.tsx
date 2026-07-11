import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { opsApi } from '@/services/opsApi';

/* ── constants ─────────────────────────────────────────────────────── */
const SWAP_REASONS = [
  { value: 'mechanical_breakdown', label: 'Panne mécanique' },
  { value: 'accident',            label: 'Accident' },
  { value: 'maintenance',         label: 'Maintenance' },
  { value: 'customer_request',    label: 'Demande client' },
  { value: 'upgrade',             label: 'Upgrade' },
  { value: 'downgrade',           label: 'Downgrade' },
  { value: 'vehicle_unavailable', label: 'Véhicule indisponible' },
  { value: 'commercial_gesture',  label: 'Geste commercial' },
  { value: 'other',               label: 'Autre' },
] as const;

type StepKey = 'reason' | 'summary' | 'vehicle' | 'financial' | 'operations' | 'confirmation';

const STEPS: { key: StepKey; title: string; hint: string }[] = [
  { key: 'reason',       title: 'Motif',        hint: 'Raison du changement' },
  { key: 'summary',      title: 'Réservation',  hint: 'Résumé actuel' },
  { key: 'vehicle',      title: 'Véhicule',     hint: 'Sélection' },
  { key: 'financial',    title: 'Impact',        hint: 'Financier' },
  { key: 'operations',   title: 'Opérations',   hint: 'Conséquences' },
  { key: 'confirmation', title: 'Confirmation',  hint: 'Validation' },
];

const VEHICLE_TABS = [
  { key: 'recommended', label: 'Recommandés' },
  { key: 'upgrade',     label: 'Upgrade' },
  { key: 'downgrade',   label: 'Downgrade' },
  { key: 'all',         label: 'Tous' },
] as const;

type FinancialAction = 'charge' | 'free_upgrade' | 'refund' | 'ignore';

interface WizardState {
  reason: string;
  reasonDescription: string;
  selectedVehicleId: string;
  newDailyRate: string;
  financialAction: FinancialAction | '';
  createMissions: boolean;
  oldVehicleRecovered: boolean;
}

const INITIAL_STATE: WizardState = {
  reason: '',
  reasonDescription: '',
  selectedVehicleId: '',
  newDailyRate: '',
  financialAction: 'charge',
  createMissions: true,
  oldVehicleRecovered: false,
};

/* ── props ─────────────────────────────────────────────────────────── */
export interface VehicleSwapWizardProps {
  open: boolean;
  onClose: () => void;
  source: { type: 'reservation' | 'contract'; id: string } | null;
  reservation?: any;
  contract?: any;
  currentVehicle?: any;
  onSuccess: () => void;
}

/* ── component ─────────────────────────────────────────────────────── */
export const VehicleSwapWizard: React.FC<VehicleSwapWizardProps> = ({
  open, onClose, source, reservation, contract, currentVehicle, onSuccess,
}) => {
  const qc = useQueryClient();
  const [stepIdx, setStepIdx] = useState(0);
  const [form, setForm] = useState<WizardState>(INITIAL_STATE);
  const [vehicleTab, setVehicleTab] = useState<string>('recommended');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = STEPS[stepIdx];

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setStepIdx(0);
      setForm(INITIAL_STATE);
      setVehicleTab('recommended');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const sourceParams = useMemo(() => {
    if (!source) return {};
    return source.type === 'reservation'
      ? { reservation_id: source.id }
      : { contract_id: source.id };
  }, [source]);

  // ── Eligible vehicles query ──
  const eligibleQ = useQuery({
    queryKey: ['swap-eligible', source?.type, source?.id],
    queryFn: () => opsApi.swapEligibleVehicles(sourceParams),
    enabled: open && !!source && stepIdx >= 2,
  });

  // Financial impact is computed locally from the editable new daily rate

  // ── Swap history ──
  const swapsQ = useQuery({
    queryKey: ['vehicle-swaps', source?.type, source?.id],
    queryFn: () => opsApi.vehicleSwaps(sourceParams),
    enabled: open && !!source,
  });

  const eligibleData = eligibleQ.data;
  const currentV = eligibleData?.current_vehicle ?? currentVehicle;
  const rentalPeriod = eligibleData?.rental_period;
  const categories = eligibleData?.categories ?? { recommended: [], upgrade: [], downgrade: [], all: [] };
  const selectedVehicle = (categories.all as any[]).find((v: any) => v.id === form.selectedVehicleId);


  /* ── Helpers ─────────────────────────────────────────────────────── */
  const reasonLabel = SWAP_REASONS.find(r => r.value === form.reason)?.label ?? form.reason;

  const summaryData = useMemo(() => {
    const vName = (cv: any) => `${cv?.brand_name ?? cv?.brand?.name ?? ''} ${cv?.model_name ?? cv?.model?.model_name ?? cv?.model?.name ?? ''}`.trim();
    if (source?.type === 'reservation' && reservation) {
      const r = reservation;
      const custName = r.customer_name ?? r.customer?.full_name ?? r.customer?.display_name ?? r.customer?.name ?? '—';
      const vehName = vName(currentV) || r.vehicle_name || vName(r.vehicle) || '—';
      const plate = currentV?.registration_number ?? r.vehicle_registration ?? r.vehicle?.registration_number ?? '—';
      const start = r.desired_start_at;
      const end = r.desired_end_at;
      const remaining = rentalPeriod?.remaining_days ?? (start && end ? Math.max(0, Math.ceil((new Date(end).getTime() - Date.now()) / 86400000)) : '—');
      return {
        number: r.reservation_number ?? r.id?.slice(0, 8),
        customerName: custName,
        vehicleName: vehName,
        plate,
        remainingDays: remaining,
        contractNumber: r.contract_number ?? '—',
        periodStart: rentalPeriod?.start ?? start,
        periodEnd: rentalPeriod?.end ?? end,
      };
    }
    if (source?.type === 'contract' && contract) {
      const c = contract;
      const custName = c.customer_name ?? c.customer?.full_name ?? c.customer?.display_name ?? c.customer?.name ?? c.customerName ?? '—';
      const vehName = vName(currentV) || c.vehicle_name || c.vehicleName || vName(c.vehicle) || '—';
      const plate = currentV?.registration_number ?? c.vehicle?.registration_number ?? '—';
      const start = c.start_date ?? c.startDate;
      const end = c.end_date ?? c.endDate;
      const remaining = rentalPeriod?.remaining_days ?? (start && end ? Math.max(0, Math.ceil((new Date(end).getTime() - Date.now()) / 86400000)) : '—');
      return {
        number: c.contract_number ?? c.contractNumber ?? c.id?.slice(0, 8),
        customerName: custName,
        vehicleName: vehName,
        plate,
        remainingDays: remaining,
        contractNumber: c.contract_number ?? c.contractNumber ?? '—',
        periodStart: rentalPeriod?.start ?? start,
        periodEnd: rentalPeriod?.end ?? end,
      };
    }
    return { number: '—', customerName: '—', vehicleName: '—', plate: '—', remainingDays: '—', contractNumber: '—', periodStart: '—', periodEnd: '—' };
  }, [source, reservation, contract, currentV, rentalPeriod]);

  const oldDailyRate = Number(currentV?.daily_rental_price ?? reservation?.daily_rate ?? contract?.daily_rate ?? 0);
  const newDailyRate = form.newDailyRate !== '' ? Number(form.newDailyRate) : Number(selectedVehicle?.daily_rental_price ?? 0);
  const finRemainingDays = Number(rentalPeriod?.remaining_days ?? summaryData.remainingDays) || 0;
  const totalDifference = finRemainingDays * (newDailyRate - oldDailyRate);

  const canAdvance = (): boolean => {
    if (step.key === 'reason') return !!form.reason && (form.reason !== 'other' || !!form.reasonDescription.trim());
    if (step.key === 'summary') return true;
    if (step.key === 'vehicle') return !!form.selectedVehicleId && !!selectedVehicle?.available;
    if (step.key === 'financial') return !!form.financialAction;
    if (step.key === 'operations') return true;
    return true;
  };

  const next = () => { if (canAdvance() && stepIdx < STEPS.length - 1) setStepIdx(stepIdx + 1); };
  const prev = () => { if (stepIdx > 0) setStepIdx(stepIdx - 1); };

  const doSwap = async (mode: 'instant' | 'request') => {
    setError(null);
    setBusy(true);
    try {
      const reason = form.reason === 'other' ? form.reasonDescription : reasonLabel;
      if (mode === 'instant') {
        await opsApi.instantVehicleSwap({
          ...sourceParams,
          new_vehicle_id: form.selectedVehicleId,
          reason,
          new_daily_rate: newDailyRate || undefined,
          financial_action: form.financialAction || undefined,
          create_missions: form.createMissions,
          old_vehicle_recovered: form.oldVehicleRecovered,
        });
      } else {
        await opsApi.requestVehicleSwap({
          ...sourceParams,
          new_vehicle_id: form.selectedVehicleId,
          reason,
        });
      }
      qc.invalidateQueries({ queryKey: ['reservation'] });
      qc.invalidateQueries({ queryKey: ['contract'] });
      qc.invalidateQueries({ queryKey: ['vehicle-swaps'] });
      qc.invalidateQueries({ queryKey: ['swap-eligible'] });
      onSuccess();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Erreur lors du changement de véhicule.');
    } finally {
      setBusy(false);
    }
  };

  const fmtDate = (d: string | undefined) => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return d; }
  };
  const fmtPrice = (n: number | null | undefined) => n != null ? `${n.toLocaleString('fr-FR')} MAD` : '—';

  /* ── Step renderers ─────────────────────────────────────────────── */

  const renderReason = () => (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1.5">Motif du changement <span className="text-rose-500">*</span></label>
        <select
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
          value={form.reason}
          onChange={e => setForm(s => ({ ...s, reason: e.target.value }))}
        >
          <option value="">— Sélectionner un motif —</option>
          {SWAP_REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>
      {form.reason === 'other' && (
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">Description <span className="text-rose-500">*</span></label>
          <textarea
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            rows={3}
            placeholder="Décrivez la raison du changement…"
            value={form.reasonDescription}
            onChange={e => setForm(s => ({ ...s, reasonDescription: e.target.value }))}
          />
        </div>
      )}
    </div>
  );

  const renderSummary = () => (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
        {[
          [source?.type === 'reservation' ? 'Réservation' : 'Contrat', summaryData.number],
          ['Client', summaryData.customerName],
          ['Véhicule', summaryData.vehicleName],
          ['Immatriculation', summaryData.plate],
          ['Jours restants', `${summaryData.remainingDays} jours`],
          ['Période', `${fmtDate(summaryData.periodStart)} → ${fmtDate(summaryData.periodEnd)}`],
          ...(summaryData.contractNumber !== '—' && source?.type === 'reservation' ? [['Contrat', summaryData.contractNumber]] : []),
        ].map(([label, val], i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-slate-500">{label}</span>
            <span className="font-bold text-slate-900">{val}</span>
          </div>
        ))}
      </div>
      {(swapsQ.data ?? []).length > 0 && (
        <div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Historique des changements</div>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {(swapsQ.data ?? []).map((s: any) => (
              <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs">
                <div>
                  <span className="font-bold text-slate-700">{s.old_vehicle?.brand?.name ?? ''} {s.old_vehicle?.model?.model_name ?? s.old_vehicle?.model?.name ?? ''}</span>
                  <span className="mx-1 text-slate-400">→</span>
                  <span className="font-bold text-slate-900">{s.new_vehicle?.brand?.name ?? ''} {s.new_vehicle?.model?.model_name ?? s.new_vehicle?.model?.name ?? ''}</span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${s.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : s.status === 'rejected' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                  {s.status === 'approved' ? 'Validé' : s.status === 'rejected' ? 'Refusé' : 'En attente'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderVehicle = () => {
    const tabVehicles: any[] = categories[vehicleTab as keyof typeof categories] ?? [];

    return (
      <div className="space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {VEHICLE_TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setVehicleTab(t.key)}
              className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                vehicleTab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
              <span className="ml-1 text-[10px] text-slate-400">({(categories[t.key as keyof typeof categories] ?? []).length})</span>
            </button>
          ))}
        </div>

        {eligibleQ.isLoading && (
          <div className="flex items-center justify-center py-12 text-sm text-slate-500">Chargement des véhicules…</div>
        )}

        {/* Vehicle cards grid */}
        {!eligibleQ.isLoading && (
          <div className="grid grid-cols-2 gap-3 max-h-[340px] overflow-y-auto pr-1">
            {tabVehicles.length === 0 && (
              <div className="col-span-2 py-8 text-center text-sm text-slate-400">Aucun véhicule dans cette catégorie.</div>
            )}
            {tabVehicles.map((v: any) => {
              const isSelected = form.selectedVehicleId === v.id;
              const isAvail = v.available;
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={!isAvail}
                  onClick={() => setForm(s => ({ ...s, selectedVehicleId: v.id }))}
                  className={`relative rounded-xl border-2 p-3 text-left transition-all ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-200'
                      : isAvail
                        ? 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                        : 'border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed'
                  }`}
                >
                  {/* Photo */}
                  <div className="h-24 w-full rounded-lg bg-slate-100 overflow-hidden mb-2">
                    {v.photo_url ? (
                      <img src={v.photo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-300">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-10 w-10">
                          <path d="M8 17h.01M12 17h.01M16 17h.01M3 9h18M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="text-xs font-black text-slate-900 truncate">{v.brand_name} {v.model_name}</div>
                  <div className="text-[10px] text-slate-500 font-semibold">{v.registration_number}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {v.categorie && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">{v.categorie}</span>}
                    {v.fuel_type && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">{v.fuel_type}</span>}
                    {v.transmission && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">{v.transmission}</span>}
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">{v.mileage_current ? `${v.mileage_current.toLocaleString()} km` : ''}</span>
                    <span className="text-xs font-black text-indigo-600">{v.daily_rental_price ? `${v.daily_rental_price} MAD/j` : ''}</span>
                  </div>

                  {/* Availability badge */}
                  <div className={`absolute top-2 right-2 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                    isAvail ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                  }`}>
                    {isAvail ? 'Disponible' : 'Indisponible'}
                  </div>

                  {/* Unavailability reasons */}
                  {!isAvail && v.availability_reasons?.length > 0 && (
                    <div className="mt-1.5 text-[9px] text-rose-600 font-semibold truncate">
                      {v.availability_reasons[0]}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Availability preview + compatibility when a vehicle is selected */}
        {selectedVehicle && (
          <div className="space-y-3">
            {/* Availability checklist */}
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Vérification de disponibilité</div>
              {selectedVehicle.available ? (
                <div className="space-y-1">
                  {['Aucune réservation conflictuelle', 'Aucune maintenance en cours', 'Aucune mission conflictuelle', 'Véhicule prêt'].map((txt, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span className="text-slate-700">{txt}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1">
                  {(selectedVehicle.availability_reasons ?? []).map((r: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-rose-500 font-bold">✗</span>
                      <span className="text-rose-700">{r}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Compatibility comparison */}
            {currentV && (
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Comparaison</div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="py-1 text-left font-bold text-slate-500"></th>
                      <th className="py-1 text-left font-bold text-slate-700">Actuel</th>
                      <th className="py-1 text-left font-bold text-indigo-700">Nouveau</th>
                      <th className="py-1 w-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ['Catégorie', currentV.categorie, selectedVehicle.categorie],
                      ['Gamme', currentV.gamme, selectedVehicle.gamme],
                      ['Transmission', currentV.transmission, selectedVehicle.transmission],
                      ['Carburant', currentV.fuel_type, selectedVehicle.fuel_type],
                      ['Tarif/jour', currentV.daily_rental_price ? `${currentV.daily_rental_price} MAD` : '—', selectedVehicle.daily_rental_price ? `${selectedVehicle.daily_rental_price} MAD` : '—'],
                    ] as [string, string | null, string | null][]).map(([label, old, nw], i) => {
                      const diff = old && nw && old !== nw && String(old) !== String(nw);
                      return (
                        <tr key={i} className="border-b border-slate-50">
                          <td className="py-1.5 text-slate-500">{label}</td>
                          <td className="py-1.5 font-semibold text-slate-700">{old || '—'}</td>
                          <td className={`py-1.5 font-semibold ${diff ? 'text-amber-700' : 'text-slate-700'}`}>{nw || '—'}</td>
                          <td className="py-1.5">{diff && <span className="text-amber-500 text-[10px] font-bold">⚠</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderFinancial = () => (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Tarif actuel</span>
          <span className="font-bold text-slate-900">{fmtPrice(oldDailyRate)}/jour</span>
        </div>
        <div className="flex items-center justify-between text-sm gap-3">
          <label htmlFor="new_daily_rate" className="text-slate-500 shrink-0">Nouveau tarif (MAD/jour)</label>
          <input
            id="new_daily_rate"
            type="number"
            min="0"
            step="1"
            placeholder={String(selectedVehicle?.daily_rental_price ?? 0)}
            value={form.newDailyRate}
            onChange={e => setForm(s => ({ ...s, newDailyRate: e.target.value }))}
            className="w-36 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-indigo-700 text-right focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Jours restants</span>
          <span className="font-bold text-slate-900">{finRemainingDays} jours</span>
        </div>
        <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-700">Différence totale</span>
          <span className={`text-lg font-black ${totalDifference > 0 ? 'text-rose-600' : totalDifference < 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
            {totalDifference > 0 ? '+' : ''}{fmtPrice(totalDifference)}
          </span>
        </div>
      </div>

      <div className="rounded-xl border-2 border-indigo-500 bg-indigo-50/50 p-3">
        <div className="text-xs font-bold text-slate-900">Facturer au client</div>
        <div className="text-[10px] text-slate-500">La différence sera ajoutée automatiquement à la facture</div>
      </div>
    </div>
  );

  const renderOperations = () => (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Les opérations suivantes seront effectuées</div>
        <div className="space-y-2">
          {[
            'Retour de l\'ancien véhicule',
            'Mise à jour de la réservation',
            ...(source?.type === 'contract' || contract ? ['Mise à jour du contrat'] : []),
            'Notification au client',
            'Notification au gestionnaire de flotte',
            'Création du journal d\'audit',
          ].map((txt, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 text-[10px] font-bold">✓</span>
              <span className="text-slate-700">{txt}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.createMissions}
            onChange={e => setForm(s => ({ ...s, createMissions: e.target.checked }))}
            className="h-4 w-4 rounded accent-indigo-600"
          />
          <div>
            <div className="text-xs font-bold text-slate-900">Créer automatiquement les missions</div>
            <div className="text-[10px] text-slate-500">Mission de récupération + mission de livraison</div>
          </div>
        </label>

        {form.createMissions && (
          <div className="ml-7 space-y-3 border-l-2 border-indigo-200 pl-4">
            <div>
              <div className="text-xs font-bold text-slate-700 mb-2">L'ancien véhicule a-t-il déjà été récupéré ?</div>
              <div className="flex gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="recovered"
                    checked={form.oldVehicleRecovered}
                    onChange={() => setForm(s => ({ ...s, oldVehicleRecovered: true }))}
                    className="accent-indigo-600"
                  />
                  <span className="text-xs font-semibold text-slate-700">Oui</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="recovered"
                    checked={!form.oldVehicleRecovered}
                    onChange={() => setForm(s => ({ ...s, oldVehicleRecovered: false }))}
                    className="accent-indigo-600"
                  />
                  <span className="text-xs font-semibold text-slate-700">Non</span>
                </label>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              {!form.oldVehicleRecovered && (
                <div className="flex items-center gap-2 text-amber-700">
                  <span className="font-bold">→</span> Mission de récupération sera créée
                </div>
              )}
              <div className="flex items-center gap-2 text-indigo-700">
                <span className="font-bold">→</span> Mission de livraison sera créée
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderConfirmation = () => (
    <div className="space-y-4">
      {/* Vehicle swap visual */}
      <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-indigo-50 p-5">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Échange de véhicule</div>
        <div className="flex items-center gap-4">
          <div className="flex-1 rounded-xl bg-white border border-slate-200 p-3 text-center">
            <div className="text-[10px] text-slate-400 font-bold mb-1">Ancien</div>
            <div className="text-sm font-black text-slate-900">{currentV?.brand_name} {currentV?.model_name}</div>
            <div className="text-[10px] text-slate-500">{currentV?.registration_number}</div>
          </div>
          <div className="text-2xl text-indigo-500 font-black">→</div>
          <div className="flex-1 rounded-xl bg-indigo-600 p-3 text-center">
            <div className="text-[10px] text-indigo-200 font-bold mb-1">Nouveau</div>
            <div className="text-sm font-black text-white">{selectedVehicle?.brand_name} {selectedVehicle?.model_name}</div>
            <div className="text-[10px] text-indigo-200">{selectedVehicle?.registration_number}</div>
          </div>
        </div>
      </div>

      {/* Summary details */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
        {[
          ['Motif', form.reason === 'other' ? form.reasonDescription : reasonLabel],
          ['Impact financier', `${totalDifference > 0 ? '+' : ''}${fmtPrice(totalDifference)}`],
          ['Nouveau tarif', `${fmtPrice(newDailyRate)}/jour`],
          ['Action financière', { charge: 'Facturer', free_upgrade: 'Gratuit', refund: 'Rembourser', ignore: 'Ignorer' }[form.financialAction as string] ?? '—'],
          ['Missions', form.createMissions ? `${form.oldVehicleRecovered ? '1' : '2'} mission(s)` : 'Aucune'],
        ].map(([label, val], i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-slate-500">{label}</span>
            <span className="font-bold text-slate-900">{val}</span>
          </div>
        ))}
      </div>

      {/* Notifications preview */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Notifications</div>
        <div className="space-y-1">
          {['Client', 'Gestionnaire de flotte', 'Administrateur', 'Directeur'].map((r, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-slate-700">
              <span className="text-emerald-500 font-bold">✓</span> {r}
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">{error}</div>
      )}
    </div>
  );

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <DrawerPanel open={open} title="Changement de véhicule" onClose={onClose} widthClass="max-w-3xl">
      <div className="flex h-full flex-col">
        {/* Stepper */}
        <div className="df-stepper mb-6">
          {STEPS.map((s, i) => {
            const done = i < stepIdx;
            const active = i === stepIdx;
            return (
              <div
                key={s.key}
                className={`df-step ${done ? 'df-step--done' : ''} ${active ? 'df-step--active' : ''}`}
                onClick={() => { if (done) setStepIdx(i); }}
                style={{ cursor: done ? 'pointer' : 'default' }}
              >
                <div className="df-step__bullet">{done ? '✓' : i + 1}</div>
                {i < STEPS.length - 1 && (
                  <div className={`df-step__rail ${done ? 'df-step__rail--done' : active ? 'df-step__rail--active' : ''}`} />
                )}
                <div className="df-step__text">
                  <div className="df-step__label">{s.title}</div>
                  <div className="df-step__hint">{s.hint}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Step counter */}
        <div className="mb-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
          Étape {stepIdx + 1} / {STEPS.length} — {step.title}
        </div>

        {/* Step content */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {step.key === 'reason' && renderReason()}
          {step.key === 'summary' && renderSummary()}
          {step.key === 'vehicle' && renderVehicle()}
          {step.key === 'financial' && renderFinancial()}
          {step.key === 'operations' && renderOperations()}
          {step.key === 'confirmation' && renderConfirmation()}
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
          <div>
            {stepIdx > 0 && (
              <button
                type="button"
                onClick={prev}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600 hover:bg-slate-50"
              >
                Précédent
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600 hover:bg-slate-50"
            >
              Annuler
            </button>
            {step.key === 'confirmation' ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => doSwap('request')}
                  className="rounded-xl bg-amber-600 px-5 py-2.5 text-xs font-black text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {busy ? 'Traitement…' : 'Enregistrer comme demande'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => doSwap('instant')}
                  className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {busy ? 'Traitement…' : 'Changer le véhicule'}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={!canAdvance()}
                onClick={next}
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-black text-white hover:bg-slate-800 disabled:opacity-50"
              >
                Suivant
              </button>
            )}
          </div>
        </div>
      </div>
    </DrawerPanel>
  );
};
