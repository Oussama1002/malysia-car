import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { supplierAgencyApi, subRentalApi, type PaymentMethod } from '@/services/subRentalApi';
import { apiClient, getApiBase } from '@/services/apiClient';
import { documentCenterApi } from '@/services/documentCenterApi';

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

/** Predefined document categories the user can attach when creating an SL contract. */
const DOC_CATEGORIES = [
  { key: 'insurance',                label: 'Assurance',                icon: '🛡️' },
  { key: 'registration_card',        label: 'Carte grise',              icon: '🚗' },
  { key: 'circulation_authorization',label: 'Autorisation de circulation', icon: '📄' },
  { key: 'payment_attestation',      label: 'Attestation de paiement',  icon: '✅' },
  { key: 'technical_inspection',     label: 'Visite technique',         icon: '🔧' },
  { key: 'vignette',                 label: 'Vignette',                 icon: '🎫' },
] as const;
type DocCategoryKey = typeof DOC_CATEGORIES[number]['key'];

interface SubRentalCreatePageProps {
  /** When true, render without the outer page shell (title, spacing) — suits a drawer. */
  embedded?: boolean;
  /** Called after successful creation. Overrides the default navigate-to-detail. */
  onCreated?: (id: string) => void;
  /** Called when the user clicks Annuler. Overrides the default navigate-back. */
  onCancel?: () => void;
}

