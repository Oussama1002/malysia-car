import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { opsApi } from '@/services/opsApi';
import { DateField } from '@/modules/shared/components/DateField';
import { ScanProofLink } from '@/modules/shared/components/ScanProofLink';
import { useChequeDuplicate } from '@/modules/shared/hooks/useChequeDuplicate';

export interface Deposit {
  id: string;
  amount: number | string;
  method: string;
  check_number?: string | null;
  check_bank?: string | null;
  check_date?: string | null;
  status: 'held' | 'returned' | 'retained';
  notes?: string | null;
  settlement_notes?: string | null;
  collected_at?: string | null;
  settled_at?: string | null;
}

const METHOD_FR: Record<string, string> = {
  cash: 'Espèces',
  cheque: 'Chèque',
  bank_transfer: 'Virement',
  card: 'Carte',
  other: 'Autre',
};

const STATUS_FR: Record<string, { label: string; cls: string }> = {
  held: { label: 'Détenue', cls: 'bg-indigo-100 text-indigo-700' },
  returned: { label: 'Restituée au client', cls: 'bg-emerald-100 text-emerald-700' },
  retained: { label: 'Retenue par l\'agence', cls: 'bg-rose-100 text-rose-700' },
};

const fmtMad = (v: number | string) =>
  `${Number(v).toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} MAD`;

export function useDeposits(reservationId: string) {
  return useQuery({
    queryKey: ['reservation', reservationId, 'deposits'],
    queryFn: () => opsApi.deposits(reservationId) as Promise<Deposit[]>,
    enabled: !!reservationId,
  });
}

/**
 * Franchise d'assurance. `mode` decides what the agent can do here:
 * 'collect' at the check-out, 'settle' at the check-in.
 */
