import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, getApiBase } from '@/services/apiClient';
import { BrandLogo } from '@/modules/shared/components/BrandLogo';
import { Modal } from '@/modules/shared/components/Modal';

interface BrandModel {
  id: string;
  name: string;
  vehiclesCount?: number;
}

interface Brand {
  id: string;
  name: string;
  logoUrl?: string | null;
  vehiclesCount?: number;
  models: BrandModel[];
}

const inputCls =
  'px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-semibold text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all';

export const VehicleBrandsPage: React.FC = () => {
  const qc = useQueryClient();
  const [newBrand, setNewBrand] = useState('');
  const [editing, setEditing] = useState<Brand | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<Brand[]>({
    queryKey: ['vehicle-brands'],
    queryFn: () => apiClient<{ data: Brand[] }>('/v1/vehicle-brands').then((r) => r.data),
    enabled: !!getApiBase(),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['vehicle-brands'] });
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : 'Erreur');

  const addBrand = useMutation({
    mutationFn: (name: string) => apiClient('/v1/vehicle-brands', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: () => { setError(null); refresh(); setNewBrand(''); },
    onError: fail,
  });

  const deleteBrand = useMutation({
    mutationFn: (id: string) => apiClient(`/v1/vehicle-brands/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setError(null); refresh(); },
    onError: fail,
  });

  const brands: Brand[] = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Véhicules — Marques &amp; modèles</h1>
          <p className="text-sm text-slate-500">Gérez le catalogue des marques et modèles du parc.</p>
        </div>
        <Link className="text-sm font-bold text-indigo-600" to="/settings">← Paramètres</Link>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-700">
          {error}
        </div>
      )}

      {/* Ajout rapide */}
      <div className="df-card">
        <div className="df-card__body flex flex-wrap items-center gap-2">
          <input
            className={`${inputCls} flex-1 min-w-[220px]`}
            placeholder="Nouvelle marque — ex : Hyundai"
            value={newBrand}
            onChange={(e) => setNewBrand(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newBrand.trim()) addBrand.mutate(newBrand.trim()); }}
          />
          <button
            className="df-btn df-btn--primary"
            disabled={!newBrand.trim() || addBrand.isPending}
            onClick={() => addBrand.mutate(newBrand.trim())}
          >
            {addBrand.isPending ? 'Ajout…' : 'Ajouter la marque'}
          </button>
        </div>
      </div>

      {/* Catalogue */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="w-16 px-4 py-3 text-left">Logo</th>
              <th className="px-4 py-3 text-left">Marque</th>
              <th className="px-4 py-3 text-left">Modèles</th>
              <th className="w-28 px-4 py-3 text-center">Véhicules</th>
              <th className="w-44 px-4 py-3 text-right"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Chargement…</td></tr>
            )}
            {!isLoading && brands.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">Aucune marque enregistrée.</td></tr>
            )}
            {brands.map((brand) => (
              <tr key={brand.id} className="hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <BrandLogo brand={brand.name} url={brand.logoUrl} size={32} />
                </td>
                <td className="px-4 py-3 font-black text-slate-900">{brand.name}</td>
                <td className="px-4 py-3 text-slate-600">
                  {brand.models.length === 0 ? (
                    <span className="text-slate-400">Aucun modèle</span>
                  ) : (
                    <span className="flex flex-wrap gap-1.5">
                      {brand.models.slice(0, 6).map((m) => (
                        <span key={m.id} className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                          {m.name}
                        </span>
                      ))}
                      {brand.models.length > 6 && (
                        <span className="px-1 text-xs font-bold text-slate-400">+{brand.models.length - 6}</span>
                      )}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center font-semibold text-slate-700">{brand.vehiclesCount ?? 0}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button
                    className="rounded-lg px-3 py-1.5 text-xs font-black text-indigo-600 hover:bg-indigo-50"
                    onClick={() => { setError(null); setEditing(brand); }}
                  >
                    Modifier
                  </button>
                  <button
                    className="rounded-lg px-3 py-1.5 text-xs font-black text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                    disabled={deleteBrand.isPending}
                    onClick={() => {
                      if (confirm(`Supprimer la marque « ${brand.name} » et ses modèles ?`)) deleteBrand.mutate(brand.id);
                    }}
                  >
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <BrandEditor
          brand={brands.find((b) => b.id === editing.id) ?? editing}
          onClose={() => setEditing(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
};

/** Renommer la marque, poser son logo, tenir ses modèles. */
const BrandEditor: React.FC<{ brand: Brand; onClose: () => void; onChanged: () => void }> = ({ brand, onClose, onChanged }) => {
  const [name, setName] = useState(brand.name);
  const [newModel, setNewModel] = useState('');
  const [renaming, setRenaming] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open title={`Modifier — ${brand.name}`} onClose={onClose} widthClass="max-w-2xl">
      <div className="space-y-5">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</div>
        )}

        {/* Identité */}
        <div className="flex flex-wrap items-center gap-4">
          <BrandLogo brand={brand.name} url={brand.logoUrl} size={56} />
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const body = new FormData();
                  body.append('file', file);
                  void run(() => apiClient(`/v1/vehicle-brands/${brand.id}/logo`, { method: 'POST', body }));
                  e.target.value = '';
                }}
              />
              {brand.logoUrl ? 'Remplacer le logo' : 'Téléverser un logo'}
            </label>
            {brand.logoUrl && (
              <button
                className="rounded-xl px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50"
                disabled={busy}
                onClick={() => run(() => apiClient(`/v1/vehicle-brands/${brand.id}/logo`, { method: 'DELETE' }))}
              >
                Retirer le logo
              </button>
            )}
          </div>
        </div>

        <div>
          <label className="df-label">Nom de la marque</label>
          <div className="mt-1 flex gap-2">
            <input className={`${inputCls} flex-1`} value={name} onChange={(e) => setName(e.target.value)} />
            <button
              className="df-btn df-btn--primary df-btn--sm"
              disabled={busy || !name.trim() || name.trim() === brand.name}
              onClick={() => run(() => apiClient(`/v1/vehicle-brands/${brand.id}`, {
                method: 'PUT',
                body: JSON.stringify({ name: name.trim() }),
              }))}
            >
              Renommer
            </button>
          </div>
        </div>

        {/* Modèles */}
        <div>
          <div className="mb-2 text-xs font-black uppercase tracking-widest text-slate-400">
            Modèles ({brand.models.length})
          </div>
          <div className="space-y-2">
            {brand.models.map((model) => (
              <div key={model.id} className="flex flex-wrap items-center gap-2">
                <input
                  className={`${inputCls} flex-1 min-w-[180px]`}
                  value={renaming[model.id] ?? model.name}
                  onChange={(e) => setRenaming((r) => ({ ...r, [model.id]: e.target.value }))}
                />
                <span className="text-[11px] font-semibold text-slate-400">
                  {model.vehiclesCount ?? 0} véhicule{(model.vehiclesCount ?? 0) > 1 ? 's' : ''}
                </span>
                <button
                  className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 disabled:opacity-40"
                  disabled={busy || !(renaming[model.id] ?? '').trim() || (renaming[model.id] ?? model.name) === model.name}
                  onClick={() => run(() => apiClient(`/v1/vehicle-models/${model.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ name: (renaming[model.id] ?? model.name).trim() }),
                  }))}
                >
                  Renommer
                </button>
                <button
                  className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-40"
                  disabled={busy}
                  onClick={() => {
                    if (confirm(`Supprimer le modèle « ${model.name} » ?`)) {
                      void run(() => apiClient(`/v1/vehicle-models/${model.id}`, { method: 'DELETE' }));
                    }
                  }}
                >
                  Supprimer
                </button>
              </div>
            ))}
            {brand.models.length === 0 && (
              <p className="text-sm text-slate-400">Aucun modèle pour cette marque.</p>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <input
              className={`${inputCls} flex-1`}
              placeholder={`Nouveau modèle pour ${brand.name}`}
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newModel.trim()) {
                  void run(() => apiClient('/v1/vehicle-models', {
                    method: 'POST',
                    body: JSON.stringify({ brand_id: brand.id, name: newModel.trim() }),
                  }).then(() => setNewModel('')));
                }
              }}
            />
            <button
              className="df-btn df-btn--subtle df-btn--sm"
              disabled={busy || !newModel.trim()}
              onClick={() => run(() => apiClient('/v1/vehicle-models', {
                method: 'POST',
                body: JSON.stringify({ brand_id: brand.id, name: newModel.trim() }),
              }).then(() => setNewModel('')))}
            >
              Ajouter le modèle
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <button className="df-btn df-btn--ghost" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </Modal>
  );
};
