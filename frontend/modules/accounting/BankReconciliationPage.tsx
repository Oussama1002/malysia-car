import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  autoMatchBankLines,
  importBankLines,
  listBankLines,
  matchBankLine,
  suggestBankMatches,
  ignoreBankLine,
  unmatchBankLine,
  type AutoMatchResult,
  type BankStatementLine,
  type BankSuggestion,
} from '@/services/accountingApi';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { EmptyState } from '@/modules/shared/components/EmptyState';
import { formatCurrencyMad, formatDate } from '@/modules/shared/formatters';

const STATUS_LABEL: Record<BankStatementLine['status'], string> = {
  unmatched: 'Non rapproché',
  matched: 'Rapproché',
  ignored: 'Ignoré',
};
const STATUS_TONE: Record<BankStatementLine['status'], 'warning' | 'success' | 'default'> = {
  unmatched: 'warning',
  matched: 'success',
  ignored: 'default',
};

export const BankReconciliationPage: React.FC = () => {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'unmatched' | 'matched' | 'ignored' | ''>('unmatched');
  const [importOpen, setImportOpen] = useState(false);
  const [pickingFor, setPickingFor] = useState<BankStatementLine | null>(null);

  const linesQ = useQuery({
    queryKey: ['bank-rec', filter],
    queryFn: () => listBankLines({ status: filter || undefined, per_page: 100 }),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['bank-rec'] });

  const matchMut = useMutation({
    mutationFn: ({ line, payment }: { line: string; payment: string }) => matchBankLine(line, payment),
    onSuccess: () => { invalidate(); setPickingFor(null); },
  });
  const ignoreMut = useMutation({ mutationFn: (line: string) => ignoreBankLine(line), onSuccess: invalidate });
  const unmatchMut = useMutation({ mutationFn: (line: string) => unmatchBankLine(line), onSuccess: invalidate });

  const [autoResult, setAutoResult] = useState<AutoMatchResult | null>(null);
  const autoMut = useMutation({
    mutationFn: (dryRun: boolean) => autoMatchBankLines({ dry_run: dryRun }),
    onSuccess: (res) => { setAutoResult(res.data); invalidate(); },
  });

  const lines = linesQ.data?.data ?? [];
  const unmatchedCount = lines.filter((l) => l.status === 'unmatched').length;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <Link to="/accounting" className="text-xs font-bold text-indigo-600">← Comptabilité</Link>
          <h1 className="text-2xl font-black text-slate-900">Rapprochement bancaire</h1>
        </div>
        <div className="flex gap-2">
          <button
            className="df-btn df-btn--ghost"
            disabled={autoMut.isPending || unmatchedCount === 0}
            onClick={() => autoMut.mutate(true)}
            title="Simule sans écrire : liste les lignes qui ont exactement un paiement candidat (montant exact, date ±1 jour)."
          >
            {autoMut.isPending ? 'Simulation…' : 'Simuler rapprochement auto'}
          </button>
          <button
            className="df-btn df-btn--secondary"
            disabled={autoMut.isPending || unmatchedCount === 0}
            onClick={() => autoMut.mutate(false)}
          >
            {autoMut.isPending ? 'Rapprochement…' : 'Rapprocher automatiquement'}
          </button>
          <button className="df-btn df-btn--primary" onClick={() => setImportOpen(true)}>Importer un relevé</button>
        </div>
      </header>

      {autoResult && (
        <div className="df-card">
          <div className="df-card__body flex items-center justify-between gap-4 text-sm">
            <div className="flex-1">
              <div className="font-bold text-slate-800">
                {autoResult.dry_run ? 'Simulation' : 'Rapprochement automatique'} — {autoResult.scanned} ligne(s) scannée(s)
              </div>
              <div className="mt-1 flex flex-wrap gap-4 text-xs text-slate-600">
                <span className="text-emerald-700 font-bold">✓ {autoResult.matched} rapprochée(s)</span>
                <span className="text-amber-700">⚠ {autoResult.ambiguous} ambiguë(s)</span>
                <span className="text-slate-500">○ {autoResult.no_candidate} sans candidat</span>
              </div>
            </div>
            <button className="df-btn df-btn--ghost text-xs" onClick={() => setAutoResult(null)}>Fermer</button>
          </div>
        </div>
      )}

      <div className="df-card">
        <div className="df-card__body flex items-center gap-3">
          <label className="text-xs font-bold uppercase text-slate-500">Filtre</label>
          <select
            className="df-input"
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
          >
            <option value="">Tous</option>
            <option value="unmatched">Non rapprochés</option>
            <option value="matched">Rapprochés</option>
            <option value="ignored">Ignorés</option>
          </select>
        </div>
      </div>

      {linesQ.isLoading ? (
        <div className="text-slate-500">Chargement…</div>
      ) : !lines.length ? (
        <EmptyState title="Aucune ligne de relevé" description="Importez un relevé bancaire CSV pour commencer." />
      ) : (
        <div className="df-card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Date valeur</th>
                <th>Libellé</th>
                <th>Réf.</th>
                <th className="text-right">Montant</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-slate-700">{formatDate(l.value_date)}</td>
                  <td className="text-slate-800">{l.label}</td>
                  <td className="font-mono text-xs text-slate-500">{l.external_reference ?? '—'}</td>
                  <td className={`text-right font-mono font-bold ${Number(l.amount) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {formatCurrencyMad(Number(l.amount))}
                  </td>
                  <td><StatusBadge label={STATUS_LABEL[l.status]} tone={STATUS_TONE[l.status]} /></td>
                  <td className="px-2 flex gap-1">
                    {l.status === 'unmatched' && (
                      <>
                        <button className="df-btn df-btn--ghost text-xs" onClick={() => setPickingFor(l)}>Rapprocher</button>
                        <button className="df-btn df-btn--ghost text-xs text-slate-500" onClick={() => ignoreMut.mutate(l.id)}>Ignorer</button>
                      </>
                    )}
                    {l.status === 'matched' && (
                      <button className="df-btn df-btn--ghost text-xs text-rose-600" onClick={() => unmatchMut.mutate(l.id)}>Dérapprocher</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DrawerPanel open={!!pickingFor} title="Rapprocher avec un paiement" onClose={() => setPickingFor(null)}>
        {pickingFor && (
          <SuggestionsList
            line={pickingFor}
            onPick={(paymentId) => matchMut.mutate({ line: pickingFor.id, payment: paymentId })}
            submitting={matchMut.isPending}
          />
        )}
      </DrawerPanel>

      <DrawerPanel open={importOpen} title="Importer un relevé" onClose={() => setImportOpen(false)}>
        <ImportForm onDone={() => { setImportOpen(false); invalidate(); }} />
      </DrawerPanel>
    </div>
  );
};

const SuggestionsList: React.FC<{
  line: BankStatementLine;
  onPick: (paymentId: string) => void;
  submitting: boolean;
}> = ({ line, onPick, submitting }) => {
  const sugQ = useQuery({
    queryKey: ['bank-rec', 'suggestions', line.id],
    queryFn: () => suggestBankMatches(line.id),
  });
  const list = (sugQ.data?.data ?? []) as BankSuggestion[];

  return (
    <div className="space-y-3">
      <div className="rounded-md bg-slate-50 p-3 text-sm">
        <div className="font-bold">{line.label}</div>
        <div className="text-slate-500">
          {formatDate(line.value_date)} · {formatCurrencyMad(Number(line.amount))}
        </div>
      </div>

      {sugQ.isLoading ? (
        <div className="text-slate-500">Recherche…</div>
      ) : !list.length ? (
        <EmptyState title="Aucun paiement candidat" description="Montant exact ± 3 jours, méthode bank/check/card, non déjà rapproché." />
      ) : (
        <ul className="space-y-2">
          {list.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-md border border-slate-200 p-3">
              <div>
                <div className="font-bold text-slate-900">{p.payment_number}</div>
                <div className="text-xs text-slate-500">
                  {formatDate(p.payment_date)} · {p.payment_method} · {formatCurrencyMad(Number(p.amount))}
                </div>
              </div>
              <button className="df-btn df-btn--primary text-xs" disabled={submitting} onClick={() => onPick(p.id)}>
                Rapprocher
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const ImportForm: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const [csv, setCsv] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped_duplicates: number } | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      // Expected CSV columns: value_date,label,amount,external_reference
      const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const header = lines.shift()?.split(/[,;]/).map((h) => h.trim().toLowerCase()) ?? [];
      const col = (name: string) => header.indexOf(name);
      if (col('value_date') < 0 || col('amount') < 0 || col('label') < 0) {
        throw new Error('Colonnes requises: value_date, label, amount (+ external_reference optionnel)');
      }
      const payload = lines.map((row) => {
        const parts = row.split(/[,;]/).map((c) => c.trim());
        return {
          value_date: parts[col('value_date')],
          label: parts[col('label')],
          amount: Number(parts[col('amount')].replace(',', '.')),
          external_reference: col('external_reference') >= 0 ? parts[col('external_reference')] : undefined,
        };
      });
      return importBankLines(payload);
    },
    onSuccess: (res) => { setResult(res.data); setError(null); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Collez un CSV avec en-tête <code>value_date,label,amount,external_reference</code>. Dates au format AAAA-MM-JJ.
        Montants positifs = encaissement, négatifs = décaissement.
      </p>
      <textarea
        className="df-input font-mono text-xs"
        rows={12}
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        placeholder={'value_date,label,amount,external_reference\n2026-11-15,Virement BMCI CL0001,2500.00,REF123\n2026-11-16,Chèque 00123,1200.00,'}
      />
      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {result && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {result.created} ligne(s) importée(s), {result.skipped_duplicates} doublon(s) ignoré(s).
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button className="df-btn df-btn--ghost" onClick={onDone}>Fermer</button>
        <button className="df-btn df-btn--primary" disabled={!csv.trim() || mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? 'Import…' : 'Importer'}
        </button>
      </div>
    </div>
  );
};
