import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  mobileOpsApi,
  type MobileOpsMissionDto,
  type MissionType,
  type MissionProofBundle,
} from '@/services/mobileOpsApi';
import { formatDate } from '@/modules/shared/formatters';

// ── Label maps ───────────────────────────────────────────────────────

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

const TYPE_LABEL: Record<string, string> = {
  delivery: 'Livraison',
  pickup: 'Récupération',
  check_in: 'Check-in',
  check_out: 'Check-out',
  inspection: 'Inspection',
  assistance: 'Assistance',
};

type DrawerMode = null | 'detail' | 'create';

export const AdminOpsView: React.FC = () => {
  const qc = useQueryClient();
  const [filters, setFilters] = useState<{
    status: string;
    mission_type: string;
    q: string;
    page: number;
  }>({ status: '', mission_type: '', q: '', page: 1 });
  const [drawerMode, setDrawerMode] = useState<DrawerMode>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const listQ = useQuery({
    queryKey: ['mobile-ops', 'admin', 'missions', filters],
    queryFn: () =>
      mobileOpsApi.adminListMissions({
        status: filters.status || undefined,
        mission_type: filters.mission_type || undefined,
        q: filters.q || undefined,
        page: filters.page,
        per_page: 25,
      }),
    refetchInterval: 30_000,
  });

  const missions = listQ.data?.data ?? [];
  const meta = listQ.data?.meta;

  const openDetail = (id: string) => {
    setSelectedId(id);
    setDrawerMode('detail');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-slate-900">Suivi des missions terrain</h1>
          <p className="text-xs text-slate-500">
            {meta ? `${meta.total} mission(s)` : 'Chargement...'} — moniteur admin/gestionnaire
          </p>
        </div>
        <button
          className="df-btn df-btn--primary text-xs"
          onClick={() => { setDrawerMode('create'); setSelectedId(null); }}
        >
          + Nouvelle mission
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))}
          className="df-input text-xs"
        >
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select
          value={filters.mission_type}
          onChange={(e) => setFilters((f) => ({ ...f, mission_type: e.target.value, page: 1 }))}
          className="df-input text-xs"
        >
          <option value="">Tous les types</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input
          type="text"
          value={filters.q}
          onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value, page: 1 }))}
          placeholder="Rechercher..."
          className="df-input text-xs"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="px-3 py-2 text-left font-bold text-slate-600">Mission</th>
              <th className="px-3 py-2 text-left font-bold text-slate-600">Type</th>
              <th className="px-3 py-2 text-left font-bold text-slate-600">Statut</th>
              <th className="px-3 py-2 text-left font-bold text-slate-600">Agent</th>
              <th className="px-3 py-2 text-left font-bold text-slate-600">Véhicule</th>
              <th className="px-3 py-2 text-left font-bold text-slate-600">Planifiée</th>
              <th className="px-3 py-2 text-left font-bold text-slate-600">Preuves</th>
            </tr>
          </thead>
          <tbody>
            {listQ.isLoading && (
              <tr><td colSpan={7} className="py-6 text-center text-slate-400">Chargement...</td></tr>
            )}
            {!listQ.isLoading && missions.length === 0 && (
              <tr><td colSpan={7} className="py-6 text-center text-slate-400">Aucune mission trouvée</td></tr>
            )}
            {missions.map((m) => (
              <tr
                key={m.id}
                className="cursor-pointer border-b border-slate-50 transition hover:bg-slate-50"
                onClick={() => openDetail(m.id)}
              >
                <td className="px-3 py-2">
                  <div className="font-mono text-[10px] text-slate-400">{m.mission_number ?? m.id.slice(0, 8)}</div>
                </td>
                <td className="px-3 py-2 font-bold">{TYPE_LABEL[m.mission_type] ?? m.mission_type}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${STATUS_TONE[m.status]}`}>
                    {STATUS_LABEL[m.status] ?? m.status}
                  </span>
                </td>
                <td className="px-3 py-2 text-slate-600">{m.assigned_agent?.email ?? '—'}</td>
                <td className="px-3 py-2 font-mono">{m.vehicle?.registration_number ?? '—'}</td>
                <td className="px-3 py-2 text-slate-500">{m.planned_at ? formatDate(m.planned_at) : '—'}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1.5 text-[10px]">
                    {(m.photos_count ?? 0) > 0 && <span className="text-slate-500">{m.photos_count} ph</span>}
                    {(m.inspections_count ?? 0) > 0 && <span className="text-indigo-500">{m.inspections_count} insp</span>}
                    {(m.issues_count ?? 0) > 0 && <span className="text-rose-500">{m.issues_count} pb</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta && meta.last_page > 1 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">
            Page {meta.current_page} / {meta.last_page} ({meta.total} total)
          </span>
          <div className="flex gap-1">
            <button
              className="df-btn df-btn--ghost text-xs"
              disabled={meta.current_page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            >
              Précédent
            </button>
            <button
              className="df-btn df-btn--ghost text-xs"
              disabled={meta.current_page >= meta.last_page}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            >
              Suivant
            </button>
          </div>
        </div>
      )}

      {/* Drawer */}
      {drawerMode === 'detail' && selectedId && (
        <AdminMissionDrawer
          missionId={selectedId}
          onClose={() => { setDrawerMode(null); setSelectedId(null); qc.invalidateQueries({ queryKey: ['mobile-ops'] }); }}
        />
      )}
      {drawerMode === 'create' && (
        <CreateMissionDrawer
          onClose={() => { setDrawerMode(null); qc.invalidateQueries({ queryKey: ['mobile-ops'] }); }}
        />
      )}
    </div>
  );
};

// ── Admin Mission Detail Drawer ─────────────────────────────────────

const AdminMissionDrawer: React.FC<{ missionId: string; onClose: () => void }> = ({ missionId, onClose }) => {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [assignUserId, setAssignUserId] = useState('');
  const [tab, setTab] = useState<'info' | 'proof'>('info');

  const detailQ = useQuery({
    queryKey: ['mobile-ops', 'mission', missionId],
    queryFn: () => mobileOpsApi.getMission(missionId),
  });

  const proofQ = useQuery({
    queryKey: ['mobile-ops', 'admin', 'proof', missionId],
    queryFn: () => mobileOpsApi.getMissionProof(missionId),
    enabled: tab === 'proof',
  });

  const assignMut = useMutation({
    mutationFn: () => mobileOpsApi.adminAssignMission(missionId, assignUserId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mobile-ops'] });
      setAssignUserId('');
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });

  const cancelMut = useMutation({
    mutationFn: () => mobileOpsApi.adminCancelMission(missionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mobile-ops'] });
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });

  const m = detailQ.data;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-slate-900/40" onClick={onClose} />
      <aside className="w-full max-w-2xl overflow-auto bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-mono text-xs text-slate-500">{m?.mission_number ?? missionId.slice(0, 8)}</div>
            <h2 className="text-lg font-black">{m ? (TYPE_LABEL[m.mission_type] ?? m.mission_type) : '...'}</h2>
            {m && (
              <span className={`mt-1 inline-block rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${STATUS_TONE[m.status]}`}>
                {STATUS_LABEL[m.status] ?? m.status}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">&times;</button>
        </div>

        {error && <div className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

        {/* Tabs */}
        <div className="mt-4 flex gap-2 border-b border-slate-100 pb-2">
          <button onClick={() => setTab('info')} className={`text-xs font-bold ${tab === 'info' ? 'text-indigo-600' : 'text-slate-400'}`}>
            Détails
          </button>
          <button onClick={() => setTab('proof')} className={`text-xs font-bold ${tab === 'proof' ? 'text-indigo-600' : 'text-slate-400'}`}>
            Preuves & dossier
          </button>
        </div>

        {detailQ.isLoading && <div className="mt-4 text-sm text-slate-400">Chargement...</div>}

        {m && tab === 'info' && (
          <div className="mt-4 space-y-4">
            {/* Info grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <InfoCell label="Agent" value={m.assigned_agent?.email ?? '—'} />
              <InfoCell label="Véhicule" value={m.vehicle?.registration_number ?? '—'} />
              <InfoCell label="Client" value={m.client?.customer_code ?? '—'} />
              <InfoCell label="Planifiée" value={m.planned_at ? formatDate(m.planned_at) : '—'} />
              <InfoCell label="Départ" value={m.pickup_address ?? m.origin_address ?? '—'} />
              <InfoCell label="Arrivée" value={m.dropoff_address ?? m.destination_address ?? '—'} />
              {m.actual_start_at && <InfoCell label="Démarrage" value={formatDate(m.actual_start_at)} />}
              {m.arrived_at && <InfoCell label="Arrivée site" value={formatDate(m.arrived_at)} />}
              {m.actual_end_at && <InfoCell label="Clôture" value={formatDate(m.actual_end_at)} />}
            </div>

            {m.notes && (
              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{m.notes}</div>
            )}

            {/* Assign agent */}
            {!['completed', 'cancelled', 'failed'].includes(m.status) && (
              <div className="rounded-xl border border-slate-100 p-3">
                <div className="mb-2 text-xs font-bold text-slate-700">Assigner / réassigner un agent</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={assignUserId}
                    onChange={(e) => setAssignUserId(e.target.value)}
                    placeholder="UUID de l'agent"
                    className="df-input flex-1 text-xs"
                  />
                  <button
                    className="df-btn df-btn--primary text-xs"
                    onClick={() => { setError(null); assignMut.mutate(); }}
                    disabled={!assignUserId || assignMut.isPending}
                  >
                    Assigner
                  </button>
                </div>
              </div>
            )}

            {/* Cancel */}
            {!['completed', 'cancelled', 'failed'].includes(m.status) && (
              <button
                className="df-btn df-btn--ghost w-full text-xs text-rose-600"
                onClick={() => {
                  if (confirm('Annuler cette mission ?')) {
                    setError(null);
                    cancelMut.mutate();
                  }
                }}
                disabled={cancelMut.isPending}
              >
                Annuler la mission
              </button>
            )}

            {/* Issues */}
            {(m.issues ?? []).length > 0 && (
              <div>
                <div className="mb-2 text-xs font-bold text-slate-700">Problèmes ({(m.issues ?? []).length})</div>
                {(m.issues ?? []).map((iss) => (
                  <div key={iss.id} className="mb-2 rounded-lg border border-slate-100 p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold">{iss.issue_type}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        iss.severity === 'critical' ? 'bg-rose-100 text-rose-700' :
                        iss.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {iss.severity}
                      </span>
                    </div>
                    <div className="mt-1 text-slate-600">{iss.description}</div>
                    {iss.resolved_at ? (
                      <div className="mt-1 text-emerald-600">Résolu: {iss.resolution_notes}</div>
                    ) : (
                      <ResolveIssueInline missionId={missionId} issueId={iss.id} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'proof' && (
          <div className="mt-4 space-y-4">
            {proofQ.isLoading && <div className="text-sm text-slate-400">Chargement du dossier...</div>}
            {proofQ.data && <ProofView proof={proofQ.data} />}
          </div>
        )}
      </aside>
    </div>
  );
};

// ── Resolve issue inline ────────────────────────────────────────────

const ResolveIssueInline: React.FC<{ missionId: string; issueId: string }> = ({ missionId, issueId }) => {
  const qc = useQueryClient();
  const [notes, setNotes] = useState('');
  const [open, setOpen] = useState(false);

  const mut = useMutation({
    mutationFn: () => mobileOpsApi.resolveIssue(missionId, issueId, notes),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mobile-ops'] }); setOpen(false); },
  });

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-1 text-[10px] font-bold text-indigo-600 hover:underline">
        Résoudre
      </button>
    );
  }

  return (
    <div className="mt-2 flex gap-1">
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes de résolution..."
        className="df-input flex-1 text-[11px]"
      />
      <button
        className="df-btn df-btn--primary text-[10px]"
        onClick={() => mut.mutate()}
        disabled={!notes || mut.isPending}
      >
        OK
      </button>
    </div>
  );
};

// ── Proof view ──────────────────────────────────────────────────────

const ProofView: React.FC<{ proof: MissionProofBundle }> = ({ proof }) => (
  <div className="space-y-4 text-xs">
    {/* Photos by phase */}
    <div>
      <div className="mb-2 font-bold text-slate-700">Photos ({proof.photos_count})</div>
      {Object.keys(proof.photos_by_phase).length === 0 ? (
        <div className="text-slate-400">Aucune photo</div>
      ) : (
        Object.entries(proof.photos_by_phase).map(([phase, photos]) => (
          <div key={phase} className="mb-2">
            <div className="font-mono text-[10px] uppercase text-slate-500">{phase}</div>
            <div className="grid grid-cols-3 gap-1 mt-1">
              {(photos as import('@/services/mobileOpsApi').MobileOpsPhoto[]).map((p) => (
                <div key={p.id} className="rounded border border-slate-100 p-1.5">
                  <div className="truncate text-[10px]">{p.original_filename ?? p.id.slice(0, 8)}</div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>

    {/* Inspections */}
    <div>
      <div className="mb-2 font-bold text-slate-700">Inspections ({proof.inspections.length})</div>
      {proof.inspections.length === 0 ? (
        <div className="text-slate-400">Aucune inspection</div>
      ) : (
        proof.inspections.map((insp) => (
          <div key={insp.id} className="mb-2 rounded-lg bg-slate-50 p-2">
            <div className="font-bold">{insp.inspection_type === 'check_in' ? 'Check-in' : 'Check-out'}</div>
            <div className="text-slate-500">
              {insp.odometer_km != null && `${insp.odometer_km} km · `}
              {insp.fuel_level != null && `${insp.fuel_level}% carburant · `}
              Ext: {insp.exterior_condition ?? '—'} · Int: {insp.interior_condition ?? '—'}
            </div>
            {insp.damage_notes && <div className="mt-1 text-rose-600">{insp.damage_notes}</div>}
          </div>
        ))
      )}
    </div>

    {/* Signatures */}
    <div>
      <div className="mb-2 font-bold text-slate-700">Signatures ({proof.signatures.length})</div>
      {proof.signatures.map((sig) => (
        <div key={sig.id} className="mb-1 rounded-lg bg-emerald-50 p-2 text-emerald-800">
          <span className="font-bold">{sig.signer_name}</span>
          {sig.signed_at && <span> — {formatDate(sig.signed_at)}</span>}
        </div>
      ))}
      {proof.signatures.length === 0 && <div className="text-slate-400">Aucune signature</div>}
    </div>

    {/* Issues */}
    <div>
      <div className="mb-2 font-bold text-slate-700">Problèmes ({proof.issues.length})</div>
      {proof.issues.map((iss) => (
        <div key={iss.id} className="mb-1 rounded-lg border border-slate-100 p-2">
          <span className="font-bold">{iss.issue_type}</span> — {iss.severity} — {iss.description}
          {iss.resolved_at && <span className="text-emerald-600"> (Résolu)</span>}
        </div>
      ))}
      {proof.issues.length === 0 && <div className="text-slate-400">Aucun problème signalé</div>}
    </div>

    {/* Checklist */}
    <div>
      <div className="mb-2 font-bold text-slate-700">Check-list ({proof.checklist.length})</div>
      {proof.checklist.map((c) => (
        <div key={String(c.id)} className="mb-1 flex justify-between rounded bg-slate-50 px-2 py-1">
          <span>
            <span className="font-mono text-[10px] text-slate-400">{c.checklist_phase}</span>{' '}
            {c.item_label}
          </span>
          <span className="text-slate-500">{c.item_status ?? '—'}</span>
        </div>
      ))}
      {proof.checklist.length === 0 && <div className="text-slate-400">Aucun élément</div>}
    </div>
  </div>
);

// ── Create Mission Drawer ───────────────────────────────────────────

const CreateMissionDrawer: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    mission_type: 'delivery' as MissionType,
    vehicle_id: '',
    client_id: '',
    assigned_user_id: '',
    pickup_address: '',
    dropoff_address: '',
    planned_at: '',
    notes: '',
  });

  const createMut = useMutation({
    mutationFn: () =>
      mobileOpsApi.adminCreateMission({
        mission_type: form.mission_type,
        vehicle_id: form.vehicle_id || undefined,
        client_id: form.client_id || undefined,
        assigned_user_id: form.assigned_user_id || undefined,
        pickup_address: form.pickup_address || undefined,
        dropoff_address: form.dropoff_address || undefined,
        planned_at: form.planned_at || undefined,
        notes: form.notes || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mobile-ops'] });
      onClose();
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });

  const set = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-slate-900/40" onClick={onClose} />
      <aside className="w-full max-w-lg overflow-auto bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black">Nouvelle mission</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-xl">&times;</button>
        </div>

        {error && <div className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => { e.preventDefault(); setError(null); createMut.mutate(); }}
        >
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">Type de mission *</label>
            <select value={form.mission_type} onChange={(e) => set('mission_type', e.target.value)} className="df-input w-full text-xs">
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">Agent (UUID)</label>
            <input type="text" value={form.assigned_user_id} onChange={(e) => set('assigned_user_id', e.target.value)} className="df-input w-full text-xs" placeholder="Optionnel" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">Véhicule (UUID)</label>
            <input type="text" value={form.vehicle_id} onChange={(e) => set('vehicle_id', e.target.value)} className="df-input w-full text-xs" placeholder="Optionnel" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">Client (UUID)</label>
            <input type="text" value={form.client_id} onChange={(e) => set('client_id', e.target.value)} className="df-input w-full text-xs" placeholder="Optionnel" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">Adresse de départ</label>
            <input type="text" value={form.pickup_address} onChange={(e) => set('pickup_address', e.target.value)} className="df-input w-full text-xs" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">Adresse d'arrivée</label>
            <input type="text" value={form.dropoff_address} onChange={(e) => set('dropoff_address', e.target.value)} className="df-input w-full text-xs" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">Date planifiée</label>
            <input type="datetime-local" value={form.planned_at} onChange={(e) => set('planned_at', e.target.value)} className="df-input w-full text-xs" />
          </div>

          <div>
            <label className="mb-1 block text-xs font-bold text-slate-700">Notes</label>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} className="df-input w-full text-xs" rows={3} />
          </div>

          <button type="submit" className="df-btn df-btn--primary w-full" disabled={createMut.isPending}>
            {createMut.isPending ? 'Création...' : 'Créer la mission'}
          </button>
        </form>
      </aside>
    </div>
  );
};

// ── Helper ──────────────────────────────────────────────────────────

const InfoCell: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg bg-slate-50 p-2">
    <div className="text-[10px] font-bold text-slate-400">{label}</div>
    <div className="text-xs text-slate-800">{value}</div>
  </div>
);
