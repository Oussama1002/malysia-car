import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  declineEnvelope,
  ENVELOPE_STATUS_LABEL,
  envelopeStatusTone,
  EVENT_TYPE_LABEL,
  getEnvelope,
  getSignedPdfDownloadUrl,
  PROVIDER_LABEL,
  sendEnvelope,
  SIGNER_ROLE_LABEL,
  SIGNER_STATUS_LABEL,
  signerStatusTone,
  voidEnvelope,
  type SignatureEventType,
} from '@/services/signatureApi';
import { ApiError } from '@/services/apiError';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';

const EVENT_ICON: Record<SignatureEventType, string> = {
  envelope_created: '📋',
  sent: '📤',
  opened: '👁️',
  otp_sent: '🔢',
  otp_verified: '🔓',
  signed: '✍️',
  declined: '👎',
  expired: '⏰',
  completed: '✅',
  failed: '⚠️',
};

const EVENT_TONE: Record<string, string> = {
  completed: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  signed: 'bg-emerald-50 border-emerald-200 text-emerald-800',
  otp_verified: 'bg-indigo-50 border-indigo-200 text-indigo-800',
  declined: 'bg-rose-50 border-rose-200 text-rose-800',
  expired: 'bg-slate-50 border-slate-200 text-slate-600',
  failed: 'bg-amber-50 border-amber-200 text-amber-900',
};

