import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  closeFiscalYear,
  createFiscalYear,
  createTax,
  getAccountingMappings,
  listFiscalYears,
  listTaxes,
  updateAccountingMappings,
  updateTax,
  type AccountingMappings,
  type FiscalYear,
  type Tax,
} from '@/services/accountingApi';
import { ApiError } from '@/services/apiError';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { EmptyState } from '@/modules/shared/components/EmptyState';

const TAX_TYPE_LABEL: Record<Tax['tax_type'], string> = {
  vat: 'TVA',
  withholding: 'Retenue à la source',
  stamp: 'Droit de timbre',
  other: 'Autre',
};

const FY_STATUS_TONE: Record<FiscalYear['status'], 'success' | 'warning' | 'danger'> = {
  open: 'success',
  closed: 'warning',
  locked: 'danger',
};

const FY_STATUS_LABEL: Record<FiscalYear['status'], string> = {
  open: 'Ouvert',
  closed: 'Clôturé',
  locked: 'Verrouillé',
};

export const AccountingSettingsPage: React.FC = () => {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [taxDrawer, setTaxDrawer] = useState(false);
  const [fyDrawer, setFyDrawer] = useState(false);
  const [editTax, setEditTax] = useState<Tax | null>(null);

  const taxesQ = useQuery({ queryKey: ['accounting', 'taxes'], queryFn: () => listTaxes() });
  const fyQ = useQuery({ queryKey: ['accounting', 'fiscal-years'], queryFn: () => listFiscalYears() });
  const mappingsQ = useQuery({ queryKey: ['accounting', 'mappings'], queryFn: () => getAccountingMappings() });

  const invalidateTaxes = () => qc.invalidateQueries({ queryKey: ['accounting', 'taxes'] });
  const invalidateFy = () => qc.invalidateQueries({ queryKey: ['accounting', 'fiscal-years'] });

  const createTaxMut = useMutation({
    mutationFn: (p: Partial<Tax>) => createTax(p),
    onSuccess: () => { invalidateTaxes(); setTaxDrawer(false); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const updateTaxMut = useMutation({
    mutationFn: ({ id, ...p }: Partial<Tax> & { id: string }) => updateTax(id, p),
    onSuccess: () => { invalidateTaxes(); setTaxDrawer(false); setEditTax(null); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const createFyMut = useMutation({
    mutationFn: (p: { code: string; start_date: string; end_date: string }) => createFiscalYear(p),
    onSuccess: () => { invalidateFy(); setFyDrawer(false); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const closeFyMut = useMutation({
    mutationFn: (id: string) => closeFiscalYear(id),
    onSuccess: () => invalidateFy(),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });
  const saveMappingsMut = useMutation({
    mutationFn: (m: Partial<AccountingMappings>) => updateAccountingMappings(m),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accounting', 'mappings'] }),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const taxes = taxesQ.data?.data ?? [];
  const fiscalYears = fyQ.data?.data ?? [];

  return (
    <div className="space-y-8">
      <header>
        <Link to="/accounting" className="text-xs font-bold text-indigo-600">← Comptabilité</Link>
        <h1 className="text-2xl font-black text-slate-900">Paramètres fiscaux</h1>
      </header>

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {/* TAXES */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-800">Taxes</h2>
          <button className="df-btn df-btn--primary" onClick={() => { setEditTax(null); setError(null); setTaxDrawer(true); }}>+ Nouvelle taxe</button>
        </div>
        {taxesQ.isLoading ? (
          <div className="text-slate-500">Chargement…</div>
        ) : !taxes.length ? (
          <EmptyState title="Aucune taxe" description="Configurez la TVA, les retenues à la source et autres taxes marocaines." />
        ) : (
          <div className="df-card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2">Code</th>
                  <th>Nom</th>
                  <th>Type</th>
                  <th className="text-right">Taux</th>
                  <th>Compte PCG</th>
                  <th>Actif</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {taxes.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono font-bold text-slate-900">{t.code}</td>
                    <td className="text-slate-800">{t.name}</td>
                    <td><StatusBadge label={TAX_TYPE_LABEL[t.tax_type]} tone="info" /></td>
                    <td className="text-right font-mono">{t.rate.toFixed(1)}%</td>
                    <td className="font-mono text-slate-600">{t.account_code ?? '—'}</td>
                    <td>{t.is_active ? <StatusBadge label="Actif" tone="success" /> : <StatusBadge label="Inactif" tone="default" />}</td>
                    <td className="px-2">
                      <button className="df-btn df-btn--ghost text-xs" onClick={() => { setEditTax(t); setError(null); setTaxDrawer(true); }}>Éditer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* FISCAL YEARS */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-800">Exercices fiscaux</h2>
          <button className="df-btn df-btn--primary" onClick={() => { setError(null); setFyDrawer(true); }}>+ Nouvel exercice</button>
        </div>
        {fyQ.isLoading ? (
          <div className="text-slate-500">Chargement…</div>
        ) : !fiscalYears.length ? (
          <EmptyState title="Aucun exercice" description="Créez votre premier exercice fiscal." />
        ) : (
          <div className="df-card overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2">Code</th>
                  <th>Début</th>
                  <th>Fin</th>
                  <th>Périodes</th>
                  <th>Statut</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fiscalYears.map((fy) => (
                  <tr key={fy.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono font-bold text-slate-900">{fy.code}</td>
                    <td className="text-slate-700">{fy.start_date}</td>
                    <td className="text-slate-700">{fy.end_date}</td>
                    <td className="text-slate-600">{fy.periods?.length ?? 0} périodes</td>
                    <td><StatusBadge label={FY_STATUS_LABEL[fy.status]} tone={FY_STATUS_TONE[fy.status]} /></td>
                    <td className="px-2">
                      {fy.status === 'open' && (
                        <button
                          className="df-btn df-btn--ghost text-xs text-rose-600"
                          disabled={closeFyMut.isPending}
                          onClick={() => { if (confirm(`Clôturer l'exercice ${fy.code} ?`)) closeFyMut.mutate(fy.id); }}
                        >
                          Clôturer
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-800">Mappings comptables automatiques</h2>
        </div>
        <div className="df-card p-4">
          <MappingsForm
            initial={mappingsQ.data?.data?.mappings ?? null}
            loading={mappingsQ.isLoading}
            saving={saveMappingsMut.isPending}
            onSave={(m) => saveMappingsMut.mutate(m)}
          />
        </div>
      </section>

      {/* Tax drawer */}
      <DrawerPanel open={taxDrawer} title={editTax ? 'Modifier taxe' : 'Nouvelle taxe'} onClose={() => { setTaxDrawer(false); setEditTax(null); }}>
        <TaxForm
          initial={editTax}
          submitting={createTaxMut.isPending || updateTaxMut.isPending}
          error={error}
          onCancel={() => { setTaxDrawer(false); setEditTax(null); }}
          onSubmit={(p) => {
            setError(null);
            if (editTax) updateTaxMut.mutate({ ...p, id: editTax.id } as Partial<Tax> & { id: string });
            else createTaxMut.mutate(p);
          }}
        />
      </DrawerPanel>

      {/* Fiscal year drawer */}
      <DrawerPanel open={fyDrawer} title="Nouvel exercice fiscal" onClose={() => setFyDrawer(false)}>
        <FiscalYearForm
          submitting={createFyMut.isPending}
          error={error}
          onCancel={() => setFyDrawer(false)}
          onSubmit={(p) => { setError(null); createFyMut.mutate(p); }}
        />
      </DrawerPanel>
    </div>
  );
};

const MAPPINGS_LABELS: Array<{ key: keyof AccountingMappings; label: string }> = [
  { key: 'account_client', label: 'Compte client' },
  { key: 'account_tva_collectee', label: 'Compte TVA collectee' },
  { key: 'account_banque', label: 'Compte banque' },
  { key: 'account_caisse', label: 'Compte caisse' },
  { key: 'account_produit_location', label: 'Compte produit location' },
  { key: 'account_vente_vo', label: 'Compte vente VO' },
  { key: 'account_immobilisation_vehicule', label: 'Compte immobilisation vehicule' },
  { key: 'account_amortissement', label: 'Compte amortissement' },
  { key: 'account_amortissement_cumule', label: 'Compte amortissement cumule' },
  { key: 'account_penalites_retard', label: 'Compte penalites retard' },
  { key: 'account_produits_financiers', label: 'Compte produits financiers' },
];

const MappingsForm: React.FC<{
  initial: AccountingMappings | null;
  loading: boolean;
  saving: boolean;
  onSave: (m: Partial<AccountingMappings>) => void;
}> = ({ initial, loading, saving, onSave }) => {
  const [form, setForm] = useState<Partial<AccountingMappings>>({});
  const effective = { ...(initial ?? {}), ...form } as Partial<AccountingMappings>;

  if (loading) return <div className="text-slate-500">Chargement…</div>;

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => { e.preventDefault(); onSave(form); }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        {MAPPINGS_LABELS.map((m) => (
          <div key={m.key}>
            <label className="text-xs font-bold uppercase text-slate-500">{m.label}</label>
            <input
              className="df-input mt-1 font-mono"
              value={(effective[m.key] as string) ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, [m.key]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <button type="submit" className="df-btn df-btn--primary" disabled={saving}>
          {saving ? 'Enregistrement…' : 'Enregistrer mappings'}
        </button>
      </div>
    </form>
  );
};

const TaxForm: React.FC<{
  initial: Tax | null;
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (p: Partial<Tax>) => void;
}> = ({ initial, submitting, error, onCancel, onSubmit }) => {
  const [form, setForm] = useState<Partial<Tax>>(
    initial ?? { tax_type: 'vat', rate: 20, is_active: true }
  );

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Code *</label>
          <input className="df-input mt-1 font-mono" value={form.code ?? ''} onChange={(e) => setForm({ ...form, code: e.target.value })} required placeholder="ex: TVA20" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Type</label>
          <select className="df-input mt-1" value={form.tax_type ?? 'vat'} onChange={(e) => setForm({ ...form, tax_type: e.target.value as Tax['tax_type'] })}>
            {(Object.entries(TAX_TYPE_LABEL) as [Tax['tax_type'], string][]).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs font-bold uppercase text-slate-500">Nom *</label>
          <input className="df-input mt-1" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="ex: TVA 20%" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Taux (%)</label>
          <input type="number" step="0.01" min="0" max="100" className="df-input mt-1" value={form.rate ?? 0} onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })} />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Compte PCG</label>
          <input className="df-input mt-1 font-mono" value={form.account_code ?? ''} onChange={(e) => setForm({ ...form, account_code: e.target.value || undefined })} placeholder="ex: 4455" />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Actif</label>
      <div className="flex justify-end gap-2">
        <button type="button" className="df-btn df-btn--ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="df-btn df-btn--primary" disabled={submitting}>{submitting ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </form>
  );
};

const FiscalYearForm: React.FC<{
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (p: { code: string; start_date: string; end_date: string }) => void;
}> = ({ submitting, error, onCancel, onSubmit }) => {
  const thisYear = new Date().getFullYear();
  const [form, setForm] = useState({
    code: String(thisYear),
    start_date: `${thisYear}-01-01`,
    end_date: `${thisYear}-12-31`,
  });

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Code *</label>
        <input className="df-input mt-1" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required placeholder="ex: 2026" />
      </div>
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Date de début *</label>
        <input type="date" className="df-input mt-1" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required />
      </div>
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Date de fin *</label>
        <input type="date" className="df-input mt-1" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} required />
      </div>
      <p className="text-xs text-slate-500">Les périodes mensuelles seront créées automatiquement.</p>
      <div className="flex justify-end gap-2">
        <button type="button" className="df-btn df-btn--ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="df-btn df-btn--primary" disabled={submitting}>{submitting ? 'Création…' : 'Créer l\'exercice'}</button>
      </div>
    </form>
  );
};
