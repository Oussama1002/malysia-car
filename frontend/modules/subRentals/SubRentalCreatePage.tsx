import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supplierAgencyApi, subRentalApi, type PaymentMethod } from '@/services/subRentalApi';
import { apiClient, getApiBase } from '@/services/apiClient';

type VehicleMode = 'existing' | 'temporary';

interface FormState {
  supplier_agency_id: string;
  vehicle_mode: VehicleMode;
  vehicle_id: string;
  ext_registration: string;
  ext_brand: string;
  ext_model: string;
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
  ext_registration: '',
  ext_brand: '',
  ext_model: '',
  ext_year: '',
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
      body.external_vehicle_identity = {
        registration_number: form.ext_registration || undefined,
        brand_name: form.ext_brand || undefined,
        model_name: form.ext_model || undefined,
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
              {field('Immatriculation', <input className={inputCls} value={form.ext_registration} onChange={set('ext_registration')} placeholder="Ex: A-12345-B" />)}
              {field('Marque', <input className={inputCls} value={form.ext_brand} onChange={set('ext_brand')} placeholder="Ex: Peugeot" />)}
              {field('Modèle', <input className={inputCls} value={form.ext_model} onChange={set('ext_model')} placeholder="Ex: 208" />)}
              {field('Année', <input className={inputCls} type="number" value={form.ext_year} onChange={set('ext_year')} placeholder="Ex: 2022" min="1990" max="2100" />)}
              {field('Couleur', <input className={inputCls} value={form.ext_color} onChange={set('ext_color')} placeholder="Ex: Blanc" />)}
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
