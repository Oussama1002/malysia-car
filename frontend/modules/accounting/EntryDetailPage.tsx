import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelEntry,
  deleteEntry,
  ENTRY_STATUS_LABEL,
  entryStatusTone,
  getEntry,
  postEntry,
} from '@/services/accountingApi';
import { ApiError } from '@/services/apiError';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { formatCurrencyMad } from '@/modules/shared/formatters';

export const EntryDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const entryQ = useQuery({
    queryKey: ['accounting', 'entry', id],
    queryFn: () => getEntry(id!),
    enabled: !!id,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['accounting', 'entry', id] });
    qc.invalidateQueries({ queryKey: ['accounting', 'entries'] });
  };

  const postMut = useMutation({
    mutationFn: () => postEntry(id!),
    onSuccess: () => { invalidate(); setError(null); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur lors de la comptabilisation'),
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelEntry(id!),
    onSuccess: () => { invalidate(); setError(null); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur lors de l\'annulation'),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteEntry(id!),
    onSuccess: () => navigate('/accounting/entries'),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur lors de la suppression'),
  });

  const entry = entryQ.data?.data;

  if (entryQ.isLoading) return <div className="text-slate-500 p-6">Chargement…</div>;
  if (!entry) return <div className="text-rose-600 p-6">Écriture introuvable.</div>;

  const isBalanced = Math.abs(entry.total_debit - entry.total_credit) < 0.01;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/accounting/entries" className="text-xs font-bold text-indigo-600">← Écritures</Link>
          <h1 className="text-2xl font-black text-slate-900">{entry.entry_number}</h1>
          <p className="text-slate-500">{entry.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {entry.status === 'draft' && (
            <>
              <button
                className="df-btn df-btn--primary"
                disabled={!isBalanced || postMut.isPending}
                onClick={() => { if (confirm('Comptabiliser cette écriture ?')) postMut.mutate(); }}
                title={!isBalanced ? 'L\'écriture n\'est pas équilibrée (débit ≠ crédit)' : ''}
              >
                {postMut.isPending ? 'Comptabilisation…' : '✓ Comptabiliser'}
              </button>
              <button
                className="df-btn df-btn--ghost text-rose-600"
                disabled={deleteMut.isPending}
                onClick={() => { if (confirm('Supprimer définitivement cette écriture ?')) deleteMut.mutate(); }}
              >
                Supprimer
              </button>
            </>
          )}
          {entry.status === 'posted' && (
            <button
              className="df-btn df-btn--ghost text-rose-600"
              disabled={cancelMut.isPending}
              onClick={() => { if (confirm('Annuler cette écriture ? Une écriture d\'extourne sera créée.')) cancelMut.mutate(); }}
            >
              {cancelMut.isPending ? 'Annulation…' : 'Annuler (extourne)'}
            </button>
          )}
        </div>
      </header>

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {!isBalanced && entry.status === 'draft' && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-700">
          ⚠ L'écriture n'est pas équilibrée — débit ({formatCurrencyMad(entry.total_debit)}) ≠ crédit ({formatCurrencyMad(entry.total_credit)})
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="df-card"><div className="df-card__body"><div className="text-xs font-bold uppercase text-slate-500">Statut</div><div className="mt-1"><StatusBadge label={ENTRY_STATUS_LABEL[entry.status]} tone={entryStatusTone(entry.status)} /></div></div></div>
        <div className="df-card"><div className="df-card__body"><div className="text-xs font-bold uppercase text-slate-500">Date</div><div className="mt-1 text-lg font-black text-slate-900">{entry.entry_date}</div></div></div>
        <div className="df-card"><div className="df-card__body"><div className="text-xs font-bold uppercase text-slate-500">Journal</div><div className="mt-1 font-mono font-bold text-slate-900">{entry.journal?.code ?? '—'} <span className="font-normal text-slate-600">{entry.journal?.name}</span></div></div></div>
        <div className="df-card"><div className="df-card__body"><div className="text-xs font-bold uppercase text-slate-500">Équilibre</div><div className={`mt-1 font-bold ${isBalanced ? 'text-emerald-600' : 'text-rose-600'}`}>{isBalanced ? '✓ Équilibré' : '✗ Déséquilibré'}</div></div></div>
      </div>

      {entry.reference && (
        <div className="df-card"><div className="df-card__body text-sm"><span className="font-bold text-slate-500">Référence :</span> <span className="font-mono text-slate-800">{entry.reference}</span></div></div>
      )}

      <div className="df-card overflow-x-auto">
        <div className="df-card__body border-b border-slate-100 pb-2">
          <h2 className="font-bold text-slate-800">Lignes d'écriture</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">#</th>
              <th>Compte</th>
              <th>Libellé</th>
              <th className="text-right">Débit</th>
              <th className="text-right">Crédit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(entry.lines ?? []).map((line) => (
              <tr key={line.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-400">{line.line_order}</td>
                <td className="font-mono font-bold text-slate-900">{line.account_code}</td>
                <td className="text-slate-700">{line.label}</td>
                <td className={`text-right font-mono ${line.debit > 0 ? 'text-slate-900 font-semibold' : 'text-slate-300'}`}>
                  {line.debit > 0 ? formatCurrencyMad(Number(line.debit)) : '—'}
                </td>
                <td className={`text-right font-mono ${line.credit > 0 ? 'text-slate-900 font-semibold' : 'text-slate-300'}`}>
                  {line.credit > 0 ? formatCurrencyMad(Number(line.credit)) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
              <td colSpan={3} className="px-4 py-2 text-right text-slate-600 uppercase text-xs tracking-wide">Totaux</td>
              <td className="text-right font-mono text-slate-900">{formatCurrencyMad(entry.total_debit)}</td>
              <td className="text-right font-mono text-slate-900">{formatCurrencyMad(entry.total_credit)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {entry.posted_at && (
        <p className="text-xs text-slate-400">Comptabilisé le : {new Date(entry.posted_at).toLocaleDateString('fr-MA')}</p>
      )}
    </div>
  );
};
