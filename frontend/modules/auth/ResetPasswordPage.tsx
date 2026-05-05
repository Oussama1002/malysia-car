import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { confirmPasswordReset } from '@/services/adminApi';
import { ApiError } from '@/services/apiError';

export const ResetPasswordPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const initialEmail = params.get('email') ?? '';
  const [email, setEmail] = useState(initialEmail);
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pwd.length < 8) {
      setError('Mot de passe trop court (min. 8 caractères).');
      return;
    }
    if (pwd !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      await confirmPasswordReset({
        email,
        token,
        password: pwd,
        password_confirmation: confirm,
      });
      setDone(true);
      setTimeout(() => navigate('/login'), 1500);
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
          <h1 className="text-xl font-black text-slate-900">Réinitialisation</h1>
          {done ? (
            <p className="mt-4 text-sm font-semibold text-emerald-700">
              Mot de passe mis à jour. Redirection vers la page de connexion…
            </p>
          ) : (
            <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
              {error && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
                  {error}
                </div>
              )}
              {!token && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                  Aucun token trouvé dans l&apos;URL. Utilisez le lien reçu par email.
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@domaine.ma"
                  className="df-input"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Nouveau mot de passe
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  className="df-input"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                  Confirmer le mot de passe
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="df-input"
                />
              </div>
              <button type="submit" disabled={loading || !token} className="df-btn df-btn--primary w-full disabled:opacity-60">
                {loading ? t('common.loading') : 'Mettre à jour'}
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
