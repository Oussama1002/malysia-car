import { endpoints } from '@/services/endpoints';
import { ApiError } from '@/services/apiError';
import { isDemoModeEnabled } from '@/config/runtimeFlags';

export { ApiError, endpoints };

export function getApiBase(): string {
  return (import.meta as ImportMeta & { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE?.replace(/\/$/, '') ?? '';
}

export function isDemoMode(): boolean {
  return isDemoModeEnabled();
}

function authHeader(): Record<string, string> {
  const raw = localStorage.getItem('df_session');
  if (!raw) return {};
  try {
    const s = JSON.parse(raw) as { token?: string };
    if (s?.token) return { Authorization: `Bearer ${s.token}` };
  } catch {
    /* ignore */
  }
  return {};
}

export type ApiClientOptions = {
  /** Set false for login, refresh, and other unauthenticated calls (default: true) */
  auth?: boolean;
};

/**
 * JSON HTTP client for the Laravel API (`/api/...` when VITE_API_BASE is set, e.g. `http://localhost:8000/api`).
 */
export async function apiClient<T>(path: string, init?: RequestInit, options?: ApiClientOptions): Promise<T> {
  const base = getApiBase();
  if (!base) {
    throw new ApiError('API base URL not configured (VITE_API_BASE).', 0);
  }
  const useAuth = options?.auth !== false;
  const isFormDataBody = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const res = await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(isFormDataBody ? {} : { 'Content-Type': 'application/json' }),
      ...(useAuth ? authHeader() : {}),
      ...(init?.headers as Record<string, string>),
    },
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : null;
  if (res.status === 401 && useAuth) {
    localStorage.removeItem('df_session');
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.assign('/login?session=expired');
    }
  }
  if (!res.ok) {
    const msg = (json as { message?: string; errors?: unknown })?.message ?? res.statusText;
    throw new ApiError(String(msg), res.status, json);
  }
  return json as T;
}
