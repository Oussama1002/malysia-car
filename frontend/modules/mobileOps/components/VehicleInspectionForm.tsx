import React, { useState } from 'react';
import type { InspectionType, ConditionLevel } from '@/services/mobileOpsApi';

interface InspectionFormData {
  inspection_type: InspectionType;
  odometer_km?: number;
  fuel_level?: number;
  exterior_condition: ConditionLevel;
  interior_condition: ConditionLevel;
  damage_notes?: string;
  gps_lat?: number;
  gps_lng?: number;
}

interface VehicleInspectionFormProps {
  onSubmit: (data: InspectionFormData) => void;
  isPending?: boolean;
  defaultType?: InspectionType;
}

const CONDITION_OPTIONS: { value: ConditionLevel; label: string; color: string }[] = [
  { value: 'good', label: 'Bon', color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  { value: 'minor_damage', label: 'Dommages mineurs', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { value: 'major_damage', label: 'Dommages majeurs', color: 'bg-rose-100 text-rose-800 border-rose-300' },
];

export const VehicleInspectionForm: React.FC<VehicleInspectionFormProps> = ({ onSubmit, isPending, defaultType = 'check_in' }) => {
  const [type, setType] = useState<InspectionType>(defaultType);
  const [odometer, setOdometer] = useState('');
  const [fuel, setFuel] = useState('50');
  const [exterior, setExterior] = useState<ConditionLevel>('good');
  const [interior, setInterior] = useState<ConditionLevel>('good');
  const [damageNotes, setDamageNotes] = useState('');
  const [gettingGps, setGettingGps] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);

  const captureGps = () => {
    if (!navigator.geolocation) return;
    setGettingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGettingGps(false);
      },
      () => setGettingGps(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      inspection_type: type,
      odometer_km: odometer ? parseInt(odometer, 10) : undefined,
      fuel_level: parseInt(fuel, 10),
      exterior_condition: exterior,
      interior_condition: interior,
      damage_notes: damageNotes || undefined,
      gps_lat: gps?.lat,
      gps_lng: gps?.lng,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type */}
      <div className="flex gap-2">
        {(['check_in', 'check_out'] as InspectionType[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`flex-1 rounded-xl border px-3 py-2 text-xs font-bold transition ${
              type === t ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'
            }`}
          >
            {t === 'check_in' ? 'Check-in (remise)' : 'Check-out (retour)'}
          </button>
        ))}
      </div>

      {/* Odometer */}
      <div>
        <label className="mb-1 block text-xs font-bold text-slate-700">Kilométrage (km)</label>
        <input
          type="number"
          value={odometer}
          onChange={(e) => setOdometer(e.target.value)}
          className="df-input w-full"
          placeholder="ex: 45200"
          min={0}
        />
      </div>

      {/* Fuel level */}
      <div>
        <label className="mb-1 block text-xs font-bold text-slate-700">Niveau carburant: {fuel}%</label>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={fuel}
          onChange={(e) => setFuel(e.target.value)}
          className="w-full accent-indigo-600"
        />
        <div className="flex justify-between text-[10px] text-slate-400">
          <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
        </div>
      </div>

      {/* Exterior condition */}
      <div>
        <label className="mb-1 block text-xs font-bold text-slate-700">État extérieur</label>
        <div className="flex gap-2">
          {CONDITION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setExterior(opt.value)}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${
                exterior === opt.value ? opt.color : 'border-slate-200 text-slate-500'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Interior condition */}
      <div>
        <label className="mb-1 block text-xs font-bold text-slate-700">État intérieur</label>
        <div className="flex gap-2">
          {CONDITION_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setInterior(opt.value)}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${
                interior === opt.value ? opt.color : 'border-slate-200 text-slate-500'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Damage notes */}
      {(exterior !== 'good' || interior !== 'good') && (
        <div>
          <label className="mb-1 block text-xs font-bold text-slate-700">Notes dommages</label>
          <textarea
            value={damageNotes}
            onChange={(e) => setDamageNotes(e.target.value)}
            className="df-input w-full"
            rows={3}
            placeholder="Décrivez les dommages constatés..."
          />
        </div>
      )}

      {/* GPS */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={captureGps} className="df-btn df-btn--ghost text-xs" disabled={gettingGps}>
          {gettingGps ? 'Localisation...' : gps ? `GPS: ${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)}` : 'Capturer GPS'}
        </button>
      </div>

      <button type="submit" className="df-btn df-btn--primary w-full" disabled={isPending}>
        {isPending ? 'Envoi...' : 'Enregistrer l\'inspection'}
      </button>
    </form>
  );
};
