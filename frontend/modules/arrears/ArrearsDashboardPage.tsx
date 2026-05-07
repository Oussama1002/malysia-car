import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ARREARS_STAGE_LABEL,
  arrearsStageTone,
  createArrearsCase,
  listArrearsCases,
  type ArrearsCase,
  type ArrearsStage,
} from '@/services/arrearsApi';
import { ApiError } from '@/services/apiError';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { EmptyState } from '@/modules/shared/components/EmptyState';
import { KpiCard } from '@/modules/shared/components/KpiCard';
import { formatCurrencyMad } from '@/modules/shared/formatters';
import { formatClientCode } from '@/services/entityCode';

const STAGES: ArrearsStage[] = ['new', 'reminder_1', 'reminder_2', 'formal_notice', 'promise', 'legal', 'repossession', 'closed'];

export const ArrearsDashboardPage: React.FC = () => {
  const qc = useQueryClient();
  const [stageFilter, setStageFilter] = useState<ArrearsStage | ''>('');
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const casesQ = useQuery({
    queryKey: ['arrears', 'cases', { stageFilter, search }],
    queryFn: () => listArrearsCases({ stage: stageFilter || undefined, search: search || undefined }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['arrears', 'cases'] });

  const createMut = useMutation({
    mutationFn: (p: Parameters<typeof createArrearsCase>[0]) => createArrearsCase(p),
    onSuccess: () => { invalidate(); setDrawerOpen(false); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const cases = casesQ.data?.data ?? [];

  // KPIs
  const allQ = useQuery({
    queryKey: ['arrears', 'cases', 'all'],
    queryFn: () => listArrearsCases({ per_page: 500 }),
  });
  const allCases = allQ.data?.data ?? [];
  const totalOverdue = allCases.reduce((s, c) => s + Number(c.total_overdue), 0);
  const totalRecovered = allCases.reduce((s, c) => s + Number(c.total_recovered), 0);
  const activeCases = allCases.filter((c) => c.stage !== 'closed').length;
  const legalCases = allCases.filter((c) => c.stage === 'legal' || c.stage === 'repossession').length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Contentieux & Impayés</h1>
          <p className="text-slate-500">Gestion des dossiers de recouvrement et procédures juridiques.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/arrears/legal" className="df-btn df-btn--ghost">Dossiers juridiques →</Link>
          <button className="df-btn df-btn--primary" onClick={() => { setError(null); setDrawerOpen(true); }}>+ Nouveau dossier</button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard title="Total impayés" value={formatCurrencyMad(totalOverdue)} accentClass="bg-rose-600" />
        <KpiCard title="Recouvré" value={formatCurrencyMad(totalRecovered)} accentClass="bg-emerald-600" />
        <KpiCard title="Dossiers actifs" value={String(activeCases)} accentClass="bg-indigo-600" />
        <KpiCard title="En phase juridique" value={String(legalCases)} accentClass={legalCases > 0 ? 'bg-rose-700' : 'bg-slate-400'} />
      </div>

      {/* Stage filters */}
      <div className="flex flex-wrap gap-2">
        <button
          className={`df-btn text-xs ${stageFilter === '' ? 'df-btn--primary' : 'df-btn--ghost'}`}
          onClick={() => setStageFilter('')}
        >
          Tous
        </button>
        {STAGES.map((s) => (
          <button
            key={s}
            className={`df-btn text-xs ${stageFilter === s ? 'df-btn--primary' : 'df-btn--ghost'}`}
            onClick={() => setStageFilter(s)}
          >
            {ARREARS_STAGE_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="df-card">
        <div className="df-card__body">
          <input
            placeholder="Rechercher client / contrat / n° dossier…"
            className="df-input w-full"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {casesQ.isLoading ? (
        <div className="text-slate-500">Chargement…</div>
      ) : !cases.length ? (
        <EmptyState title="Aucun dossier" description="Créez un dossier de contentieux pour un client ou contrat impayé." />
      ) : (
        <div className="df-card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">N° dossier</th>
                <th>Client</th>
                <th>Contrat</th>
                <th className="text-right">Impayé</th>
                <th className="text-right">Recouvré</th>
                <th>Jours retard</th>
                <th>Étape</th>
                <th>Prochaine action</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cases.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono font-bold text-slate-900">{c.case_number}</td>
                  <td className="text-slate-800">{c.customer?.full_name ?? formatClientCode(c.customer_id)}</td>
                  <td className="font-mono text-slate-600">{c.contract?.contract_number ?? '—'}</td>
                  <td className="text-right font-mono text-rose-600 font-semibold">{formatCurrencyMad(Number(c.total_overdue))}</td>
                  <td className="text-right font-mono text-emerald-600">{formatCurrencyMad(Number(c.total_recovered))}</td>
                  <td>
                    <span className={`font-mono font-bold ${Number(c.days_overdue) > 90 ? 'text-rose-600' : Number(c.days_overdue) > 30 ? 'text-orange-500' : 'text-slate-700'}`}>
                      {c.days_overdue}j
                    </span>
                  </td>
                  <td><StatusBadge label={ARREARS_STAGE_LABEL[c.stage]} tone={arrearsStageTone(c.stage)} /></td>
                  <td className="text-slate-500 text-xs">{c.next_action_date ?? '—'}</td>
                  <td className="px-2">
                    <Link to={`/arrears/${c.id}`} className="df-btn df-btn--ghost text-xs">Dossier →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DrawerPanel open={drawerOpen} title="Nouveau dossier contentieux" onClose={() => setDrawerOpen(false)}>
        <ArrearsCaseForm
          submitting={createMut.isPending}
          error={error}
          onCancel={() => setDrawerOpen(false)}
          onSubmit={(p) => { setError(null); createMut.mutate(p); }}
        />
      </DrawerPanel>
    </div>
  );
};

const ArrearsCaseForm: React.FC<{
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (p: Parameters<typeof createArrearsCase>[0]) => void;
}> = ({ submitting, error, onCancel, onSubmit }) => {
  const [form, setForm] = useState<Parameters<typeof createArrearsCase>[0]>({ customer_id: '' });

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">ID Client *</label>
        <input className="df-input mt-1" value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} required placeholder="UUID du client" />
      </div>
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">ID Contrat</label>
        <input className="df-input mt-1" value={form.contract_id ?? ''} onChange={(e) => setForm({ ...form, contract_id: e.target.value || undefined })} placeholder="UUID du contrat (optionnel)" />
        <p className="text-xs text-slate-400 mt-1">Si renseigné, les montants impayés seront calculés automatiquement.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Montant impayé (MAD)</label>
          <input type="number" step="0.01" min="0" className="df-input mt-1" value={form.total_overdue ?? ''} onChange={(e) => setForm({ ...form, total_overdue: Number(e.target.value) || undefined })} placeholder="Auto si contrat" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Jours de retard</label>
          <input type="number" min="0" className="df-input mt-1" value={form.days_overdue ?? ''} onChange={(e) => setForm({ ...form, days_overdue: Number(e.target.value) || undefined })} />
        </div>
      </div>
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Prochaine action</label>
        <input type="date" className="df-input mt-1" value={form.next_action_date ?? ''} onChange={(e) => setForm({ ...form, next_action_date: e.target.value || undefined })} />
      </div>
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Notes</label>
        <textarea className="df-input mt-1" rows={3} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value || undefined })} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="df-btn df-btn--ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="df-btn df-btn--primary" disabled={submitting}>{submitting ? 'Création…' : 'Créer le dossier'}</button>
      </div>
    </form>
  );
};
