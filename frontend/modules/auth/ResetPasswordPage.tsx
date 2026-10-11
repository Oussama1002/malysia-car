import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { confirmPasswordReset } from '@/services/adminApi';
import { ApiError } from '@/services/apiError';

const MIN_PASSWORD_LENGTH = 6;

export const ResetPasswordPage: React.FC = () => {
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
    if (pwd.length < MIN_PASSWORD_LENGTH) {
      setError(`Mot de passe trop court (min. ${MIN_PASSWORD_LENGTH} caractères).`);
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
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl ring-1 ring-slate-100">
        <h1 className="text-2xl font-black text-slate-900">Réinitialisation</h1>
        <p className="mt-1 text-sm text-slate-500">Définissez votre nouveau mot de passe.</p>

        {done ? (
          <p className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            Mot de passe mis à jour. Redirection vers la page de connexion…
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            {error && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
                {error}
              </div>
            )}
            {!token && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
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
                placeholder="vous@exemple.com"
                className="df-input w-full"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">
                Nouveau mot de passe
              </label>
              <input
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
                placeholder={`Min. ${MIN_PASSWORD_LENGTH} caractères`}
                className="df-input w-full"
              />
              <p className="mt-1 text-[11px] text-slate-500">Min. {MIN_PASSWORD_LENGTH} caractères</p>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">Confirmer</label>
              <input
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirmer le mot de passe"
                className="df-input w-full"
              />
            </div>

            <button type="submit" disabled={loading || !token} className="df-btn df-btn--primary w-full disabled:opacity-60">
              {loading ? 'Envoi…' : 'Réinitialiser'}
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
