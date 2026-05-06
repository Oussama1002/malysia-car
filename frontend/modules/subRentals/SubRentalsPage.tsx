import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { subRentalApi, type SubRentalContract, type SubRentalStatus } from '@/services/subRentalApi';
import { getApiBase } from '@/services/apiClient';

type Filter = '' | 'active' | 'draft' | 'due_soon' | 'overdue' | 'returned' | 'closed';

const STATUS_LABELS: Record<SubRentalStatus, string> = {
  draft: 'Brouillon',
  active: 'Actif',
  returned: 'Retourné',
  closed: 'Clôturé',
  cancelled: 'Annulé',
};

const STATUS_COLORS: Record<SubRentalStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  active: 'bg-emerald-100 text-emerald-800',
  returned: 'bg-blue-100 text-blue-800',
  closed: 'bg-purple-100 text-purple-800',
  cancelled: 'bg-red-100 text-red-700',
};

function KpiCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className={`rounded-2xl border p-5 ${color}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

export const SubRentalsPage: React.FC = () => {
  const apiReady = !!getApiBase();
  const [filter, setFilter] = useState<Filter>('');

  const dashQ = useQuery({
    queryKey: ['sub-rentals', 'dashboard'],
    queryFn: () => subRentalApi.dashboard(),
    enabled: apiReady,
  });

  const params: Record<string, string> = { per_page: '100' };
  if (filter === 'due_soon') params.due_soon = '1';
  else if (filter === 'overdue') params.overdue = '1';
  else if (filter) params.status = filter;

  const listQ = useQuery({
    queryKey: ['sub-rentals', 'list', filter],
    queryFn: () => subRentalApi.list(params),
    enabled: apiReady,
  });

  if (!apiReady) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        API non configurée. Renseignez <span className="font-mono">VITE_API_BASE</span>.
      </div>
    );
  }

  const dashboard = dashQ.data?.data;
  const contracts: SubRentalContract[] = listQ.data?.data ?? [];

  const filterBtn = (key: Filter, label: string) => (
    <button
      key={key || 'all'}
      type="button"
      onClick={() => setFilter(key)}
      className={`rounded-full px-3 py-1 text-xs font-bold transition ${
        filter === key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Sous-location</h1>
          <p className="text-sm text-slate-500">Contrats de sous-location avec agences fournisseurs</p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/fleet/supplier-agencies"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Agences fournisseurs
          </Link>
          <Link
            to="/fleet/sub-rentals/new"
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            + Nouveau contrat
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      {dashboard && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <KpiCard label="Actifs" value={dashboard.active_sub_rentals} color="border-emerald-200 bg-emerald-50 text-emerald-900" />
          <KpiCard label="Retour imminent" value={dashboard.due_soon} color="border-amber-200 bg-amber-50 text-amber-900" />
          <KpiCard label="En retard" value={dashboard.overdue} color="border-red-200 bg-red-50 text-red-900" />
          <KpiCard
            label="Coût fournisseur (mois)"
            value={`${dashboard.monthly_supplier_cost.toLocaleString('fr-MA')} MAD`}
            color="border-slate-200 bg-white text-slate-800"
          />
          <KpiCard
            label="Marge totale"
            value={`${dashboard.total_margin >= 0 ? '+' : ''}${dashboard.total_margin.toLocaleString('fr-MA')} MAD`}
            color={dashboard.total_margin >= 0 ? 'border-green-200 bg-green-50 text-green-900' : 'border-red-200 bg-red-50 text-red-900'}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {filterBtn('', 'Tous')}
        {filterBtn('active', 'Actifs')}
        {filterBtn('due_soon', 'Retour imminent')}
        {filterBtn('overdue', 'En retard')}
        {filterBtn('draft', 'Brouillons')}
        {filterBtn('returned', 'Retournés')}
        {filterBtn('closed', 'Clôturés')}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {listQ.isLoading ? (
          <div className="p-6 text-sm text-slate-500">Chargement…</div>
        ) : listQ.isError ? (
          <div className="p-6 text-sm text-red-600">Erreur de chargement des contrats.</div>
        ) : contracts.length === 0 ? (
          <div className="p-6 text-sm text-slate-400">Aucun contrat trouvé.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Contrat</th>
                <th className="px-4 py-3 text-left">Fournisseur</th>
                <th className="px-4 py-3 text-left">Véhicule</th>
                <th className="px-4 py-3 text-left">Période</th>
                <th className="px-4 py-3 text-right">Coût/j</th>
                <th className="px-4 py-3 text-left">Paiement</th>
                <th className="px-4 py-3 text-left">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contracts.map((c) => {
                const isOverdue = c.status === 'active' && new Date(c.end_date) < new Date();
                const isDueSoon =
                  c.status === 'active' &&
                  !isOverdue &&
                  new Date(c.end_date) <= new Date(Date.now() + 3 * 86400000);

                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link to={`/fleet/sub-rentals/${c.id}`} className="font-semibold text-indigo-600 hover:underline">
                        {c.contract_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{c.supplier_agency?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {(c.vehicle as any)?.registration_number ??
                        c.external_vehicle_identity?.registration_number ??
                        '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className="text-slate-600">{new Date(c.start_date).toLocaleDateString('fr-MA')}</span>
                        <span className="text-slate-400">→</span>
                        <span className={isOverdue ? 'font-bold text-red-600' : isDueSoon ? 'font-bold text-amber-600' : 'text-slate-600'}>
                          {new Date(c.end_date).toLocaleDateString('fr-MA')}
                        </span>
                        {isOverdue && (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">RETARD</span>
                        )}
                        {isDueSoon && !isOverdue && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">BIENTÔT</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">
                      {Number(c.daily_cost).toLocaleString('fr-MA')} MAD
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          c.payment_status === 'paid'
                            ? 'bg-green-100 text-green-800'
                            : c.payment_status === 'partial'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {c.payment_status === 'paid' ? 'Payé' : c.payment_status === 'partial' ? 'Partiel' : 'Impayé'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_COLORS[c.status]}`}>
                        {STATUS_LABELS[c.status]}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
