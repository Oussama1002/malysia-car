import React, { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useAuthSession } from '@/modules/auth/AuthContext';
import { getApiBase } from '@/services/apiClient';
import { loginFormSchema, type LoginFormValues } from '@/modules/auth/loginFormSchema';
import { Icon } from '@/modules/shared/components/Icon';

export const LoginPage: React.FC = () => {
  const { t } = useTranslation();
  const { login } = useAuthSession();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/dashboard';
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await login(values.email, values.password);
    if (!result.ok) {
      const key =
        result.reason === 'api_unreachable'
          ? 'auth.loginApiUnreachable'
          : result.reason === 'server_error'
            ? 'auth.loginServerError'
            : 'auth.loginInvalid';
      setError('root', { message: t(key) });
      return;
    }
    navigate(from, { replace: true });
  });

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="df-card df-card--elevated w-full max-w-md">
        <div className="df-card__body">
          <div className="mb-8 text-center">
            <div className="df-heroMark mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-[22px] text-3xl font-black text-white">
              D
            </div>
            <h1 className="text-2xl font-black text-slate-900">{t('app.name')}</h1>
            <p className="text-sm text-slate-600">{t('app.tagline')}</p>
            {import.meta.env.DEV && getApiBase() && (
              <p className="mt-2 text-xs font-semibold text-emerald-700">API: {getApiBase()}</p>
            )}
          </div>

          <form onSubmit={onSubmit} className="space-y-5" noValidate>
            {(errors.root?.message || errors.email || errors.password) && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
                {errors.root?.message ?? errors.email?.message ?? errors.password?.message}
              </div>
            )}
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">{t('auth.email')}</label>
              <input type="email" autoComplete="email" className="df-input" {...register('email')} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">{t('auth.password')}</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="df-input !pr-10"
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 end-0 flex items-center px-3 text-[color:var(--df-text-muted)] hover:text-[color:var(--df-text)]"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  <Icon name={showPassword ? 'eye-off' : 'eye'} size={16} />
                </button>
              </div>
            </div>
            <button type="submit" disabled={isSubmitting} className="df-btn df-btn--primary w-full disabled:opacity-60">
              {isSubmitting ? t('common.loading') : t('auth.login')}
            </button>
            <div className="text-center text-sm">
              <Link className="font-semibold text-indigo-600 hover:underline" to="/forgot-password">
                {t('auth.forgot')}
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