export const FranchisePanel: React.FC<{
  reservationId: string;
  dueAmount?: number;
  mode: 'collect' | 'settle';
  damagesCount?: number;
}> = ({ reservationId, dueAmount = 0, mode, damagesCount = 0 }) => {
  const qc = useQueryClient();
  const depositsQ = useDeposits(reservationId);
  const deposits = depositsQ.data ?? [];
  const held = deposits.filter((d) => d.status === 'held');

  const [form, setForm] = useState({
    amount: dueAmount ? String(dueAmount) : '',
    method: 'cheque',
    check_number: '',
    check_bank: '',
    check_date: '',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [vehicleOk, setVehicleOk] = useState(false);
  const [retainOpen, setRetainOpen] = useState(false);
  const [retainReason, setRetainReason] = useState('');
  const chequeAlreadyUsed = useChequeDuplicate(
    form.method === 'cheque' ? form.check_number : null,
    form.check_bank,
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['reservation', reservationId, 'deposits'] });
    qc.invalidateQueries({ queryKey: ['reservation', reservationId] });
  };

  const createM = useMutation({
    mutationFn: () =>
      opsApi.createDeposit(reservationId, {
        amount: Number(form.amount),
        method: form.method,
        check_number: form.method === 'cheque' ? form.check_number || undefined : undefined,
        check_bank: form.method === 'cheque' ? form.check_bank || undefined : undefined,
        check_date: form.method === 'cheque' ? form.check_date || undefined : undefined,
        notes: form.notes || undefined,
      }),
    onSuccess: () => { setError(null); refresh(); },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Erreur'),
  });

  const releaseM = useMutation({
    mutationFn: (id: string) => opsApi.releaseDeposit(id),
    onSuccess: () => { setError(null); refresh(); },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Erreur'),
  });

  const retainM = useMutation({
    mutationFn: (id: string) => opsApi.retainDeposit(id, retainReason),
    onSuccess: () => { setError(null); setRetainOpen(false); setRetainReason(''); refresh(); },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Erreur'),
  });

  return (
    <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-widest text-indigo-500">Franchise d'assurance</h3>
        <span className="text-[10px] font-bold text-indigo-400">Garantie — n'est pas un paiement</span>
      </div>

      {depositsQ.isLoading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : (
        <>
          {deposits.length > 0 && (
            <div className="mb-4 space-y-2">
              {deposits.map((d) => {
                const badge = STATUS_FR[d.status] ?? { label: d.status, cls: 'bg-slate-100 text-slate-600' };
                return (
                  <div key={d.id} className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm font-black text-slate-800">
                        {fmtMad(d.amount)} · {METHOD_FR[d.method] ?? d.method}
                        {d.check_number ? <span className="ms-2 font-mono text-xs text-slate-500">n° {d.check_number}</span> : null}
                        {d.check_bank ? <span className="ms-1 text-xs text-slate-500">({d.check_bank})</span> : null}
                      </div>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${badge.cls}`}>{badge.label}</span>
                    </div>
                    <div className="mt-1"><ScanProofLink entityType="contract_deposit" entityId={d.id} /></div>
                    {d.settlement_notes && (
                      <div className="mt-1 text-xs text-slate-500">{d.settlement_notes}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {error && (
            <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</div>
          )}

          {/* ── Encaissement, au départ ── */}
          {mode === 'collect' && held.length === 0 && (
            <>
              {dueAmount > 0 && (
                <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                  Franchise de {fmtMad(dueAmount)} prévue au contrat — le véhicule ne peut pas être remis tant qu'elle n'est pas encaissée.
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-slate-400">Montant (MAD) *</label>
                  <input
                    type="number" step="0.01" min="0.01"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    value={form.amount}
                    onChange={(e) => setForm((s) => ({ ...s, amount: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-slate-400">Moyen *</label>
                  <select
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    value={form.method}
                    onChange={(e) => setForm((s) => ({ ...s, method: e.target.value }))}
                  >
                    {Object.entries(METHOD_FR).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </div>
                {form.method === 'cheque' && (
                  <>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold text-slate-400">N° chèque</label>
                      <input
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                        value={form.check_number}
                        onChange={(e) => setForm((s) => ({ ...s, check_number: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold text-slate-400">Banque</label>
                      <input
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                        value={form.check_bank}
                        onChange={(e) => setForm((s) => ({ ...s, check_bank: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold text-slate-400">Date du chèque</label>
                      <DateField
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                        value={form.check_date}
                        onChange={(v) => setForm((s) => ({ ...s, check_date: v }))}
                      />
                    </div>
                  </>
                )}
              </div>
              {chequeAlreadyUsed && (
                <div className="mt-3 rounded-xl border-2 border-rose-300 bg-rose-50 px-3.5 py-3 text-xs font-bold text-rose-800">
                  ⚠ {chequeAlreadyUsed}
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => {
                    if (!Number(form.amount)) { setError('Renseignez le montant de la franchise.'); return; }
                    createM.mutate();
                  }}
                  disabled={createM.isPending || !!chequeAlreadyUsed}
                  className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {createM.isPending ? 'Enregistrement…' : 'Enregistrer la franchise'}
                </button>
              </div>
            </>
          )}

          {mode === 'collect' && held.length > 0 && (
            <p className="text-sm font-semibold text-emerald-700">
              Franchise détenue — le véhicule peut être remis au client.
            </p>
          )}

          {/* ── Restitution, au retour ── */}
          {mode === 'settle' && held.length > 0 && (
            <div className="space-y-3">
              {damagesCount > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
                  {damagesCount} dommage{damagesCount > 1 ? 's' : ''} constaté{damagesCount > 1 ? 's' : ''} sur ce retour — vérifiez les photos avant de restituer la franchise.
                </div>
              )}
              <label className="flex items-start gap-2.5 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={vehicleOk}
                  onChange={(e) => setVehicleOk(e.target.checked)}
                />
                <span>
                  J'ai vérifié les photos de retour, le véhicule est en bon état :
                  la franchise doit être restituée au client.
                </span>
              </label>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRetainOpen((v) => !v)}
                  className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50"
                >
                  Retenir la franchise
                </button>
                <button
                  onClick={() => held.forEach((d) => releaseM.mutate(d.id))}
                  disabled={!vehicleOk || releaseM.isPending}
                  className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  {releaseM.isPending ? 'Restitution…' : 'Restituer la franchise'}
                </button>
              </div>

              {retainOpen && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                  <label className="mb-1 block text-[10px] font-bold text-rose-700">Motif de la retenue *</label>
                  <textarea
                    className="w-full rounded-xl border border-rose-200 px-3 py-2 text-sm"
                    rows={2}
                    placeholder="Dommage constaté, carburant manquant, amende…"
                    value={retainReason}
                    onChange={(e) => setRetainReason(e.target.value)}
                  />
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => {
                        if (!retainReason.trim()) { setError('Indiquez le motif de la retenue.'); return; }
                        held.forEach((d) => retainM.mutate(d.id));
                      }}
                      disabled={retainM.isPending}
                      className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-black text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      {retainM.isPending ? 'Enregistrement…' : 'Confirmer la retenue'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === 'settle' && held.length === 0 && deposits.length === 0 && (
            <p className="text-sm text-slate-500">Aucune franchise encaissée sur cette réservation.</p>
          )}
        </>
      )}
    </div>
  );
};

export default FranchisePanel;
