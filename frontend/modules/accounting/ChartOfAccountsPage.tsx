import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ACCOUNT_TYPE_LABEL,
  createAccount,
  deleteAccount,
  listAccounts,
  updateAccount,
  type AccountingAccount,
  type AccountType,
} from '@/services/accountingApi';
import { ApiError } from '@/services/apiError';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { EmptyState } from '@/modules/shared/components/EmptyState';
import { formatCurrencyMad } from '@/modules/shared/formatters';

const TYPE_TONES: Record<AccountType, 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
  asset: 'info',
  liability: 'warning',
  equity: 'success',
  income: 'success',
  expense: 'danger',
  contra: 'default',
};

export const ChartOfAccountsPage: React.FC = () => {
  const qc = useQueryClient();
  const [filterType, setFilterType] = useState<AccountType | ''>('');
  const [search, setSearch] = useState('');
  const [drawerMode, setDrawerMode] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<AccountingAccount | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accountsQ = useQuery({
    queryKey: ['accounting', 'accounts', filterType, search],
    queryFn: () => listAccounts({ account_type: filterType || undefined, search: search || undefined }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['accounting', 'accounts'] });

  const createMut = useMutation({
    mutationFn: (p: Parameters<typeof createAccount>[0]) => createAccount(p),
    onSuccess: () => { invalidate(); setDrawerMode(null); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const updateMut = useMutation({
    mutationFn: (p: Partial<AccountingAccount> & { id: string }) => updateAccount(p.id, p),
    onSuccess: () => { invalidate(); setDrawerMode(null); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAccount(id),
    onSuccess: () => invalidate(),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const accounts = accountsQ.data?.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/accounting" className="text-xs font-bold text-indigo-600">← Comptabilité</Link>
          <h1 className="text-2xl font-black text-slate-900">Plan comptable</h1>
        </div>
        <button className="df-btn df-btn--primary" onClick={() => { setSelected(null); setError(null); setDrawerMode('create'); }}>
          + Nouveau compte
        </button>
      </header>

      <div className="df-card">
        <div className="df-card__body flex flex-wrap gap-3">
          <input placeholder="Rechercher code / libellé…" className="df-input flex-1" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="df-input" value={filterType} onChange={(e) => setFilterType(e.target.value as AccountType | '')}>
            <option value="">Tous les types</option>
            {(Object.entries(ACCOUNT_TYPE_LABEL) as [AccountType, string][]).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {accountsQ.isLoading ? (
        <div className="text-slate-500">Chargement…</div>
      ) : !accounts.length ? (
        <EmptyState title="Plan comptable vide" description="Créez votre premier compte ou importez un plan marocain standard." />
      ) : (
        <div className="df-card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Code</th>
                <th>Intitulé</th>
                <th>Type</th>
                <th className="text-right">Solde actuel</th>
                <th>Actif</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {accounts.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono font-bold text-slate-900">{a.code}</td>
                  <td>
                    <div className="font-semibold text-slate-800">{a.name}</div>
                    {a.parent_code && <div className="text-xs text-slate-500">Sous {a.parent_code}</div>}
                  </td>
                  <td><StatusBadge label={ACCOUNT_TYPE_LABEL[a.account_type]} tone={TYPE_TONES[a.account_type]} /></td>
                  <td className="text-right font-mono">{formatCurrencyMad(Number(a.current_balance))}</td>
                  <td>{a.is_active ? <StatusBadge label="Actif" tone="success" /> : <StatusBadge label="Inactif" tone="default" />}</td>
                  <td className="px-2">
                    <div className="flex gap-1">
                      <button className="df-btn df-btn--ghost text-xs" onClick={() => { setSelected(a); setError(null); setDrawerMode('edit'); }}>Éditer</button>
                      <button className="df-btn df-btn--ghost text-xs text-rose-600" onClick={() => { if (confirm('Supprimer ce compte ?')) deleteMut.mutate(a.id); }}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DrawerPanel open={!!drawerMode} title={drawerMode === 'edit' ? 'Modifier compte' : 'Nouveau compte'} onClose={() => setDrawerMode(null)}>
        <AccountForm
          mode={drawerMode ?? 'create'}
          initial={selected}
          submitting={createMut.isPending || updateMut.isPending}
          error={error}
          onCancel={() => setDrawerMode(null)}
          onSubmit={(p) => {
            setError(null);
            if (drawerMode === 'edit' && selected) {
              updateMut.mutate({ ...p, id: selected.id });
            } else {
              createMut.mutate(p as Parameters<typeof createAccount>[0]);
            }
          }}
        />
      </DrawerPanel>
    </div>
  );
};

const AccountForm: React.FC<{
  mode: 'create' | 'edit';
  initial: AccountingAccount | null;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (p: Partial<AccountingAccount>) => void;
}> = ({ mode, initial, submitting, error, onCancel, onSubmit }) => {
  const [form, setForm] = useState<Partial<AccountingAccount>>(
    initial ?? { account_type: 'asset', normal_balance: 'debit', is_active: true, is_detail: true, opening_balance: 0 }
  );
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Code</label>
          <input className="df-input mt-1" value={form.code ?? ''} onChange={(e) => setForm({ ...form, code: e.target.value })} required disabled={mode === 'edit'} />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Type</label>
          <select className="df-input mt-1" value={form.account_type ?? 'asset'} onChange={(e) => setForm({ ...form, account_type: e.target.value as AccountType })}>
            {(Object.entries(ACCOUNT_TYPE_LABEL) as [AccountType, string][]).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-bold uppercase text-slate-500">Intitulé</label>
          <input className="df-input mt-1" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Balance normale</label>
          <select className="df-input mt-1" value={form.normal_balance ?? 'debit'} onChange={(e) => setForm({ ...form, normal_balance: e.target.value as 'debit' | 'credit' })}>
            <option value="debit">Débit</option>
            <option value="credit">Crédit</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Compte parent</label>
          <input className="df-input mt-1" value={form.parent_code ?? ''} onChange={(e) => setForm({ ...form, parent_code: e.target.value || undefined })} placeholder="ex: 34" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Solde d'ouverture</label>
          <input type="number" step="0.01" className="df-input mt-1" value={form.opening_balance ?? 0} onChange={(e) => setForm({ ...form, opening_balance: Number(e.target.value) })} />
        </div>
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Actif</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.is_detail} onChange={(e) => setForm({ ...form, is_detail: e.target.checked })} /> Compte de détail</label>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="df-btn df-btn--ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="df-btn df-btn--primary" disabled={submitting}>{submitting ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </form>
  );
};
