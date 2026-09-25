import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/services/apiClient';

/** Une demande laissée sur le site public de l'agence. */
interface WebsiteLead {
  id: string;
  full_name: string;
  phone: string;
  email?: string | null;
  city?: string | null;
  vehicle_label?: string | null;
  pickup_at?: string | null;
  return_at?: string | null;
  message?: string | null;
  status: 'new' | 'contacted' | 'converted' | 'rejected';
  handling_notes?: string | null;
  created_at?: string | null;
}

const STATUS_FR: Record<WebsiteLead['status'], string> = {
  new: 'Nouvelle',
  contacted: 'Client contacté',
  converted: 'Transformée en réservation',
  rejected: 'Sans suite',
};

const STATUS_TONE: Record<WebsiteLead['status'], string> = {
  new: 'bg-rose-100 text-rose-700',
  contacted: 'bg-amber-100 text-amber-700',
  converted: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-slate-100 text-slate-500',
};

const fmtDate = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const fmtDateTime = (v?: string | null) =>
  v
    ? new Date(v).toLocaleString('fr-MA', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—';

export const WebsiteLeadsPage: React.FC = () => {
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>('');
  const [search, setSearch] = useState('');

  const leadsQ = useQuery({
    queryKey: ['website-leads', status, search],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      if (search) qs.set('search', search);
      return apiClient<{ data: WebsiteLead[]; meta?: { total: number; new_count: number } }>(
        `/v1/website-leads?${qs}`,
      );
    },
  });

  const updateM = useMutation({
    mutationFn: (vars: { id: string; status: WebsiteLead['status'] }) =>
      apiClient(`/v1/website-leads/${vars.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: vars.status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['website-leads'] }),
  });

  const leads = leadsQ.data?.data ?? [];
  const newCount = leadsQ.data?.meta?.new_count ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Demandes du site</h1>
          <p className="text-sm text-slate-500">
            Les réservations demandées depuis le site public. Rappelez le client, puis créez sa fiche et sa réservation.
          </p>
        </div>
        {newCount > 0 && (
          <span className="rounded-full bg-rose-100 px-4 py-2 text-sm font-black text-rose-700">
            {newCount} demande{newCount > 1 ? 's' : ''} à traiter
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          className="df-input min-w-[240px] flex-1"
          placeholder="Rechercher (nom, téléphone, email)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="df-input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          {(Object.keys(STATUS_FR) as WebsiteLead['status'][]).map((s) => (
            <option key={s} value={s}>{STATUS_FR[s]}</option>
          ))}
        </select>
      </div>

      {leadsQ.isLoading ? (
        <div className="df-card df-card__body text-sm text-slate-500">Chargement…</div>
      ) : leads.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center text-sm text-slate-400">
          Aucune demande pour l'instant.
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => (
            <article key={lead.id} className="df-card">
              <div className="df-card__body space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-black text-slate-900">{lead.full_name}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-black ${STATUS_TONE[lead.status]}`}>
                        {STATUS_FR[lead.status]}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                      <a className="font-bold text-indigo-700" href={`tel:${lead.phone}`}>{lead.phone}</a>
                      {lead.email && <a className="text-slate-500" href={`mailto:${lead.email}`}>{lead.email}</a>}
                      {lead.city && <span className="text-slate-500">{lead.city}</span>}
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-slate-400">
                    Reçue le {fmtDateTime(lead.created_at)}
                  </div>
                </div>

                <div className="grid gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase text-slate-400">Véhicule souhaité</div>
                    <div className="font-semibold text-slate-700">{lead.vehicle_label || 'Peu importe'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase text-slate-400">Départ</div>
                    <div className="font-semibold text-slate-700">{fmtDate(lead.pickup_at)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase text-slate-400">Retour</div>
                    <div className="font-semibold text-slate-700">{fmtDate(lead.return_at)}</div>
                  </div>
                </div>

                {lead.message && (
                  <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{lead.message}</p>
                )}

                <div className="flex flex-wrap gap-2">
                  {lead.status !== 'contacted' && (
                    <button
                      type="button"
                      className="df-btn df-btn--ghost text-xs"
                      disabled={updateM.isPending}
                      onClick={() => updateM.mutate({ id: lead.id, status: 'contacted' })}
                    >
                      Client contacté
                    </button>
                  )}
                  {lead.status !== 'converted' && (
                    <button
                      type="button"
                      className="df-btn df-btn--primary text-xs"
                      disabled={updateM.isPending}
                      onClick={() => updateM.mutate({ id: lead.id, status: 'converted' })}
                    >
                      Transformée en réservation
                    </button>
                  )}
                  {lead.status !== 'rejected' && (
                    <button
                      type="button"
                      className="df-btn df-btn--ghost text-xs text-rose-600"
                      disabled={updateM.isPending}
                      onClick={() => updateM.mutate({ id: lead.id, status: 'rejected' })}
                    >
                      Sans suite
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

export default WebsiteLeadsPage;
