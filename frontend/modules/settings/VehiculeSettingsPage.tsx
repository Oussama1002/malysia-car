import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, getApiBase } from '@/services/apiClient';

interface BrandModel { id: string; name: string; }
interface Brand { id: string; name: string; models: BrandModel[]; }

const inputCls = 'px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-semibold text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all';

export const VehiculeSettingsPage: React.FC = () => {
  const qc = useQueryClient();
  const [newBrand, setNewBrand] = useState('');
  const [newModels, setNewModels] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingBrand, setEditingBrand] = useState<{ id: string; name: string } | null>(null);
  const [editingModel, setEditingModel] = useState<{ id: string; name: string; brand_id: string } | null>(null);

  const { data, isLoading } = useQuery<Brand[]>({
    queryKey: ['vehicle-brands'],
    queryFn: () => apiClient<{ data: Brand[] }>('/v1/vehicle-brands').then(r => r.data),
    enabled: !!getApiBase(),
  });

  const addBrand = useMutation({
    mutationFn: (name: string) =>
      apiClient('/v1/vehicle-brands', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vehicle-brands'] }); setNewBrand(''); },
  });

  const renameBrand = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiClient(`/v1/vehicle-brands/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vehicle-brands'] }); setEditingBrand(null); },
  });

  const addModel = useMutation({
    mutationFn: ({ brand_id, name }: { brand_id: string; name: string }) =>
      apiClient('/v1/vehicle-models', { method: 'POST', body: JSON.stringify({ brand_id, name }) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['vehicle-brands'] });
      setNewModels(m => ({ ...m, [vars.brand_id]: '' }));
    },
  });

  const renameModel = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiClient(`/v1/vehicle-models/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vehicle-brands'] }); setEditingModel(null); },
  });

  const brands: Brand[] = data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-4">
        <Link
          to="/settings"
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
          </svg>
          Parametres
        </Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-2xl font-black text-slate-900">Vehicules</h1>
      </header>
      <p className="text-slate-500 -mt-4 text-sm">Gestion des marques et modeles du parc automobile.</p>

      {/* Add brand */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-black text-slate-700 uppercase tracking-widest">Ajouter une marque</h2>
        <div className="flex items-center gap-3">
          <input
            className={`${inputCls} flex-1 max-w-sm`}
            placeholder="Nom de la marque (ex: Dacia)"
            value={newBrand}
            onChange={e => setNewBrand(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && newBrand.trim()) addBrand.mutate(newBrand.trim()); }}
          />
          <button
            disabled={!newBrand.trim() || addBrand.isPending}
            onClick={() => addBrand.mutate(newBrand.trim())}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-black hover:bg-indigo-700 transition-all disabled:opacity-50">
            + Ajouter
          </button>
        </div>
      </div>

      {/* Brand list */}
      <div className="space-y-3">
        {isLoading && <p className="text-sm text-slate-400 py-4 text-center">Chargement...</p>}
        {!isLoading && brands.length === 0 && (
          <p className="text-sm text-slate-400 py-4 text-center">Aucune marque enregistree. Ajoutez-en une ci-dessus.</p>
        )}

        {brands.map(brand => (
          <div key={brand.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Brand header */}
            <div className="flex items-center justify-between px-5 py-4">
              {editingBrand?.id === brand.id ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    className={`${inputCls} flex-1 max-w-xs`}
                    value={editingBrand.name}
                    autoFocus
                    onChange={e => setEditingBrand({ ...editingBrand, name: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && editingBrand.name.trim()) renameBrand.mutate({ id: brand.id, name: editingBrand.name.trim() });
                      if (e.key === 'Escape') setEditingBrand(null);
                    }}
                  />
                  <button
                    disabled={!editingBrand.name.trim() || renameBrand.isPending}
                    onClick={() => renameBrand.mutate({ id: brand.id, name: editingBrand.name.trim() })}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-black hover:bg-indigo-700 disabled:opacity-50">
                    Enregistrer
                  </button>
                  <button
                    onClick={() => setEditingBrand(null)}
                    className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-black hover:bg-slate-200">
                    Annuler
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-3 flex-1 text-left"
                  onClick={() => setExpanded(expanded === brand.id ? null : brand.id)}>
                  <span className="text-sm font-black text-slate-900">{brand.name}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg">
                    {brand.models.length} modele{brand.models.length !== 1 ? 's' : ''}
                  </span>
                  <svg className={`w-4 h-4 text-slate-400 transition-transform ml-auto ${expanded === brand.id ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              )}
              {editingBrand?.id !== brand.id && (
                <button
                  onClick={() => { setEditingBrand({ id: brand.id, name: brand.name }); setExpanded(brand.id); }}
                  className="ml-3 p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0"
                  title="Renommer la marque">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              )}
            </div>

            {/* Models panel */}
            {expanded === brand.id && (
              <div className="px-5 pb-5 border-t border-slate-100 space-y-3 pt-4">
                <div className="flex flex-wrap gap-2">
                  {brand.models.length === 0 && (
                    <span className="text-xs text-slate-400">Aucun modele pour cette marque.</span>
                  )}
                  {brand.models.map(m => (
                    <div key={m.id} className="group relative">
                      {editingModel?.id === m.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            className="px-3 py-1.5 bg-white border border-indigo-300 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 w-32"
                            value={editingModel.name}
                            autoFocus
                            onChange={e => setEditingModel({ ...editingModel, name: e.target.value })}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && editingModel.name.trim()) renameModel.mutate({ id: m.id, name: editingModel.name.trim() });
                              if (e.key === 'Escape') setEditingModel(null);
                            }}
                          />
                          <button
                            disabled={!editingModel.name.trim() || renameModel.isPending}
                            onClick={() => renameModel.mutate({ id: m.id, name: editingModel.name.trim() })}
                            className="px-2.5 py-1.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black hover:bg-indigo-700 disabled:opacity-50">
                            OK
                          </button>
                          <button
                            onClick={() => setEditingModel(null)}
                            className="px-2.5 py-1.5 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black hover:bg-slate-200">
                            X
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditingModel({ id: m.id, name: m.name, brand_id: brand.id })}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors group-hover:pr-2">
                          {m.name}
                          <svg className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add model */}
                <div className="flex items-center gap-2 pt-1">
                  <input
                    className={`${inputCls} flex-1`}
                    placeholder={`Nouveau modele pour ${brand.name}`}
                    value={newModels[brand.id] ?? ''}
                    onChange={e => setNewModels(m => ({ ...m, [brand.id]: e.target.value }))}
                    onKeyDown={e => {
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
                    className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black hover:bg-indigo-700 transition-all disabled:opacity-50">
                    + Modele
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
