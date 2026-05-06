import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supplierAgencyApi, type SupplierAgency, type SupplierAgencyStatus } from '@/services/subRentalApi';
import { getApiBase } from '@/services/apiClient';

const STATUS_COLORS: Record<SupplierAgencyStatus, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  inactive: 'bg-slate-100 text-slate-600',
  blacklisted: 'bg-red-100 text-red-700',
};
const STATUS_LABELS: Record<SupplierAgencyStatus, string> = {
  active: 'Actif',
  inactive: 'Inactif',
  blacklisted: 'Liste noire',
};

interface AgencyFormState {
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  ice: string;
  rc: string;
  status: SupplierAgencyStatus;
  notes: string;
}

const EMPTY_FORM: AgencyFormState = {
  name: '', contact_person: '', phone: '', email: '',
  address: '', city: '', ice: '', rc: '', status: 'active', notes: '',
};

function AgencyModal({
  agency,
  onClose,
}: {
  agency: SupplierAgency | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<AgencyFormState>(
    agency
      ? {
          name: agency.name, contact_person: agency.contact_person ?? '',
          phone: agency.phone ?? '', email: agency.email ?? '',
          address: agency.address ?? '', city: agency.city ?? '',
          ice: agency.ice ?? '', rc: agency.rc ?? '',
          status: agency.status, notes: agency.notes ?? '',
        }
      : EMPTY_FORM
  );
  const [err, setErr] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (data: Partial<SupplierAgency>) =>
      agency ? supplierAgencyApi.update(agency.id, data) : supplierAgencyApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier-agencies'] });
      onClose();
    },
    onError: (e: unknown) => setErr((e as any)?.data?.message ?? 'Erreur'),
  });

  const set = (k: keyof AgencyFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const inp = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="font-bold text-slate-900">{agency ? 'Modifier l\'agence' : 'Nouvelle agence fournisseur'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); setErr(null); mutation.mutate(form as Partial<SupplierAgency>); }}
          className="p-6 space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Nom <span className="text-red-500">*</span></label>
              <input className={inp} value={form.name} onChange={set('name')} required />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Contact</label>
              <input className={inp} value={form.contact_person} onChange={set('contact_person')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Téléphone</label>
              <input className={inp} value={form.phone} onChange={set('phone')} type="tel" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Email</label>
              <input className={inp} value={form.email} onChange={set('email')} type="email" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Ville</label>
              <input className={inp} value={form.city} onChange={set('city')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Statut</label>
              <select className={inp} value={form.status} onChange={set('status')}>
                <option value="active">Actif</option>
                <option value="inactive">Inactif</option>
                <option value="blacklisted">Liste noire</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">ICE</label>
              <input className={inp} value={form.ice} onChange={set('ice')} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">RC</label>
              <input className={inp} value={form.rc} onChange={set('rc')} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Adresse</label>
            <input className={inp} value={form.address} onChange={set('address')} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Notes</label>
            <textarea className={`${inp} resize-none`} rows={2} value={form.notes} onChange={set('notes')} />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Annuler
            </button>
            <button type="submit" disabled={mutation.isPending} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {mutation.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const SupplierAgenciesPage: React.FC = () => {
  const apiReady = !!getApiBase();
  const qc = useQueryClient();
  const [modal, setModal] = useState<SupplierAgency | null | 'new'>(null);

  const agenciesQ = useQuery({
    queryKey: ['supplier-agencies', 'list'],
    queryFn: () => supplierAgencyApi.list({ with_contracts_count: '1', per_page: '200' }),
    enabled: apiReady,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => supplierAgencyApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplier-agencies'] }),
  });

  const agencies: SupplierAgency[] = agenciesQ.data?.data ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Agences fournisseurs</h1>
          <p className="text-sm text-slate-500">Gestion des agences depuis lesquelles vous sous-louez des véhicules</p>
        </div>
        <div className="flex gap-2">
          <Link to="/fleet/sub-rentals" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            ← Sous-locations
          </Link>
          <button
            onClick={() => setModal('new')}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            + Nouvelle agence
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {agenciesQ.isLoading ? (
          <div className="p-6 text-sm text-slate-500">Chargement…</div>
        ) : agencies.length === 0 ? (
          <div className="p-6 text-sm text-slate-400">Aucune agence fournisseur trouvée.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left">Nom</th>
                <th className="px-4 py-3 text-left">Contact</th>
                <th className="px-4 py-3 text-left">Ville</th>
                <th className="px-4 py-3 text-center">Contrats actifs</th>
                <th className="px-4 py-3 text-left">Statut</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {agencies.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-semibold text-slate-800">{a.name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{a.contact_person ?? '—'}</div>
                    {a.phone && <div className="text-xs text-slate-400">{a.phone}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{a.city ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-800">
                      {(a as any).active_contracts_count ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_COLORS[a.status]}`}>
                      {STATUS_LABELS[a.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setModal(a)}
                      className="mr-2 text-xs font-semibold text-indigo-600 hover:underline"
                    >
                      Modifier
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Supprimer "${a.name}" ?`)) deleteMutation.mutate(a.id);
                      }}
                      className="text-xs font-semibold text-red-500 hover:underline"
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {(modal === 'new' || (modal !== null && modal !== 'new')) && (
        <AgencyModal
          agency={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
};
