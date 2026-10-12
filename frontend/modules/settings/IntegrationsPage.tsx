import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSettings, testIntegrationEmail } from '@/services/adminApi';
import { ApiError } from '@/services/apiError';

/**
 * Paramètres → Intégrations : SMTP de la société. Les emails (réinitialisation
 * de mot de passe, etc.) sont envoyés via ce SMTP (CompanyMailer côté backend).
 * S'il n'est pas renseigné, le backend retombe sur le mailer du .env.
 */
export const IntegrationsPage: React.FC = () => {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'integrations'],
    queryFn: async () => (await getSettings('integrations')).data.settings,
  });

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const saveMut = useMutation({
    mutationFn: async () => (await updateSettings('integrations', draft)).data.settings,
    onSuccess: (s) => {
      qc.setQueryData(['settings', 'integrations'], s);
      setSavedAt(Date.now());
    },
  });

  const testMut = useMutation({
    mutationFn: async () => (await testIntegrationEmail()).data,
    onSuccess: (d) => setTestMsg({ ok: true, text: d.message }),
    onError: (e) =>
      setTestMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Échec de l’envoi du test.' }),
  });

  const set = (k: string, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Intégrations — Email (SMTP)</h1>
        <p className="mt-1 text-sm text-slate-500">
          Configurez le serveur SMTP utilisé pour envoyer les emails (réinitialisation de mot de passe…).
          Laissez vide pour utiliser la configuration par défaut du serveur.
        </p>
      </div>

      {isLoading ? (
        <div className="df-card df-card__body text-sm text-slate-500">Chargement…</div>
      ) : (
        <div className="df-card df-card__body space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Hôte SMTP" placeholder="smtp.gmail.com">
              <input className="df-input w-full" value={draft.smtp_host ?? ''}
                onChange={(e) => set('smtp_host', e.target.value)} placeholder="smtp.gmail.com" />
            </Field>
            <Field label="Port">
              <input className="df-input w-full" inputMode="numeric" value={draft.smtp_port ?? ''}
                onChange={(e) => set('smtp_port', e.target.value)} placeholder="587" />
            </Field>
            <Field label="Utilisateur (adresse email)">
              <input className="df-input w-full" value={draft.smtp_user ?? ''}
                onChange={(e) => set('smtp_user', e.target.value)} placeholder="contact@malysiacar.ma" />
            </Field>
            <Field label="Mot de passe">
              <input className="df-input w-full" type="password" value={draft.smtp_password ?? ''}
                onChange={(e) => set('smtp_password', e.target.value)} placeholder="••••••••" autoComplete="new-password" />
            </Field>
            <Field label="Chiffrement">
              <select className="df-input w-full" value={draft.smtp_encryption ?? ''}
                onChange={(e) => set('smtp_encryption', e.target.value)}>
                <option value="">Auto (selon le port)</option>
                <option value="tls">TLS (587)</option>
                <option value="ssl">SSL (465)</option>
                <option value="none">Aucun</option>
              </select>
            </Field>
            <Field label="Nom d’expéditeur">
              <input className="df-input w-full" value={draft.smtp_sender_name ?? ''}
                onChange={(e) => set('smtp_sender_name', e.target.value)} placeholder="Malysia Car" />
            </Field>
            <Field label="Adresse d’expéditeur (optionnel)">
              <input className="df-input w-full" value={draft.smtp_from_address ?? ''}
                onChange={(e) => set('smtp_from_address', e.target.value)} placeholder="Par défaut : l’utilisateur SMTP" />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button type="button" className="df-btn df-btn--primary"
              disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <button type="button" className="df-btn df-btn--ghost"
              disabled={testMut.isPending} onClick={() => { setTestMsg(null); testMut.mutate(); }}>
              {testMut.isPending ? 'Envoi du test…' : 'Envoyer un email de test'}
            </button>
            {savedAt && <span className="text-xs font-semibold text-emerald-600">Enregistré ✓</span>}
          </div>

          {testMsg && (
            <div className={`rounded-xl px-3 py-2 text-sm font-semibold ${
              testMsg.ok ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                         : 'border border-rose-200 bg-rose-50 text-rose-800'}`}>
              {testMsg.text}
            </div>
          )}

          <p className="text-xs text-slate-400">
            Astuce Gmail : activez la validation en 2 étapes puis créez un « mot de passe d’application » (les espaces
            affichés sont ignorés). Hôte <code>smtp.gmail.com</code>, port <code>587</code> (TLS) ou <code>465</code> (SSL).
          </p>
        </div>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; placeholder?: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span>
    {children}
  </label>
);
