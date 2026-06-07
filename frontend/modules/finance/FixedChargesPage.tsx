import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, getApiBase } from '@/services/apiClient';
import { formatCurrencyMad } from '@/modules/shared/formatters';
import { SearchFilterBar } from '@/modules/shared/components/SearchFilterBar';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';

// ── Types ──────────────────────────────────────────────────────────
type Expense = {
  id: string;
  label: string;
  amount: string | number;
  expense_date: string;
  due_date?: string | null;
  category: string;
  expense_type: string;
  status: string;
  payment_method?: string | null;
  reference?: string | null;
  vehicle_id?: string | null;
  customer_id?: string | null;
  supplier_id?: string | null;
  notes?: string | null;
  paid_at?: string | null;
};

type DashboardData = {
  monthly_total: number;
  yearly_total: number;
  overdue_count: number;
  upcoming_count: number;
  by_category: Record<string, number>;
  by_type: Record<string, number>;
  top_vehicles: Array<{ vehicle_id: string; total: number }>;
  monthly_trend: Record<string, number>;
};

type Supplier = {
  id: string;
  name: string;
  category?: string | null;
  phone?: string | null;
  email?: string | null;
  expenses_count?: number;
  expenses_sum_amount?: number | null;
};

// ── Constants ──────────────────────────────────────────────────────
const CATEGORIES = [
  'carburant', 'entretien', 'réparations', 'assurance', 'pneus', 'nettoyage',
  'amendes', 'péages', 'salaires', 'loyer', 'SaaS', 'marketing',
  'logistique', 'taxes', 'crédit véhicule', 'autres',
];

const CATEGORY_FR: Record<string, string> = {
  carburant: 'Carburant', entretien: 'Entretien', 'réparations': 'Réparations',
  assurance: 'Assurance', pneus: 'Pneus', nettoyage: 'Nettoyage',
  amendes: 'Amendes', 'péages': 'Péages', salaires: 'Salaires',
  loyer: 'Loyer', SaaS: 'SaaS', marketing: 'Marketing',
  logistique: 'Logistique', taxes: 'Taxes', 'crédit véhicule': 'Crédit véhicule', autres: 'Autres',
};

const TYPE_FR: Record<string, string> = { fixed: 'Fixe', operational: 'Opérationnelle', one_time: 'Ponctuelle' };
const STATUS_FR: Record<string, string> = { paid: 'Payée', unpaid: 'Impayée', overdue: 'En retard' };
const METHOD_FR: Record<string, string> = { cash: 'Espèces', check: 'Chèque', bank_transfer: 'Virement', card: 'Carte' };

type TabKey = 'dashboard' | 'list' | 'vehicle' | 'suppliers';

