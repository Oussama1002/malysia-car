import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supplierAgencyApi, subRentalApi, type PaymentMethod } from '@/services/subRentalApi';
import { apiClient, getApiBase } from '@/services/apiClient';

const PLATE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWY'.split('');
const PLATE_REGIONS = Array.from({ length: 99 }, (_, i) => i + 1);
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - 1989 }, (_, i) => CURRENT_YEAR - i);
const COLOR_OPTIONS = ['Blanc', 'Noir', 'Gris', 'Argent', 'Rouge', 'Bleu', 'Vert', 'Beige', 'Marron', 'Orange', 'Jaune', 'Violet', 'Autre'];

interface VehicleBrandOption { id: string; name: string; models: { id: string; name: string }[]; }

function parsePlate(reg: string) {
  const m = reg.match(/^(\d+)-([A-Z])-(\d+)$/);
  if (m) return { platNum: m[1], platLetter: m[2], platRegion: Number(m[3]) };
  return { platNum: reg, platLetter: 'A', platRegion: 1 };
}

type VehicleMode = 'existing' | 'temporary';

interface FormState {
  supplier_agency_id: string;
  vehicle_mode: VehicleMode;
  vehicle_id: string;
  plat_num: string;
  plat_letter: string;
  plat_region: number;
  ext_brand_id: string;
  ext_model_id: string;
  ext_year: string;
  ext_color: string;
  ext_mileage: string;
  start_date: string;
  end_date: string;
  daily_cost: string;
  deposit_amount: string;
  payment_method: PaymentMethod;
  notes: string;
}

const INITIAL: FormState = {
  supplier_agency_id: '',
  vehicle_mode: 'temporary',
  vehicle_id: '',
  plat_num: '',
  plat_letter: 'A',
  plat_region: 1,
  ext_brand_id: '',
  ext_model_id: '',
  ext_year: String(CURRENT_YEAR),
  ext_color: '',
  ext_mileage: '',
  start_date: '',
  end_date: '',
  daily_cost: '',
  deposit_amount: '',
  payment_method: 'cash',
  notes: '',
};

