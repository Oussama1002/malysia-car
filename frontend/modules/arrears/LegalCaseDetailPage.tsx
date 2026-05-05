import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRepossessionOrder,
  getLegalCase,
  updateLegalCase,
  updateRepossessionOrder,
  type LegalCase,
  type RepossessionOrder,
} from '@/services/arrearsApi';
import { ApiError } from '@/services/apiError';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { EntityAuditTimeline } from '@/modules/shared/components/EntityAuditTimeline';
import { formatCurrencyMad } from '@/modules/shared/formatters';

const STATUS_LABEL: Record<LegalCase['status'], string> = {
  open: 'Ouvert',
  in_progress: 'En cours',
  judgment_obtained: 'Jugement obtenu',
  appeal: 'Appel',
  settled: 'Réglé',
  closed: 'Clôturé',
};

const STATUS_TONE: Record<LegalCase['status'], 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
  open: 'info',
  in_progress: 'warning',
  judgment_obtained: 'success',
  appeal: 'warning',
  settled: 'success',
  closed: 'default',
};

const REPO_STATUS_LABEL: Record<RepossessionOrder['status'], string> = {
  ordered: 'Ordonné',
  in_progress: 'En cours',
  completed: 'Effectué',
  failed: 'Échoué',
  cancelled: 'Annulé',
};

const REPO_STATUS_TONE: Record<RepossessionOrder['status'], 'default' | 'info' | 'success' | 'warning' | 'danger'> = {
  ordered: 'info',
  in_progress: 'warning',
  completed: 'success',
  failed: 'danger',
  cancelled: 'default',
};

