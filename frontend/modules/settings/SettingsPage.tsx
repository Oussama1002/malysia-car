import React, { useState } from 'react';
import { TabsSection } from '@/modules/shared/components/TabsSection';
import { DataTable } from '@/modules/shared/components/DataTable';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listBranches } from '@/services/adminApi';
import { apiClient, getApiBase } from '@/services/apiClient';
import { Link } from 'react-router-dom';
import { useAuthSession } from '@/modules/auth/AuthContext';

interface BrandModel { id: string; name: string; }
interface Brand { id: string; name: string; models: BrandModel[]; }

const inputCls = 'px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-semibold text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300 transition-all';

const BrandsManager: React.FC = () => {
  const qc = useQueryClient();
  const [newBrand, setNewBrand] = useState('');
  const [newModels, setNewModels] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

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

  const addModel = useMutation({
    mutationFn: ({ brand_id, name }: { brand_id: string; name: string }) =>
      apiClient('/v1/vehicle-models', { method: 'POST', body: JSON.stringify({ brand_id, name }) }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['vehicle-brands'] });
      setNewModels(m => ({ ...m, [vars.brand_id]: '' }));
    },
  });

  const brands: Brand[] = data ?? [];

  return (
    <div className="space-y-6">
      {/* Add brand */}
      <div className="flex items-center gap-3">
        <input
          className={`${inputCls} flex-1 max-w-xs`}
          placeholder="Nouvelle marque (ex: Dacia)"
          value={newBrand}
          onChange={e => setNewBrand(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && newBrand.trim()) addBrand.mutate(newBrand.trim()); }}
        />
        <button
          disabled={!newBrand.trim() || addBrand.isPending}
          onClick={() => addBrand.mutate(newBrand.trim())}
          className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-black hover:bg-indigo-700 transition-all disabled:opacity-50">
          + Ajouter marque
        </button>
      </div>

      {isLoading && <p className="text-sm text-slate-400">Chargement...</p>}

      {brands.length === 0 && !isLoading && (
        <p className="text-sm text-slate-400">Aucune marque enregistrée. Ajoutez-en une ci-dessus.</p>
      )}

      {/* Brand list */}
      <div className="space-y-3">
        {brands.map(brand => (
          <div key={brand.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Brand header */}
            <button
              type="button"
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
              onClick={() => setExpanded(expanded === brand.id ? null : brand.id)}>
              <div className="flex items-center gap-3">
                <span className="text-sm font-black text-slate-900">{brand.name}</span>
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 bg-slate-100 text-slate-500 rounded-lg">
                  {brand.models.length} modèle{brand.models.length !== 1 ? 's' : ''}
                </span>
              </div>
              <svg className={`w-4 h-4 text-slate-400 transition-transform ${expanded === brand.id ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Models */}
            {expanded === brand.id && (
              <div className="px-5 pb-4 border-t border-slate-100 space-y-3 pt-3">
                {/* Existing models */}
                <div className="flex flex-wrap gap-2">
                  {brand.models.length === 0 && (
                    <span className="text-xs text-slate-400">Aucun modèle encore.</span>
                  )}
                  {brand.models.map(m => (
                    <span key={m.id} className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold">
                      {m.name}
                    </span>
                  ))}
                </div>
                {/* Add model */}
                <div className="flex items-center gap-2">
                  <input
                    className={`${inputCls} flex-1`}
                    placeholder={`Nouveau modèle pour ${brand.name}`}
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

export const SettingsPage: React.FC = () => {
  const [tab, setTab] = useState('vehicules');
  const apiReady = !!getApiBase();
  const { session } = useAuthSession();
  const canViewBranches = ['ADMIN', 'DIRECTEUR'].includes(session?.user.role ?? '');
  const branches = useQuery({
    queryKey: ['admin', 'branches'],
    queryFn: () => listBranches(),
    enabled: apiReady && canViewBranches,
    retry: false,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-slate-900">Paramètres</h1>
        <p className="text-slate-500">Règles métier, pays, devises, templates — UI de configuration.</p>
      </header>

      <TabsSection
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'vehicules', label: 'Véhicules' },
          { id: 'branches', label: 'Agences' },
        ]}
      />

      {tab === 'vehicules' && <BrandsManager />}

      {tab === 'branches' && (
        <DataTable
          loading={branches.isLoading}
          columns={[
            { key: 'n', header: 'Agence', render: (r) => r.name },
            { key: 'code', header: 'Code', render: (r) => <span className="font-mono text-xs">{r.code}</span> },
            { key: 'city', header: 'Ville', render: (r) => r.city ?? '—' },
            { key: 'c', header: 'Pays', render: (r) => r.country_code ?? '—' },
          ]}
          rows={branches.data?.data ?? []}
          rowKey={(r) => r.id}
          emptyTitle="Aucune agence"
        />
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <AdminCard
          title="Utilisateurs"
          subtitle="Comptes staff, rôles, affectations"
          href="/settings/users"
        />
        <AdminCard
          title="Rôles & permissions"
          subtitle="Matrice de droits par module"
          href="/settings/roles"
        />
        <AdminCard
          title="Véhicules"
          subtitle="Marques & modèles du parc"
          href="/settings"
          active
        />
        <AdminCard
          title="Agences"
          subtitle="Points de vente & structure"
          href="/settings/branches"
        />
      </div>
    </div>
  );
};

const AdminCard: React.FC<{ title: string; subtitle: string; href: string; active?: boolean }> = ({ title, subtitle, href, active }) => (
  <div className={`rounded-2xl border bg-white p-6 shadow-sm ${active ? 'border-indigo-200 ring-2 ring-indigo-500/10' : 'border-slate-100'}`}>
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-sm font-black text-slate-900">{title}</div>
        <div className="text-sm text-slate-600">{subtitle}</div>
      </div>
      <Link className={`rounded-xl px-4 py-2 text-sm font-black text-white ${active ? 'bg-indigo-600' : 'bg-slate-700 hover:bg-slate-800'}`} to={href}>
        Ouvrir
      </Link>
    </div>
  </div>
);