export const SignatureEnvelopeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [showVoidForm, setShowVoidForm] = useState(false);

  const envelopeQ = useQuery({
    queryKey: ['signatures', 'envelope', id],
    queryFn: () => getEnvelope(id!),
    enabled: !!id,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['signatures', 'envelope', id] });
    qc.invalidateQueries({ queryKey: ['signatures', 'envelopes'] });
  };

  const sendMut = useMutation({
    mutationFn: () => sendEnvelope(id!),
    onSuccess: () => { invalidate(); setError(null); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur lors de l\'envoi'),
  });

  const voidMut = useMutation({
    mutationFn: () => voidEnvelope(id!, voidReason),
    onSuccess: () => { invalidate(); setShowVoidForm(false); setError(null); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur lors de l\'annulation'),
  });

  const env = envelopeQ.data?.data;

  if (envelopeQ.isLoading) return <div className="text-slate-500 p-6">Chargement…</div>;
  if (!env) return <div className="text-rose-600 p-6">Enveloppe introuvable.</div>;

  const signedCount  = (env.signers ?? []).filter((s) => s.status === 'signed').length;
  const totalSigners = (env.signers ?? []).length;
  const progressPct  = totalSigners > 0 ? Math.round((signedCount / totalSigners) * 100) : 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/signatures" className="text-xs font-bold text-indigo-600">← Signatures</Link>
          <h1 className="text-2xl font-black text-slate-900">{env.subject}</h1>
          <p className="text-slate-500 text-sm">
            {PROVIDER_LABEL[env.provider] ?? env.provider}
            {' · '}
            créé le {env.created_at ? new Date(env.created_at).toLocaleDateString('fr-MA') : '—'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <StatusBadge label={ENVELOPE_STATUS_LABEL[env.status]} tone={envelopeStatusTone(env.status)} />
          {env.status === 'draft' && (
            <button className="df-btn df-btn--primary" disabled={sendMut.isPending} onClick={() => sendMut.mutate()}>
              {sendMut.isPending ? 'Envoi…' : '📤 Envoyer aux signataires'}
            </button>
          )}
          {!['completed', 'voided', 'declined'].includes(env.status) && (
            <button className="df-btn df-btn--ghost text-rose-600 text-xs" onClick={() => setShowVoidForm(true)}>Annuler</button>
          )}
          {env.signed_file_id && (
            <a href={getSignedPdfDownloadUrl(env.id)} target="_blank" rel="noopener noreferrer" className="df-btn df-btn--primary text-xs">
              📄 Télécharger signé
            </a>
          )}
        </div>
      </header>

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {env.status === 'failed' && (
        <div className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Le fournisseur a signalé une erreur ou un échec pour cette enveloppe. Consultez la chronologie et les journaux d’audit.
        </div>
      )}
      {env.provider === 'internal' && (
        <div className="space-y-2">
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <strong className="font-bold">Mode démo (OTP interne).</strong>{' '}
            Les signatures n’ont pas de valeur légale équivalente à un fournisseur certifié. Utilisez Yousign ou DocuSign en production.
          </div>
        </div>
      )}

      {/* Void form */}
      {showVoidForm && (
        <div className="df-card border-2 border-rose-200">
          <div className="df-card__body space-y-3">
            <h2 className="font-bold text-rose-700">Annuler l'enveloppe</h2>
            <textarea className="df-input w-full" rows={2} placeholder="Motif d'annulation…" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
            <div className="flex gap-2">
              <button className="df-btn df-btn--ghost" onClick={() => setShowVoidForm(false)}>Retour</button>
              <button className="df-btn df-btn--primary" style={{ background: '#e11d48' }} disabled={voidMut.isPending} onClick={() => voidMut.mutate()}>
                {voidMut.isPending ? 'Annulation…' : 'Confirmer l\'annulation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      {totalSigners > 0 && (
        <div className="df-card">
          <div className="df-card__body space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-bold text-slate-700">Progression des signatures</span>
              <span className="font-mono font-bold text-slate-900">{signedCount}/{totalSigners} signé{signedCount > 1 ? 's' : ''}</span>
            </div>
            <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${env.status === 'completed' ? 'bg-emerald-500' : env.status === 'declined' ? 'bg-rose-500' : 'bg-indigo-500'}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {env.expires_at && (
              <p className="text-xs text-slate-400">Expiration : {new Date(env.expires_at).toLocaleDateString('fr-MA')}</p>
            )}
          </div>
        </div>
      )}

      {/* Details + message */}
      {env.message && (
        <div className="df-card"><div className="df-card__body">
          <div className="text-xs font-bold uppercase text-slate-500 mb-1">Message aux signataires</div>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{env.message}</p>
        </div></div>
      )}

      {/* Signers */}
      <div className="space-y-3">
        <h2 className="font-bold text-slate-800">Signataires ({totalSigners})</h2>
        <div className="space-y-3">
          {(env.signers ?? []).map((signer, i) => (
            <div key={signer.id} className="df-card">
              <div className="df-card__body flex flex-wrap items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-100 font-black text-indigo-700">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-900">{signer.name}</div>
                  <div className="text-sm text-slate-500">{signer.email}{signer.phone ? ` · ${signer.phone}` : ''}</div>
                  <div className="text-xs text-slate-400">{SIGNER_ROLE_LABEL[signer.role]}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge label={SIGNER_STATUS_LABEL[signer.status]} tone={signerStatusTone(signer.status)} />
                  {signer.signed_at && <span className="text-xs text-slate-400">Signé le {new Date(signer.signed_at).toLocaleString('fr-MA')}</span>}
                  {signer.declined_at && <span className="text-xs text-rose-400">Refusé le {new Date(signer.declined_at).toLocaleString('fr-MA')}</span>}
                  {signer.ip_address && <span className="text-xs font-mono text-slate-300">IP: {signer.ip_address}</span>}
                </div>
                {signer.decline_reason && (
                  <div className="w-full rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600">
                    Motif : {signer.decline_reason}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Event timeline */}
      <div className="space-y-3">
        <h2 className="font-bold text-slate-800">Chronologie des événements</h2>
        {(env.events ?? []).length === 0 ? (
          <p className="text-slate-400 text-sm">Aucun événement enregistré.</p>
        ) : (
          <div className="relative space-y-3 before:absolute before:left-6 before:top-0 before:bottom-0 before:w-0.5 before:bg-slate-200">
            {[...(env.events ?? [])].reverse().map((ev) => (
              <div key={ev.id} className="flex gap-4 relative pl-14">
                <div className="absolute left-2.5 h-7 w-7 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center text-base">
                  {EVENT_ICON[ev.event_type] ?? '•'}
                </div>
                <div className={`flex-1 rounded-xl border px-3 py-2 text-sm ${EVENT_TONE[ev.event_type] ?? 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">{EVENT_TYPE_LABEL[ev.event_type]}</span>
                    <span className="text-xs opacity-60 shrink-0">{new Date(ev.occurred_at).toLocaleString('fr-MA')}</span>
                  </div>
                  {ev.signer && <div className="text-xs opacity-70 mt-0.5">→ {ev.signer.name} ({ev.signer.email})</div>}
                  {ev.event_data && Object.keys(ev.event_data).length > 0 && (
                    <div className="text-xs opacity-50 mt-1 font-mono">{JSON.stringify(ev.event_data)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
