import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mobileOpsApi, type MobileOpsMissionDto, type MobileOpsMissionStatus } from '@/services/mobileOpsApi';
import { formatDate } from '@/modules/shared/formatters';
import { SignaturePad } from '../components/SignaturePad';
import { VehicleInspectionForm } from '../components/VehicleInspectionForm';
import { IssueReportForm } from '../components/IssueReportForm';

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

const PHOTO_PHASES = [
  { key: 'front', label: 'Avant' },
  { key: 'rear', label: 'Arrière' },
  { key: 'left', label: 'Gauche' },
  { key: 'right', label: 'Droite' },
  { key: 'interior', label: 'Intérieur' },
  { key: 'odometer', label: 'Compteur' },
  { key: 'damage', label: 'Dommages' },
  { key: 'fuel', label: 'Carburant' },
  { key: 'documents', label: 'Documents' },
];

type Tab = 'workflow' | 'inspection' | 'photos' | 'signature' | 'issue';

/**
 * Mobile-first agent view.
 * Shows one mission at a time with step-by-step workflow.
 */
export const AgentMobileView: React.FC = () => {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');

  const listQ = useQuery({
    queryKey: ['mobile-ops', 'my-missions', filterStatus],
    queryFn: () => mobileOpsApi.myMissions({ status: filterStatus || undefined }),
    refetchInterval: 30_000,
  });

  const missions = listQ.data?.data ?? [];

  if (selectedId) {
    return (
      <MissionWorkflow
        missionId={selectedId}
        onBack={() => {
          setSelectedId(null);
          qc.invalidateQueries({ queryKey: ['mobile-ops'] });
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-black text-slate-900">Mes missions</h1>
        <p className="text-xs text-slate-500">Appuyez sur une mission pour la traiter</p>
      </header>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5">
        {['', 'assigned', 'accepted', 'in_progress', 'arrived'].map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${
              filterStatus === s ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {s === '' ? 'Toutes' : STATUS_LABEL[s] ?? s}
          </button>
        ))}
      </div>

      {listQ.isLoading && <div className="py-8 text-center text-sm text-slate-400">Chargement...</div>}

      {!listQ.isLoading && missions.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center">
          <div className="text-sm font-bold text-slate-700">Aucune mission</div>
          <div className="mt-1 text-xs text-slate-500">Aucune mission ne vous est assignée pour le moment.</div>
        </div>
      )}

      <div className="space-y-2">
        {missions.map((m) => (
          <MissionCard key={m.id} mission={m} onSelect={() => setSelectedId(m.id)} />
        ))}
      </div>
    </div>
  );
};

// ── Mission Card ────────────────────────────────────────────────────

const MissionCard: React.FC<{ mission: MobileOpsMissionDto; onSelect: () => void }> = ({ mission: m, onSelect }) => {
  const isUrgent = ['assigned', 'accepted'].includes(m.status);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:shadow-md ${
        isUrgent ? 'border-amber-200' : 'border-slate-100'
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="font-mono text-[10px] text-slate-400">{m.mission_number ?? m.id.slice(0, 8)}</div>
          <div className="text-sm font-bold text-slate-900">{TYPE_LABEL[m.mission_type] ?? m.mission_type}</div>
        </div>
        <span className={`rounded-lg px-2 py-0.5 text-[10px] font-black uppercase ${STATUS_TONE[m.status] ?? 'bg-slate-100'}`}>
          {STATUS_LABEL[m.status] ?? m.status}
        </span>
      </div>

      <div className="mt-2 space-y-0.5 text-xs text-slate-600">
        {m.vehicle && <div>Véhicule: <span className="font-bold">{m.vehicle.registration_number}</span></div>}
        {m.client && <div>Client: <span className="font-bold">{m.client.customer_code}</span></div>}
        {(m.pickup_address || m.origin_address) && <div>De: {m.pickup_address ?? m.origin_address}</div>}
        {(m.dropoff_address || m.destination_address) && <div>Vers: {m.dropoff_address ?? m.destination_address}</div>}
        {m.planned_at && <div className="text-[10px] text-slate-400">Planifiée: {formatDate(m.planned_at)}</div>}
      </div>

      <div className="mt-2 flex gap-2 text-[10px] text-slate-400">
        {(m.photos_count ?? 0) > 0 && <span>{m.photos_count} photos</span>}
        {(m.inspections_count ?? 0) > 0 && <span>{m.inspections_count} inspection(s)</span>}
        {(m.issues_count ?? 0) > 0 && <span className="text-rose-500">{m.issues_count} problème(s)</span>}
      </div>
    </button>
  );
};

// ── Mission Workflow (single mission detail) ────────────────────────

const MissionWorkflow: React.FC<{ missionId: string; onBack: () => void }> = ({ missionId, onBack }) => {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('workflow');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const detailQ = useQuery({
    queryKey: ['mobile-ops', 'mission', missionId],
    queryFn: () => mobileOpsApi.getMission(missionId),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['mobile-ops', 'mission', missionId] });
    qc.invalidateQueries({ queryKey: ['mobile-ops', 'my-missions'] });
  };

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setError(null);
    setTimeout(() => setSuccess(null), 3000);
  };

  // Lifecycle mutations
  const acceptMut = useMutation({
    mutationFn: () => mobileOpsApi.accept(missionId),
    onSuccess: () => { refresh(); showSuccess('Mission acceptée'); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });
  const startMut = useMutation({
    mutationFn: () => mobileOpsApi.start(missionId),
    onSuccess: () => { refresh(); showSuccess('Mission démarrée'); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });
  const arriveMut = useMutation({
    mutationFn: () => mobileOpsApi.arrive(missionId),
    onSuccess: () => { refresh(); showSuccess('Arrivée confirmée'); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });
  const completeMut = useMutation({
    mutationFn: (status: 'completed' | 'failed') => mobileOpsApi.complete(missionId, status),
    onSuccess: () => { refresh(); showSuccess('Mission clôturée'); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });
  const inspectionMut = useMutation({
    mutationFn: (data: Parameters<typeof mobileOpsApi.submitInspection>[1]) =>
      mobileOpsApi.submitInspection(missionId, data),
    onSuccess: () => { refresh(); showSuccess('Inspection enregistrée'); setTab('workflow'); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });
  const issueMut = useMutation({
    mutationFn: (data: Parameters<typeof mobileOpsApi.reportIssue>[1]) =>
      mobileOpsApi.reportIssue(missionId, data),
    onSuccess: () => { refresh(); showSuccess('Problème signalé'); setTab('workflow'); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });
  const signatureMut = useMutation({
    mutationFn: (dataUrl: string) => {
      const signerName = prompt('Nom du signataire:') || 'Client';
      return mobileOpsApi.captureSignature(missionId, { signer_name: signerName, data_url: dataUrl });
    },
    onSuccess: () => { refresh(); showSuccess('Signature capturée'); setTab('workflow'); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });
  const photoMut = useMutation({
    mutationFn: (input: { phase: string; files: File[] }) =>
      mobileOpsApi.uploadPhotos(missionId, input.files, { phase: input.phase }),
    onSuccess: () => { refresh(); showSuccess('Photos envoyées'); },
    onError: (e) => setError(e instanceof Error ? e.message : 'Erreur'),
  });

  const m = detailQ.data;
  if (detailQ.isLoading) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="text-xs font-bold text-indigo-600">&larr; Retour</button>
        <div className="py-8 text-center text-sm text-slate-400">Chargement...</div>
      </div>
    );
  }
  if (!m) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="text-xs font-bold text-indigo-600">&larr; Retour</button>
        <div className="py-8 text-center text-sm text-slate-500">Mission introuvable.</div>
      </div>
    );
  }

  const isActive = ['assigned', 'accepted', 'in_progress', 'arrived'].includes(m.status);
  const TABS: { key: Tab; label: string; show: boolean }[] = [
    { key: 'workflow', label: 'Mission', show: true },
    { key: 'inspection', label: 'Inspection', show: isActive },
    { key: 'photos', label: 'Photos', show: isActive },
    { key: 'signature', label: 'Signature', show: isActive },
    { key: 'issue', label: 'Problème', show: isActive },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-xs font-bold text-indigo-600">&larr; Retour</button>
        <div className="flex-1">
          <div className="font-mono text-[10px] text-slate-400">{m.mission_number ?? m.id.slice(0, 8)}</div>
          <div className="text-lg font-black text-slate-900">{TYPE_LABEL[m.mission_type] ?? m.mission_type}</div>
        </div>
        <span className={`rounded-lg px-2.5 py-1 text-xs font-black uppercase ${STATUS_TONE[m.status]}`}>
          {STATUS_LABEL[m.status] ?? m.status}
        </span>
      </div>

      {/* Alerts */}
      {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
      {success && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</div>}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {TABS.filter((t) => t.show).map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setError(null); }}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'workflow' && (
        <WorkflowTab
          mission={m}
          onAccept={() => { setError(null); acceptMut.mutate(); }}
          onStart={() => { setError(null); startMut.mutate(); }}
          onArrive={() => { setError(null); arriveMut.mutate(); }}
          onComplete={(s) => { setError(null); completeMut.mutate(s); }}
          isPending={acceptMut.isPending || startMut.isPending || arriveMut.isPending || completeMut.isPending}
        />
      )}

      {tab === 'inspection' && (
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          <h3 className="mb-3 text-sm font-black text-slate-900">Inspection véhicule</h3>
          <VehicleInspectionForm
            onSubmit={(data) => inspectionMut.mutate(data)}
            isPending={inspectionMut.isPending}
          />
          {/* Previous inspections */}
          {(m.inspections ?? []).length > 0 && (
            <div className="mt-4 border-t pt-3">
              <div className="mb-2 text-xs font-bold text-slate-500">Inspections précédentes</div>
              {(m.inspections ?? []).map((insp) => (
                <div key={insp.id} className="mb-2 rounded-lg bg-slate-50 p-2 text-xs">
                  <div className="font-bold">{insp.inspection_type === 'check_in' ? 'Check-in' : 'Check-out'}</div>
                  <div className="text-slate-500">
                    {insp.odometer_km && `${insp.odometer_km} km`}
                    {insp.fuel_level != null && ` · ${insp.fuel_level}% carburant`}
                    {insp.exterior_condition && ` · Ext: ${insp.exterior_condition}`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'photos' && (
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          <h3 className="mb-3 text-sm font-black text-slate-900">Photos</h3>
          <div className="grid grid-cols-3 gap-2">
            {PHOTO_PHASES.map((phase) => (
              <label
                key={phase.key}
                className="cursor-pointer rounded-xl border border-dashed border-slate-200 p-3 text-center text-[11px] font-bold text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50"
              >
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []) as File[];
                    if (files.length > 0) {
                      setError(null);
                      photoMut.mutate({ phase: phase.key, files });
                    }
                  }}
                />
                {phase.label}
              </label>
            ))}
          </div>
          {photoMut.isPending && <div className="mt-2 text-xs text-slate-400">Envoi en cours...</div>}

          {/* Photo gallery */}
          {(m.photos ?? []).length > 0 && (
            <div className="mt-4 border-t pt-3">
              <div className="mb-2 text-xs font-bold text-slate-500">{(m.photos ?? []).length} photo(s)</div>
              <ul className="grid grid-cols-2 gap-2">
                {(m.photos ?? []).map((p) => (
                  <li key={p.id} className="rounded-lg border border-slate-100 p-2">
                    <div className="font-mono text-[10px] uppercase text-slate-400">{p.phase ?? 'photo'}</div>
                    <div className="truncate text-xs text-slate-600">{p.original_filename ?? p.id.slice(0, 8)}</div>
                    <div className="text-[10px] text-slate-400">{p.created_at ? formatDate(p.created_at) : ''}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === 'signature' && (
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          <h3 className="mb-3 text-sm font-black text-slate-900">Signature client</h3>
          {(m.signatures ?? []).length > 0 ? (
            <div className="mb-4 space-y-2">
              {(m.signatures ?? []).map((sig) => (
                <div key={sig.id} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  Signé par <span className="font-bold">{sig.signer_name}</span>
                  {sig.signed_at && <span> le {formatDate(sig.signed_at)}</span>}
                </div>
              ))}
            </div>
          ) : m.customer_signature_file_id ? (
            <div className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
              Signature capturée
            </div>
          ) : null}
          <SignaturePad
            onCapture={(dataUrl) => { setError(null); signatureMut.mutate(dataUrl); }}
            disabled={signatureMut.isPending}
          />
          {signatureMut.isPending && <div className="mt-2 text-xs text-slate-400">Envoi...</div>}
        </div>
      )}

      {tab === 'issue' && (
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          <h3 className="mb-3 text-sm font-black text-slate-900">Signaler un problème</h3>
          <IssueReportForm onSubmit={(data) => issueMut.mutate(data)} isPending={issueMut.isPending} />
          {/* Previous issues */}
          {(m.issues ?? []).length > 0 && (
            <div className="mt-4 border-t pt-3">
              <div className="mb-2 text-xs font-bold text-slate-500">Problèmes signalés</div>
              {(m.issues ?? []).map((iss) => (
                <div key={iss.id} className="mb-2 rounded-lg border border-slate-100 p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{iss.issue_type}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      iss.severity === 'critical' ? 'bg-rose-100 text-rose-700' :
                      iss.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                      iss.severity === 'medium' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {iss.severity}
                    </span>
                  </div>
                  <div className="mt-1 text-slate-600">{iss.description}</div>
                  {iss.resolved_at && (
                    <div className="mt-1 text-emerald-600">Résolu: {iss.resolution_notes}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ── Workflow tab with lifecycle actions ──────────────────────────────

const WorkflowTab: React.FC<{
  mission: MobileOpsMissionDto;
  onAccept: () => void;
  onStart: () => void;
  onArrive: () => void;
  onComplete: (s: 'completed' | 'failed') => void;
  isPending: boolean;
}> = ({ mission: m, onAccept, onStart, onArrive, onComplete, isPending }) => {
  // Status flow visualization
  const steps: { status: MobileOpsMissionStatus; label: string }[] = [
    { status: 'assigned', label: 'Assignée' },
    { status: 'accepted', label: 'Acceptée' },
    { status: 'in_progress', label: 'En route' },
    { status: 'arrived', label: 'Sur site' },
    { status: 'completed', label: 'Terminée' },
  ];
  const statusOrder = ['pending', 'assigned', 'accepted', 'in_progress', 'arrived', 'completed'];
  const currentIdx = statusOrder.indexOf(m.status);

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <div className="flex items-center justify-between">
          {steps.map((step, i) => {
            const stepIdx = statusOrder.indexOf(step.status);
            const done = currentIdx >= stepIdx;
            const active = m.status === step.status;
            return (
              <React.Fragment key={step.status}>
                {i > 0 && (
                  <div className={`mx-1 h-0.5 flex-1 ${done ? 'bg-indigo-400' : 'bg-slate-200'}`} />
                )}
                <div className="flex flex-col items-center">
                  <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold ${
                    active ? 'bg-indigo-600 text-white ring-2 ring-indigo-200' :
                    done ? 'bg-indigo-400 text-white' :
                    'bg-slate-200 text-slate-500'
                  }`}>
                    {done && !active ? '✓' : i + 1}
                  </div>
                  <span className={`mt-1 text-[9px] font-bold ${active ? 'text-indigo-700' : 'text-slate-400'}`}>
                    {step.label}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Mission info */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4 space-y-2 text-sm">
        <InfoRow label="Type" value={TYPE_LABEL[m.mission_type] ?? m.mission_type} />
        {m.vehicle && <InfoRow label="Véhicule" value={m.vehicle.registration_number} />}
        {m.client && <InfoRow label="Client" value={`${m.client.customer_code} (${m.client.customer_type})`} />}
        {(m.pickup_address || m.origin_address) && <InfoRow label="Adresse départ" value={(m.pickup_address ?? m.origin_address)!} />}
        {(m.dropoff_address || m.destination_address) && <InfoRow label="Adresse arrivée" value={(m.dropoff_address ?? m.destination_address)!} />}
        {m.planned_at && <InfoRow label="Planifiée" value={formatDate(m.planned_at)} />}
        {m.actual_start_at && <InfoRow label="Démarrée" value={formatDate(m.actual_start_at)} />}
        {m.arrived_at && <InfoRow label="Arrivée" value={formatDate(m.arrived_at)} />}
        {m.notes && <InfoRow label="Notes" value={m.notes} />}
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        {(m.status === 'assigned' || m.status === 'pending') && (
          <button className="df-btn df-btn--primary w-full py-3 text-sm" onClick={onAccept} disabled={isPending}>
            Accepter la mission
          </button>
        )}
        {m.status === 'accepted' && (
          <button className="df-btn df-btn--primary w-full py-3 text-sm" onClick={onStart} disabled={isPending}>
            Démarrer (en route)
          </button>
        )}
        {m.status === 'in_progress' && (
          <button className="df-btn df-btn--primary w-full py-3 text-sm" onClick={onArrive} disabled={isPending}>
            Je suis arrivé
          </button>
        )}
        {(m.status === 'in_progress' || m.status === 'arrived') && (
          <>
            <button
              className="df-btn df-btn--primary w-full py-3 text-sm bg-emerald-600 hover:bg-emerald-700"
              onClick={() => onComplete('completed')}
              disabled={isPending}
            >
              Clôturer (succès)
            </button>
            <button
              className="df-btn df-btn--ghost w-full py-2 text-sm text-rose-600"
              onClick={() => onComplete('failed')}
              disabled={isPending}
            >
              Marquer en échec
            </button>
          </>
        )}
      </div>

      {/* Checklist summary */}
      {(m.checklist_items ?? []).length > 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          <div className="mb-2 text-xs font-black text-slate-900">Check-list ({(m.checklist_items ?? []).length})</div>
          <ul className="space-y-1">
            {(m.checklist_items ?? []).map((c) => (
              <li key={String(c.id)} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                <span>
                  <span className="font-mono text-[10px] uppercase text-slate-400">{c.checklist_phase}</span>{' '}
                  <span className="font-semibold text-slate-700">{c.item_label}</span>
                </span>
                <span className="font-mono text-[10px] text-slate-500">{c.item_status ?? '—'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const InfoRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between gap-4">
    <span className="text-xs font-bold text-slate-500">{label}</span>
    <span className="text-right text-xs text-slate-800">{value}</span>
  </div>
);
