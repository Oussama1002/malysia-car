import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { requestPasswordReset } from '@/services/adminApi';
import { ApiError } from '@/services/apiError';

export const ForgotPasswordPage: React.FC = () => {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugToken, setDebugToken] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await requestPasswordReset(email);
      setSent(true);
      if (res?.data?.debug_token) {
        setDebugToken(res.data.debug_token);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Erreur réseau. Réessayez.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="df-card df-card--elevated w-full max-w-md">
        <div className="df-card__body">
          <h1 className="text-xl font-black text-slate-900">{t('auth.forgot')}</h1>
          <p className="mt-2 text-sm text-slate-500">
            Entrez votre email, un lien de réinitialisation vous sera envoyé.
          </p>
          {sent ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                {t('auth.resetSent')}
              </div>
              {debugToken && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                  <div className="font-black uppercase tracking-wider">Dev token</div>
                  <div className="mt-1 break-all font-mono">{debugToken}</div>
                  <Link
                    className="mt-2 inline-block font-semibold text-indigo-700 underline"
                    to={`/reset-password?token=${encodeURIComponent(debugToken)}&email=${encodeURIComponent(email)}`}
                  >
                    Ouvrir la page de réinitialisation
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
                  {error}
                </div>
              )}
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@domaine.ma"
                className="df-input"
              />
              <button type="submit" disabled={loading} className="df-btn df-btn--primary w-full disabled:opacity-60">
                {loading ? t('common.loading') : 'Envoyer'}
              </button>
            </form>
          )}
          <Link to="/login" className="mt-6 inline-block text-sm font-semibold text-indigo-600">
            ← {t('auth.login')}
          </Link>
        </div>
      </div>
    </div>
  );
};
