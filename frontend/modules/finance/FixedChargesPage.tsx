import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, getApiBase } from '@/services/apiClient';
import { formatCurrencyMad } from '@/modules/shared/formatters';
import { Icon } from '@/modules/shared/components/Icon';

type Dashboard = {
  totalMonthlyEquivalent: number;
  overdueCount: number;
  upcomingCount: number;
  byCategory: Record<string, number>;
};

type FixedCharge = {
  id: string;
  name: string;
  category: string;
  amount: string;
  frequency: string;
  status: string;
  next_due_date: string | null;
};

export const FixedChargesPage: React.FC = () => {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    category: 'autres',
    amount: '0',
    frequency: 'monthly' as const,
    start_date: new Date().toISOString().slice(0, 10),
  });

  const dashQ = useQuery({
    queryKey: ['fixed-charges', 'dashboard'],
    queryFn: async () => {
      const r = await apiClient<{ data: Dashboard }>('/v1/fixed-charges/dashboard');
      return (r as { data: Dashboard }).data;
    },
    enabled: !!getApiBase(),
  });

  const listQ = useQuery({
    queryKey: ['fixed-charges', 'list'],
    queryFn: async () => {
      const r = await apiClient<{ data: FixedCharge[] }>('/v1/fixed-charges?per_page=100');
      return (r as { data: FixedCharge[] }).data;
    },
    enabled: !!getApiBase(),
  });
  const detailQ = useQuery({
    queryKey: ['fixed-charges', 'detail', selectedId],
    queryFn: async () => {
      const r = await apiClient<{ data: Record<string, unknown> }>(`/v1/fixed-charges/${selectedId}`);
      return (r as { data: Record<string, unknown> }).data;
    },
    enabled: !!getApiBase() && !!selectedId,
  });

  const createM = useMutation({
    mutationFn: async () => {
      await apiClient('/v1/fixed-charges', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          category: form.category,
          amount: Number(form.amount),
          frequency: form.frequency,
          start_date: form.start_date,
        }),
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['fixed-charges'] });
    },
  });

  const d = dashQ.data;
  const frequencyLabel: Record<string, string> = {
    monthly: 'Mensuel',
    quarterly: 'Trimestriel',
    yearly: 'Annuel',
    one_time: 'Unique',
  };

  const statusMeta: Record<string, { label: string; className: string }> = {
    active: { label: 'Active', className: 'bg-emerald-100 text-emerald-700' },
    overdue: { label: 'En retard', className: 'bg-rose-100 text-rose-700' },
    paused: { label: 'En pause', className: 'bg-slate-100 text-slate-700' },
    cancelled: { label: 'Annulée', className: 'bg-slate-100 text-slate-500' },
  };

  const formatDate = (value: string | null): string => {
    if (!value) return '—';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return dt.toLocaleDateString('fr-MA');
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-[color:var(--df-text)]">Charges fixes</h1>
        <p className="text-sm text-[color:var(--df-text-muted)]">Suivi des charges récurrentes et échéances.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="df-card df-card--elev p-4">
          <div className="text-[10px] font-black uppercase text-[color:var(--df-text-muted)]">Équivalent mensuel</div>
          <div className="text-xl font-black">{d ? formatCurrencyMad(d.totalMonthlyEquivalent) : '—'}</div>
        </div>
        <div className="df-card df-card--elev p-4">
          <div className="text-[10px] font-black uppercase text-[color:var(--df-text-muted)]">En retard</div>
          <div className="text-xl font-black text-red-600">{d?.overdueCount ?? '—'}</div>
        </div>
        <div className="df-card df-card--elev p-4">
          <div className="text-[10px] font-black uppercase text-[color:var(--df-text-muted)]">À venir (30j)</div>
          <div className="text-xl font-black text-amber-600">{d?.upcomingCount ?? '—'}</div>
        </div>
        <div className="df-card df-card--elev p-4">
          <div className="text-[10px] font-black uppercase text-[color:var(--df-text-muted)]">Catégories</div>
          <div className="text-xs text-[color:var(--df-text-muted)]">{d?.byCategory ? Object.keys(d.byCategory).length : 0} actives</div>
        </div>
      </div>

      <div className="df-card p-5">
        <h2 className="mb-3 text-sm font-bold">Nouvelle charge fixe</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input className="df-input" placeholder="Libellé" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <select className="df-input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            {['loyer agence', 'salaires', 'assurance', 'parking', 'internet/téléphone', 'comptabilité', 'crédit véhicule', 'autres'].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input className="df-input" type="number" placeholder="Montant" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
          <select className="df-input" value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value as 'monthly' }))}>
            <option value="monthly">Mensuel</option>
            <option value="quarterly">Trimestriel</option>
            <option value="yearly">Annuel</option>
            <option value="one_time">Unique</option>
          </select>
        </div>
        <button type="button" className="df-btn df-btn--primary df-btn--sm mt-3" disabled={createM.isPending || !form.name} onClick={() => createM.mutate()}>
          {createM.isPending ? '…' : 'Créer'}
        </button>
      </div>

      <div className="df-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold">Liste Charges fixes</h2>
          <span className="rounded-full bg-[color:var(--df-surface-sunk)] px-2.5 py-1 text-xs font-semibold text-[color:var(--df-text-muted)]">
            {(listQ.data ?? []).length} ligne(s)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="df-table w-full min-w-[900px] text-sm">
            <thead>
              <tr>
                <th>Charge</th>
                <th>Catégorie</th>
                <th>Montant</th>
                <th>Fréquence</th>
                <th>Prochaine échéance</th>
                <th>Statut</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {listQ.isLoading && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-[color:var(--df-text-muted)]">
                    Chargement des charges fixes…
                  </td>
                </tr>
              )}
              {!listQ.isLoading && (listQ.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-[color:var(--df-text-muted)]">
                    Aucune charge fixe enregistrée.
                  </td>
                </tr>
              )}
              {(listQ.data ?? []).map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="font-semibold text-[color:var(--df-text)]">{row.name}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-[color:var(--df-text-faint)]">{row.id.slice(0, 8)}…</div>
                  </td>
                  <td>
                    <span className="rounded-full bg-[color:var(--df-surface-sunk)] px-2 py-0.5 text-xs font-semibold text-[color:var(--df-text-muted)]">
                      {row.category}
                    </span>
                  </td>
                  <td className="font-semibold">{formatCurrencyMad(Number(row.amount))}</td>
                  <td>{frequencyLabel[row.frequency] ?? row.frequency}</td>
                  <td>{formatDate(row.next_due_date)}</td>
                  <td>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${statusMeta[row.status]?.className ?? 'bg-slate-100 text-slate-700'}`}>
                      {statusMeta[row.status]?.label ?? row.status}
                    </span>
                  </td>
                  <td className="text-right">
                    <button type="button" className="df-btn df-btn--ghost df-btn--sm" onClick={() => setSelectedId(row.id)}>
                      <Icon name="eye" size={14} /> Détail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-[color:var(--df-border)] bg-[color:var(--df-surface-solid)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[color:var(--df-border)] px-5 py-3">
              <h3 className="text-base font-bold">Détail charge fixe</h3>
              <button type="button" className="df-btn df-btn--ghost df-btn--sm" onClick={() => setSelectedId(null)}>
                <Icon name="close" size={14} /> Fermer
              </button>
            </div>
            <div className="p-5">
              {detailQ.isLoading && <div className="text-sm text-[color:var(--df-text-muted)]">Chargement…</div>}
              {detailQ.isError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  Impossible de charger le détail de la charge.
                </div>
              )}
              {!detailQ.isLoading && !detailQ.isError && detailQ.data && (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <DetailField label="Nom" value={String(detailQ.data.name ?? '—')} />
                  <DetailField label="Catégorie" value={String(detailQ.data.category ?? '—')} />
                  <DetailField label="Montant" value={formatCurrencyMad(Number(detailQ.data.amount ?? 0))} />
                  <DetailField label="Fréquence" value={frequencyLabel[String(detailQ.data.frequency ?? '')] ?? String(detailQ.data.frequency ?? '—')} />
                  <DetailField label="Date début" value={formatDate((detailQ.data.start_date as string | null) ?? null)} />
                  <DetailField label="Prochaine échéance" value={formatDate((detailQ.data.next_due_date as string | null) ?? null)} />
                  <DetailField label="Statut" value={statusMeta[String(detailQ.data.status ?? '')]?.label ?? String(detailQ.data.status ?? '—')} />
                  <DetailField label="Fournisseur" value={String(detailQ.data.supplier_name ?? '—')} />
                  <DetailField label="Mode de paiement" value={String(detailQ.data.payment_method ?? '—')} />
                  <DetailField label="Devise" value={String(detailQ.data.currency_code ?? 'MAD')} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DetailField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="text-[10px] font-black uppercase tracking-widest text-[color:var(--df-text-muted)]">{label}</div>
    <div className="mt-1 text-sm font-semibold text-[color:var(--df-text)]">{value}</div>
  </div>
);
