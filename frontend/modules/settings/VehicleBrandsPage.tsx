import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, getApiBase } from '@/services/apiClient';

interface BrandModel { id: string; name: string; }
interface Brand { id: string; name: string; models: BrandModel[]; }

const inputCls = 'px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-semibold text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all';

export const VehicleBrandsPage: React.FC = () => {
  const qc = useQueryClient();
  const [newBrand, setNewBrand] = useState('');
  const [newModels, setNewModels] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery<Brand[]>({
    queryKey: ['vehicle-brands'],
    queryFn: () => apiClient<{ data: Brand[] }>('/v1/vehicle-brands').then((r) => r.data),
    enabled: !!getApiBase(),
  });

  const addBrand = useMutation({
    mutationFn: (name: string) =>
      apiClient('/v1/vehicle-brands', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vehicle-brands'] }); setNewBrand(''); },
  });

  const deleteBrand = useMutation({
    mutationFn: (id: string) => apiClient(`/v1/vehicle-brands/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicle-brands'] }),
  });

  const addModel = useMutation({
    mutationFn: ({ brand_id, name }: { brand_id: string; name: string }) =>
      apiClient('/v1/vehicle-models', { method: 'POST', body: JSON.stringify({ brand_id, name }) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['vehicle-brands'] });
      setNewModels((m) => ({ ...m, [vars.brand_id]: '' }));
    },
  });

  const deleteModel = useMutation({
    mutationFn: (id: string) => apiClient(`/v1/vehicle-models/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicle-brands'] }),
  });

  const brands: Brand[] = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Véhicules — Marques & modèles</h1>
          <p className="text-sm text-slate-500">Gérez le catalogue des marques et modèles du parc.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link className="text-sm font-bold text-indigo-600" to="/settings">
            ← Paramètres
          </Link>
        </div>
      </div>

      {/* Add brand */}
      <div className="df-card">
        <div className="df-card__body">
          <div className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">Ajouter une marque</div>
          <div className="flex items-center gap-3">
            <input
              className={`${inputCls} flex-1 max-w-sm`}
              placeholder="Nom de la marque (ex: Dacia)"
              value={newBrand}
              onChange={(e) => setNewBrand(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newBrand.trim()) addBrand.mutate(newBrand.trim()); }}
            />
            <button
              disabled={!newBrand.trim() || addBrand.isPending}
              onClick={() => addBrand.mutate(newBrand.trim())}
              className="df-btn df-btn--primary disabled:opacity-50"
            >
              + Ajouter marque
            </button>
          </div>
        </div>
      </div>

      {isLoading && <p className="text-sm text-slate-400">Chargement…</p>}

      {brands.length === 0 && !isLoading && (
        <div className="df-card">
          <div className="df-card__body py-10 text-center text-sm text-slate-400">
            Aucune marque enregistrée. Ajoutez-en une ci-dessus.
          </div>
        </div>
      )}

      {/* Brand list */}
      <div className="space-y-3">
        {brands.map((brand) => (
          <div key={brand.id} className="df-card overflow-hidden">
            {/* Brand header */}
            <button
              type="button"
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
              onClick={() => setExpanded(expanded === brand.id ? null : brand.id)}
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-black text-slate-900">{brand.name}</span>
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg">
                  {brand.models.length} modèle{brand.models.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); if (confirm(`Supprimer la marque "${brand.name}" ?`)) deleteBrand.mutate(brand.id); }}
                  className="rounded-lg px-2.5 py-1 text-[11px] font-bold text-rose-500 hover:bg-rose-50 transition-colors"
                >
                  Supprimer
                </button>
                <svg
                  className={`w-4 h-4 text-slate-400 transition-transform ${expanded === brand.id ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Models */}
            {expanded === brand.id && (
              <div className="px-5 pb-4 border-t border-slate-100 space-y-3 pt-3">
                <div className="flex flex-wrap gap-2">
                  {brand.models.length === 0 && (
                    <span className="text-xs text-slate-400">Aucun modèle encore.</span>
                  )}
                  {brand.models.map((m) => (
                    <span
                      key={m.id}
                      className="group flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
                    >
                      {m.name}
                      <button
                        type="button"
                        onClick={() => { if (confirm(`Supprimer le modèle "${m.name}" ?`)) deleteModel.mutate(m.id); }}
                        className="hidden group-hover:inline-flex text-rose-400 hover:text-rose-600 transition-colors"
                        aria-label="Supprimer"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    className={`${inputCls} flex-1`}
                    placeholder={`Nouveau modèle pour ${brand.name}`}
                    value={newModels[brand.id] ?? ''}
                    onChange={(e) => setNewModels((m) => ({ ...m, [brand.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      const name = (newModels[brand.id] ?? '').trim();
                      if (e.key === 'Enter' && name) addModel.mutate({ brand_id: brand.id, name });
                    }}
                  />
                  <button
                    disabled={!(newModels[brand.id] ?? '').trim() || addModel.isPending}
                    onClick={() => {
                      const name = (newModels[brand.id] ?? '').trim();
                      if (name) addModel.mutate({ brand_id: brand.id, name });
                    }}
                    className="df-btn df-btn--primary df-btn--sm disabled:opacity-50"
                  >
                    + Modèle
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
