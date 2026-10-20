import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/services/apiClient';

/** Payload passé via `location.state` à `/reservations` pour pré-remplir la
 *  nouvelle réservation à partir d'une demande du site. */
export interface FromLeadNavState {
  id: string;
  full_name: string;
  phone: string;
  email?: string | null;
  vehicle_id?: string | null;
  vehicle_label?: string | null;
  pickup_at?: string | null;
  return_at?: string | null;
  /** Tarif / jour affiché au client sur la landing (le plus bas palier
   *  disponible, sinon le daily_rental_price du véhicule). Pré-remplit la
   *  modale « Nouvelle réservation ». */
  daily_rate?: number | null;
}

/** Une demande laissée sur le site public de l'agence. */
interface WebsiteLead {
  id: string;
  full_name: string;
  phone: string;
  email?: string | null;
  city?: string | null;
  vehicle_label?: string | null;
  /** Véhicule rattaché quand le visiteur a cliqué sur une fiche précise ;
   *  sert à afficher la matricule de la voiture dans la carte. */
  vehicle?: {
    id: string;
    registration_number?: string | null;
    /** Tarifs renseignés côté fleet — repris pour pré-remplir la future
     *  réservation (plus petit palier > tarif journalier). */
    daily_rental_price?: number | string | null;
    rental_price_tiers?: Record<string, number | string> | null;
  } | null;
  /** Résultat de la vérif de disponibilité sur la période souhaitée.
   *  `null` quand le véhicule ou les dates ne sont pas renseignés. */
  availability?: {
    available: boolean | null;
    reasons?: string[];
    messages?: Record<string, string>;
  } | null;
  pickup_at?: string | null;
  return_at?: string | null;
  message?: string | null;
  /** Tarif / jour exact affiché au client sur la landing au moment du
   *  submit. Priorité absolue sur un recalcul à partir de la fleet. */
  quoted_daily_rate?: number | string | null;
  status: 'new' | 'contacted' | 'converted' | 'rejected';
  handling_notes?: string | null;
  handled_at?: string | null;
  handler?: {
    id: string;
    name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  } | null;
  created_at?: string | null;
}

const agentDisplayName = (u: NonNullable<WebsiteLead['handler']>) =>
  (u.name && u.name.trim())
    || `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim()
    || u.email
    || '—';

const agentInitials = (u: NonNullable<WebsiteLead['handler']>) => {
  const name = agentDisplayName(u);
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || '?';
};

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

const pad2 = (n: number) => (n < 10 ? '0' + n : String(n));

// Formatage déterministe JJ/MM/AAAA : certains navigateurs (notamment via
// locale 'fr-MA') retombent sur en-US et affichent MM/JJ/AAAA — on fabrique
// nous-mêmes la chaîne pour éviter toute confusion.
const fmtDate = (v?: string | null): string => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
};

const fmtDateTime = (v?: string | null): string => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return `${fmtDate(v)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

interface MissingPriceVehicle {
  id: string;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  registration?: string | null;
  fuel?: string | null;
  transmission?: string | null;
  categorie?: string | null;
  /** Chemin relatif renvoyé par l'API (ex. `/api/v1/files/<uuid>`). */
  photo_url?: string | null;
  /** Prix /jour par palier (clés : tier_1_2, tier_3_6, …). */
  rental_price_tiers?: Record<string, number> | null;
}

interface TierSchemaItem {
  key: string;
  min_days: number;
  max_days: number | null;
  label: string;
}

/** Les 5 paliers prédéfinis — doivent rester alignés avec `Vehicle::RENTAL_PRICE_TIERS`
 *  côté backend. Le fallback local sert si l'API ne renvoie pas la grille. */
const DEFAULT_TIER_SCHEMA: TierSchemaItem[] = [
  { key: 'tier_1_2',   min_days: 1,  max_days: 2,    label: '1-2 jours' },
  { key: 'tier_3_6',   min_days: 3,  max_days: 6,    label: '3-6 jours' },
  { key: 'tier_7_14',  min_days: 7,  max_days: 14,   label: '7-14 jours' },
  { key: 'tier_15_29', min_days: 15, max_days: 29,   label: '15-29 jours' },
  { key: 'tier_30',    min_days: 30, max_days: null, label: '30 jours et +' },
];

/** URL absolue de la photo à partir du chemin relatif renvoyé par l'API. */
function photoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:/i.test(path)) return path;
  const base = (import.meta as unknown as { env?: { VITE_API_BASE?: string } })
    .env?.VITE_API_BASE?.replace(/\/+$/, '');
  if (!base) return path;
  // `photo_url` arrive en `/api/v1/files/...` alors que `VITE_API_BASE` est
  // deja l'origine + `/api` : on retire le prefixe pour eviter le `/api/api`.
  const normalized = path.replace(/^\/api\//, '/');
  return base + normalized;
}