export const LegalCaseDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [repoDrawer, setRepoDrawer] = useState(false);
  const [editStatusDrawer, setEditStatusDrawer] = useState(false);
  const [newStatus, setNewStatus] = useState<LegalCase['status']>('in_progress');

  const legalQ = useQuery({
    queryKey: ['arrears', 'legal-case', id],
    queryFn: () => getLegalCase(id!),
    enabled: !!id,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['arrears', 'legal-case', id] });
    qc.invalidateQueries({ queryKey: ['arrears', 'legal-cases'] });
  };

  const updateStatusMut = useMutation({
    mutationFn: () => updateLegalCase(id!, { status: newStatus }),
    onSuccess: () => { invalidate(); setEditStatusDrawer(false); setError(null); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const createRepoMut = useMutation({
    mutationFn: (p: Parameters<typeof createRepossessionOrder>[1]) => createRepossessionOrder(id!, p),
    onSuccess: () => { invalidate(); setRepoDrawer(false); setError(null); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const updateRepoMut = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: RepossessionOrder['status'] }) =>
      updateRepossessionOrder(orderId, { status }),
    onSuccess: () => { invalidate(); setError(null); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const legalCase = legalQ.data?.data;

  if (legalQ.isLoading) return <div className="text-slate-500 p-6">Chargement…</div>;
  if (!legalCase) return <div className="text-rose-600 p-6">Dossier juridique introuvable.</div>;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/arrears/legal" className="text-xs font-bold text-indigo-600">← Dossiers juridiques</Link>
          <h1 className="text-2xl font-black text-slate-900">{legalCase.case_number}</h1>
          <p className="text-slate-500">{legalCase.customer?.full_name ?? legalCase.customer_id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge label={STATUS_LABEL[legalCase.status]} tone={STATUS_TONE[legalCase.status]} />
          <button className="df-btn df-btn--ghost text-xs" onClick={() => { setNewStatus(legalCase.status); setEditStatusDrawer(true); }}>Changer statut</button>
          {(legalCase.case_type === 'repossession' || legalCase.case_type === 'judgment') && (
            <button className="df-btn df-btn--primary text-xs" onClick={() => { setError(null); setRepoDrawer(true); }}>+ Ordre de saisie</button>
          )}
        </div>
      </header>

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="df-card"><div className="df-card__body">
          <div className="text-xs font-bold uppercase text-slate-500">Montant réclamé</div>
          <div className="text-xl font-black text-rose-600 mt-1">{formatCurrencyMad(Number(legalCase.claimed_amount))}</div>
        </div></div>
        {legalCase.awarded_amount != null && (
          <div className="df-card"><div className="df-card__body">
            <div className="text-xs font-bold uppercase text-slate-500">Montant accordé</div>
            <div className="text-xl font-black text-emerald-600 mt-1">{formatCurrencyMad(Number(legalCase.awarded_amount))}</div>
          </div></div>
        )}
        <div className="df-card"><div className="df-card__body">
          <div className="text-xs font-bold uppercase text-slate-500">Ordres de saisie</div>
          <div className="text-xl font-black text-slate-900 mt-1">{(legalCase.repossession_orders ?? []).length}</div>
        </div></div>
      </div>

      {/* Details */}
      <div className="df-card">
        <div className="df-card__body grid gap-3 md:grid-cols-3 text-sm">
          <div><span className="font-bold text-slate-500">Type : </span><span className="text-slate-800">{legalCase.case_type}</span></div>
          {legalCase.lawyer_name && <div><span className="font-bold text-slate-500">Avocat : </span><span className="text-slate-800">{legalCase.lawyer_name}</span></div>}
          {legalCase.lawyer_contact && <div><span className="font-bold text-slate-500">Contact avocat : </span><span className="text-slate-800">{legalCase.lawyer_contact}</span></div>}
          {legalCase.court_name && <div><span className="font-bold text-slate-500">Tribunal : </span><span className="text-slate-800">{legalCase.court_name}</span></div>}
          {legalCase.court_reference && <div><span className="font-bold text-slate-500">Réf. tribunal : </span><span className="font-mono text-slate-800">{legalCase.court_reference}</span></div>}
          {legalCase.filing_date && <div><span className="font-bold text-slate-500">Dépôt : </span><span className="text-slate-800">{legalCase.filing_date}</span></div>}
          {legalCase.hearing_date && <div><span className="font-bold text-slate-500">Audience : </span><span className="text-slate-800">{legalCase.hearing_date}</span></div>}
          {legalCase.judgment_date && <div><span className="font-bold text-slate-500">Jugement : </span><span className="text-slate-800">{legalCase.judgment_date}</span></div>}
          {legalCase.judgment_summary && (
            <div className="md:col-span-3"><span className="font-bold text-slate-500">Résumé jugement : </span><span className="text-slate-700">{legalCase.judgment_summary}</span></div>
          )}
          {legalCase.notes && (
            <div className="md:col-span-3"><span className="font-bold text-slate-500">Notes : </span><span className="text-slate-700">{legalCase.notes}</span></div>
          )}
        </div>
      </div>

      {/* Link to arrears case */}
      {legalCase.arrears_case && (
        <div className="df-card">
          <div className="df-card__body flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase text-slate-500">Dossier contentieux lié</div>
              <div className="font-mono font-bold text-slate-900 mt-1">{legalCase.arrears_case.case_number}</div>
            </div>
            <Link to={`/arrears/${legalCase.arrears_case.id}`} className="df-btn df-btn--ghost text-xs">Voir dossier →</Link>
          </div>
        </div>
      )}

      {/* Repossession orders */}
      {(legalCase.repossession_orders ?? []).length > 0 && (
        <div className="df-card overflow-x-auto">
          <div className="df-card__body border-b border-slate-100 pb-2">
            <h2 className="font-bold text-slate-800">Ordres de saisie</h2>
          </div>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">N° ordre</th>
                <th>Ordonné le</th>
                <th>Agent</th>
                <th>Lieu</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(legalCase.repossession_orders ?? []).map((order) => (
                <tr key={order.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono font-bold text-slate-900">{order.order_number}</td>
                  <td className="text-slate-700">{order.ordered_at}</td>
                  <td className="text-slate-600">{order.recovery_agent ?? '—'}</td>
                  <td className="text-slate-600">{order.recovery_location ?? '—'}</td>
                  <td><StatusBadge label={REPO_STATUS_LABEL[order.status]} tone={REPO_STATUS_TONE[order.status]} /></td>
                  <td className="px-2">
                    {order.status === 'ordered' && (
                      <div className="flex gap-1">
                        <button
                          className="df-btn df-btn--ghost text-xs"
                          onClick={() => updateRepoMut.mutate({ orderId: order.id, status: 'in_progress' })}
                        >En cours</button>
                        <button
                          className="df-btn df-btn--ghost text-xs text-emerald-600"
                          onClick={() => updateRepoMut.mutate({ orderId: order.id, status: 'completed' })}
                        >Effectué</button>
                        <button
                          className="df-btn df-btn--ghost text-xs text-rose-600"
                          onClick={() => updateRepoMut.mutate({ orderId: order.id, status: 'failed' })}
                        >Échoué</button>
                      </div>
                    )}
                    {order.status === 'in_progress' && (
                      <div className="flex gap-1">
                        <button
                          className="df-btn df-btn--ghost text-xs text-emerald-600"
                          onClick={() => updateRepoMut.mutate({ orderId: order.id, status: 'completed' })}
                        >Effectué</button>
                        <button
                          className="df-btn df-btn--ghost text-xs text-rose-600"
                          onClick={() => updateRepoMut.mutate({ orderId: order.id, status: 'failed' })}
                        >Échoué</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <div className="mb-3 text-sm font-black text-slate-900">Audit & traçabilité</div>
        <EntityAuditTimeline entityType="legal_case" entityId={String(legalCase.id ?? id)} />
      </div>

      {/* Status change drawer */}
      <DrawerPanel open={editStatusDrawer} title="Changer le statut" onClose={() => setEditStatusDrawer(false)}>
        <div className="space-y-4">
          {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
          <div>
            <label className="text-xs font-bold uppercase text-slate-500">Nouveau statut</label>
            <select className="df-input mt-1" value={newStatus} onChange={(e) => setNewStatus(e.target.value as LegalCase['status'])}>
              {(Object.entries(STATUS_LABEL) as [LegalCase['status'], string][]).map(([k, l]) => (
                <option key={k} value={k}>{l}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button className="df-btn df-btn--ghost" onClick={() => setEditStatusDrawer(false)}>Annuler</button>
            <button className="df-btn df-btn--primary" disabled={updateStatusMut.isPending} onClick={() => updateStatusMut.mutate()}>
              {updateStatusMut.isPending ? 'Mise à jour…' : 'Confirmer'}
            </button>
          </div>
        </div>
      </DrawerPanel>

      {/* Repossession order drawer */}
      <DrawerPanel open={repoDrawer} title="Nouvel ordre de saisie" onClose={() => setRepoDrawer(false)}>
        <RepossessionForm
          submitting={createRepoMut.isPending}
          error={error}
          onCancel={() => setRepoDrawer(false)}
          onSubmit={(p) => { setError(null); createRepoMut.mutate(p); }}
        />
      </DrawerPanel>
    </div>
  );
};

const RepossessionForm: React.FC<{
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (p: Parameters<typeof createRepossessionOrder>[1]) => void;
}> = ({ submitting, error, onCancel, onSubmit }) => {
  const [form, setForm] = useState<Parameters<typeof createRepossessionOrder>[1]>({
    vehicle_id: '',
    ordered_at: new Date().toISOString().substring(0, 10),
  });

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">ID Véhicule *</label>
        <input className="df-input mt-1" value={form.vehicle_id} onChange={(e) => setForm({ ...form, vehicle_id: e.target.value })} required placeholder="UUID du véhicule" />
      </div>
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Date d'ordre *</label>
        <input type="date" className="df-input mt-1" value={form.ordered_at} onChange={(e) => setForm({ ...form, ordered_at: e.target.value })} required />
      </div>
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Agent de recouvrement</label>
        <input className="df-input mt-1" value={form.recovery_agent ?? ''} onChange={(e) => setForm({ ...form, recovery_agent: e.target.value || undefined })} />
      </div>
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Lieu de saisie prévu</label>
        <input className="df-input mt-1" value={form.recovery_location ?? ''} onChange={(e) => setForm({ ...form, recovery_location: e.target.value || undefined })} />
      </div>
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Notes</label>
        <textarea className="df-input mt-1" rows={3} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value || undefined })} />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" className="df-btn df-btn--ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="df-btn df-btn--primary" disabled={submitting}>{submitting ? 'Création…' : 'Créer l\'ordre'}</button>
      </div>
    </form>
  );
};
