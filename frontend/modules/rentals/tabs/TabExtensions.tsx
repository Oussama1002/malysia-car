import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { opsApi } from '@/services/opsApi';
import { DateField } from '@/modules/shared/components/DateField';
import { Modal } from '@/modules/shared/components/Modal';

interface Extension {
  id: string;
  old_end_at: string;
  new_end_at: string;
  additional_amount: number;
  status: string;
  requested_at?: string | null;
  resolved_at?: string | null;
  notes?: string | null;
}

interface Props {
  reservationId: string;
  extensions: Extension[];
  /** Contexte réservation (début/fin/durée/tarif) pour l'auto-calcul. */
  reservation?: {
    desired_start_at?: string | null;
    desired_end_at?: string | null;
    daily_rate?: number | null;
  } | null;
  /** Montant déjà facturé — permet d'afficher le nouveau total après prolongation. */
  currentTotal?: number;
  /** Tarif/jour calculé (ex. depuis le contrat quand la réservation ne porte pas de daily_rate). */
  fallbackDailyRate?: number;
  onRefresh: () => void;
  /** Masque l'historique quand le formulaire est rendu dans un drawer. */
  compact?: boolean;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  requested: { label: 'Demandée', cls: 'bg-amber-100 text-amber-700' },
  approved:  { label: 'Approuvée', cls: 'bg-emerald-100 text-emerald-700' },
  rejected:  { label: 'Rejetée', cls: 'bg-rose-100 text-rose-700' },
  applied:   { label: 'Appliquée', cls: 'bg-indigo-100 text-indigo-700' },
};

const fmtDate = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtMad = (v: number) => `${v.toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} MAD`;