// ── Main component ─────────────────────────────────────────────────
export const FixedChargesPage: React.FC = () => {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>('dashboard');
  const [createOpen, setCreateOpen] = useState(false);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState({ category: '', expense_type: '', status: '' });

  const hasApi = !!getApiBase();

  const dashQ = useQuery({
    queryKey: ['expenses', 'dashboard'],
    queryFn: async () => (await apiClient<{ data: DashboardData }>('/v1/expenses/dashboard')).data,
    enabled: hasApi,
  });

  const listQ = useQuery({
    queryKey: ['expenses', 'list', filters],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (filters.category) qs.set('category', filters.category);
      if (filters.expense_type) qs.set('expense_type', filters.expense_type);
      if (filters.status) qs.set('status', filters.status);
      qs.set('per_page', '200');
      return (await apiClient<{ data: Expense[] }>(`/v1/expenses?${qs}`)).data;
    },
    enabled: hasApi,
  });

  const vehiclesQ = useQuery({
    queryKey: ['fleet', 'vehicles-for-expenses'],
    queryFn: async () => (await apiClient<{ data: any[] }>('/v1/vehicles?per_page=200')).data,
    enabled: hasApi,
  });

  const suppliersQ = useQuery({
    queryKey: ['expense-suppliers'],
    queryFn: async () => (await apiClient<{ data: Supplier[] }>('/v1/expense-suppliers')).data,
    enabled: hasApi,
  });

  const createM = useMutation({
    mutationFn: async (data: Record<string, unknown>) => apiClient('/v1/expenses', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['expenses'] }); setCreateOpen(false); },
  });

  const markPaidM = useMutation({
    mutationFn: async (id: string) => apiClient(`/v1/expenses/${id}/mark-paid`, { method: 'POST', body: '{}' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });

  const deleteM = useMutation({
    mutationFn: async (id: string) => apiClient(`/v1/expenses/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses'] }),
  });

  const createSupplierM = useMutation({
    mutationFn: async (data: Record<string, unknown>) => apiClient('/v1/expense-suppliers', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expense-suppliers'] }),
  });

  const d = dashQ.data;
  const expenses = listQ.data ?? [];
  const filtered = useMemo(() => {
    if (!q.trim()) return expenses;
    const lower = q.toLowerCase();
    return expenses.filter((e) => `${e.label} ${e.category} ${e.reference ?? ''}`.toLowerCase().includes(lower));
  }, [expenses, q]);

  const fmtDate = (v: string | null | undefined) => v ? new Date(v).toLocaleDateString('fr-MA') : '—';

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Dépenses</h1>
          <p className="text-sm text-slate-500">Intelligence des coûts flotte & opérations</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="rounded-2xl bg-indigo-600 px-5 py-2.5 text-sm font-black text-white shadow-lg hover:bg-indigo-700"
        >
          + Nouvelle dépense
        </button>
      </header>

      {/* Tabs */}
      <div className="flex gap-0 border-b border-slate-200">
        {([
          { id: 'dashboard', label: 'Tableau de bord' },
          { id: 'list', label: 'Toutes les dépenses' },
          { id: 'vehicle', label: 'Par véhicule' },
          { id: 'suppliers', label: 'Fournisseurs' },
        ] as { id: TabKey; label: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-3 text-sm font-black border-b-2 transition-colors ${tab === t.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ Dashboard Tab ═══ */}
      {tab === 'dashboard' && d && (
        <div className="space-y-6">
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KPI label="Ce mois" value={formatCurrencyMad(d.monthly_total)} color="bg-indigo-50 text-indigo-700" />
            <KPI label="Cette année" value={formatCurrencyMad(d.yearly_total)} color="bg-slate-50 text-slate-800" />
            <KPI label="En retard" value={String(d.overdue_count)} color="bg-rose-50 text-rose-700" />
            <KPI label="À venir (30j)" value={String(d.upcoming_count)} color="bg-amber-50 text-amber-700" />
          </div>

          {/* By category + by type */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-100 bg-white p-5">
              <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">Par catégorie</h3>
              <div className="space-y-2">
                {Object.entries(d.by_category).sort(([,a],[,b]) => Number(b) - Number(a)).map(([cat, total]) => (
                  <div key={cat} className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">{CATEGORY_FR[cat] ?? cat}</span>
                    <span className="text-sm font-black text-slate-900">{formatCurrencyMad(Number(total))}</span>
                  </div>
                ))}
                {Object.keys(d.by_category).length === 0 && <p className="text-sm text-slate-400">Aucune donnée</p>}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-white p-5">
              <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">Fixe vs Opérationnel</h3>
              <div className="space-y-3">
                {Object.entries(d.by_type).map(([type, total]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">{TYPE_FR[type] ?? type}</span>
                    <span className="text-sm font-black text-slate-900">{formatCurrencyMad(Number(total))}</span>
                  </div>
                ))}
              </div>
              <h3 className="mb-3 mt-6 text-xs font-black uppercase tracking-widest text-slate-400">Top véhicules les plus coûteux</h3>
              <div className="space-y-2">
                {d.top_vehicles.map((v, i) => {
                  const veh = (vehiclesQ.data ?? []).find((x: any) => x.id === v.vehicle_id);
                  const name = veh ? `${veh.brand?.name ?? veh.brand_name ?? ''} ${veh.model?.model_name ?? veh.model?.name ?? veh.model_name ?? ''} · ${veh.registration_number ?? ''}` : v.vehicle_id.slice(0, 8);
                  return (
                    <div key={v.vehicle_id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">{i + 1}. {name}</span>
                      <span className="font-bold text-slate-800">{formatCurrencyMad(v.total)}</span>
                    </div>
                  );
                })}
                {d.top_vehicles.length === 0 && <p className="text-sm text-slate-400">Aucune dépense véhicule</p>}
              </div>
            </div>
          </div>

          {/* Monthly trend */}
          <div className="rounded-2xl border border-slate-100 bg-white p-5">
            <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">Tendance mensuelle</h3>
            <div className="flex items-end gap-1 h-32">
              {(() => {
                const entries = Object.entries(d.monthly_trend);
                const max = Math.max(...entries.map(([,v]) => Number(v)), 1);
                return entries.map(([month, total]) => (
                  <div key={month} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-indigo-500 min-h-[4px]"
                      style={{ height: `${(Number(total) / max) * 100}%` }}
                      title={`${month}: ${formatCurrencyMad(Number(total))}`}
                    />
                    <span className="text-[9px] text-slate-400 -rotate-45">{month.slice(5)}</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ═══ List Tab ═══ */}
      {tab === 'list' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <SearchFilterBar placeholder="Rechercher…" value={q} onChange={setQ} />
            <select className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold" value={filters.category} onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}>
              <option value="">Toutes catégories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_FR[c] ?? c}</option>)}
            </select>
            <select className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold" value={filters.expense_type} onChange={(e) => setFilters((f) => ({ ...f, expense_type: e.target.value }))}>
              <option value="">Tous types</option>
              <option value="fixed">Fixe</option>
              <option value="operational">Opérationnelle</option>
              <option value="one_time">Ponctuelle</option>
            </select>
            <select className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
              <option value="">Tous statuts</option>
              <option value="paid">Payée</option>
              <option value="unpaid">Impayée</option>
              <option value="overdue">En retard</option>
            </select>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5 text-left">Libellé</th>
                  <th className="px-4 py-2.5 text-left">Catégorie</th>
                  <th className="px-4 py-2.5 text-left">Type</th>
                  <th className="px-4 py-2.5 text-right">Montant</th>
                  <th className="px-4 py-2.5 text-left">Date</th>
                  <th className="px-4 py-2.5 text-center">Statut</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-800">{e.label}</div>
                      {e.reference && <div className="text-[10px] text-slate-400">{e.reference}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{CATEGORY_FR[e.category] ?? e.category}</td>
                    <td className="px-4 py-3 text-slate-600">{TYPE_FR[e.expense_type] ?? e.expense_type}</td>
                    <td className="px-4 py-3 text-right font-black text-slate-800">{formatCurrencyMad(Number(e.amount))}</td>
                    <td className="px-4 py-3 text-slate-600">{fmtDate(e.expense_date)}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge
                        label={STATUS_FR[e.status] ?? e.status}
                        tone={e.status === 'paid' ? 'success' : e.status === 'overdue' ? 'danger' : 'warning'}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {e.status !== 'paid' && (
                        <button onClick={() => markPaidM.mutate(e.id)} disabled={markPaidM.isPending} className="text-xs font-bold text-emerald-600 hover:underline mr-2">Payer</button>
                      )}
                      <button onClick={() => deleteM.mutate(e.id)} className="text-xs font-bold text-rose-600 hover:underline">Suppr.</button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-sm text-slate-400">Aucune dépense</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ Vehicle Tab ═══ */}
      {tab === 'vehicle' && (
        <VehicleExpensesView vehicles={vehiclesQ.data ?? []} expenses={expenses} />
      )}

      {/* ═══ Suppliers Tab ═══ */}
      {tab === 'suppliers' && (
        <SuppliersView suppliers={suppliersQ.data ?? []} onCreate={(data) => createSupplierM.mutate(data)} creating={createSupplierM.isPending} />
      )}

      {/* ═══ Create expense modal ═══ */}
      {createOpen && (
        <CreateExpenseModal
          vehicles={vehiclesQ.data ?? []}
          suppliers={suppliersQ.data ?? []}
          onClose={() => setCreateOpen(false)}
          onSubmit={(data) => createM.mutate(data)}
          submitting={createM.isPending}
        />
      )}
    </div>
  );
};

// ── Sub-components ─────────────────────────────────────────────────

const KPI: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <div className={`rounded-xl px-4 py-4 ${color}`}>
    <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">{label}</div>
    <div className="mt-1 text-xl font-black">{value}</div>
  </div>
);

const VehicleExpensesView: React.FC<{ vehicles: any[]; expenses: Expense[] }> = ({ vehicles, expenses }) => {
  const vehicleExpenses = useMemo(() => {
    const map: Record<string, { total: number; count: number; byCategory: Record<string, number> }> = {};
    for (const e of expenses) {
      if (!e.vehicle_id) continue;
      if (!map[e.vehicle_id]) map[e.vehicle_id] = { total: 0, count: 0, byCategory: {} };
      map[e.vehicle_id].total += Number(e.amount);
      map[e.vehicle_id].count++;
      const cat = e.category;
      map[e.vehicle_id].byCategory[cat] = (map[e.vehicle_id].byCategory[cat] ?? 0) + Number(e.amount);
    }
    return Object.entries(map).sort(([,a], [,b]) => b.total - a.total);
  }, [expenses]);

  return (
    <div className="space-y-4">
      {vehicleExpenses.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
          Aucune dépense liée à un véhicule. Créez des dépenses en sélectionnant un véhicule.
        </div>
      )}
      {vehicleExpenses.map(([vId, data]) => {
        const veh = vehicles.find((v: any) => v.id === vId);
        const name = veh ? `${veh.brand?.name ?? veh.brand_name ?? ''} ${veh.model?.model_name ?? veh.model?.name ?? veh.model_name ?? ''}`.trim() : 'Véhicule';
        const reg = veh?.registration_number ?? '';
        return (
          <div key={vId} className="rounded-2xl border border-slate-100 bg-white p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-black text-slate-800">{name} <span className="font-mono text-slate-400">{reg}</span></div>
                <div className="text-xs text-slate-500">{data.count} dépense(s)</div>
              </div>
              <div className="text-lg font-black text-indigo-700">{formatCurrencyMad(data.total)}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(data.byCategory).sort(([,a],[,b]) => b - a).map(([cat, total]) => (
                <span key={cat} className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600">
                  {CATEGORY_FR[cat] ?? cat}: {formatCurrencyMad(total)}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const SuppliersView: React.FC<{ suppliers: Supplier[]; onCreate: (data: Record<string, unknown>) => void; creating: boolean }> = ({ suppliers, onCreate, creating }) => {
  const [form, setForm] = useState({ name: '', category: '', phone: '', email: '' });
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-100 bg-white p-5">
        <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">Nouveau fournisseur</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Nom *" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          <input className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Catégorie" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
          <input className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Téléphone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          <input className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>
        <button
          onClick={() => { onCreate(form); setForm({ name: '', category: '', phone: '', email: '' }); }}
          disabled={creating || !form.name}
          className="mt-3 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {creating ? 'Création…' : 'Ajouter fournisseur'}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
            <tr>
              <th className="px-4 py-2.5 text-left">Fournisseur</th>
              <th className="px-4 py-2.5 text-left">Catégorie</th>
              <th className="px-4 py-2.5 text-left">Contact</th>
              <th className="px-4 py-2.5 text-right">Total dépensé</th>
              <th className="px-4 py-2.5 text-center">Nb dépenses</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {suppliers.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-bold text-slate-800">{s.name}</td>
                <td className="px-4 py-3 text-slate-600">{s.category ?? '—'}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{s.phone ?? ''} {s.email ?? ''}</td>
                <td className="px-4 py-3 text-right font-black text-slate-800">{formatCurrencyMad(Number(s.expenses_sum_amount ?? 0))}</td>
                <td className="px-4 py-3 text-center">{s.expenses_count ?? 0}</td>
              </tr>
            ))}
            {suppliers.length === 0 && (
              <tr><td colSpan={5} className="py-8 text-center text-sm text-slate-400">Aucun fournisseur</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const CreateExpenseModal: React.FC<{
  vehicles: any[];
  suppliers: Supplier[];
  onClose: () => void;
  onSubmit: (data: Record<string, unknown>) => void;
  submitting: boolean;
}> = ({ vehicles, suppliers, onClose, onSubmit, submitting }) => {
  const [form, setForm] = useState({
    label: '',
    amount: '',
    expense_date: new Date().toISOString().slice(0, 10),
    due_date: '',
    category: 'autres',
    expense_type: 'operational',
    status: 'unpaid',
    payment_method: '',
    reference: '',
    vehicle_id: '',
    supplier_id: '',
    notes: '',
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-black text-slate-900">Nouvelle dépense</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-[10px] font-bold text-slate-400">Libellé *</label>
            <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="Ex: Vidange Porsche 911" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold text-slate-400">Montant (MAD) *</label>
            <input type="number" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold text-slate-400">Date *</label>
            <input type="date" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={form.expense_date} onChange={(e) => set('expense_date', e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold text-slate-400">Catégorie *</label>
            <select className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={form.category} onChange={(e) => set('category', e.target.value)}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_FR[c] ?? c}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold text-slate-400">Type</label>
            <select className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={form.expense_type} onChange={(e) => set('expense_type', e.target.value)}>
              <option value="operational">Opérationnelle</option>
              <option value="fixed">Fixe (récurrente)</option>
              <option value="one_time">Ponctuelle</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold text-slate-400">Véhicule</label>
            <select className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={form.vehicle_id} onChange={(e) => set('vehicle_id', e.target.value)}>
              <option value="">— Aucun —</option>
              {vehicles.map((v: any) => (
                <option key={v.id} value={v.id}>{v.brand?.name ?? v.brand_name ?? ''} {v.model?.model_name ?? v.model?.name ?? v.model_name ?? ''} · {v.registration_number ?? ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold text-slate-400">Fournisseur</label>
            <select className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={form.supplier_id} onChange={(e) => set('supplier_id', e.target.value)}>
              <option value="">— Aucun —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold text-slate-400">Mode de paiement</label>
            <select className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={form.payment_method} onChange={(e) => set('payment_method', e.target.value)}>
              <option value="">—</option>
              <option value="cash">Espèces</option>
              <option value="check">Chèque</option>
              <option value="bank_transfer">Virement</option>
              <option value="card">Carte</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold text-slate-400">Échéance</label>
            <input type="date" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold text-slate-400">Référence / N° facture</label>
            <input className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={form.reference} onChange={(e) => set('reference', e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-[10px] font-bold text-slate-400">Notes</label>
            <textarea className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600">Annuler</button>
          <button
            onClick={() => onSubmit({ ...form, amount: Number(form.amount), vehicle_id: form.vehicle_id || undefined, supplier_id: form.supplier_id || undefined })}
            disabled={submitting || !form.label || !form.amount || !form.expense_date}
            className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Création…' : 'Créer dépense'}
          </button>
        </div>
      </div>
    </div>
  );
};
