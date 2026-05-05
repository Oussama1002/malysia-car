import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createFixedAsset,
  disposeFixedAsset,
  listFixedAssets,
  type FixedAsset,
} from '@/services/accountingApi';
import { ApiError } from '@/services/apiError';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { EmptyState } from '@/modules/shared/components/EmptyState';
import { formatCurrencyMad } from '@/modules/shared/formatters';

const CATEGORY_LABEL: Record<FixedAsset['category'], string> = {
  vehicle: 'Véhicule',
  equipment: 'Équipement',
  furniture: 'Mobilier',
  building: 'Immeuble',
  intangible: 'Incorporel',
  other: 'Autre',
};

const METHOD_LABEL: Record<FixedAsset['depreciation_method'], string> = {
  linear: 'Linéaire',
  declining: 'Dégressif',
  none: 'Aucune',
};

const STATUS_TONE: Record<FixedAsset['status'], 'success' | 'danger' | 'warning'> = {
  active: 'success',
  disposed: 'danger',
  impaired: 'warning',
};

const STATUS_LABEL: Record<FixedAsset['status'], string> = {
  active: 'Actif',
  disposed: 'Cédé',
  impaired: 'Déprécié',
};

export const FixedAssetsPage: React.FC = () => {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [disposeId, setDisposeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assetsQ = useQuery({
    queryKey: ['accounting', 'fixed-assets', { search, category, status }],
    queryFn: () => listFixedAssets({ search: search || undefined, category: category || undefined, status: status || undefined }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['accounting', 'fixed-assets'] });

  const createMut = useMutation({
    mutationFn: (p: Partial<FixedAsset>) => createFixedAsset(p),
    onSuccess: () => { invalidate(); setDrawerOpen(false); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const disposeMut = useMutation({
    mutationFn: ({ id, date, amount }: { id: string; date: string; amount: number }) =>
      disposeFixedAsset(id, { disposal_date: date, disposal_amount: amount }),
    onSuccess: () => { invalidate(); setDisposeId(null); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const assets = assetsQ.data?.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/accounting" className="text-xs font-bold text-indigo-600">← Comptabilité</Link>
          <h1 className="text-2xl font-black text-slate-900">Immobilisations</h1>
        </div>
        <button className="df-btn df-btn--primary" onClick={() => { setError(null); setDrawerOpen(true); }}>
          + Nouvelle immobilisation
        </button>
      </header>

      <div className="df-card">
        <div className="df-card__body flex flex-wrap gap-3">
          <input placeholder="N° actif / nom…" className="df-input flex-1" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="df-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Toutes catégories</option>
            {(Object.entries(CATEGORY_LABEL) as [FixedAsset['category'], string][]).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
          <select className="df-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tous statuts</option>
            <option value="active">Actif</option>
            <option value="disposed">Cédé</option>
            <option value="impaired">Déprécié</option>
          </select>
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {assetsQ.isLoading ? (
        <div className="text-slate-500">Chargement…</div>
      ) : !assets.length ? (
        <EmptyState title="Aucune immobilisation" description="Enregistrez vos actifs immobilisés (véhicules, équipements, bâtiments…)." />
      ) : (
        <div className="df-card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">N°</th>
                <th>Désignation</th>
                <th>Catégorie</th>
                <th>Méthode</th>
                <th className="text-right">Coût d'acq.</th>
                <th className="text-right">Amort. cumulé</th>
                <th className="text-right">VNC</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {assets.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono font-bold text-slate-900">{a.asset_number}</td>
                  <td>
                    <div className="font-semibold text-slate-800">{a.name}</div>
                    <div className="text-xs text-slate-500">{a.acquisition_date} · {a.useful_life_months} mois</div>
                  </td>
                  <td className="text-slate-600">{CATEGORY_LABEL[a.category]}</td>
                  <td className="text-slate-600">{METHOD_LABEL[a.depreciation_method]}</td>
                  <td className="text-right font-mono">{formatCurrencyMad(Number(a.acquisition_cost))}</td>
                  <td className="text-right font-mono text-rose-600">{formatCurrencyMad(Number(a.accumulated_depreciation))}</td>
                  <td className="text-right font-mono font-bold text-slate-900">{formatCurrencyMad(Number(a.book_value))}</td>
                  <td><StatusBadge label={STATUS_LABEL[a.status]} tone={STATUS_TONE[a.status]} /></td>
                  <td className="px-2">
                    <div className="flex gap-1">
                      <Link to={`/accounting/fixed-assets/${a.id}`} className="df-btn df-btn--ghost text-xs">Détail</Link>
                      {a.status === 'active' && (
                        <button className="df-btn df-btn--ghost text-xs text-rose-600" onClick={() => { setError(null); setDisposeId(a.id); }}>Céder</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create drawer */}
      <DrawerPanel open={drawerOpen} title="Nouvelle immobilisation" onClose={() => setDrawerOpen(false)}>
        <FixedAssetForm
          submitting={createMut.isPending}
          error={error}
          onCancel={() => setDrawerOpen(false)}
          onSubmit={(p) => { setError(null); createMut.mutate(p); }}
        />
      </DrawerPanel>

      {/* Dispose drawer */}
      <DrawerPanel open={!!disposeId} title="Cession d'immobilisation" onClose={() => setDisposeId(null)}>
        <DisposeForm
          submitting={disposeMut.isPending}
          error={error}
          onCancel={() => setDisposeId(null)}
          onSubmit={(date, amount) => {
            setError(null);
            disposeMut.mutate({ id: disposeId!, date, amount });
          }}
        />
      </DrawerPanel>
    </div>
  );
};

const FixedAssetForm: React.FC<{
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (p: Partial<FixedAsset>) => void;
}> = ({ submitting, error, onCancel, onSubmit }) => {
  const [form, setForm] = useState<Partial<FixedAsset>>({
    category: 'vehicle',
    depreciation_method: 'linear',
    useful_life_months: 60,
    residual_value: 0,
  });

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">N° actif *</label>
          <input className="df-input mt-1" value={form.asset_number ?? ''} onChange={(e) => setForm({ ...form, asset_number: e.target.value })} required placeholder="ex: VH-2026-001" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Catégorie</label>
          <select className="df-input mt-1" value={form.category ?? 'vehicle'} onChange={(e) => setForm({ ...form, category: e.target.value as FixedAsset['category'] })}>
            {(Object.entries(CATEGORY_LABEL) as [FixedAsset['category'], string][]).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-bold uppercase text-slate-500">Désignation *</label>
          <input className="df-input mt-1" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Date d'acquisition *</label>
          <input type="date" className="df-input mt-1" value={form.acquisition_date ?? ''} onChange={(e) => setForm({ ...form, acquisition_date: e.target.value })} required />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Coût d'acquisition *</label>
          <input type="number" step="0.01" min="0" className="df-input mt-1" value={form.acquisition_cost ?? ''} onChange={(e) => setForm({ ...form, acquisition_cost: Number(e.target.value) })} required />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Valeur résiduelle</label>
          <input type="number" step="0.01" min="0" className="df-input mt-1" value={form.residual_value ?? 0} onChange={(e) => setForm({ ...form, residual_value: Number(e.target.value) })} />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Durée (mois)</label>
          <input type="number" min="1" className="df-input mt-1" value={form.useful_life_months ?? 60} onChange={(e) => setForm({ ...form, useful_life_months: Number(e.target.value) })} />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Méthode</label>
          <select className="df-input mt-1" value={form.depreciation_method ?? 'linear'} onChange={(e) => setForm({ ...form, depreciation_method: e.target.value as FixedAsset['depreciation_method'] })}>
            {(Object.entries(METHOD_LABEL) as [FixedAsset['depreciation_method'], string][]).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Cpte actif (PCG)</label>
          <input className="df-input mt-1 font-mono" value={form.asset_account_code ?? ''} onChange={(e) => setForm({ ...form, asset_account_code: e.target.value || undefined })} placeholder="ex: 2340" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Cpte dotation</label>
          <input className="df-input mt-1 font-mono" value={form.depreciation_account_code ?? ''} onChange={(e) => setForm({ ...form, depreciation_account_code: e.target.value || undefined })} placeholder="ex: 6193" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Cpte amort. cumulé</label>
          <input className="df-input mt-1 font-mono" value={form.accumulated_dep_account_code ?? ''} onChange={(e) => setForm({ ...form, accumulated_dep_account_code: e.target.value || undefined })} placeholder="ex: 2832" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="df-btn df-btn--ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="df-btn df-btn--primary" disabled={submitting}>{submitting ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </form>
  );
};

const DisposeForm: React.FC<{
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (date: string, amount: number) => void;
}> = ({ submitting, error, onCancel, onSubmit }) => {
  const [date, setDate] = useState(new Date().toISOString().substring(0, 10));
  const [amount, setAmount] = useState(0);

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSubmit(date, amount); }}>
      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <p className="text-sm text-slate-600">Enregistrez la cession de cet actif. Une écriture comptable sera générée automatiquement.</p>
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Date de cession *</label>
        <input type="date" className="df-input mt-1" value={date} onChange={(e) => setDate(e.target.value)} required />
      </div>
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Montant de cession (MAD)</label>
        <input type="number" step="0.01" min="0" className="df-input mt-1" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="df-btn df-btn--ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="df-btn df-btn--primary" disabled={submitting}>{submitting ? 'Enregistrement…' : 'Valider la cession'}</button>
      </div>
    </form>
  );
};