export const SubRentalCreatePage: React.FC<SubRentalCreatePageProps> = ({
  embedded = false,
  onCreated,
  onCancel,
}) => {
  const navigate = useNavigate();
  const apiReady = !!getApiBase();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [error, setError] = useState<string | null>(null);
  const [brands, setBrands] = useState<VehicleBrandOption[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [docs, setDocs] = useState<Record<DocCategoryKey, File | null>>({
    insurance: null,
    registration_card: null,
    circulation_authorization: null,
    payment_attestation: null,
    technical_inspection: null,
    vignette: null,
  });
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

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
    enabled: false, // existing vehicle mode removed
  });

  const selectedBrand = brands.find((b) => b.id === form.ext_brand_id);
  const modelOptions = selectedBrand?.models ?? [];

  const computedDays =
    form.start_date && form.end_date
      ? Math.max(1, Math.round((new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / 86400000))
      : 0;
  const computedTotal = computedDays * (parseFloat(form.daily_cost) || 0);

  const uploadAttachments = async (subRentalId: string): Promise<void> => {
    const uploads: Array<{ label: string; run: () => Promise<unknown> }> = [];

    for (const [key, file] of Object.entries(docs) as Array<[DocCategoryKey, File | null]>) {
      if (!file) continue;
      const cat = DOC_CATEGORIES.find((c) => c.key === key);
      uploads.push({
        label: cat?.label ?? key,
        run: () => {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('category', key);
          fd.append('label', cat?.label ?? key);
          return documentCenterApi.uploadToEntity('sub_rental_contract', subRentalId, fd);
        },
      });
    }
    photos.forEach((file, idx) => {
      uploads.push({
        label: `Photo ${idx + 1}`,
        run: () => {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('category', 'photo');
          fd.append('label', `Photo véhicule ${idx + 1}`);
          return documentCenterApi.uploadToEntity('sub_rental_contract', subRentalId, fd);
        },
      });
    });

    if (uploads.length === 0) return;
    let done = 0;
    for (const u of uploads) {
      setUploadStatus(`Envoi ${u.label} (${done + 1}/${uploads.length})…`);
      try { await u.run(); } catch { /* non-blocking */ }
      done++;
    }
    setUploadStatus(null);
  };

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => subRentalApi.create(body),
    onSuccess: async (res) => {
      const id = (res as any)?.data?.id;
      if (id) {
        try { await uploadAttachments(id); } catch { /* ignore */ }
      }
      if (onCreated && id) {
        onCreated(id);
      } else {
        navigate(id ? `/fleet/sub-rentals/${id}` : '/fleet/sub-rentals');
      }
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

    {
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
    <div className={embedded ? 'space-y-6' : 'max-w-2xl space-y-6'}>
      {!embedded && (
        <div>
          <h1 className="text-xl font-bold text-slate-900">Nouveau contrat de sous-location</h1>
          <p className="text-sm text-slate-500">Renseignez les informations du contrat avec le fournisseur.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Supplier */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Agence fournisseur</h2>
          {field('Agence fournisseur', (
            <div className="flex items-stretch gap-2">
              <select className={`${inputCls} flex-1`} value={form.supplier_agency_id} onChange={(e) => {
                if (e.target.value === '__new__') { navigate('/fleet/supplier-agencies'); return; }
                set('supplier_agency_id')(e);
              }} required>
                <option value="">— Sélectionner —</option>
                {(agenciesQ.data?.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.name} {a.city ? `(${a.city})` : ''}</option>
                ))}
                <option value="__new__">+ Nouveau fournisseur</option>
              </select>
              <button
                type="button"
                onClick={() => navigate('/fleet/supplier-agencies')}
                className="shrink-0 rounded-2xl bg-indigo-600 px-4 py-2.5 text-xs font-black text-white hover:bg-indigo-700 whitespace-nowrap"
              >
                + Nouveau
              </button>
            </div>
          ), true)}
          {agenciesQ.data?.data?.length === 0 && (
            <p className="text-xs text-amber-600">Aucune agence active. <a href="/fleet/supplier-agencies" className="underline">Créer une agence</a>.</p>
          )}
        </div>

        {/* Vehicle identity */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide">Véhicule</h2>

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

        {/* Photos */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">Photos du véhicule</h2>
            <span className="text-[11px] font-semibold text-slate-400">{photos.length} sélectionnée{photos.length > 1 ? 's' : ''}</span>
          </div>
          <p className="text-xs text-slate-500">Face, arrière, profils, intérieur, tableau de bord — utile en cas de restitution.</p>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((f, i) => (
              <div key={i} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 aspect-square">
                <img src={URL.createObjectURL(f)} alt={f.name} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotos((s) => s.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-black text-white opacity-0 transition group-hover:opacity-100"
                  aria-label="Retirer"
                >✕</button>
              </div>
            ))}
            <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:bg-slate-100">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v12m6-6H6" /></svg>
              <span className="text-[11px] font-bold">Ajouter</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  setPhotos((s) => [...s, ...files]);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>

        {/* Documents */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">Documents véhicule</h2>
            <span className="text-[11px] font-semibold text-slate-400">
              {Object.values(docs).filter(Boolean).length} / {DOC_CATEGORIES.length}
            </span>
          </div>
          <p className="text-xs text-slate-500">PDF ou photo — assurance, carte grise, autorisation de circulation, attestation de paiement, visite technique et vignette.</p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {DOC_CATEGORIES.map((cat) => {
              const file = docs[cat.key];
              const inputId = `doc-${cat.key}`;
              return (
                <div
                  key={cat.key}
                  className={`rounded-xl border p-3 transition ${
                    file ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="mb-2 flex items-start gap-2">
                    <span className="text-lg leading-none">{cat.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-black text-slate-800">{cat.label}</div>
                      {file && (
                        <div className="mt-0.5 truncate text-[10px] font-semibold text-emerald-700">
                          ✓ {file.name}
                        </div>
                      )}
                    </div>
                    {file && (
                      <button
                        type="button"
                        onClick={() => setDocs((s) => ({ ...s, [cat.key]: null }))}
                        className="text-[10px] font-black text-rose-500 hover:text-rose-700"
                        aria-label="Retirer"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <label
                    htmlFor={inputId}
                    className={`inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
                      file
                        ? 'border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                    {file ? 'Remplacer' : 'Téléverser'}
                  </label>
                  <input
                    id={inputId}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setDocs((s) => ({ ...s, [cat.key]: f }));
                      e.target.value = '';
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        {uploadStatus && (
          <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-700">
            {uploadStatus}
          </div>
        )}

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
            onClick={() => (onCancel ? onCancel() : navigate('/fleet/sub-rentals'))}
            className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Annuler
          </button>
        </div>
      </form>
    </div>
  );
};