export const SubRentalCreatePage: React.FC = () => {
  const navigate = useNavigate();
  const apiReady = !!getApiBase();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const [brands, setBrands] = useState<VehicleBrandOption[]>([]);

  useEffect(() => {
    if (!apiReady) return;
    apiClient<{ data: VehicleBrandOption[] }>('/v1/vehicle-brands')
      .then((res) => setBrands(res.data))
      .catch(() => setBrands([]));
  }, [apiReady]);

  const agenciesQ = useQuery({
    queryKey: ['supplier-agencies', 'list-active'],
    queryFn: () => supplierAgencyApi.list({ status: 'active', per_page: '200' }),
    enabled: apiReady,
  });

  const vehiclesQ = useQuery({
    queryKey: ['fleet', 'vehicles', 'available'],
    queryFn: () => apiClient<{ data: Array<{ id: string; registration_number: string; brand?: { name: string }; model?: { name: string } }> }>('/v1/vehicles?per_page=200&availability_status=available'),
    enabled: apiReady && form.vehicle_mode === 'existing',
  });

  const selectedBrand = brands.find((b) => b.id === form.ext_brand_id);
  const modelOptions = selectedBrand?.models ?? [];

  const computedDays =
    form.start_date && form.end_date
      ? Math.max(1, Math.round((new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / 86400000))
      : 0;
  const computedTotal = computedDays * (parseFloat(form.daily_cost) || 0);

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => subRentalApi.create(body),
    onSuccess: (res) => {
      const id = (res as any)?.data?.id;
      navigate(id ? `/fleet/sub-rentals/${id}` : '/fleet/sub-rentals');
    },
    onError: (e: unknown) => {
      const msg = (e as any)?.data?.message ?? (e as Error)?.message ?? 'Erreur lors de la création.';
      setError(msg);
    },
  });

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.supplier_agency_id) { setError('Sélectionnez une agence fournisseur.'); return; }
    if (!form.start_date || !form.end_date) { setError('Les dates sont obligatoires.'); return; }
    if (!form.daily_cost || parseFloat(form.daily_cost) <= 0) { setError('Le coût journalier est obligatoire.'); return; }

    const body: Record<string, unknown> = {
      supplier_agency_id: form.supplier_agency_id,
      start_date: form.start_date,
      end_date: form.end_date,
      daily_cost: parseFloat(form.daily_cost),
      total_cost: computedTotal,
      payment_method: form.payment_method,
      notes: form.notes || undefined,
    };

    if (form.deposit_amount) body.deposit_amount = parseFloat(form.deposit_amount);

    if (form.vehicle_mode === 'existing' && form.vehicle_id) {
      body.vehicle_id = form.vehicle_id;
    } else {
      const registration = form.plat_num ? `${form.plat_num}-${form.plat_letter}-${form.plat_region}` : undefined;
      const brandObj = brands.find((b) => b.id === form.ext_brand_id);
      const modelObj = brandObj?.models.find((m) => m.id === form.ext_model_id);
      body.external_vehicle_identity = {
        registration_number: registration,
        brand_name: brandObj?.name || undefined,
        model_name: modelObj?.name || undefined,
        year: form.ext_year ? parseInt(form.ext_year) : undefined,
        color: form.ext_color || undefined,
        mileage: form.ext_mileage ? parseFloat(form.ext_mileage) : undefined,
      };
    }

    createMutation.mutate(body);
  };

  const field = (label: string, node: React.ReactNode, required = false) => (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {node}
    </div>
  );

  const inputCls = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400';

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Nouveau contrat de sous-location</h1>
        <p className="text-sm text-slate-500">Renseignez les informations du contrat avec le fournisseur.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Supplier */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Agence fournisseur</h2>
          {field('Agence fournisseur', (
            <select className={inputCls} value={form.supplier_agency_id} onChange={set('supplier_agency_id')} required>
              <option value="">— Sélectionner —</option>
              {(agenciesQ.data?.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.name} {a.city ? `(${a.city})` : ''}</option>
              ))}
            </select>
          ), true)}
          {agenciesQ.data?.data?.length === 0 && (
            <p className="text-xs text-amber-600">Aucune agence active. <a href="/fleet/supplier-agencies" className="underline">Créer une agence</a>.</p>
          )}
        </div>

        {/* Vehicle identity */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Véhicule</h2>
          <div className="flex gap-3">
            {(['temporary', 'existing'] as VehicleMode[]).map((m) => (
              <label key={m} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="vehicle_mode"
                  value={m}
                  checked={form.vehicle_mode === m}
                  onChange={() => setForm((f) => ({ ...f, vehicle_mode: m }))}
                  className="accent-indigo-600"
                />
                <span className="text-sm">{m === 'temporary' ? 'Créer un véhicule temporaire' : 'Lier à un véhicule existant'}</span>
              </label>
            ))}
          </div>

          {form.vehicle_mode === 'existing' ? (
            field('Véhicule existant', (
              <select className={inputCls} value={form.vehicle_id} onChange={set('vehicle_id')}>
                <option value="">— Sélectionner —</option>
                {(vehiclesQ.data?.data ?? []).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.registration_number} {v.brand?.name} {v.model?.name}
                  </option>
                ))}
              </select>
            ))
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {/* Immatriculation — plate picker */}
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Immatriculation</label>
                <div className="flex items-center gap-2">
                  <input
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-black text-center focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="12345"
                    value={form.plat_num}
                    onChange={(e) => setForm((f) => ({ ...f, plat_num: e.target.value.replace(/\D/g, '') }))}
                  />
                  <span className="text-slate-300 font-black text-xl">–</span>
                  <select
                    className="w-20 px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-black text-center focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={form.plat_letter}
                    onChange={(e) => setForm((f) => ({ ...f, plat_letter: e.target.value }))}
                  >
                    {PLATE_LETTERS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <span className="text-slate-300 font-black text-xl">–</span>
                  <select
                    className="w-20 px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-black text-center focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    value={form.plat_region}
                    onChange={(e) => setForm((f) => ({ ...f, plat_region: Number(e.target.value) }))}
                  >
                    {PLATE_REGIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                {form.plat_num && (
                  <p className="text-[10px] text-slate-400 mt-1 ml-1 font-mono font-bold">
                    {form.plat_num}-{form.plat_letter}-{form.plat_region}
                  </p>
                )}
              </div>

              {/* Marque — API dropdown */}
              {field('Marque', (
                <select
                  className={inputCls}
                  value={form.ext_brand_id}
                  onChange={(e) => setForm((f) => ({ ...f, ext_brand_id: e.target.value, ext_model_id: '' }))}
                >
                  <option value="">— Sélectionner —</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              ))}

              {/* Modèle — filtered by brand */}
              {field('Modèle', (
                <select
                  className={inputCls}
                  value={form.ext_model_id}
                  onChange={(e) => setForm((f) => ({ ...f, ext_model_id: e.target.value }))}
                  disabled={!form.ext_brand_id}
                >
                  <option value="">— Sélectionner —</option>
                  {modelOptions.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              ))}

              {/* Année */}
              {field('Année', (
                <select className={inputCls} value={form.ext_year} onChange={set('ext_year')}>
                  {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              ))}

              {/* Couleur */}
              {field('Couleur', (
                <select className={inputCls} value={form.ext_color} onChange={set('ext_color')}>
                  <option value="">— Sélectionner —</option>
                  {COLOR_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              ))}

              {field('Kilométrage', <input className={inputCls} type="number" value={form.ext_mileage} onChange={set('ext_mileage')} placeholder="Ex: 45000" min="0" />)}
            </div>
          )}
        </div>

        {/* Contract dates & costs */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Contrat</h2>
          <div className="grid grid-cols-2 gap-3">
            {field('Date de début', <input className={inputCls} type="date" value={form.start_date} onChange={set('start_date')} required />, true)}
            {field('Date de fin', <input className={inputCls} type="date" value={form.end_date} onChange={set('end_date')} required />, true)}
            {field('Coût journalier (MAD)', <input className={inputCls} type="number" step="0.01" min="0" value={form.daily_cost} onChange={set('daily_cost')} placeholder="0.00" required />, true)}
            {field('Coût total estimé', (
              <input className={`${inputCls} bg-slate-50`} readOnly value={computedTotal > 0 ? `${computedTotal.toLocaleString('fr-MA')} MAD (${computedDays} jours)` : '—'} />
            ))}
            {field('Caution (MAD)', <input className={inputCls} type="number" step="0.01" min="0" value={form.deposit_amount} onChange={set('deposit_amount')} placeholder="Optionnel" />)}
            {field('Mode de paiement', (
              <select className={inputCls} value={form.payment_method} onChange={set('payment_method')}>
                <option value="cash">Espèces</option>
                <option value="bank_transfer">Virement bancaire</option>
                <option value="cheque">Chèque</option>
                <option value="card">Carte</option>
                <option value="other">Autre</option>
              </select>
            ))}
          </div>
          {field('Notes', (
            <textarea className={`${inputCls} resize-none`} rows={3} value={form.notes} onChange={set('notes')} placeholder="Observations, conditions particulières…" />
          ))}
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {createMutation.isPending ? 'Création…' : 'Créer le contrat'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/fleet/sub-rentals')}
            className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
};