type TabKey = 'leads' | 'pricing';

export const WebsiteLeadsPage: React.FC = () => {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [tab, setTab] = useState<TabKey>('leads');
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

  // Véhicules visibles sur la landing sans tarif journalier — admin et
  // responsable flotte reçoivent la notif, et peuvent corriger ici.
  const missingPricesQ = useQuery({
    queryKey: ['website-leads', 'missing-prices'],
    queryFn: () =>
      apiClient<{
        data: MissingPriceVehicle[];
        meta?: { total: number; tier_schema?: TierSchemaItem[] };
      }>('/v1/website-leads/missing-prices'),
  });

  const updateM = useMutation({
    mutationFn: (vars: { id: string; status: WebsiteLead['status'] }) =>
      apiClient(`/v1/website-leads/${vars.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: vars.status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['website-leads'] }),
  });

  // Suppression définitive : « Annuler » retire la demande de la liste.
  const [deleteTarget, setDeleteTarget] = useState<WebsiteLead | null>(null);
  const deleteM = useMutation({
    mutationFn: (id: string) =>
      apiClient(`/v1/website-leads/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ['website-leads'] });
    },
  });

  const setPriceM = useMutation({
    mutationFn: (vars: { vehicleId: string; tiers: Record<string, number> }) =>
      apiClient(`/v1/website-leads/vehicles/${vars.vehicleId}/price`, {
        method: 'PATCH',
        body: JSON.stringify({ tiers: vars.tiers }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['website-leads', 'missing-prices'] });
    },
  });

  const leads = leadsQ.data?.data ?? [];
  const newCount = leadsQ.data?.meta?.new_count ?? 0;
  const missing = missingPricesQ.data?.data ?? [];
  const missingCount = missing.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Demandes du site</h1>
          <p className="text-sm text-slate-500">
            Les réservations demandées depuis le site public. Rappelez le client, puis créez sa fiche et sa réservation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {newCount > 0 && (
            <span className="rounded-full bg-rose-100 px-4 py-2 text-sm font-black text-rose-700">
              {newCount} demande{newCount > 1 ? 's' : ''} à traiter
            </span>
          )}
          {missingCount > 0 && (
            <span className="rounded-full bg-amber-100 px-4 py-2 text-sm font-black text-amber-700">
              {missingCount} véhicule{missingCount > 1 ? 's' : ''} sans tarif
            </span>
          )}
        </div>
      </div>

      {/* Onglets : Demandes du site · Véhicules à tarifer */}
      <div className="flex gap-1 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setTab('leads')}
          className={`px-4 py-2.5 text-sm font-black transition border-b-2 ${
            tab === 'leads'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Demandes
          {leads.length > 0 && (
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
              {leads.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab('pricing')}
          className={`px-4 py-2.5 text-sm font-black transition border-b-2 ${
            tab === 'pricing'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Véhicules
          {missingCount > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-700">
              {missingCount}
            </span>
          )}
        </button>
      </div>

      {tab === 'pricing' && (
        <PricingTab
          vehicles={missing}
          loading={missingPricesQ.isLoading}
          tierSchema={missingPricesQ.data?.meta?.tier_schema ?? DEFAULT_TIER_SCHEMA}
          onSetPrice={(vehicleId, tiers) => setPriceM.mutateAsync({ vehicleId, tiers })}
          pending={setPriceM.isPending}
        />
      )}

      {tab === 'leads' && (<>

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
                    <div className="font-semibold text-slate-700">
                      {lead.vehicle_label || 'Peu importe'}
                      {lead.vehicle?.registration_number && (
                        <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-600">
                          {lead.vehicle.registration_number}
                        </span>
                      )}
                    </div>
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

                {(() => {
                  // Rangée commerciale : la Durée vient des dates, le
                  // Tarif / jour reprend le quote figé au submit (sinon on
                  // retombe sur la fleet comme pour la conversion), et le
                  // Montant = Durée × Tarif. Les cases vides affichent "—".
                  const days = (() => {
                    if (!lead.pickup_at || !lead.return_at) return 0;
                    const a = new Date(lead.pickup_at).getTime();
                    const b = new Date(lead.return_at).getTime();
                    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
                    return Math.max(0, Math.round((b - a) / 86_400_000));
                  })();
                  const storedQuote = Number(lead.quoted_daily_rate ?? 0);
                  let daily: number | null = storedQuote > 0 ? storedQuote : null;
                  if (daily === null) {
                    const tiers = lead.vehicle?.rental_price_tiers ?? null;
                    const tierValues = tiers
                      ? Object.values(tiers)
                          .map((n) => Number(n))
                          .filter((n) => Number.isFinite(n) && n > 0)
                      : [];
                    const base = Number(lead.vehicle?.daily_rental_price ?? 0);
                    daily = tierValues.length ? Math.min(...tierValues) : (base > 0 ? base : null);
                  }
                  const total = daily !== null && days > 0 ? daily * days : null;
                  const fmtMad = (n: number) =>
                    `${n.toLocaleString('fr-MA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} MAD`;
                  return (
                    <div className="grid gap-2 text-sm sm:grid-cols-3">
                      <div>
                        <div className="text-[10px] font-bold uppercase text-slate-400">Durée</div>
                        <div className="font-black text-slate-800">
                          {days > 0 ? `${days} jour${days > 1 ? 's' : ''}` : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase text-slate-400">Tarif / jour</div>
                        <div className="font-black text-indigo-700">
                          {daily !== null ? fmtMad(daily) : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold uppercase text-slate-400">Montant</div>
                        <div className="font-black text-emerald-700">
                          {total !== null ? fmtMad(total) : '—'}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {lead.availability?.available === false && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                    <span className="font-black">⚠ Véhicule indisponible</span>{' '}
                    sur la période souhaitée
                    {(() => {
                      const msgs = lead.availability?.messages ?? {};
                      const reasons = lead.availability?.reasons ?? [];
                      const parts = reasons.map((c) => msgs[c] ?? c);
                      return parts.length > 0 ? ` — ${parts.join(' · ')}.` : '.';
                    })()}
                  </div>
                )}

                {lead.message && (
                  <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{lead.message}</p>
                )}

                {lead.status !== 'new' && lead.handler && (
                  <div className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-sm font-black text-white">
                      {agentInitials(lead.handler)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] font-black uppercase tracking-widest text-amber-700">
                        Pris en charge par
                      </div>
                      <div className="truncate text-sm font-bold text-slate-800">
                        {agentDisplayName(lead.handler)}
                      </div>
                      {lead.handler.email && (
                        <a
                          className="truncate text-[11px] text-amber-700/80 hover:underline"
                          href={`mailto:${lead.handler.email}`}
                        >
                          {lead.handler.email}
                        </a>
                      )}
                    </div>
                    {lead.handled_at && (
                      <div className="text-right text-[11px] text-amber-700">
                        {fmtDateTime(lead.handled_at)}
                      </div>
                    )}
                  </div>
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
                      onClick={() => {
                        // Ouvrir le module Réservations avec les infos de la
                        // demande pré-remplies ; le statut `converted` est posé
                        // là-bas après la création effective. Si l'agent veut
                        // juste marquer la demande sans créer, il peut rouvrir
                        // la page et utiliser l'ancien raccourci (ci-dessous).
                        // Tarif / jour affiché au client :
                        //   1. priorité absolue à `quoted_daily_rate` figé
                        //      à la soumission (le prix qu'il a réellement
                        //      vu, même si la fleet a été modifiée depuis) ;
                        //   2. sinon on reconstitue depuis la fleet actuelle
                        //      (plus bas palier > daily_rental_price) pour
                        //      les leads antérieurs au stockage du quote.
                        const storedQuote = Number(lead.quoted_daily_rate ?? 0);
                        let quotedDaily: number | null = storedQuote > 0 ? storedQuote : null;
                        if (quotedDaily === null) {
                          const tiers = lead.vehicle?.rental_price_tiers ?? null;
                          const tierValues = tiers
                            ? Object.values(tiers)
                                .map((n) => Number(n))
                                .filter((n) => Number.isFinite(n) && n > 0)
                            : [];
                          const dailyFromTiers = tierValues.length ? Math.min(...tierValues) : null;
                          const dailyRentalPrice = Number(lead.vehicle?.daily_rental_price ?? 0);
                          quotedDaily = dailyFromTiers
                            ?? (dailyRentalPrice > 0 ? dailyRentalPrice : null);
                        }
                        const payload: FromLeadNavState = {
                          id: lead.id,
                          full_name: lead.full_name,
                          phone: lead.phone,
                          email: lead.email,
                          vehicle_id: lead.vehicle?.id ?? null,
                          vehicle_label: lead.vehicle_label,
                          pickup_at: lead.pickup_at,
                          return_at: lead.return_at,
                          daily_rate: quotedDaily,
                        };
                        nav('/reservations', { state: { fromLead: payload } });
                      }}
                    >
                      Transformée en réservation
                    </button>
                  )}
                  {lead.status !== 'converted' && (
                    <button
                      type="button"
                      className="df-btn df-btn--ghost text-xs"
                      disabled={updateM.isPending}
                      onClick={() => updateM.mutate({ id: lead.id, status: 'converted' })}
                      title="Marquer comme traitée sans ouvrir le module Réservations"
                    >
                      Marquer traitée
                    </button>
                  )}
                  <button
                    type="button"
                    className="df-btn df-btn--ghost text-xs text-rose-600"
                    disabled={deleteM.isPending}
                    onClick={() => setDeleteTarget(lead)}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      </>)}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => !deleteM.isPending && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="text-[10px] font-black uppercase tracking-widest text-rose-700">
                Confirmation
              </div>
              <h3 className="mt-1 text-base font-black text-slate-900">
                Supprimer la demande du site ?
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Êtes-vous sûr ? La demande de <strong>{deleteTarget.full_name}</strong> sera
                définitivement supprimée de la liste.
              </p>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4">
              <button
                type="button"
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteM.isPending}
              >
                Non, garder
              </button>
              <button
                type="button"
                className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-black text-white hover:bg-rose-700 disabled:opacity-50"
                onClick={() => deleteM.mutate(deleteTarget.id)}
                disabled={deleteM.isPending}
              >
                {deleteM.isPending ? 'Suppression…' : 'Oui, supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ────────────────────────────────────────────────────────────
   Onglet « Véhicules à tarifer »
   ──────────────────────────────────────────────────────────── */
const PricingTab: React.FC<{
  vehicles: MissingPriceVehicle[];
  loading: boolean;
  tierSchema: TierSchemaItem[];
  onSetPrice: (vehicleId: string, tiers: Record<string, number>) => Promise<unknown>;
  pending: boolean;
}> = ({ vehicles, loading, tierSchema, onSetPrice, pending }) => {
  if (loading) {
    return <div className="df-card df-card__body text-sm text-slate-500">Chargement…</div>;
  }
  if (vehicles.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-sm text-slate-500">
        Aucun véhicule visible sur le site pour le moment.
      </div>
    );
  }
  const missing = vehicles.filter(
    (v) => fromPriceOf(v) === null,
  ).length;
  return (
    <div className="space-y-4">
      {missing > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="font-black">
            {missing} véhicule{missing > 1 ? 's' : ''} sans tarif — « Tarif sur demande » côté site.
          </div>
          <div className="mt-0.5 text-xs">
            Cliquez sur <strong>Tarif</strong> pour configurer les prix par durée.
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {vehicles.map((v) => (
          <PricingRow
            key={v.id}
            v={v}
            tierSchema={tierSchema}
            onSetPrice={onSetPrice}
            pending={pending}
          />
        ))}
      </div>
    </div>
  );
};

/** Plus petit prix /jour parmi les paliers remplis (sinon le tarif journalier). */
function fromPriceOf(v: MissingPriceVehicle): number | null {
  const tiers = Object.values(v.rental_price_tiers ?? {})
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (tiers.length) return Math.min(...tiers);
  if (v.daily_rental_price && v.daily_rental_price > 0) return v.daily_rental_price;
  return null;
}

const PricingRow: React.FC<{
  v: MissingPriceVehicle;
  tierSchema: TierSchemaItem[];
  onSetPrice: (vehicleId: string, tiers: Record<string, number>) => Promise<unknown>;
  pending: boolean;
}> = ({ v, tierSchema, onSetPrice, pending }) => {
  const [open, setOpen] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const label = [v.brand, v.model].filter(Boolean).join(' ') || 'Véhicule';
  const sub = [v.year, v.categorie, v.fuel, v.transmission].filter(Boolean).join(' · ');
  const img = photoUrl(v.photo_url);
  const from = fromPriceOf(v);
  const hasPrice = from !== null;
  const filledTiers = tierSchema
    .map((t) => ({ label: t.label, value: Number(v.rental_price_tiers?.[t.key]) }))
    .filter((t) => Number.isFinite(t.value) && t.value > 0);
  return (
    <>
      <article className="df-card flex h-full flex-col overflow-hidden">
        <div className="relative flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 to-slate-200">
          {img ? (
            <img
              src={img}
              alt={label}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = '/logo.png';
                (e.currentTarget as HTMLImageElement).className = 'h-12 w-auto object-contain opacity-80';
              }}
            />
          ) : (
            <img src="/logo.png" alt="DriveFlow" className="h-12 w-auto object-contain opacity-80" />
          )}
          <span className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-black ${
            hasPrice ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
          }`}>
            {hasPrice ? 'Tarifé' : 'Sans tarif'}
          </span>
        </div>
        <div className="flex flex-1 flex-col p-4">
          <div className="text-sm font-black text-slate-900">{label}</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {v.registration ? <span className="font-mono">{v.registration}</span> : null}
            {v.registration && sub ? ' · ' : null}
            {sub}
          </div>

          {hasPrice ? (
            <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-2.5">
              <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">À partir de</div>
              <div className="text-lg font-black text-emerald-800">
                {from!.toLocaleString('fr-MA')} <span className="text-xs font-bold">MAD / j</span>
              </div>
              {filledTiers.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {filledTiers.map((t) => (
                    <div key={t.label} className="flex justify-between text-[11px] text-slate-600">
                      <span>{t.label}</span>
                      <span className="font-bold">{t.value.toLocaleString('fr-MA')} MAD</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/60 p-2.5 text-xs font-semibold text-amber-700">
              Tarif sur demande
            </div>
          )}

          <div className="mt-auto flex items-center gap-2 pt-3">
            <button
              type="button"
              onClick={() => setOpen(true)}
              disabled={pending}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-3.5 w-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              {hasPrice ? 'Modifier' : 'Tarif'}
            </button>
            {savedAt && <span className="text-xs font-semibold text-emerald-600">✓</span>}
          </div>
        </div>
      </article>
      {open && (
        <TierPricingModal
          v={v}
          label={label}
          tierSchema={tierSchema}
          pending={pending}
          onClose={() => setOpen(false)}
          onSave={async (tiers) => {
            await onSetPrice(v.id, tiers);
            setSavedAt(Date.now());
            setOpen(false);
          }}
        />
      )}
    </>
  );
};

/* ────────────────────────────────────────────────────────────
   Popup « Tarif par palier de durée »
   ──────────────────────────────────────────────────────────── */
const TierPricingModal: React.FC<{
  v: MissingPriceVehicle;
  label: string;
  tierSchema: TierSchemaItem[];
  pending: boolean;
  onClose: () => void;
  onSave: (tiers: Record<string, number>) => Promise<void>;
}> = ({ v, label, tierSchema, pending, onClose, onSave }) => {
  // Chaque palier est une string (champ libre). On parse à la volée pour
  // calculer le prix de départ, et à la soumission pour construire le payload.
  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const t of tierSchema) {
      const existing = v.rental_price_tiers?.[t.key];
      seed[t.key] = existing != null ? String(existing) : '';
    }
    return seed;
  });
  const [error, setError] = useState<string | null>(null);

  const base = Number(values.tier_1_2);
  const canSave = base > 0 && !pending;

  // « À partir de » : plus petit prix /jour parmi les paliers remplis, pour
  // montrer en live ce que le visiteur du site verra.
  const fromPrice = (() => {
    const nums = tierSchema
      .map((t) => Number(values[t.key]))
      .filter((n) => Number.isFinite(n) && n > 0);
    return nums.length > 0 ? Math.min(...nums) : null;
  })();

  const submit = async () => {
    setError(null);
    const tiers: Record<string, number> = {};
    for (const t of tierSchema) {
      const n = Number(values[t.key]);
      if (Number.isFinite(n) && n > 0) {
        tiers[t.key] = n;
      }
    }
    if (!tiers.tier_1_2) {
      setError('Le palier 1-2 jours est obligatoire.');
      return;
    }
    try {
      await onSave(tiers);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center"
      onClick={() => !pending && onClose()}
    >
      <div
        className="my-4 w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="text-[10px] font-black uppercase tracking-widest text-indigo-700">
            Configurer le tarif
          </div>
          <h3 className="mt-1 text-base font-black text-slate-900">{label}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Un prix /jour pour chaque durée. Seul le palier <strong>1-2 jours</strong> est obligatoire ; laissez les autres vides si vous ne faites pas de remise sur la durée.
          </p>
        </div>

        <div className="space-y-2 px-6 py-5">
          {tierSchema.map((t) => {
            const required = t.key === 'tier_1_2';
            return (
              <label key={t.key} className="flex items-center gap-3">
                <div className="min-w-[7.5rem] text-sm font-bold text-slate-700">
                  {t.label}
                  {required && <span className="ml-1 text-rose-600">*</span>}
                </div>
                <div className="relative flex-1">
                  <input
                    type="number"
                    min={0}
                    step="any"
                    className="df-input w-full pr-16"
                    placeholder={required ? 'Obligatoire' : 'Optionnel'}
                    value={values[t.key] ?? ''}
                    onChange={(e) =>
                      setValues((s) => ({ ...s, [t.key]: e.target.value }))
                    }
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    MAD / j
                  </span>
                </div>
              </label>
            );
          })}

          {fromPrice != null && (
            <div className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
              <strong>Aperçu site :</strong>{' '}
              {fromPrice < base
                ? `« À partir de ${fromPrice.toLocaleString('fr-MA')} MAD / j »`
                : `« ${base.toLocaleString('fr-MA')} MAD / j »`}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
            onClick={onClose}
            disabled={pending}
          >
            Annuler
          </button>
          <button
            type="button"
            className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-40"
            onClick={submit}
            disabled={!canSave}
          >
            {pending ? 'Enregistrement…' : 'Enregistrer les tarifs'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WebsiteLeadsPage;