const TabExtensions: React.FC<Props> = ({
  reservationId,
  extensions,
  reservation,
  currentTotal = 0,
  fallbackDailyRate = 0,
  onRefresh,
  compact = false,
}) => {
  const [open, setOpen] = useState(compact);
  const [form, setForm] = useState({ new_end_at: '', additional_amount: '', notes: '' });

  const start = reservation?.desired_start_at ? new Date(reservation.desired_start_at) : null;
  const end = reservation?.desired_end_at ? new Date(reservation.desired_end_at) : null;
  const totalDays = start && end
    ? Math.max(0, Math.ceil((end.getTime() - start.getTime()) / 86_400_000))
    : 0;
  // Tarif/jour fiable : la valeur backend `totals.daily_rate` sort parfois
  // égale au MONTANT TOTAL quand la réservation couvre un seul jour
  // (contract_total / 1 = contract_total). On préfère donc dériver le
  // tarif journalier localement à partir du total courant et de la durée,
  // puis on retombe sur le daily_rate explicite de la réservation, puis
  // sur la valeur fournie en fallback. L'auto-calcul ne peut plus
  // multiplier le total par les jours.
  const derivedDaily = (currentTotal > 0 && totalDays > 0)
    ? currentTotal / totalDays
    : 0;
  const dailyRate = derivedDaily
    || Number(reservation?.daily_rate ?? 0)
    || Number(fallbackDailyRate)
    || 0;

  // Auto-calc : à chaque changement de new_end_at ou daily_rate on ré-estime
  // le montant additionnel (jours en plus × tarif/jour). L'agent peut
  // toujours corriger à la main.
  const addedDays = useMemo(() => {
    if (!form.new_end_at || !end) return 0;
    const ne = new Date(form.new_end_at);
    if (Number.isNaN(ne.getTime())) return 0;
    const d = Math.ceil((ne.getTime() - end.getTime()) / 86_400_000);
    return d > 0 ? d : 0;
  }, [form.new_end_at, end]);
  const autoAdditional = addedDays * dailyRate;

  // Pré-remplit le montant tant que l'agent n'a pas tapé une valeur manuelle.
  // userEditedRef garde la trace d'une saisie explicite pour ne pas écraser.
  const userEditedRef = useRef(false);
  useEffect(() => {
    if (userEditedRef.current) return;
    const next = autoAdditional > 0 ? String(autoAdditional) : '';
    setForm((s) => (s.additional_amount === next ? s : { ...s, additional_amount: next }));
  }, [autoAdditional]);

  const typedAdditional = Number(form.additional_amount);
  const effectiveAdditional = form.additional_amount !== ''
    ? (Number.isFinite(typedAdditional) ? typedAdditional : 0)
    : autoAdditional;
  const newTotal = currentTotal + effectiveAdditional;

  const extM = useMutation({
    mutationFn: () =>
      opsApi.requestExtension(reservationId, {
        new_end_at: form.new_end_at,
        additional_amount: effectiveAdditional,
        notes: form.notes || undefined,
      }),
    onSuccess: () => {
      onRefresh();
      userEditedRef.current = false;
      setForm({ new_end_at: '', additional_amount: '', notes: '' });
      if (!compact) setOpen(false);
    },
  });

  // Formulaire extrait pour pouvoir le rendre inline (drawer / compact)
  // ou dans la Modal selon le mode.
  const formBody = (
    <div className="space-y-4">
      {/* Contexte réservation — lecture seule, référence pour l'agent. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <ContextTile label="Date début" value={fmtDate(reservation?.desired_start_at)} />
        <ContextTile label="Date retour" value={fmtDate(reservation?.desired_end_at)} />
        <ContextTile label="Durée" value={totalDays > 0 ? `${totalDays} j` : '—'} />
        <ContextTile label="Tarif / jour" value={dailyRate > 0 ? fmtMad(dailyRate) : '—'} />
      </div>
      {currentTotal > 0 && (
        <ContextTile label="Montant total actuel" value={fmtMad(currentTotal)} />
      )}

      <div>
        <label className="mb-1 block text-[10px] font-bold text-slate-400">Nouvelle date de retour</label>
        <DateField withTime
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
          value={form.new_end_at}
          onChange={(dfValue) => setForm((s) => ({ ...s, new_end_at: dfValue }))}
        />
        {addedDays > 0 && (
          <div className="mt-1 text-[11px] font-semibold text-indigo-600">
            + {addedDays} jour{addedDays > 1 ? 's' : ''}
          </div>
        )}
      </div>

      <div>
        <label className="mb-1 block text-[10px] font-bold text-slate-400">
          Montant additionnel (MAD)
          {autoAdditional > 0 && (
            <span className="ml-2 font-normal text-slate-500">
              — auto : {fmtMad(autoAdditional)} ({addedDays} j × {fmtMad(dailyRate)})
            </span>
          )}
        </label>
        <input
          type="number"
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
          placeholder={autoAdditional ? String(autoAdditional) : '0'}
          value={form.additional_amount}
          onChange={(e) => {
            userEditedRef.current = true;
            setForm((s) => ({ ...s, additional_amount: e.target.value }));
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <ContextTile label="Montant ajouté" value={fmtMad(effectiveAdditional)} tone="indigo" />
        <ContextTile label="Nouveau total" value={fmtMad(newTotal)} tone="emerald" />
      </div>

      <div>
        <label className="mb-1 block text-[10px] font-bold text-slate-400">Raison</label>
        <input
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
          placeholder="Motif de la prolongation"
          value={form.notes}
          onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
        />
      </div>

      <div className="flex justify-end gap-2">
        {!compact && (
          <button type="button" className="df-btn df-btn--ghost" onClick={() => setOpen(false)}>Annuler</button>
        )}
        <button
          onClick={() => extM.mutate()}
          disabled={extM.isPending || !form.new_end_at}
          className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-black text-white hover:bg-amber-700 disabled:opacity-50"
        >
          {extM.isPending ? 'Enregistrement…' : 'Appliquer prolongation'}
        </button>
      </div>
    </div>
  );

  if (compact) {
    return (
      <div className="space-y-6">
        {formBody}
        {extensions.length > 0 && (
          <HistoryTable extensions={extensions} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* History table */}
      <div>
        <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">
          Historique des prolongations ({extensions.length})
        </h3>
        {extensions.length > 0 ? (
          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5 text-left">Date demande</th>
                  <th className="px-4 py-2.5 text-left">Ancien retour</th>
                  <th className="px-4 py-2.5 text-left">Nouveau retour</th>
                  <th className="px-4 py-2.5 text-right">Montant</th>
                  <th className="px-4 py-2.5 text-center">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {extensions.map((ext) => {
                  const badge = STATUS_BADGE[ext.status] ?? { label: ext.status, cls: 'bg-slate-100 text-slate-600' };
                  return (
                    <tr key={ext.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-600">{fmtDate(ext.requested_at)}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{fmtDate(ext.old_end_at)}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">{fmtDate(ext.new_end_at)}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800">{fmtMad(Number(ext.additional_amount))}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
            Aucune prolongation demandée
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-black text-white hover:bg-amber-700"
        >
          + Nouvelle prolongation
        </button>
      </div>

      {/* Saisie en popup : la page reste lisible, le formulaire ne la coupe pas. */}
      <Modal open={open} title="Nouvelle prolongation" onClose={() => setOpen(false)} widthClass="max-w-xl">
        {formBody}
      </Modal>

    </div>
  );
};

const ContextTile: React.FC<{ label: string; value: string; tone?: 'indigo' | 'emerald' }> = ({ label, value, tone }) => (
  <div className={`rounded-lg px-3 py-2 ${
    tone === 'indigo' ? 'bg-indigo-50' : tone === 'emerald' ? 'bg-emerald-50' : 'bg-slate-50'
  }`}>
    <div className={`text-[10px] font-bold uppercase tracking-wide ${
      tone === 'indigo' ? 'text-indigo-500' : tone === 'emerald' ? 'text-emerald-600' : 'text-slate-400'
    }`}>{label}</div>
    <div className={`mt-0.5 text-sm font-black ${
      tone === 'indigo' ? 'text-indigo-700' : tone === 'emerald' ? 'text-emerald-700' : 'text-slate-800'
    }`}>{value}</div>
  </div>
);

const HistoryTable: React.FC<{ extensions: Extension[] }> = ({ extensions }) => (
  <div>
    <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-slate-400">
      Historique des prolongations ({extensions.length})
    </h3>
    <div className="rounded-xl border border-slate-100 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
          <tr>
            <th className="px-4 py-2.5 text-left">Date demande</th>
            <th className="px-4 py-2.5 text-left">Ancien retour</th>
            <th className="px-4 py-2.5 text-left">Nouveau retour</th>
            <th className="px-4 py-2.5 text-right">Montant</th>
            <th className="px-4 py-2.5 text-center">Statut</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {extensions.map((ext) => {
            const badge = STATUS_BADGE[ext.status] ?? { label: ext.status, cls: 'bg-slate-100 text-slate-600' };
            return (
              <tr key={ext.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-600">{fmtDate(ext.requested_at)}</td>
                <td className="px-4 py-3 font-semibold text-slate-700">{fmtDate(ext.old_end_at)}</td>
                <td className="px-4 py-3 font-bold text-slate-900">{fmtDate(ext.new_end_at)}</td>
                <td className="px-4 py-3 text-right font-bold text-slate-800">{fmtMad(Number(ext.additional_amount))}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                    {badge.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>
);

export default TabExtensions;
