import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { opsApi } from '@/services/opsApi';

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
  onRefresh: () => void;
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

const TabExtensions: React.FC<Props> = ({ reservationId, extensions, onRefresh }) => {
  const [form, setForm] = useState({ new_end_at: '', additional_amount: '', notes: '' });

  const extM = useMutation({
    mutationFn: () =>
      opsApi.requestExtension(reservationId, {
        new_end_at: form.new_end_at,
        additional_amount: form.additional_amount ? Number(form.additional_amount) : 0,
        notes: form.notes || undefined,
      }),
    onSuccess: () => {
      onRefresh();
      setForm({ new_end_at: '', additional_amount: '', notes: '' });
    },
  });

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

      {/* New extension form */}
      <div className="rounded-xl border border-slate-100 p-5">
        <h3 className="mb-4 text-xs font-black uppercase tracking-widest text-slate-400">Nouvelle prolongation</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-[10px] font-bold text-slate-400">Nouvelle date de retour</label>
            <input
              type="datetime-local"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              value={form.new_end_at}
              onChange={(e) => setForm((s) => ({ ...s, new_end_at: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold text-slate-400">Montant additionnel (MAD)</label>
            <input
              type="number"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              placeholder="0"
              value={form.additional_amount}
              onChange={(e) => setForm((s) => ({ ...s, additional_amount: e.target.value }))}
            />
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
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => extM.mutate()}
            disabled={extM.isPending || !form.new_end_at}
            className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-black text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {extM.isPending ? 'Enregistrement…' : 'Appliquer prolongation'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TabExtensions;
