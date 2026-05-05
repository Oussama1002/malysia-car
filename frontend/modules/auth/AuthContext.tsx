import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getApiBase } from '@/services/apiClient';
import { ApiError } from '@/services/apiError';
import type { AuthSession } from '@/services/dtos';
import { loginWithLaravelApi, logoutLaravelSession } from '@/services/laravelAuthApi';
import type { AppRole } from '@/domain/appRole';
import type { User } from '@/types';
import { UserRole } from '@/types';

const STORAGE = 'df_session';

export type LoginFailureReason = 'invalid_credentials' | 'api_unreachable' | 'server_error';
export type LoginResult = { ok: true } | { ok: false; reason: LoginFailureReason };

type Ctx = {
  session: AuthSession | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  logout: () => Promise<void>;
  /**
   * Modern role (source of truth for RBAC).
   *
   * Use this for sidebar gating, route guards, and per-action permission
   * checks (`canAccessModule`, `canPerform`). One of the 10 specialized
   * roles defined in `@/domain/appRole`.
   */
  appRole: AppRole | null;
  /**
   * @deprecated Adapter that collapses the 10 specialized backend roles into
   * the 3-value legacy `UserRole` enum. Provided ONLY for old screens still
   * importing `User` from `@/types`. Never use it for RBAC decisions — gate
   * on `appRole` (or directly on `session.user.role`).
   *
   * Kept only for old UI compatibility.
   */
  legacyUser: User | null;
  expired: boolean;
  clearExpired: () => void;
};

const AuthContext = createContext<Ctx | undefined>(undefined);

/**
 * Legacy collapse — retained only to keep old `screens/*` rendering. The
 * modern app reads `session.user.role` (an `AppRole`) directly.
 */
function sessionToLegacyUser(s: AuthSession): User {
  const r = s.user.role;
  const role =
    r === 'ADMIN' || r === 'DIRECTEUR'
      ? UserRole.ADMIN
      : r === 'CLIENT_PORTAL'
        ? UserRole.CLIENT
        : UserRole.AGENT;
  return {
    id: s.user.id,
    name: s.user.name,
    email: s.user.email,
    role,
    avatar: s.user.avatar ?? `https://i.pravatar.cc/150?u=${encodeURIComponent(s.user.email)}`,
  };
}

function readSession(): AuthSession | null {
  const raw = localStorage.getItem(STORAGE);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthSession | (User & { expiresAt?: number });
    if ('token' in parsed && 'expiresAt' in parsed && 'user' in parsed && typeof parsed.user === 'object') {
      return parsed as AuthSession;
    }
    /** Legacy `{ id, name, email, role: UserRole }` */
    const u = parsed as User;
    return {
      user: {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role === UserRole.ADMIN ? 'ADMIN' : u.role === UserRole.CLIENT ? 'CLIENT_PORTAL' : 'AGENT_COMMERCIAL',
      },
      token: `legacy.${u.id}`,
      expiresAt: Date.now() + 8 * 60 * 60 * 1000,
    };
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const s = readSession();
    if (s && s.expiresAt < Date.now()) {
      localStorage.removeItem(STORAGE);
      setExpired(true);
      setSession(null);
    } else {
      setSession(s);
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<LoginResult> => {
    if (!getApiBase()) {
      return { ok: false, reason: 'api_unreachable' };
    }
    try {
      const s = await loginWithLaravelApi(email, password);
      if (!s) {
        return { ok: false, reason: 'invalid_credentials' };
      }
      setSession(s);
      localStorage.setItem(STORAGE, JSON.stringify(s));
      setExpired(false);
      return { ok: true };
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401 || error.status === 422) {
          return { ok: false, reason: 'invalid_credentials' };
        }
        if (error.status === 0) {
          return { ok: false, reason: 'api_unreachable' };
        }
      }
      if (error instanceof TypeError) {
        return { ok: false, reason: 'api_unreachable' };
      }
      return { ok: false, reason: 'server_error' };
    }
  }, []);

  const logout = useCallback(async () => {
    if (getApiBase() && session?.token) {
      await logoutLaravelSession();
    }
    setSession(null);
    localStorage.removeItem(STORAGE);
  }, [session]);

  const clearExpired = useCallback(() => setExpired(false), []);

  const appRole = useMemo<AppRole | null>(() => session?.user.role ?? null, [session]);
  const legacyUser = useMemo(() => (session ? sessionToLegacyUser(session) : null), [session]);

  const value = useMemo(
    () => ({ session, loading, login, logout, appRole, legacyUser, expired, clearExpired }),
    [session, loading, login, logout, appRole, legacyUser, expired, clearExpired],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuthSession(): Ctx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthSession must be used within AuthProvider');
  return ctx;
}

/** @deprecated Prefer useAuthSession */
export function useAuth(): { user: User | null; login: (email: string) => Promise<void>; logout: () => void } {
  const { legacyUser, login, logout, session } = useAuthSession();
  return {
    user: legacyUser,
    login: async (email: string) => {
      const result = await login(email, 'password');
      if (!result.ok) throw new Error('login failed');
    },
    logout,
  };
}

export function useSessionExpiryWatcher(): void {
  const { session, logout } = useAuthSession();
  useEffect(() => {
    if (!session) return;
    const t = window.setInterval(() => {
      if (session.expiresAt < Date.now()) {
        void logout();
      }
    }, 30_000);
    return () => window.clearInterval(t);
  }, [session, logout]);
}
