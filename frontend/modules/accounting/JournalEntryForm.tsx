import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  createEntry,
  listJournals,
  type EntryCreatePayload,
} from '@/services/accountingApi';
import { ApiError } from '@/services/apiError';
import { formatCurrencyMad } from '@/modules/shared/formatters';

interface LineInput {
  account_code: string;
  label: string;
  debit: number;
  credit: number;
}

const emptyLine = (): LineInput => ({ account_code: '', label: '', debit: 0, credit: 0 });

export const JournalEntryForm: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().substring(0, 10);

  const [header, setHeader] = useState({
    journal_id: '',
    entry_date: today,
    description: '',
    reference: '',
  });

  const [lines, setLines] = useState<LineInput[]>([emptyLine(), emptyLine()]);

  const journalsQ = useQuery({ queryKey: ['accounting', 'journals'], queryFn: () => listJournals() });
  const journals = journalsQ.data?.data ?? [];

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const createMut = useMutation({
    mutationFn: (p: EntryCreatePayload) => createEntry(p),
    onSuccess: (res) => navigate(`/accounting/entries/${res.data.id}`),
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur lors de la création'),
  });

  const setLine = (i: number, patch: Partial<LineInput>) =>
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (i: number) => setLines((prev) => prev.filter((_, idx) => idx !== i));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!header.journal_id) { setError('Sélectionnez un journal'); return; }
    if (!isBalanced) { setError('L\'écriture doit être équilibrée (débit = crédit ≠ 0)'); return; }
    const validLines = lines.filter((l) => l.account_code && (l.debit > 0 || l.credit > 0));
    if (validLines.length < 2) { setError('Au moins 2 lignes sont requises'); return; }

    createMut.mutate({
      journal_id: header.journal_id,
      entry_date: header.entry_date,
      description: header.description,
      reference: header.reference || undefined,
      lines: validLines.map((l) => ({
        account_code: l.account_code,
        label: l.label,
        debit: Number(l.debit),
        credit: Number(l.credit),
      })),
    });
  };

  return (
    <div className="space-y-6">
      <header>
        <Link to="/accounting/entries" className="text-xs font-bold text-indigo-600">← Écritures</Link>
        <h1 className="text-2xl font-black text-slate-900">Nouvelle écriture</h1>
      </header>

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header */}
        <div className="df-card">
          <div className="df-card__body space-y-4">
            <h2 className="font-bold text-slate-800">En-tête</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs font-bold uppercase text-slate-500">Journal *</label>
                <select className="df-input mt-1" value={header.journal_id} onChange={(e) => setHeader({ ...header, journal_id: e.target.value })} required>
                  <option value="">Sélectionner un journal…</option>
                  {journals.map((j) => <option key={j.id} value={j.id}>{j.code} — {j.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-slate-500">Date *</label>
                <input type="date" className="df-input mt-1" value={header.entry_date} onChange={(e) => setHeader({ ...header, entry_date: e.target.value })} required />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-bold uppercase text-slate-500">Description *</label>
                <input className="df-input mt-1" value={header.description} onChange={(e) => setHeader({ ...header, description: e.target.value })} required placeholder="ex: Facturation loyer véhicule…" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-slate-500">Référence</label>
                <input className="df-input mt-1" value={header.reference} onChange={(e) => setHeader({ ...header, reference: e.target.value })} placeholder="ex: FAC-2026-001" />
              </div>
            </div>
          </div>
        </div>

        {/* Lines */}
        <div className="df-card overflow-x-auto">
          <div className="df-card__body border-b border-slate-100 pb-2 flex items-center justify-between">
            <h2 className="font-bold text-slate-800">Lignes d'écriture</h2>
            <button type="button" className="df-btn df-btn--ghost text-xs" onClick={addLine}>+ Ligne</button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 text-left w-32">Compte *</th>
                <th className="text-left">Libellé</th>
                <th className="text-right w-36">Débit (MAD)</th>
                <th className="text-right w-36">Crédit (MAD)</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lines.map((line, i) => (
                <tr key={i}>
                  <td className="px-4 py-1.5">
                    <input
                      className="df-input font-mono"
                      value={line.account_code}
                      onChange={(e) => setLine(i, { account_code: e.target.value })}
                      placeholder="ex: 3421"
                    />
                  </td>
                  <td className="pr-2 py-1.5">
                    <input
                      className="df-input"
                      value={line.label}
                      onChange={(e) => setLine(i, { label: e.target.value })}
                      placeholder="Libellé de la ligne…"
                    />
                  </td>
                  <td className="pr-2 py-1.5">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="df-input text-right"
                      value={line.debit || ''}
                      onChange={(e) => setLine(i, { debit: Number(e.target.value), credit: Number(e.target.value) > 0 ? 0 : line.credit })}
                    />
                  </td>
                  <td className="pr-2 py-1.5">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="df-input text-right"
                      value={line.credit || ''}
                      onChange={(e) => setLine(i, { credit: Number(e.target.value), debit: Number(e.target.value) > 0 ? 0 : line.debit })}
                    />
                  </td>
                  <td className="pr-2 py-1.5 text-center">
                    {lines.length > 2 && (
                      <button type="button" className="text-rose-400 hover:text-rose-600 text-lg leading-none" onClick={() => removeLine(i)}>×</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50">
                <td colSpan={2} className="px-4 py-2 text-right text-xs font-bold uppercase text-slate-500 tracking-wide">Totaux</td>
                <td className={`text-right px-2 py-2 font-mono font-bold ${isBalanced ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrencyMad(totalDebit)}</td>
                <td className={`text-right pr-2 py-2 font-mono font-bold ${isBalanced ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrencyMad(totalCredit)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Balance indicator */}
        {totalDebit > 0 && (
          <div className={`rounded-lg p-3 text-sm font-medium ${isBalanced ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
            {isBalanced
              ? `✓ Écriture équilibrée — ${formatCurrencyMad(totalDebit)}`
              : `⚠ Déséquilibre : Débit ${formatCurrencyMad(totalDebit)} ≠ Crédit ${formatCurrencyMad(totalCredit)} (écart : ${formatCurrencyMad(Math.abs(totalDebit - totalCredit))})`
            }
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Link to="/accounting/entries" className="df-btn df-btn--ghost">Annuler</Link>
          <button
            type="submit"
            className="df-btn df-btn--primary"
            disabled={createMut.isPending}
          >
            {createMut.isPending ? 'Enregistrement…' : 'Enregistrer (brouillon)'}
          </button>
        </div>
      </form>
    </div>
  );
};
