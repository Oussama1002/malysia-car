import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ACTION_TYPE_LABEL,
  addArrearsAction,
  ARREARS_STAGE_LABEL,
  arrearsStageTone,
  escalateArrearsCase,
  getArrearsCase,
  type ActionType,
  type ArrearsCase,
} from '@/services/arrearsApi';
import { ApiError } from '@/services/apiError';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { formatCurrencyMad } from '@/modules/shared/formatters';

const ACTION_TYPES: ActionType[] = [
  'note', 'reminder_call', 'reminder_sms', 'reminder_email',
  'formal_notice', 'payment_promise', 'partial_payment',
  'legal_transfer', 'repossession_order', 'repossession_done',
  'settlement', 'write_off', 'stage_change', 'close',
];

const ACTION_ICON: Record<ActionType, string> = {
  note: '📝',
  reminder_call: '📞',
  reminder_sms: '💬',
  reminder_email: '✉️',
  formal_notice: '⚖️',
  payment_promise: '🤝',
  partial_payment: '💰',
  legal_transfer: '🏛️',
  repossession_order: '🔑',
  repossession_done: '✅',
  settlement: '🕊️',
  write_off: '✏️',
  stage_change: '🔄',
  close: '🔒',
};

export const ArrearsCaseDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [actionDrawer, setActionDrawer] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');
  const [showEscalate, setShowEscalate] = useState(false);

  const caseQ = useQuery({
    queryKey: ['arrears', 'case', id],
    queryFn: () => getArrearsCase(id!),
    enabled: !!id,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['arrears', 'case', id] });
    qc.invalidateQueries({ queryKey: ['arrears', 'cases'] });
  };

  const actionMut = useMutation({
    mutationFn: (p: Parameters<typeof addArrearsAction>[1]) => addArrearsAction(id!, p),
    onSuccess: () => { invalidate(); setActionDrawer(false); setError(null); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const escalateMut = useMutation({
    mutationFn: () => escalateArrearsCase(id!, escalateReason),
    onSuccess: () => { invalidate(); setShowEscalate(false); setError(null); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const arrCase = caseQ.data?.data;

  if (caseQ.isLoading) return <div className="text-slate-500 p-6">Chargement…</div>;
  if (!arrCase) return <div className="text-rose-600 p-6">Dossier introuvable.</div>;

  const recoveryRate = arrCase.total_overdue > 0
    ? ((arrCase.total_recovered / arrCase.total_overdue) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/arrears" className="text-xs font-bold text-indigo-600">← Contentieux</Link>
          <h1 className="text-2xl font-black text-slate-900">{arrCase.case_number}</h1>
          <p className="text-slate-500">{arrCase.customer?.full_name ?? arrCase.customer_id}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {arrCase.stage !== 'closed' && (
            <>
              <button className="df-btn df-btn--ghost" onClick={() => { setError(null); setShowEscalate(true); }}>↑ Escalader</button>
              <button className="df-btn df-btn--primary" onClick={() => { setError(null); setActionDrawer(true); }}>+ Action</button>
            </>
          )}
          {arrCase.legal_case && (
            <Link to={`/arrears/legal/${arrCase.legal_case.id}`} className="df-btn df-btn--ghost text-indigo-600">Dossier juridique →</Link>
          )}
        </div>
      </header>

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {/* KPIs */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="df-card"><div className="df-card__body">
          <div className="text-xs font-bold uppercase text-slate-500">Impayé total</div>
          <div className="text-xl font-black text-rose-600 mt-1">{formatCurrencyMad(Number(arrCase.total_overdue))}</div>
        </div></div>
        <div className="df-card"><div className="df-card__body">
          <div className="text-xs font-bold uppercase text-slate-500">Recouvré</div>
          <div className="text-xl font-black text-emerald-600 mt-1">{formatCurrencyMad(Number(arrCase.total_recovered))}</div>
          <div className="text-xs text-slate-500">{recoveryRate}% récupéré</div>
        </div></div>
        <div className="df-card"><div className="df-card__body">
          <div className="text-xs font-bold uppercase text-slate-500">Jours de retard</div>
          <div className={`text-xl font-black mt-1 ${Number(arrCase.days_overdue) > 90 ? 'text-rose-600' : 'text-orange-500'}`}>{arrCase.days_overdue}j</div>
          <div className="text-xs text-slate-500">{arrCase.overdue_installments_count} échéances</div>
        </div></div>
        <div className="df-card"><div className="df-card__body">
          <div className="text-xs font-bold uppercase text-slate-500">Étape</div>
          <div className="mt-1"><StatusBadge label={ARREARS_STAGE_LABEL[arrCase.stage]} tone={arrearsStageTone(arrCase.stage)} /></div>
        </div></div>
      </div>

      {/* Info */}
      <div className="df-card">
        <div className="df-card__body grid gap-3 md:grid-cols-3 text-sm">
          <div><span className="font-bold text-slate-500">Client : </span>
            <Link to={`/customers/${arrCase.customer_id}`} className="text-indigo-600 font-semibold hover:underline">
              {arrCase.customer?.full_name ?? arrCase.customer_id}
            </Link>
          </div>
          {arrCase.contract && (
            <div><span className="font-bold text-slate-500">Contrat : </span>
              <Link to={`/contracts/${arrCase.contract.id}`} className="text-indigo-600 font-mono hover:underline">
                {arrCase.contract.contract_number}
              </Link>
            </div>
          )}
          {arrCase.next_action_date && (
            <div><span className="font-bold text-slate-500">Prochaine action : </span>
              <span className="text-slate-800">{arrCase.next_action_date}</span>
            </div>
          )}
          {arrCase.notes && (
            <div className="md:col-span-3"><span className="font-bold text-slate-500">Notes : </span>
              <span className="text-slate-700">{arrCase.notes}</span>
            </div>
          )}
        </div>
      </div>

      {/* Escalation form */}
      {showEscalate && (
        <div className="df-card border-2 border-orange-200">
          <div className="df-card__body space-y-3">
            <h2 className="font-bold text-orange-700">Escalader le dossier</h2>
            <p className="text-sm text-slate-600">Le dossier passera à l'étape suivante de la procédure.</p>
            <textarea
              className="df-input w-full"
              rows={3}
              placeholder="Motif d'escalade…"
              value={escalateReason}
              onChange={(e) => setEscalateReason(e.target.value)}
            />
            <div className="flex gap-2">
              <button className="df-btn df-btn--ghost" onClick={() => setShowEscalate(false)}>Annuler</button>
              <button
                className="df-btn df-btn--primary"
                disabled={escalateMut.isPending}
                onClick={() => escalateMut.mutate()}
              >
                {escalateMut.isPending ? 'Escalade…' : 'Confirmer l\'escalade'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action timeline */}
      <div className="space-y-3">
        <h2 className="font-bold text-slate-800">Historique des actions</h2>
        {(arrCase.actions ?? []).length === 0 ? (
          <p className="text-slate-500 text-sm">Aucune action enregistrée pour ce dossier.</p>
        ) : (
          <div className="relative space-y-4 before:absolute before:left-6 before:top-0 before:bottom-0 before:w-0.5 before:bg-slate-200">
            {[...(arrCase.actions ?? [])].reverse().map((action) => (
              <div key={action.id} className="flex gap-4 relative pl-14">
                <div className="absolute left-3 w-7 h-7 rounded-full bg-white border-2 border-indigo-300 flex items-center justify-center text-sm">
                  {ACTION_ICON[action.action_type] ?? '•'}
                </div>
                <div className="df-card flex-1">
                  <div className="df-card__body space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 text-sm">{ACTION_TYPE_LABEL[action.action_type]}</span>
                      <span className="text-xs text-slate-400">{action.action_date}</span>
                    </div>
                    <p className="text-sm text-slate-700">{action.description}</p>
                    {action.amount != null && action.amount > 0 && (
                      <div className="text-xs text-emerald-600 font-bold">Montant : {formatCurrencyMad(Number(action.amount))}</div>
                    )}
                    {action.promise_date && (
                      <div className="text-xs text-indigo-600">Promesse pour le : {action.promise_date}</div>
                    )}
                    {action.new_stage && (
                      <div className="text-xs text-slate-500">→ Étape : <StatusBadge label={ARREARS_STAGE_LABEL[action.new_stage as ArrearsCase['stage']]} tone={arrearsStageTone(action.new_stage as ArrearsCase['stage'])} /></div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action drawer */}
      <DrawerPanel open={actionDrawer} title="Ajouter une action" onClose={() => setActionDrawer(false)}>
        <ActionForm
          submitting={actionMut.isPending}
          error={error}
          onCancel={() => setActionDrawer(false)}
          onSubmit={(p) => { setError(null); actionMut.mutate(p); }}
        />
      </DrawerPanel>
    </div>
  );
};

const ActionForm: React.FC<{
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (p: Parameters<typeof addArrearsAction>[1]) => void;
}> = ({ submitting, error, onCancel, onSubmit }) => {
  const [form, setForm] = useState<Parameters<typeof addArrearsAction>[1]>({
    action_type: 'note',
    description: '',
    action_date: new Date().toISOString().substring(0, 10),
  });

  const needsAmount = form.action_type === 'partial_payment';
  const needsPromise = form.action_type === 'payment_promise';

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Type d'action *</label>
        <select
          className="df-input mt-1"
          value={form.action_type}
          onChange={(e) => setForm({ ...form, action_type: e.target.value as ActionType })}
        >
          {ACTION_TYPES.map((t) => (
            <option key={t} value={t}>{ACTION_ICON[t]} {ACTION_TYPE_LABEL[t]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Date *</label>
        <input type="date" className="df-input mt-1" value={form.action_date} onChange={(e) => setForm({ ...form, action_date: e.target.value })} required />
      </div>
      <div>
        <label className="text-xs font-bold uppercase text-slate-500">Description *</label>
        <textarea className="df-input mt-1" rows={4} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required placeholder="Détails de l'action effectuée…" />
      </div>
      {needsAmount && (
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Montant reçu (MAD)</label>
          <input type="number" step="0.01" min="0" className="df-input mt-1" value={form.amount ?? ''} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) || undefined })} />
        </div>
      )}
      {needsPromise && (
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Date de promesse</label>
          <input type="date" className="df-input mt-1" value={form.promise_date ?? ''} onChange={(e) => setForm({ ...form, promise_date: e.target.value || undefined })} />
        </div>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" className="df-btn df-btn--ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="df-btn df-btn--primary" disabled={submitting}>{submitting ? 'Enregistrement…' : 'Enregistrer'}</button>
      </div>
    </form>
  );
};
