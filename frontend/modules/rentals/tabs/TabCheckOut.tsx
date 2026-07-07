import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { opsApi } from '@/services/opsApi';
import { documentReaderApi } from '@/services/documentReaderApi';

interface Report {
  id: string;
  handover_type: string;
  odometer?: number | null;
  fuel_level?: number | null;
  condition_notes?: string | null;
  signature?: string | null;
  performed_by?: string | null;
  performed_at?: string | null;
  photos?: any[] | null;
  checklist?: any[] | null;
}

interface Props {
  reservationId: string;
  reports: Report[];
  onRefresh: () => void;
}

const PHOTO_ZONES = ['Avant', 'Arrière', 'Gauche', 'Droite', 'Intérieur', 'Tableau de bord'];

const TabCheckOut: React.FC<Props> = ({ reservationId, reports, onRefresh }) => {
  const pickups = reports.filter((r) => r.handover_type === 'pickup');
  const [form, setForm] = useState({
    odometer: '',
    fuel_level: '',
    condition_notes: '',
    signature: '',
  });
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'uploading' | 'extracting' | 'done' | 'error'>('idle');
  const [ocrError, setOcrError] = useState<string | null>(null);

  async function handleDashboardPhoto(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    setOcrStatus('uploading');
    setOcrError(null);
    try {
      const uploaded = await documentReaderApi.upload(file, 'vehicle_dashboard');
      setOcrStatus('extracting');
      await documentReaderApi.extract(uploaded.data.id, 'vehicle_dashboard');
      const result = await documentReaderApi.pollUntilDone(uploaded.data.id, { timeoutMs: 30000 });
      const doc = result.data;
      const data = doc.extraction?.extracted_data ?? doc.extracted_data ?? {};
      const km = Number(data.odometer ?? data.mileage ?? data.km ?? data.kilometrage ?? 0);
      const fuel = Number(data.fuel_level ?? data.fuel ?? data.carburant ?? 0);
      setForm((s) => ({
        ...s,
        odometer: km > 0 ? String(km) : s.odometer,
        fuel_level: fuel > 0 ? String(Math.min(100, fuel)) : s.fuel_level,
      }));
      setOcrStatus('done');
    } catch {
      setOcrStatus('error');
      setOcrError('Extraction impossible. Remplissez les champs manuellement.');
    }
  }

  const pickupM = useMutation({
    mutationFn: () =>
      opsApi.handoverPickup(reservationId, {
        odometer: form.odometer ? Number(form.odometer) : undefined,
        fuel_level: form.fuel_level ? Number(form.fuel_level) : undefined,
        condition_notes: form.condition_notes || undefined,
        signature: form.signature || undefined,
        checklist: [{ key: 'keys', ok: true }],
        photos: [],
      }),
    onSuccess: () => {
      onRefresh();
      setForm({ odometer: '', fuel_level: '', condition_notes: '', signature: '' });
    },
  });

  return (
    <div className="space-y-6">
      {/* Existing pickup records */}
      {pickups.length > 0 && (
        <div>
          <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">
            Historique Check-Out ({pickups.length})
          </h3>
          <div className="space-y-3">
            {pickups.map((p) => (
              <div key={p.id} className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-black text-emerald-800">
                    Check-Out effectué
                  </div>
                  <div className="text-xs text-emerald-600">
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

      {/* New pickup form */}
      <div className="rounded-xl border border-slate-100 p-5">
        <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Nouveau Check-Out</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[10px] font-bold text-slate-400">Kilométrage départ</label>
            <input
              type="number"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              placeholder="Ex: 45230"
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
              placeholder="Ex: 75"
              value={form.fuel_level}
              onChange={(e) => setForm((s) => ({ ...s, fuel_level: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-[10px] font-bold text-slate-400">Observations / état du véhicule</label>
            <textarea
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              rows={3}
              placeholder="Rayures existantes, état des pneus, accessoires remis…"
              value={form.condition_notes}
              onChange={(e) => setForm((s) => ({ ...s, condition_notes: e.target.value }))}
            />
          </div>
        </div>

        {/* Photo zones */}
        <div className="mt-4">
          <label className="mb-2 block text-[10px] font-bold text-slate-400">Photos du véhicule</label>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {PHOTO_ZONES.map((zone) => {
              const isDashboard = zone === 'Tableau de bord';
              return (
                <label
                  key={zone}
                  className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-3 text-center cursor-pointer ${
                    isDashboard
                      ? 'border-indigo-300 bg-indigo-50/40 hover:border-indigo-400'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="file"
                    accept="image/*"
                    capture={isDashboard ? 'environment' : undefined}
                    className="hidden"
                    onChange={(e) => {
                      if (isDashboard) handleDashboardPhoto(e.target.files);
                    }}
                  />
                  <div className="text-lg text-slate-300">{isDashboard ? '🔍' : '📷'}</div>
                  <div className={`mt-1 text-[10px] font-bold ${isDashboard ? 'text-indigo-600' : 'text-slate-400'}`}>{zone}</div>
                  {isDashboard && <div className="mt-0.5 text-[8px] text-indigo-400">Auto-remplir km & carburant</div>}
                </label>
              );
            })}
          </div>
          {ocrStatus === 'uploading' && <div className="mt-2 text-xs font-semibold text-indigo-600">Upload en cours…</div>}
          {ocrStatus === 'extracting' && <div className="mt-2 text-xs font-semibold text-indigo-600">Extraction OCR en cours…</div>}
          {ocrStatus === 'done' && <div className="mt-2 text-xs font-semibold text-emerald-600">Km et carburant extraits avec succès.</div>}
          {ocrStatus === 'error' && <div className="mt-2 text-xs font-semibold text-rose-600">{ocrError}</div>}
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-[10px] font-bold text-slate-400">Signature client</label>
          <div className="h-24 rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center text-xs text-slate-400">
            Zone de signature (bientôt disponible)
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={() => pickupM.mutate()}
            disabled={pickupM.isPending}
            className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {pickupM.isPending ? 'Enregistrement…' : 'Valider le Check-Out'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TabCheckOut;
