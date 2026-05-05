import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/services/queryKeys';
import { DataTable } from '@/modules/shared/components/DataTable';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { SearchFilterBar } from '@/modules/shared/components/SearchFilterBar';
import { creditApi } from '@/services/creditApi';
import { useAuthSession } from '@/modules/auth/AuthContext';

export const CreditAnalysisPage: React.FC = () => {
  const qc = useQueryClient();
  const { session } = useAuthSession();
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const cases = useQuery({ queryKey: queryKeys.credit.cases, queryFn: async () => creditApi.list() });
  const isDirectorLevel = ['ADMIN', 'DIRECTEUR'].includes(session?.user.role ?? '');

  const rows = (cases.data ?? []).filter((c: any) => `${c.id} ${c.assignedTo ?? ''} ${c.decisionStatus ?? ''}`.includes(q));
  const selected = rows.find((r: any) => r.id === selectedId) as any;

  const latestScoreQ = useQuery({
    queryKey: ['credit', 'latest-score', selectedId],
    queryFn: () => creditApi.latestScore(selectedId!),
    enabled: !!selectedId,
  });
  const scoreHistoryQ = useQuery({
    queryKey: ['credit', 'scores', selectedId],
    queryFn: () => creditApi.scores(selectedId!),
    enabled: !!selectedId,
  });

  const scoreMut = useMutation({
    mutationFn: () => creditApi.score(selectedId!),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['credit', 'latest-score', selectedId] });
      void qc.invalidateQueries({ queryKey: ['credit', 'scores', selectedId] });
      void qc.invalidateQueries({ queryKey: queryKeys.credit.cases });
    },
  });

  const approveMut = useMutation({
    mutationFn: (override: boolean) =>
      creditApi.decision(selectedId!, {
        decision: 'approved',
        create_contract: true,
        director_override: override,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.credit.cases });
      void qc.invalidateQueries({ queryKey: ['credit', 'latest-score', selectedId] });
    },
  });

  const recommendationLabel = useMemo(() => {
    const rec = (latestScoreQ.data as any)?.recommendation ?? (latestScoreQ.data as any)?.recommendation;
    if (!rec) return 'Calculer un score pour obtenir une recommandation.';
    return String(rec);
  }, [latestScoreQ.data]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-slate-900">Analyse crédit</h1>
        <p className="text-slate-500">Dossiers, scoring, décision.</p>
      </header>
      <SearchFilterBar placeholder="Filtrer…" value={q} onChange={setQ} />
      <DataTable
        loading={cases.isLoading}
        columns={[
          { key: 'id', header: 'Dossier', render: (r) => <button className="font-mono text-xs font-bold text-indigo-700" onClick={() => setSelectedId(r.id)}>#{r.id}</button> },
          { key: 's', header: 'Statut', render: (r) => <StatusBadge label={r.decisionStatus ?? r.status} tone="info" /> },
          { key: 'score', header: 'Scoring', render: (r) => <span className="font-black">{r.scoringStatus ?? r.score ?? '—'}</span> },
          { key: 'a', header: 'Client', render: (r) => <span className="font-mono text-xs">{r.customerId ?? '—'}</span> },
        ]}
        rows={rows}
        rowKey={(r) => r.id}
        emptyTitle="Aucun dossier"
      />

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-black text-slate-900">Espace analyste</div>
          <div className="flex gap-2">
            <button type="button" className="df-btn df-btn--primary text-xs" disabled={!selectedId || scoreMut.isPending} onClick={() => scoreMut.mutate()}>
              {scoreMut.isPending ? 'Calcul…' : 'Calculer score'}
            </button>
            <button type="button" className="df-btn df-btn--ghost text-xs" disabled={!selectedId || approveMut.isPending} onClick={() => approveMut.mutate(false)}>
              Valider et creer contrat
            </button>
            {isDirectorLevel && (
              <button type="button" className="df-btn df-btn--ghost text-xs" disabled={!selectedId || approveMut.isPending} onClick={() => approveMut.mutate(true)}>
                Override directeur
              </button>
            )}
          </div>
        </div>

        {!selectedId ? (
          <p className="text-sm text-slate-500">Selectionnez un dossier pour afficher le score detaille et l'historique.</p>
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase text-slate-500">Dernier score</div>
              <div className="mt-1 flex items-center gap-3">
                <div className="text-2xl font-black text-slate-900">{(latestScoreQ.data as any)?.score ?? '—'}/100</div>
                {(latestScoreQ.data as any)?.risk_band && <StatusBadge label={`Risque ${(latestScoreQ.data as any)?.risk_band}`} tone={(latestScoreQ.data as any)?.risk_band === 'D' ? 'danger' : (latestScoreQ.data as any)?.risk_band === 'C' ? 'warning' : 'success'} />}
              </div>
              <div className="mt-2 text-sm text-slate-600">Decision recommandee: <span className="font-semibold">{recommendationLabel}</span></div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs font-bold uppercase text-emerald-700">Facteurs positifs</div>
                  <ul className="text-sm text-slate-700">
                    {((latestScoreQ.data as any)?.factors_positive ?? []).map((x: string) => <li key={x}>+ {x}</li>)}
                  </ul>
                </div>
                <div>
                  <div className="text-xs font-bold uppercase text-rose-700">Facteurs negatifs</div>
                  <ul className="text-sm text-slate-700">
                    {((latestScoreQ.data as any)?.factors_negative ?? []).map((x: string) => <li key={x}>- {x}</li>)}
                  </ul>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="text-xs uppercase text-slate-500">Historique des scores</div>
              <div className="mt-2 space-y-2">
                {(scoreHistoryQ.data ?? []).map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
                    <span>{new Date(s.scored_at).toLocaleString('fr-MA')}</span>
                    <span className="font-bold">{s.score}/100 · {s.risk_band}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
