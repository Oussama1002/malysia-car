import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { opsApi } from '@/services/opsApi';

interface Damage {
  id: string;
  damage_type: string;
  description?: string | null;
  estimated_cost?: number | null;
  final_cost?: number | null;
  responsible_party?: string | null;
  status?: string | null;
  created_at?: string | null;
}

interface Props {
  reservationId: string;
  damages: Damage[];
  onRefresh: () => void;
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  open:     { label: 'Signalé', cls: 'bg-amber-100 text-amber-700' },
  assessed: { label: 'Validé', cls: 'bg-indigo-100 text-indigo-700' },
  invoiced: { label: 'Facturé', cls: 'bg-violet-100 text-violet-700' },
  settled:  { label: 'Réparé', cls: 'bg-emerald-100 text-emerald-700' },
  waived:   { label: 'Annulé', cls: 'bg-slate-100 text-slate-500' },
};

const ZONES = [
  'Pare-chocs avant', 'Pare-chocs arrière', 'Aile avant gauche', 'Aile avant droite',
  'Portière avant gauche', 'Portière avant droite', 'Portière arrière gauche', 'Portière arrière droite',
  'Aile arrière gauche', 'Aile arrière droite', 'Capot', 'Toit', 'Coffre',
  'Pare-brise', 'Lunette arrière', 'Rétroviseur gauche', 'Rétroviseur droit',
  'Intérieur', 'Mécanique', 'Autre',
];

const fmtMad = (v: number) => `${v.toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} MAD`;

const TabDamages: React.FC<Props> = ({ reservationId, damages, onRefresh }) => {
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    damage_type: 'body',
    description: '',
    estimated_cost: '',
    responsible_party: 'customer',
  });

  const damageM = useMutation({
    mutationFn: () =>
      opsApi.damageReport(reservationId, {
        damage_type: form.damage_type,
        description: form.description || undefined,
        estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : 0,
        responsible_party: form.responsible_party,
      }),
    onSuccess: () => {
      onRefresh();
      setFormOpen(false);
      setForm({ damage_type: 'body', description: '', estimated_cost: '', responsible_party: 'customer' });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">
          Rapports de dommages ({damages.length})
        </h3>
        <button
          onClick={() => setFormOpen(true)}
          className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-black text-white hover:bg-rose-700"
        >
          + Signaler un dommage
        </button>
      </div>

      {damages.length > 0 ? (
        <div className="space-y-3">
          {damages.map((d) => {
            const badge = STATUS_BADGE[d.status ?? 'open'] ?? { label: d.status ?? '—', cls: 'bg-slate-100 text-slate-600' };
            const cost = d.final_cost ?? d.estimated_cost ?? 0;
            return (
              <div key={d.id} className="rounded-xl border border-slate-100 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-slate-800 capitalize">{d.damage_type}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${badge.cls}`}>{badge.label}</span>
                    </div>
                    {d.description && <p className="mt-1 text-xs text-slate-600">{d.description}</p>}
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-black text-slate-800">{fmtMad(Number(cost))}</div>
                    <div className="text-[10px] text-slate-400 capitalize">{d.responsible_party ?? 'client'}</div>
                  </div>
                </div>
                <div className="mt-2 text-[10px] text-slate-400">
                  {d.created_at ? new Date(d.created_at).toLocaleString('fr-MA') : '—'}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
          Aucun dommage signalé
        </div>
      )}

      {/* New damage form */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setFormOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-sm font-black text-slate-900">Signaler un dommage</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[10px] font-bold text-slate-400">Zone du véhicule</label>
                <select
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  value={form.damage_type}
                  onChange={(e) => setForm((s) => ({ ...s, damage_type: e.target.value }))}
                >
                  {ZONES.map((z) => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold text-slate-400">Description</label>
                <textarea
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  rows={3}
                  placeholder="Décrivez le dommage…"
                  value={form.description}
                  onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-slate-400">Coût estimé (MAD)</label>
                  <input
                    type="number"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    placeholder="0"
                    value={form.estimated_cost}
                    onChange={(e) => setForm((s) => ({ ...s, estimated_cost: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-slate-400">Partie responsable</label>
                  <select
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    value={form.responsible_party}
                    onChange={(e) => setForm((s) => ({ ...s, responsible_party: e.target.value }))}
                  >
                    <option value="customer">Client</option>
                    <option value="company">Société</option>
                    <option value="insurance">Assurance</option>
                    <option value="third_party">Tiers</option>
                  </select>
                </div>
              </div>

              {/* Photo placeholder */}
              <div>
                <label className="mb-1 block text-[10px] font-bold text-slate-400">Photos</label>
                <div className="flex gap-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex h-20 w-20 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 text-slate-300 hover:border-slate-300 cursor-pointer">
                      📷
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setFormOpen(false)} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600">Annuler</button>
              <button
                onClick={() => damageM.mutate()}
                disabled={damageM.isPending}
                className="rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-black text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {damageM.isPending ? 'Enregistrement…' : 'Enregistrer dommage'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TabDamages;
