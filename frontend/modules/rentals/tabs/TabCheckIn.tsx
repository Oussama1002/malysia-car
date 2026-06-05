import React, { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { opsApi } from '@/services/opsApi';

interface Report {
  id: string;
  handover_type: string;
  odometer?: number | null;
  fuel_level?: number | null;
  condition_notes?: string | null;
  signature?: string | null;
  performed_by?: string | null;
  performed_at?: string | null;
}

interface Props {
  reservationId: string;
  reports: Report[];
  onRefresh: () => void;
}

const PHOTO_ZONES = ['Avant', 'Arrière', 'Gauche', 'Droite', 'Intérieur', 'Tableau de bord'];

const TabCheckIn: React.FC<Props> = ({ reservationId, reports, onRefresh }) => {
  const returns = reports.filter((r) => r.handover_type === 'return');
  const lastPickup = reports.filter((r) => r.handover_type === 'pickup').at(-1);

  const [form, setForm] = useState({
    odometer: '',
    fuel_level: '',
    condition_notes: '',
    signature: '',
  });

  const returnM = useMutation({
    mutationFn: () =>
      opsApi.handoverReturn(reservationId, {
        odometer: form.odometer ? Number(form.odometer) : undefined,
        fuel_level: form.fuel_level ? Number(form.fuel_level) : undefined,
        condition_notes: form.condition_notes || undefined,
        signature: form.signature || undefined,
        checklist: [{ key: 'body', ok: true }],
        photos: [],
      }),
    onSuccess: () => {
      onRefresh();
      setForm({ odometer: '', fuel_level: '', condition_notes: '', signature: '' });
    },
  });

  // Auto-calculations
  const extraKm = useMemo(() => {
    if (!form.odometer || !lastPickup?.odometer) return null;
    return Math.max(0, Number(form.odometer) - Number(lastPickup.odometer));
  }, [form.odometer, lastPickup]);

  const fuelDiff = useMemo(() => {
    if (!form.fuel_level || lastPickup?.fuel_level == null) return null;
    return Number(form.fuel_level) - Number(lastPickup.fuel_level);
  }, [form.fuel_level, lastPickup]);

  return (
    <div className="space-y-6">
      {/* Existing return records */}
      {returns.length > 0 && (
        <div>
          <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">
            Historique Check-In ({returns.length})
          </h3>
          <div className="space-y-3">
            {returns.map((p) => (
              <div key={p.id} className="rounded-xl border border-cyan-100 bg-cyan-50/50 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-black text-cyan-800">Check-In effectué</div>
                  <div className="text-xs text-cyan-600">
                    {p.performed_at ? new Date(p.performed_at).toLocaleString('fr-MA') : '—'}
                  </div>
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                  <div><span className="text-slate-400">Km :</span> <span className="font-bold">{p.odometer ?? '—'}</span></div>
                  <div><span className="text-slate-400">Carburant :</span> <span className="font-bold">{p.fuel_level != null ? `${p.fuel_level}%` : '—'}</span></div>
                  <div className="col-span-2"><span className="text-slate-400">Notes :</span> <span className="font-bold">{p.condition_notes || '—'}</span></div>
                </dl>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New return form */}
      <div className="rounded-xl border border-slate-100 p-5">
        <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Nouveau Check-In</h3>

        {/* Auto-calculations banner */}
        {(extraKm !== null || fuelDiff !== null) && (
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {extraKm !== null && (
              <div className="rounded-xl bg-indigo-50 px-4 py-3">
                <div className="text-[10px] font-bold text-indigo-400 uppercase">Km parcourus</div>
                <div className="text-lg font-black text-indigo-700">{extraKm.toLocaleString('fr-MA')} km</div>
              </div>
            )}
            {fuelDiff !== null && (
              <div className={`rounded-xl px-4 py-3 ${fuelDiff < 0 ? 'bg-rose-50' : 'bg-emerald-50'}`}>
                <div className={`text-[10px] font-bold uppercase ${fuelDiff < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>Diff. carburant</div>
                <div className={`text-lg font-black ${fuelDiff < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{fuelDiff > 0 ? '+' : ''}{fuelDiff}%</div>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[10px] font-bold text-slate-400">Kilométrage retour</label>
            <input
              type="number"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              placeholder={lastPickup?.odometer ? `Départ: ${lastPickup.odometer}` : 'Ex: 45830'}
              value={form.odometer}
              onChange={(e) => setForm((s) => ({ ...s, odometer: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold text-slate-400">Niveau carburant (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              placeholder={lastPickup?.fuel_level != null ? `Départ: ${lastPickup.fuel_level}%` : 'Ex: 50'}
              value={form.fuel_level}
              onChange={(e) => setForm((s) => ({ ...s, fuel_level: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-[10px] font-bold text-slate-400">Observations / état du véhicule</label>
            <textarea
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              rows={3}
              placeholder="Nouveaux dommages, propreté, accessoires manquants…"
              value={form.condition_notes}
              onChange={(e) => setForm((s) => ({ ...s, condition_notes: e.target.value }))}
            />
          </div>
        </div>

        {/* Photo zones */}
        <div className="mt-4">
          <label className="mb-2 block text-[10px] font-bold text-slate-400">Photos du véhicule</label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {PHOTO_ZONES.map((zone) => (
              <div
                key={zone}
                className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 p-3 text-center hover:border-slate-300 cursor-pointer"
              >
                <div className="text-lg text-slate-300">📷</div>
                <div className="mt-1 text-[10px] font-bold text-slate-400">{zone}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-[10px] font-bold text-slate-400">Signature client</label>
          <div className="h-24 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center text-xs text-slate-400">
            Zone de signature (bientôt disponible)
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={() => returnM.mutate()}
            disabled={returnM.isPending}
            className="rounded-xl bg-cyan-600 px-5 py-2.5 text-sm font-black text-white hover:bg-cyan-700 disabled:opacity-50"
          >
            {returnM.isPending ? 'Enregistrement…' : '🏁 Valider le Check-In'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TabCheckIn;
