import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSettings, testIntegrationEmail } from '@/services/adminApi';
import { ApiError } from '@/services/apiError';

/**
 * Paramètres → Intégrations : E-mail (SMTP). On choisit un fournisseur
 * (Gmail, Outlook…) qui pré-remplit hôte/port/chiffrement ; l'admin ne saisit
 * que l'adresse, le mot de passe et le nom d'expéditeur. Les emails de
 * l'application (réinitialisation de mot de passe…) partent via ce SMTP.
 */

type ProviderKey = 'gmail' | 'outlook' | 'custom';

const PROVIDERS: Record<ProviderKey, {
  label: string; host: string; port: string; encryption: string;
  emailPlaceholder: string; pwdPlaceholder: string; help?: string;
}> = {
  gmail: {
    label: 'Gmail / Google Workspace',
    host: 'smtp.gmail.com', port: '587', encryption: 'tls',
    emailPlaceholder: 'ex. contact@votremarque.ma',
    pwdPlaceholder: 'Mot de passe d’application Google',
    help: 'Gmail refuse le mot de passe habituel : créez un « mot de passe d’application » sur myaccount.google.com → Sécurité → Validation en deux étapes → Mots de passe des applications, puis collez-le ici.',
  },
  outlook: {
    label: 'Outlook / Office 365',
    host: 'smtp.office365.com', port: '587', encryption: 'tls',
    emailPlaceholder: 'ex. contact@votremarque.com',
    pwdPlaceholder: 'Mot de passe du compte',
    help: 'Si la connexion échoue, activez l’authentification SMTP (SMTP AUTH) sur le compte et, si besoin, un mot de passe d’application.',
  },
  custom: {
    label: 'Autre (SMTP personnalisé)',
    host: '', port: '587', encryption: 'tls',
    emailPlaceholder: 'adresse d’envoi',
    pwdPlaceholder: 'Mot de passe SMTP',
  },
};

function providerFromHost(host?: string): ProviderKey {
  const h = (host ?? '').toLowerCase();
  if (h.includes('gmail') || h.includes('google')) return 'gmail';
  if (h.includes('office365') || h.includes('outlook')) return 'outlook';
  if (h === '') return 'gmail';
  return 'custom';
}

export const IntegrationsPage: React.FC = () => {
  const qc = useQueryClient();
  const [provider, setProvider] = useState<ProviderKey>('gmail');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [senderName, setSenderName] = useState('');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('587');
  const [encryption, setEncryption] = useState('tls');
  const [pwdAlreadySet, setPwdAlreadySet] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['settings', 'integrations'],
    queryFn: async () => (await getSettings('integrations')).data.settings,
  });

  useEffect(() => {
    if (!data) return;
    const p = providerFromHost(data.smtp_host);
    setProvider(p);
    setEmail(data.smtp_user ?? '');
    setSenderName(data.smtp_sender_name ?? '');
    setHost(data.smtp_host ?? PROVIDERS[p].host);
    setPort(data.smtp_port || PROVIDERS[p].port);
    setEncryption(data.smtp_encryption || PROVIDERS[p].encryption);
    setPwdAlreadySet(data.smtp_password_set === '1');
    setPassword('');
  }, [data]);

  const onProvider = (p: ProviderKey) => {
    setProvider(p);
    if (p !== 'custom') {
      setHost(PROVIDERS[p].host);
      setPort(PROVIDERS[p].port);
      setEncryption(PROVIDERS[p].encryption);
    }
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const resolvedHost = provider === 'custom' ? host : PROVIDERS[provider].host;
      const resolvedPort = provider === 'custom' ? port : PROVIDERS[provider].port;
      const resolvedEnc = provider === 'custom' ? encryption : PROVIDERS[provider].encryption;
      const payload: Record<string, string> = {
        smtp_host: resolvedHost,
        smtp_port: resolvedPort,
        smtp_encryption: resolvedEnc,
        smtp_user: email.trim(),
        smtp_sender_name: senderName.trim(),
        smtp_from_address: email.trim(),
        // Vide = le backend garde le mot de passe existant.
        smtp_password: password,
      };
      return (await updateSettings('integrations', payload)).data.settings;
    },
    onSuccess: (s) => {
      qc.setQueryData(['settings', 'integrations'], s);
      setSavedAt(Date.now());
      setPassword('');
      setPwdAlreadySet(s.smtp_password_set === '1');
    },
  });

  const testMut = useMutation({
    mutationFn: async () => (await testIntegrationEmail()).data,
    onSuccess: (d) => setTestMsg({ ok: true, text: d.message }),
    onError: (e) =>
      setTestMsg({ ok: false, text: e instanceof ApiError ? e.message : 'Échec de l’envoi du test.' }),
  });

  const prov = PROVIDERS[provider];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">E-mail (SMTP)</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Choisissez votre fournisseur, saisissez l’adresse e-mail et son mot de passe, enregistrez,
            puis cliquez « Tester SMTP » : un e-mail de test vous sera envoyé.
          </p>
        </div>
        <button type="button" className="df-btn df-btn--ghost"
          disabled={testMut.isPending} onClick={() => { setTestMsg(null); testMut.mutate(); }}>
          {testMut.isPending ? 'Test en cours…' : 'Tester SMTP'}
        </button>
      </div>

      {isLoading ? (
        <div className="df-card df-card__body text-sm text-slate-500">Chargement…</div>
      ) : (
        <div className="df-card df-card__body space-y-4">
          <Field label="Fournisseur e-mail">
            <select className="df-input w-full" value={provider}
              onChange={(e) => onProvider(e.target.value as ProviderKey)}>
              {(Object.keys(PROVIDERS) as ProviderKey[]).map((k) => (
                <option key={k} value={k}>{PROVIDERS[k].label}</option>
              ))}
            </select>
          </Field>

          <Field label="Adresse e-mail">
            <input className="df-input w-full" value={email} placeholder={prov.emailPlaceholder}
              onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </Field>

          <Field label="Mot de passe">
            <input className="df-input w-full" type="password" value={password}
              placeholder={pwdAlreadySet ? 'Secret enregistré — saisissez une nouvelle valeur pour remplacer' : prov.pwdPlaceholder}
              onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            {pwdAlreadySet && !password && (
              <span className="mt-1 block text-xs font-medium text-emerald-600">
                Une valeur secrète est déjà enregistrée.
              </span>
            )}
          </Field>

          <Field label="Nom expéditeur">
            <input className="df-input w-full" value={senderName} placeholder="ex. Malysia Car"
              onChange={(e) => setSenderName(e.target.value)} />
          </Field>

          {provider === 'custom' && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Hôte SMTP">
                <input className="df-input w-full" value={host} placeholder="smtp.exemple.com"
                  onChange={(e) => setHost(e.target.value)} />
              </Field>
              <Field label="Port">
                <input className="df-input w-full" inputMode="numeric" value={port}
                  onChange={(e) => setPort(e.target.value)} placeholder="587" />
              </Field>
              <Field label="Chiffrement">
                <select className="df-input w-full" value={encryption}
                  onChange={(e) => setEncryption(e.target.value)}>
                  <option value="tls">TLS (587)</option>
                  <option value="ssl">SSL (465)</option>
                  <option value="none">Aucun</option>
                </select>
              </Field>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button type="button" className="df-btn df-btn--primary"
              disabled={saveMut.isPending} onClick={() => { setTestMsg(null); saveMut.mutate(); }}>
              {saveMut.isPending ? 'Enregistrement…' : 'Enregistrer'}
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

          {prov.help && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {prov.help}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">{label}</span>
    {children}
  </label>
);
