import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mobileOpsApi, type MobileOpsMissionDto } from '@/services/mobileOpsApi';
import { useAuthSession } from '@/modules/auth/AuthContext';
import { getApiBase } from '@/services/apiClient';
import { formatDate } from '@/modules/shared/formatters';

/**
 * Phase 3 — Mobile Ops landing page.
 *
 * Renders one of three views depending on the caller's role:
 *   - AGENT_LIVRAISON       → "My missions" — only assigned work
 *   - GESTIONNAIRE_FLOTTE   → live mission monitor
 *   - CLIENT_PORTAL         → customer-safe delivery tracking
 *   - ADMIN / DIRECTEUR     → full mission view (same surface as flotte)
 *
 * Row-scoping is enforced server-side; the page does not reverse-engineer
 * permissions from the response.
 */

const STATUS_LABEL: Record<string, string> = {
  planned: 'Planifiée',
  in_progress: 'En cours',
  completed: 'Terminée',
  failed: 'Échec',
};

const STATUS_TONE: Record<string, string> = {
  planned: 'bg-slate-100 text-slate-700',
  in_progress: 'bg-amber-100 text-amber-800',
  completed: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-rose-100 text-rose-800',
};

export const MobileOpsPage: React.FC = () => {
  const { appRole } = useAuthSession();
  const apiReady = !!getApiBase();

  if (!apiReady) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Backend non configuré. Renseignez <span className="font-mono">VITE_API_BASE</span> pour
        activer le module Mobile Ops.
      </div>
    );
  }

  if (appRole === 'CLIENT_PORTAL') {
    return <ClientPortalTrackingView />;
  }
  return <FieldOpsView role={appRole ?? 'AGENT_COMMERCIAL'} />;
};

/* ───────────────────────────────────────────────────────────────────────── */
/* AGENT / FLOTTE / ADMIN view                                              */
/* ───────────────────────────────────────────────────────────────────────── */

const FieldOpsView: React.FC<{ role: string }> = ({ role }) => {
  const isAgent = role === 'AGENT_LIVRAISON';
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['mobile-ops', 'my-missions', role],
    queryFn: () => mobileOpsApi.myMissions(),
  });

  const missions = list.data ?? [];

  const grouped = useMemo(() => {
    return {
      planned: missions.filter((m) => m.status === 'planned'),
      inProgress: missions.filter((m) => m.status === 'in_progress'),
      done: missions.filter((m) => m.status === 'completed' || m.status === 'failed'),
    };
  }, [missions]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black text-slate-900">
          {isAgent ? 'Mes missions' : 'Suivi des missions terrain'}
        </h1>
        <p className="text-sm text-slate-500">
          {isAgent
            ? 'Vos missions assignées — démarrez, complétez votre check-list, capturez la signature client.'
            : `${missions.length} mission(s) — suivez l'activité de l'équipe livraison en temps réel.`}
        </p>
      </header>

      {list.isLoading && <div className="text-sm text-slate-400">Chargement…</div>}

      {!list.isLoading && missions.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <div className="text-sm font-bold text-slate-700">Aucune mission visible</div>
          <div className="mt-2 text-xs text-slate-500">
            {isAgent
              ? 'Aucune mission ne vous est actuellement assignée.'
              : 'Aucune mission active en ce moment dans votre périmètre.'}
          </div>
        </div>
      )}

      {missions.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Column title="Planifiées" rows={grouped.planned} onSelect={setSelectedId} />
          <Column title="En cours" rows={grouped.inProgress} onSelect={setSelectedId} highlight />
          <Column title="Terminées" rows={grouped.done} onSelect={setSelectedId} />
        </div>
      )}

      {selectedId && <MissionDrawer missionId={selectedId} onClose={() => setSelectedId(null)} canAct={isAgent} />}
    </div>
  );
};

