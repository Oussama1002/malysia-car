import { apiClient, getApiBase } from '@/services/apiClient';
import type { AuthSession } from '@/services/dtos';
import type { AppRole } from '@/domain/appRole';

type LoginResponse = {
  data: {
    token: string;
    token_type: string;
    user: {
      id: string;
      name: string;
      email: string;
      role: string;
      avatar?: string | null;
    };
  };
};

const SESSION_MS = 8 * 60 * 60 * 1000;

/** Authenticate against Laravel `/api/v1/auth/login` when `VITE_API_BASE` is configured. */
export async function loginWithLaravelApi(email: string, password: string): Promise<AuthSession | null> {
  if (!getApiBase()) {
    return null;
  }
  const res = await apiClient<LoginResponse>(
    '/v1/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password, device_name: 'driveflow-spa' }),
    },
    { auth: false }
  );
  const u = res.data.user;
  return {
    user: {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role as AppRole,
      avatar: u.avatar ?? undefined,
    },
    token: res.data.token,
    expiresAt: Date.now() + SESSION_MS,
  };
}

/** Call while `df_session` is still in `localStorage` (Bearer is read in `apiClient`). */
export async function logoutLaravelSession(): Promise<void> {
  if (!getApiBase()) return;
  try {
    await apiClient(
      '/v1/auth/logout',
      { method: 'POST', body: '{}' },
      { auth: true }
    );
  } catch {
    /* ignore */
  }
}
