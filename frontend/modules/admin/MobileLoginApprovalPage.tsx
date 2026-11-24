import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/services/apiClient';

interface MobileLoginRequestDto {
  id: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'consumed';
  device_name: string | null;
  ip_address: string | null;
  user_agent: string | null;
  expires_at: string | null;
  decided_at: string | null;
  created_at: string | null;
  user: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    full_name: string;
    role: string | null;
  } | null;
}

interface Envelope<T> { data: T }

const STATUS_FR: Record<MobileLoginRequestDto['status'], string> = {
  pending: 'En attente',
  approved: 'Approuvée',
  rejected: 'Refusée',
  expired: 'Expirée',
  consumed: 'Utilisée',
};

const STATUS_CLASS: Record<MobileLoginRequestDto['status'], string> = {
  pending: 'bg-amber-100 text-amber-900 border-amber-300',
  approved: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  rejected: 'bg-rose-100 text-rose-900 border-rose-300',
  expired: 'bg-slate-100 text-slate-700 border-slate-300',
  consumed: 'bg-sky-100 text-sky-900 border-sky-300',
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export const MobileLoginApprovalPage: React.FC = () => {
  const { requestId = '' } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: req, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['mobile-login-approval', requestId],
    queryFn: () =>
      apiClient<Envelope<{ request: MobileLoginRequestDto }>>(
        `/v1/auth/mobile-login/${requestId}`,
      ).then((r) => r.data.request),
    refetchInterval: 5000,
    enabled: !!requestId,
  });

  const approve = useMutation({
    mutationFn: () =>
      apiClient<Envelope<{ request: MobileLoginRequestDto }>>(
        `/v1/auth/mobile-login/${requestId}/approve`,
        { method: 'POST' },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mobile-login-approval', requestId] }),
  });

  const reject = useMutation({
    mutationFn: () =>
      apiClient<Envelope<{ request: MobileLoginRequestDto }>>(
        `/v1/auth/mobile-login/${requestId}/reject`,
        { method: 'POST' },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mobile-login-approval', requestId] }),
  });

  if (isLoading) {
    return (
      <div className="p-8 text-center text-sm text-slate-600">
        Chargement de la demande…
      </div>
    );
  }

  if (isError || !req) {
    const message = (error as Error | undefined)?.message ?? 'Demande introuvable.';
    return (
      <div className="mx-auto mt-16 max-w-xl rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
        <h2 className="text-lg font-bold text-rose-900">Demande introuvable</h2>
        <p className="mt-2 text-sm text-rose-800">{message}</p>
        <button
          className="mt-4 rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-semibold text-rose-900 hover:bg-rose-50"
          onClick={() => navigate('/notifications')}
        >
          Retour aux notifications
        </button>
      </div>
    );
  }

  const isPending = req.status === 'pending';
  const busy = approve.isPending || reject.isPending;

  return (
    <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">
            Demande de connexion mobile
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Validez ou refusez l'accès de cet utilisateur à l'application mobile.
          </p>
        </div>
        <span
          className={`whitespace-nowrap rounded-full border px-3 py-1 text-xs font-bold ${STATUS_CLASS[req.status]}`}
        >
          {STATUS_FR[req.status]}
        </span>
      </div>

      <dl className="mt-6 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Utilisateur</dt>
          <dd className="mt-1 font-semibold text-slate-900">{req.user?.full_name ?? '—'}</dd>
          <dd className="text-xs text-slate-600">{req.user?.email ?? ''}</dd>
          {req.user?.role && (
            <dd className="mt-1 inline-block rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-700">
              {req.user.role}
            </dd>
          )}
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Appareil</dt>
          <dd className="mt-1 text-sm text-slate-900">{req.device_name ?? '—'}</dd>
          <dd className="text-xs text-slate-600 break-all">{req.user_agent ?? ''}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Adresse IP</dt>
          <dd className="mt-1 text-sm text-slate-900">{req.ip_address ?? '—'}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Expire</dt>
          <dd className="mt-1 text-sm text-slate-900">{formatDateTime(req.expires_at)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Demande créée</dt>
          <dd className="mt-1 text-sm text-slate-900">{formatDateTime(req.created_at)}</dd>
        </div>
        {req.decided_at && (
          <div className="sm:col-span-2">
            <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Décision</dt>
            <dd className="mt-1 text-sm text-slate-900">
              {STATUS_FR[req.status]} le {formatDateTime(req.decided_at)}
            </dd>
          </div>
        )}
      </dl>

      {isPending ? (
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
            disabled={busy}
            onClick={() => approve.mutate()}
          >
            {approve.isPending ? 'Approbation…' : 'Approuver'}
          </button>
          <button
            type="button"
            className="flex-1 rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-60"
            disabled={busy}
            onClick={() => reject.mutate()}
          >
            {reject.isPending ? 'Refus…' : 'Refuser'}
          </button>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-sm text-slate-700">
          La demande n'est plus en attente.
          <div className="mt-2">
            <button
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              onClick={() => refetch()}
            >
              Rafraîchir
            </button>
          </div>
        </div>
      )}

      {(approve.isError || reject.isError) && (
        <p className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-800">
          {(approve.error as Error | null)?.message ?? (reject.error as Error | null)?.message}
        </p>
      )}
    </div>
  );
};

export default MobileLoginApprovalPage;
