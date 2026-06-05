import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { mobileOpsApi } from '@/services/mobileOpsApi';
import { useAuthSession } from '@/modules/auth/AuthContext';
import { getApiBase } from '@/services/apiClient';
import { formatDate } from '@/modules/shared/formatters';
import { AgentMobileView } from './views/AgentMobileView';
import { AdminOpsView } from './views/AdminOpsView';

/**
 * Mobile Ops landing page.
 *
 * Routes to the correct view based on the caller's role:
 *   - AGENT_LIVRAISON       -> Mobile agent workflow (one card at a time)
 *   - GESTIONNAIRE_FLOTTE   -> Admin monitoring table
 *   - ADMIN / DIRECTEUR     -> Admin monitoring table
 *   - CLIENT_PORTAL         -> Customer delivery tracking
 */

const STATUS_LABEL: Record<string, string> = {
  pending: 'En attente',
  assigned: 'Assignée',
  accepted: 'Acceptée',
  in_progress: 'En cours',
  arrived: 'Arrivé',
  completed: 'Terminée',
  cancelled: 'Annulée',
  failed: 'Échec',
};

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700',
  assigned: 'bg-blue-100 text-blue-800',
  accepted: 'bg-sky-100 text-sky-800',
  in_progress: 'bg-amber-100 text-amber-800',
  arrived: 'bg-purple-100 text-purple-800',
  completed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-slate-200 text-slate-600',
  failed: 'bg-rose-100 text-rose-800',
};

export const MobileOpsPage: React.FC = () => {
  const { appRole } = useAuthSession();
  const apiReady = !!getApiBase();

  if (!apiReady) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Backend non configuré. Renseignez <span className="font-mono">VITE_API_BASE</span> pour
        activer le module Opérations terrain.
      </div>
    );
  }

  // Agent -> mobile workflow
  if (appRole === 'AGENT_LIVRAISON') {
    return <AgentMobileView />;
  }

  // Customer -> tracking
  if (appRole === 'CLIENT_PORTAL') {
    return <ClientPortalTrackingView />;
  }

  // Admin / Directeur / Gestionnaire -> admin monitoring
  return <AdminOpsView />;
};

/* ───────────────────────────────────────────────────────────────────────── */
/* CLIENT_PORTAL view — customer-safe tracking, no internal data            */
/* ───────────────────────────────────────────────────────────────────────── */

const ClientPortalTrackingView: React.FC = () => {
  const q = useQuery({
    queryKey: ['mobile-ops', 'customer-tracking'],
    queryFn: () => mobileOpsApi.customerTracking(),
  });

  const rows = q.data ?? [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-slate-900">Suivi de mes livraisons</h1>
        <p className="text-sm text-slate-500">
          Statut de vos prises en charge et restitutions. Pour toute question, contactez votre conseiller.
        </p>
      </header>

      {q.isLoading && <div className="text-sm text-slate-400">Chargement...</div>}

      {!q.isLoading && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <div className="text-sm font-bold text-slate-700">Aucune livraison en cours</div>
          <div className="mt-2 text-xs text-slate-500">
            Vos prochaines réservations et leurs statuts s'afficheront ici.
          </div>
          <div className="mt-4">
            <Link to="/contracts" className="text-xs font-bold text-indigo-600">
              Voir mes contrats &rarr;
            </Link>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.reservation_id} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-mono text-xs text-slate-500">{r.reservation_id.slice(0, 8)}</div>
                  <div className="text-sm font-bold text-slate-800">
                    {r.mission_type ?? 'Réservation'}{' '}
                    <span className="text-slate-400">&middot;</span>{' '}
                    <span className="font-normal text-slate-600">
                      du {r.reservation_start ? formatDate(r.reservation_start) : '—'} au{' '}
                      {r.reservation_end ? formatDate(r.reservation_end) : '—'}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  {r.mission_status && (
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${
                        STATUS_TONE[r.mission_status] ?? 'bg-slate-100'
                      }`}
                    >
                      {STATUS_LABEL[r.mission_status] ?? r.mission_status}
                    </span>
                  )}
                  {r.has_customer_signature && (
                    <span className="mt-1 text-[10px] font-bold uppercase text-emerald-700">
                      Signée
                    </span>
                  )}
                </div>
              </div>
              {(r.eta || r.started_at || r.completed_at) && (
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
                  {r.eta && <span>ETA {formatDate(r.eta)}</span>}
                  {r.started_at && <span>&middot; Démarrée {formatDate(r.started_at)}</span>}
                  {r.completed_at && <span>&middot; Terminée {formatDate(r.completed_at)}</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default MobileOpsPage;
