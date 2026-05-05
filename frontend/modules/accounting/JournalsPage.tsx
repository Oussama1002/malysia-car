import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ACCOUNT_TYPE_LABEL,
  createJournal,
  listJournals,
  type AccountingJournal,
  type JournalType,
} from '@/services/accountingApi';
import { ApiError } from '@/services/apiError';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { EmptyState } from '@/modules/shared/components/EmptyState';

const JOURNAL_TYPE_LABEL: Record<JournalType, string> = {
  sales: 'Ventes',
  purchases: 'Achats',
  cash: 'Caisse',
  bank: 'Banque',
  general: 'Opérations diverses',
  payroll: 'Paie',
  stock: 'Stock',
};

const JOURNAL_TYPE_TONE: Record<JournalType, 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
  sales: 'success',
  purchases: 'warning',
  cash: 'info',
  bank: 'info',
  general: 'default',
  payroll: 'warning',
  stock: 'default',
};

export const JournalsPage: React.FC = () => {
  const qc = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const journalsQ = useQuery({
    queryKey: ['accounting', 'journals'],
    queryFn: () => listJournals(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['accounting', 'journals'] });

  const createMut = useMutation({
    mutationFn: (p: Partial<AccountingJournal>) => createJournal(p),
    onSuccess: () => { invalidate(); setDrawerOpen(false); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const journals = journalsQ.data?.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/accounting" className="text-xs font-bold text-indigo-600">← Comptabilité</Link>
          <h1 className="text-2xl font-black text-slate-900">Journaux comptables</h1>
        </div>
        <button className="df-btn df-btn--primary" onClick={() => { setError(null); setDrawerOpen(true); }}>
          + Nouveau journal
        </button>
      </header>

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {journalsQ.isLoading ? (
        <div className="text-slate-500">Chargement…</div>
      ) : !journals.length ? (
        <EmptyState title="Aucun journal" description="Créez votre premier journal comptable (ventes, banque, caisse…)." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {journals.map((j) => (
            <Link key={j.id} to={`/accounting/entries?journal_id=${j.id}`} className="df-card hover:shadow-lg transition">
              <div className="df-card__body space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-lg font-black text-slate-900">{j.code}</span>
                  <div className="flex gap-1">
                    <StatusBadge label={JOURNAL_TYPE_LABEL[j.journal_type]} tone={JOURNAL_TYPE_TONE[j.journal_type]} />
                    {j.is_default && <StatusBadge label="Défaut" tone="success" />}
                    {!j.is_active && <StatusBadge label="Inactif" tone="default" />}
                  </div>
                </div>
                <div className="font-semibold text-slate-800">{j.name}</div>
                {j.default_account_code && (
                  <div className="text-xs text-slate-500">Compte par défaut : <span className="font-mono">{j.default_account_code}</span></div>
                )}
                {j.sequence_prefix && (
                  <div className="text-xs text-slate-500">Préfixe : <span className="font-mono">{j.sequence_prefix}</span> · Prochain n° : {j.sequence_next}</div>
                )}
                <div className="mt-2 text-xs font-bold uppercase tracking-wide text-indigo-600">Voir les écritures →</div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <DrawerPanel open={drawerOpen} title="Nouveau journal" onClose={() => setDrawerOpen(false)}>
        <JournalForm
          submitting={createMut.isPending}
          error={error}
          onCancel={() => setDrawerOpen(false)}
          onSubmit={(p) => { setError(null); createMut.mutate(p); }}
        />
      </DrawerPanel>
    </div>
  );
};

const JournalForm: React.FC<{
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (p: Partial<AccountingJournal>) => void;
}> = ({ submitting, error, onCancel, onSubmit }) => {
  const [form, setForm] = useState<Partial<AccountingJournal>>({
    journal_type: 'general',
    is_active: true,
    is_default: false,
    sequence_next: 1,
  });

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Code *</label>
          <input className="df-input mt-1" value={form.code ?? ''} onChange={(e) => setForm({ ...form, code: e.target.value })} required placeholder="ex: VT" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Type *</label>
          <select className="df-input mt-1" value={form.journal_type ?? 'general'} onChange={(e) => setForm({ ...form, journal_type: e.target.value as JournalType })}>
            {(Object.entries(JOURNAL_TYPE_LABEL) as [JournalType, string][]).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-bold uppercase text-slate-500">Nom *</label>
          <input className="df-input mt-1" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="ex: Journal des ventes" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Compte par défaut</label>
          <input className="df-input mt-1" value={form.default_account_code ?? ''} onChange={(e) => setForm({ ...form, default_account_code: e.target.value || undefined })} placeholder="ex: 5141" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Préfixe séquence</label>
          <input className="df-input mt-1" value={form.sequence_prefix ?? ''} onChange={(e) => setForm({ ...form, sequence_prefix: e.target.value || undefined })} placeholder="ex: VT" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Prochain numéro</label>
          <input type="number" min="1" className="df-input mt-1" value={form.sequence_next ?? 1} onChange={(e) => setForm({ ...form, sequence_next: Number(e.target.value) })} />
        </div>
      </div>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Actif</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} /> Défaut</label>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="df-btn df-btn--ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="df-btn df-btn--primary" disabled={submitting}>{submitting ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </form>
  );
};
