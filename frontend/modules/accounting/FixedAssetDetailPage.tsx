import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getFixedAsset, runDepreciation } from '@/services/accountingApi';
import { ApiError } from '@/services/apiError';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { formatCurrencyMad } from '@/modules/shared/formatters';

const STATUS_TONE: Record<string, 'success' | 'danger' | 'warning'> = {
  active: 'success',
  disposed: 'danger',
  impaired: 'warning',
};
const STATUS_LABEL: Record<string, string> = { active: 'Actif', disposed: 'Cédé', impaired: 'Déprécié' };
const METHOD_LABEL: Record<string, string> = { linear: 'Linéaire', declining: 'Dégressif', none: 'Aucune' };

export const FixedAssetDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [depPeriod, setDepPeriod] = useState(new Date().toISOString().substring(0, 7) + '-01');

  const assetQ = useQuery({
    queryKey: ['accounting', 'fixed-asset', id],
    queryFn: () => getFixedAsset(id!),
    enabled: !!id,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['accounting', 'fixed-asset', id] });
    qc.invalidateQueries({ queryKey: ['accounting', 'fixed-assets'] });
  };

  const depMut = useMutation({
    mutationFn: () => runDepreciation(id!, depPeriod),
    onSuccess: () => { invalidate(); setError(null); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur lors de l\'amortissement'),
  });

  const asset = assetQ.data?.data;

  if (assetQ.isLoading) return <div className="text-slate-500 p-6">Chargement…</div>;
  if (!asset) return <div className="text-rose-600 p-6">Actif introuvable.</div>;

  const depreciationRate = asset.acquisition_cost > 0
    ? ((asset.accumulated_depreciation / asset.acquisition_cost) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/accounting/fixed-assets" className="text-xs font-bold text-indigo-600">← Immobilisations</Link>
          <h1 className="text-2xl font-black text-slate-900">{asset.name}</h1>
          <p className="font-mono text-slate-500">{asset.asset_number}</p>
        </div>
        <StatusBadge label={STATUS_LABEL[asset.status] ?? asset.status} tone={STATUS_TONE[asset.status] ?? 'default'} />
      </header>

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="df-card"><div className="df-card__body">
          <div className="text-xs font-bold uppercase text-slate-500">Coût d'acquisition</div>
          <div className="mt-1 text-xl font-black text-slate-900">{formatCurrencyMad(Number(asset.acquisition_cost))}</div>
        </div></div>
        <div className="df-card"><div className="df-card__body">
          <div className="text-xs font-bold uppercase text-slate-500">Amort. cumulé</div>
          <div className="mt-1 text-xl font-black text-rose-600">{formatCurrencyMad(Number(asset.accumulated_depreciation))}</div>
          <div className="text-xs text-slate-500">{depreciationRate}% amorti</div>
        </div></div>
        <div className="df-card"><div className="df-card__body">
          <div className="text-xs font-bold uppercase text-slate-500">Valeur nette comptable</div>
          <div className="mt-1 text-xl font-black text-emerald-700">{formatCurrencyMad(Number(asset.book_value))}</div>
        </div></div>
        <div className="df-card"><div className="df-card__body">
          <div className="text-xs font-bold uppercase text-slate-500">Amort. mensuel</div>
          <div className="mt-1 text-xl font-black text-slate-900">
            {formatCurrencyMad(asset.useful_life_months > 0
              ? (asset.acquisition_cost - asset.residual_value) / asset.useful_life_months
              : 0
            )}
          </div>
        </div></div>
      </div>

      {/* Details */}
      <div className="df-card">
        <div className="df-card__body grid gap-4 md:grid-cols-3 text-sm">
          <div><span className="font-bold text-slate-500">Catégorie :</span> <span className="text-slate-800">{asset.category}</span></div>
          <div><span className="font-bold text-slate-500">Méthode :</span> <span className="text-slate-800">{METHOD_LABEL[asset.depreciation_method]}</span></div>
          <div><span className="font-bold text-slate-500">Durée de vie :</span> <span className="text-slate-800">{asset.useful_life_months} mois</span></div>
          <div><span className="font-bold text-slate-500">Date d'acquisition :</span> <span className="text-slate-800">{asset.acquisition_date}</span></div>
          <div><span className="font-bold text-slate-500">Valeur résiduelle :</span> <span className="text-slate-800">{formatCurrencyMad(Number(asset.residual_value))}</span></div>
          {asset.asset_account_code && <div><span className="font-bold text-slate-500">Cpte actif :</span> <span className="font-mono text-slate-800">{asset.asset_account_code}</span></div>}
          {asset.depreciation_account_code && <div><span className="font-bold text-slate-500">Cpte dotation :</span> <span className="font-mono text-slate-800">{asset.depreciation_account_code}</span></div>}
          {asset.accumulated_dep_account_code && <div><span className="font-bold text-slate-500">Cpte amort. cumulé :</span> <span className="font-mono text-slate-800">{asset.accumulated_dep_account_code}</span></div>}
          {asset.disposal_date && <div><span className="font-bold text-slate-500">Date de cession :</span> <span className="text-slate-800">{asset.disposal_date}</span></div>}
          {asset.disposal_amount != null && <div><span className="font-bold text-slate-500">Prix de cession :</span> <span className="text-slate-800">{formatCurrencyMad(Number(asset.disposal_amount))}</span></div>}
        </div>
      </div>

      {/* Manual depreciation run */}
      {asset.status === 'active' && asset.depreciation_method !== 'none' && (
        <div className="df-card">
          <div className="df-card__body space-y-3">
            <h2 className="font-bold text-slate-800">Passer une dotation manuelle</h2>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-xs font-bold uppercase text-slate-500">Période (date)</label>
                <input type="date" className="df-input mt-1" value={depPeriod} onChange={(e) => setDepPeriod(e.target.value)} />
              </div>
              <button
                className="df-btn df-btn--primary"
                disabled={depMut.isPending}
                onClick={() => depMut.mutate()}
              >
                {depMut.isPending ? 'En cours…' : 'Passer dotation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Depreciation schedule */}
      {(asset.depreciation_lines ?? []).length > 0 && (
        <div className="df-card overflow-x-auto">
          <div className="df-card__body border-b border-slate-100 pb-2">
            <h2 className="font-bold text-slate-800">Tableau d'amortissement</h2>
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Période</th>
                <th className="text-right">Dotation</th>
                <th className="text-right">Amort. cumulé</th>
                <th className="text-right">VNC</th>
                <th>Comptabilisé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(asset.depreciation_lines ?? []).map((line) => (
                <tr key={line.id} className={`hover:bg-slate-50 ${line.is_posted ? '' : 'opacity-60'}`}>
                  <td className="px-4 py-2 font-mono text-slate-900">{line.period_date}</td>
                  <td className="text-right font-mono">{formatCurrencyMad(Number(line.amount))}</td>
                  <td className="text-right font-mono text-rose-600">{formatCurrencyMad(Number(line.cumulative_depreciation))}</td>
                  <td className="text-right font-mono font-bold">{formatCurrencyMad(Number(line.book_value))}</td>
                  <td>
                    {line.is_posted
                      ? <StatusBadge label="Comptabilisé" tone="success" />
                      : <StatusBadge label="Prévu" tone="default" />
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
