import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createEnvelope,
  ENVELOPE_STATUS_LABEL,
  envelopeStatusTone,
  listEnvelopes,
  PROVIDER_LABEL,
  SIGNER_ROLE_LABEL,
  type CreateEnvelopePayload,
  type EnvelopeStatus,
  type SignerRole,
} from '@/services/signatureApi';
import { ApiError } from '@/services/apiError';
import { StatusBadge } from '@/modules/shared/components/StatusBadge';
import { DrawerPanel } from '@/modules/shared/components/DrawerPanel';
import { EmptyState } from '@/modules/shared/components/EmptyState';

const STATUS_FILTERS: EnvelopeStatus[] = ['draft', 'sent', 'in_progress', 'completed', 'declined', 'voided', 'expired', 'failed'];
const PROVIDERS = ['internal', 'docusign', 'yousign', 'adobe'] as const;

export const SignatureEnvelopesPage: React.FC = () => {
  const qc = useQueryClient();
  const [status, setStatus] = useState<EnvelopeStatus | ''>('');
  const [search, setSearch] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const envelopesQ = useQuery({
    queryKey: ['signatures', 'envelopes', { status, search }],
    queryFn: () => listEnvelopes({ status: status || undefined, search: search || undefined }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['signatures', 'envelopes'] });

  const createMut = useMutation({
    mutationFn: (p: CreateEnvelopePayload) => createEnvelope(p),
    onSuccess: () => { invalidate(); setDrawerOpen(false); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Erreur'),
  });

  const envelopes = envelopesQ.data?.data ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Signature électronique</h1>
          <p className="text-slate-500">Enveloppes, signataires, suivi des signatures en temps réel.</p>
        </div>
        <button className="df-btn df-btn--primary" onClick={() => { setError(null); setDrawerOpen(true); }}>
          + Nouvelle enveloppe
        </button>
      </header>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        <button className={`df-btn text-xs ${!status ? 'df-btn--primary' : 'df-btn--ghost'}`} onClick={() => setStatus('')}>Toutes</button>
        {STATUS_FILTERS.map((s) => (
          <button key={s} className={`df-btn text-xs ${status === s ? 'df-btn--primary' : 'df-btn--ghost'}`} onClick={() => setStatus(s)}>
            {ENVELOPE_STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      <div className="df-card">
        <div className="df-card__body">
          <input
            placeholder="Rechercher par sujet…"
            className="df-input w-full"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {envelopesQ.isLoading ? (
        <div className="text-slate-500">Chargement…</div>
      ) : !envelopes.length ? (
        <EmptyState title="Aucune enveloppe" description="Créez une enveloppe de signature pour un contrat, procuration ou engagement." />
      ) : (
        <div className="df-card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2">Sujet</th>
                <th>Fournisseur</th>
                <th>Signataires</th>
                <th>Envoyé le</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {envelopes.map((env) => {
                const signedCount = (env.signers ?? []).filter((s) => s.status === 'signed').length;
                const totalCount = (env.signers ?? []).length;
                return (
                  <tr key={env.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <div className="font-semibold text-slate-900">{env.subject}</div>
                      {env.signable_type && <div className="text-xs text-slate-400">{env.signable_type}</div>}
                    </td>
                    <td className="text-slate-600">{PROVIDER_LABEL[env.provider] ?? env.provider}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sm font-bold text-slate-900">{signedCount}/{totalCount}</span>
                        <div className="flex gap-0.5">
                          {(env.signers ?? []).map((s) => (
                            <div
                              key={s.id}
                              className={`h-2 w-2 rounded-full ${s.status === 'signed' ? 'bg-emerald-500' : s.status === 'declined' ? 'bg-rose-500' : s.status === 'pending' ? 'bg-slate-300' : 'bg-amber-400'}`}
                              title={`${s.name} — ${s.status}`}
                            />
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="text-slate-500 text-xs">{env.sent_at ? new Date(env.sent_at).toLocaleDateString('fr-MA') : '—'}</td>
                    <td><StatusBadge label={ENVELOPE_STATUS_LABEL[env.status]} tone={envelopeStatusTone(env.status)} /></td>
                    <td className="px-2">
                      <Link to={`/signatures/${env.id}`} className="df-btn df-btn--ghost text-xs">Détail →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <DrawerPanel open={drawerOpen} title="Nouvelle enveloppe" onClose={() => setDrawerOpen(false)}>
        <CreateEnvelopeForm
          submitting={createMut.isPending}
          error={error}
          onCancel={() => setDrawerOpen(false)}
          onSubmit={(p) => { setError(null); createMut.mutate(p); }}
        />
      </DrawerPanel>
    </div>
  );
};

const EMPTY_SIGNER = () => ({ name: '', email: '', phone: '', role: 'client' as SignerRole, signer_order: 1 });

const CreateEnvelopeForm: React.FC<{
  submitting: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (p: CreateEnvelopePayload) => void;
}> = ({ submitting, error, onCancel, onSubmit }) => {
  const [form, setForm] = useState<Omit<CreateEnvelopePayload, 'signers'>>({
    subject: '',
    provider: 'yousign',
    signable_type: 'App\\Models\\Contract',
  });
  const [signers, setSigners] = useState([EMPTY_SIGNER()]);

  const setSigner = (i: number, patch: Partial<typeof signers[0]>) =>
    setSigners((prev) => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));

  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); onSubmit({ ...form, signers: signers.map((s, i) => ({ ...s, signer_order: i + 1 })) }); }}>
      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="space-y-3">
        <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">En-tête</h3>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Sujet *</label>
          <input className="df-input mt-1" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required placeholder="ex: Contrat LLD — Société Alpha" />
        </div>
        <div>
          <label className="text-xs font-bold uppercase text-slate-500">Message</label>
          <textarea className="df-input mt-1" rows={2} value={form.message ?? ''} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Message aux signataires…" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs font-bold uppercase text-slate-500">Fournisseur</label>
            <select className="df-input mt-1" value={form.provider ?? 'yousign'} onChange={(e) => setForm({ ...form, provider: e.target.value as typeof PROVIDERS[number] })}>
              {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-slate-500">Expiration</label>
            <input type="date" className="df-input mt-1" value={form.expires_at ?? ''} onChange={(e) => setForm({ ...form, expires_at: e.target.value || undefined })} />
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs font-bold uppercase text-slate-500">Type d'entité (optionnel)</label>
            <input
              className="df-input mt-1"
              value={form.signable_type ?? ''}
              onChange={(e) => setForm({ ...form, signable_type: e.target.value || undefined })}
              placeholder="App\\Models\\Contract"
            />
          </div>
          <div>
            <label className="text-xs font-bold uppercase text-slate-500">ID entité / contrat (optionnel)</label>
            <input
              className="df-input mt-1"
              value={form.signable_id ?? ''}
              onChange={(e) => setForm({ ...form, signable_id: e.target.value || undefined })}
              placeholder="UUID du contrat"
            />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wide">Signataires</h3>
          <button type="button" className="df-btn df-btn--ghost text-xs" onClick={() => setSigners((p) => [...p, { ...EMPTY_SIGNER(), signer_order: p.length + 1 }])}>+ Ajouter</button>
        </div>
        {signers.map((s, i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">Signataire {i + 1}</span>
              {signers.length > 1 && <button type="button" className="text-rose-400 hover:text-rose-600 text-sm" onClick={() => setSigners((p) => p.filter((_, idx) => idx !== i))}>×</button>}
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <input className="df-input" value={s.name} onChange={(e) => setSigner(i, { name: e.target.value })} required placeholder="Nom complet *" />
              <input type="email" className="df-input" value={s.email} onChange={(e) => setSigner(i, { email: e.target.value })} required placeholder="Email *" />
              <input className="df-input" value={s.phone} onChange={(e) => setSigner(i, { phone: e.target.value })} placeholder="Téléphone" />
              <select className="df-input" value={s.role} onChange={(e) => setSigner(i, { role: e.target.value as SignerRole })}>
                {(Object.entries(SIGNER_ROLE_LABEL) as [SignerRole, string][]).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" className="df-btn df-btn--ghost" onClick={onCancel}>Annuler</button>
        <button type="submit" className="df-btn df-btn--primary" disabled={submitting}>{submitting ? 'Création…' : 'Créer l\'enveloppe'}</button>
      </div>
    </form>
  );
};