const Column: React.FC<{
  title: string;
  rows: MobileOpsMissionDto[];
  onSelect: (id: string) => void;
  highlight?: boolean;
}> = ({ title, rows, onSelect, highlight }) => {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className={`text-xs font-black uppercase ${highlight ? 'text-amber-700' : 'text-slate-500'}`}>{title}</div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">{rows.length}</span>
      </div>
      <ul className="space-y-2">
        {rows.length === 0 && <li className="text-xs text-slate-400">—</li>}
        {rows.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onSelect(m.id)}
              className="w-full rounded-xl border border-slate-100 bg-white px-3 py-2 text-left text-xs hover:border-indigo-200 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] text-slate-500">{m.id.slice(0, 8)}</span>
                <span className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${STATUS_TONE[m.status] ?? 'bg-slate-100'}`}>
                  {STATUS_LABEL[m.status] ?? m.status}
                </span>
              </div>
              <div className="mt-1 font-bold text-slate-800">{m.mission_type}</div>
              <div className="mt-1 text-[11px] text-slate-500">
                {m.destination_address ?? m.origin_address ?? '—'}
              </div>
              {m.scheduled_start_at && (
                <div className="mt-1 text-[10px] text-slate-400">ETA {formatDate(m.scheduled_start_at)}</div>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

/* ───────────────────────────────────────────────────────────────────────── */
/* Mission drawer — checklist, photos, signature, lifecycle actions         */
/* ───────────────────────────────────────────────────────────────────────── */

const MissionDrawer: React.FC<{
  missionId: string;
  onClose: () => void;
  canAct: boolean;
}> = ({ missionId, onClose, canAct }) => {
  const qc = useQueryClient();
  const detail = useQuery({
    queryKey: ['mobile-ops', 'mission', missionId],
    queryFn: () => mobileOpsApi.getMission(missionId),
  });
  const [error, setError] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['mobile-ops'] });

  const startMut = useMutation({
    mutationFn: () => mobileOpsApi.start(missionId),
    onSuccess: refresh,
    onError: (e) => setError(e instanceof Error ? e.message : 'Échec démarrage'),
  });
  const completeMut = useMutation({
    mutationFn: (status: 'completed' | 'failed') => mobileOpsApi.complete(missionId, status),
    onSuccess: refresh,
    onError: (e) => setError(e instanceof Error ? e.message : 'Échec clôture'),
  });
  const photoMut = useMutation({
    mutationFn: (input: { phase: string; files: File[] }) =>
      mobileOpsApi.uploadPhotos(missionId, input.files, { phase: input.phase }),
    onSuccess: refresh,
    onError: (e) => setError(e instanceof Error ? e.message : 'Échec upload'),
  });
  const signatureMut = useMutation({
    mutationFn: (input: { file: File; name?: string }) =>
      mobileOpsApi.customerSignature(missionId, input.file, input.name),
    onSuccess: refresh,
    onError: (e) => setError(e instanceof Error ? e.message : 'Échec signature'),
  });

  const m = detail.data;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-slate-900/40" onClick={onClose} />
      <aside className="w-full max-w-2xl overflow-auto bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-mono text-xs text-slate-500">{missionId}</div>
            <h2 className="text-lg font-black">{m?.mission_type ?? '—'}</h2>
            <div className="text-xs text-slate-500">
              {m?.status ? STATUS_LABEL[m.status] ?? m.status : '—'} · {m?.destination_address ?? m?.origin_address ?? '—'}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        {error && <div className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

        {detail.isLoading && <div className="mt-6 text-sm text-slate-400">Chargement…</div>}

        {m && (
          <>
            {canAct && (
              <section className="mt-5 flex flex-wrap gap-2">
                {m.status === 'planned' && (
                  <button
                    className="df-btn df-btn--primary"
                    disabled={startMut.isPending}
                    onClick={() => {
                      setError(null);
                      startMut.mutate();
                    }}
                  >
                    Démarrer la mission
                  </button>
                )}
                {m.status === 'in_progress' && (
                  <>
                    <button
                      className="df-btn df-btn--primary"
                      disabled={completeMut.isPending}
                      onClick={() => {
                        setError(null);
                        completeMut.mutate('completed');
                      }}
                    >
                      Clôturer (succès)
                    </button>
                    <button
                      className="df-btn df-btn--ghost text-rose-600"
                      disabled={completeMut.isPending}
                      onClick={() => {
                        setError(null);
                        completeMut.mutate('failed');
                      }}
                    >
                      Marquer en échec
                    </button>
                  </>
                )}
              </section>
            )}

            {/* Checklist */}
            <section className="mt-6">
              <div className="mb-2 text-sm font-black text-slate-900">Check-list</div>
              {(m.checklist_items ?? []).length === 0 ? (
                <div className="text-xs text-slate-400">Aucun élément.</div>
              ) : (
                <ul className="space-y-1">
                  {(m.checklist_items ?? []).map((c) => (
                    <li key={String(c.id)} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-xs">
                      <span>
                        <span className="font-mono text-[10px] uppercase text-slate-400">{c.checklist_phase}</span>{' '}
                        <span className="ml-1 font-semibold text-slate-700">{c.item_label}</span>
                      </span>
                      <span className="font-mono text-[10px] text-slate-500">{c.item_status ?? '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Photos */}
            {canAct && m.status === 'in_progress' && (
              <section className="mt-6">
                <div className="mb-2 text-sm font-black text-slate-900">Téléverser des photos</div>
                <div className="grid grid-cols-2 gap-2">
                  {['front', 'rear', 'left', 'right', 'interior', 'odometer', 'damage', 'fuel', 'documents'].map((phase) => (
                    <label key={phase} className="cursor-pointer rounded-xl border border-dashed border-slate-200 p-3 text-center text-xs font-semibold text-slate-600 hover:border-indigo-300">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          const files = Array.from(e.target.files ?? []);
                          if (files.length > 0) {
                            setError(null);
                            photoMut.mutate({ phase, files });
                          }
                        }}
                      />
                      {phase}
                    </label>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-6">
              <div className="mb-2 text-sm font-black text-slate-900">Photos ({(m.photos ?? []).length})</div>
              {(m.photos ?? []).length === 0 ? (
                <div className="text-xs text-slate-400">Aucune photo capturée.</div>
              ) : (
                <ul className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {(m.photos ?? []).map((p) => (
                    <li key={p.id} className="rounded-lg border border-slate-100 p-2">
                      <div className="font-mono text-[10px] uppercase text-slate-500">{p.phase ?? 'photo'}</div>
                      <div className="truncate text-xs">{p.original_filename ?? p.id}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Customer signature */}
            {canAct && (
              <section className="mt-6">
                <div className="mb-2 text-sm font-black text-slate-900">Signature client</div>
                {m.customer_signature_file_id ? (
                  <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                    ✓ Signature capturée (id : {m.customer_signature_file_id.slice(0, 8)}…)
                  </div>
                ) : (
                  <label className="block cursor-pointer rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 text-center text-xs font-semibold text-amber-800 hover:bg-amber-100">
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          setError(null);
                          signatureMut.mutate({ file });
                        }
                      }}
                    />
                    Capturer la signature client (image ou PDF)
                  </label>
                )}
              </section>
            )}
          </>
        )}
      </aside>
    </div>
  );
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
          Statut de vos prises en charge et restitutions à venir. Pour toute question, contactez votre conseiller.
        </p>
      </header>

      {q.isLoading && <div className="text-sm text-slate-400">Chargement…</div>}

      {!q.isLoading && rows.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <div className="text-sm font-bold text-slate-700">Aucune livraison en cours</div>
          <div className="mt-2 text-xs text-slate-500">
            Vos prochaines réservations et leurs statuts s'afficheront ici.
          </div>
          <div className="mt-4">
            <Link to="/contracts" className="text-xs font-bold text-indigo-600">
              Voir mes contrats →
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
                    <span className="text-slate-400">·</span>{' '}
                    <span className="font-normal text-slate-600">
                      du {r.reservation_start ? formatDate(r.reservation_start) : '—'} au{' '}
                      {r.reservation_end ? formatDate(r.reservation_end) : '—'}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  {r.mission_status && (
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${STATUS_TONE[r.mission_status] ?? 'bg-slate-100'}`}
                    >
                      {STATUS_LABEL[r.mission_status] ?? r.mission_status}
                    </span>
                  )}
                  {r.has_customer_signature && (
                    <span className="mt-1 text-[10px] font-bold uppercase text-emerald-700">
                      ✓ Signée
                    </span>
                  )}
                </div>
              </div>
              {(r.eta || r.started_at || r.completed_at) && (
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
                  {r.eta && <span>ETA {formatDate(r.eta)}</span>}
                  {r.started_at && <span>· Démarrée {formatDate(r.started_at)}</span>}
                  {r.completed_at && <span>· Terminée {formatDate(r.completed_at)}</span>}
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
