import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { opsApi } from '@/services/opsApi';

interface Driver {
  id: string;
  driver_type: string;
  first_name: string;
  last_name: string;
  phone?: string | null;
  email?: string | null;
  cin_passport?: string | null;
  license_number?: string | null;
  license_expiry?: string | null;
  relationship?: string | null;
  is_contract_signer?: boolean;
  is_financially_responsible?: boolean;
  status?: string;
}

interface Props {
  reservationId: string;
  drivers: Driver[];
  onRefresh: () => void;
}

const emptyForm = (): Record<string, string | boolean> => ({
  driver_type: 'secondary',
  first_name: '',
  last_name: '',
  phone: '',
  email: '',
  cin_passport: '',
  license_number: '',
  license_expiry: '',
  relationship: '',
  is_contract_signer: false,
  is_financially_responsible: false,
});

const TabDrivers: React.FC<Props> = ({ reservationId, drivers, onRefresh }) => {
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const storeM = useMutation({
    mutationFn: () => opsApi.storeDriver(reservationId, form),
    onSuccess: () => { onRefresh(); setFormOpen(false); setForm(emptyForm()); },
  });

  const updateM = useMutation({
    mutationFn: () => opsApi.updateDriver(reservationId, editId!, form),
    onSuccess: () => { onRefresh(); setEditId(null); setForm(emptyForm()); },
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => opsApi.destroyDriver(reservationId, id),
    onSuccess: onRefresh,
  });

  const openEdit = (d: Driver) => {
    setEditId(d.id);
    setForm({
      driver_type: d.driver_type,
      first_name: d.first_name,
      last_name: d.last_name,
      phone: d.phone ?? '',
      email: d.email ?? '',
      cin_passport: d.cin_passport ?? '',
      license_number: d.license_number ?? '',
      license_expiry: d.license_expiry?.slice(0, 10) ?? '',
      relationship: d.relationship ?? '',
      is_contract_signer: !!d.is_contract_signer,
      is_financially_responsible: !!d.is_financially_responsible,
    });
    setFormOpen(true);
  };

  const primary = drivers.filter((d) => d.driver_type === 'primary');
  const secondary = drivers.filter((d) => d.driver_type === 'secondary');

  return (
    <div className="space-y-6">
      {/* Primary driver */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Conducteur principal</h3>
          {primary.length === 0 && (
            <button
              type="button"
              onClick={() => { setForm({ ...emptyForm(), driver_type: 'primary' }); setEditId(null); setFormOpen(true); }}
              className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white hover:bg-indigo-700"
            >
              + Ajouter conducteur principal
            </button>
          )}
        </div>
        {primary.map((d) => (
          <DriverCard key={d.id} driver={d} onEdit={() => openEdit(d)} onDelete={() => deleteM.mutate(d.id)} deleting={deleteM.isPending} />
        ))}
        {primary.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
            Aucun conducteur principal ajouté
          </div>
        )}
      </div>

      {/* Secondary drivers */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Conducteurs additionnels</h3>
          <button
            type="button"
            onClick={() => { setForm(emptyForm()); setEditId(null); setFormOpen(true); }}
            className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-black text-white hover:bg-slate-900"
          >
            + Ajouter conducteur
          </button>
        </div>
        {secondary.length > 0 ? (
          <div className="rounded-xl border border-slate-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-2.5 text-left">Nom</th>
                  <th className="px-4 py-2.5 text-left">Téléphone</th>
                  <th className="px-4 py-2.5 text-left">Permis</th>
                  <th className="px-4 py-2.5 text-left">Relation</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {secondary.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-800">{d.first_name} {d.last_name}</td>
                    <td className="px-4 py-3 text-slate-600">{d.phone || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{d.license_number || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{d.relationship || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openEdit(d)} className="text-indigo-600 hover:underline text-xs font-bold mr-3">Modifier</button>
                      <button onClick={() => deleteM.mutate(d.id)} className="text-rose-600 hover:underline text-xs font-bold">Supprimer</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
            Aucun conducteur additionnel
          </div>
        )}
      </div>

      {/* Driver form modal */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setFormOpen(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-4 text-sm font-black text-slate-900">
              {editId ? 'Modifier conducteur' : 'Ajouter conducteur'}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <input className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Prénom *" value={form.first_name as string} onChange={(e) => set('first_name', e.target.value)} />
              <input className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Nom *" value={form.last_name as string} onChange={(e) => set('last_name', e.target.value)} />
              <input className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Téléphone" value={form.phone as string} onChange={(e) => set('phone', e.target.value)} />
              <input className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Email" value={form.email as string} onChange={(e) => set('email', e.target.value)} />
              <input className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="CIN / Passeport" value={form.cin_passport as string} onChange={(e) => set('cin_passport', e.target.value)} />
              <input className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="N° Permis" value={form.license_number as string} onChange={(e) => set('license_number', e.target.value)} />
              <div>
                <label className="mb-1 block text-[10px] font-bold text-slate-400">Expiration permis</label>
                <input type="date" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" value={form.license_expiry as string} onChange={(e) => set('license_expiry', e.target.value)} />
              </div>
              <input className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Relation (conjoint, ami…)" value={form.relationship as string} onChange={(e) => set('relationship', e.target.value)} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_contract_signer as boolean} onChange={(e) => set('is_contract_signer', e.target.checked)} className="rounded" />
                Signataire du contrat
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_financially_responsible as boolean} onChange={(e) => set('is_financially_responsible', e.target.checked)} className="rounded" />
                Responsable financier
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setFormOpen(false); setEditId(null); }} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600">Annuler</button>
              <button
                onClick={() => editId ? updateM.mutate() : storeM.mutate()}
                disabled={storeM.isPending || updateM.isPending || !(form.first_name as string).trim() || !(form.last_name as string).trim()}
                className="rounded-xl bg-indigo-600 px-5 py-2.5 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {(storeM.isPending || updateM.isPending) ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function DriverCard({ driver, onEdit, onDelete, deleting }: { driver: Driver; onEdit: () => void; onDelete: () => void; deleting: boolean }) {
  return (
    <div className="rounded-xl border border-slate-100 p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm font-black text-slate-900">{driver.first_name} {driver.last_name}</div>
          <div className="mt-1 flex flex-wrap gap-2">
            {driver.is_contract_signer && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">Signataire</span>}
            {driver.is_financially_responsible && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">Responsable financier</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onEdit} className="text-xs font-bold text-indigo-600 hover:underline">Modifier</button>
          <button onClick={onDelete} disabled={deleting} className="text-xs font-bold text-rose-600 hover:underline disabled:opacity-50">Supprimer</button>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
        <div><span className="text-slate-400">Tél :</span> <span className="font-semibold text-slate-700">{driver.phone || '—'}</span></div>
        <div><span className="text-slate-400">Email :</span> <span className="font-semibold text-slate-700">{driver.email || '—'}</span></div>
        <div><span className="text-slate-400">CIN/Pass :</span> <span className="font-semibold text-slate-700">{driver.cin_passport || '—'}</span></div>
        <div><span className="text-slate-400">Permis :</span> <span className="font-semibold text-slate-700">{driver.license_number || '—'}</span></div>
        <div><span className="text-slate-400">Exp. permis :</span> <span className="font-semibold text-slate-700">{driver.license_expiry?.slice(0, 10) || '—'}</span></div>
      </dl>
    </div>
  );
}

export default TabDrivers;
