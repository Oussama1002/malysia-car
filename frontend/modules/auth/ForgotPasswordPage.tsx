import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '@/services/adminApi';
import { ApiError } from '@/services/apiError';

export const ForgotPasswordPage: React.FC = () => {
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl ring-1 ring-slate-100">
        <h1 className="text-2xl font-black text-slate-900">Réinitialiser</h1>
        <p className="mt-1 text-sm text-slate-500">Nous vous enverrons un lien par email.</p>

        {sent ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              Si un compte existe pour cette adresse, un email vient de partir avec un lien de réinitialisation.
            </div>
            {debugToken && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                <div className="font-black uppercase tracking-wider">Lien de secours (dev)</div>
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
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
                {error}
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vous@exemple.com"
                className="df-input w-full"
                autoFocus
              />
            </div>
            <button type="submit" disabled={loading} className="df-btn df-btn--primary w-full disabled:opacity-60">
              {loading ? 'Envoi…' : 'Envoyer le lien'}
            </button>
          </form>
        )}

        <div className="mt-8 text-center">
          <Link to="/login" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700">
            Retour à la connexion.
          </Link>
        </div>
      </div>
    </div>
  );
};
