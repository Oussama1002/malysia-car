import { apiClient } from '@/services/apiClient';
import { ApiError } from '@/services/apiError';

// ============================================================================
// Users
// ============================================================================

export interface AdminUser {
  id: string;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  email: string;
  phone?: string | null;
  role: string;
  avatar?: string | null;
  status: 'active' | 'inactive' | 'suspended';
  locale: string;
  company_id?: string | null;
  branch_id?: string | null;
  last_login_at?: string | null;
  created_at?: string;
  updated_at?: string;
  roles?: { id: number; code: string; name: string }[] | null;
  branches?: { id: string; code: string; name: string; is_primary: boolean }[] | null;
  permissions?: string[] | null;
}

export interface Paginated<T> {
  data: T[];
  meta?: { current_page: number; last_page: number; per_page: number; total: number };
}

export interface UserListParams {
  search?: string;
  role?: string;
  status?: 'active' | 'inactive' | 'suspended';
  branch_id?: string;
  page?: number;
  per_page?: number;
}

export interface UserPayload {
  email: string;
  password?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  phone?: string;
  role?: string;
  role_ids?: number[];
  branch_ids?: string[];
  primary_branch_id?: string | null;
  locale?: 'fr' | 'en' | 'ar';
  status?: 'active' | 'inactive' | 'suspended';
}

function q(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.append(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export async function listUsers(params: UserListParams = {}): Promise<Paginated<AdminUser>> {
  return apiClient<Paginated<AdminUser>>(`/v1/users${q(params as Record<string, unknown>)}`);
}

export async function getUser(id: string): Promise<{ data: AdminUser }> {
  const meId = currentSessionUserId();
  if (!isAdminOrDirecteur() && !!meId && meId === id) {
    const me = await apiClient<AuthMeResponse>('/v1/auth/me');
    return { data: me.data.user };
  }

  try {
    return await apiClient<{ data: AdminUser }>(`/v1/users/${id}`);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 403) {
      throw error;
    }

    const meId = currentSessionUserId();
    if (!meId || meId !== id) {
      throw error;
    }

    // Non-admin profiles are available via `/v1/auth/me`.
    const me = await apiClient<AuthMeResponse>('/v1/auth/me');
    return { data: me.data.user };
  }
}

export async function createUser(payload: UserPayload): Promise<{ data: AdminUser }> {
  return apiClient<{ data: AdminUser }>('/v1/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateUser(id: string, payload: Partial<UserPayload>): Promise<{ data: AdminUser }> {
  return apiClient<{ data: AdminUser }>(`/v1/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteUser(id: string): Promise<{ message: string }> {
  return apiClient<{ message: string }>(`/v1/users/${id}`, { method: 'DELETE' });
}

export async function activateUser(id: string): Promise<{ data: { id: string; status: string } }> {
  return apiClient<{ data: { id: string; status: string } }>(`/v1/users/${id}/activate`, {
    method: 'POST',
    body: '{}',
  });
}

export async function deactivateUser(id: string): Promise<{ data: { id: string; status: string } }> {
  return apiClient<{ data: { id: string; status: string } }>(`/v1/users/${id}/deactivate`, {
    method: 'POST',
    body: '{}',
  });
}

export async function assignUserBranches(
  id: string,
  branchIds: string[],
  primaryBranchId?: string | null,
): Promise<{ data: AdminUser }> {
  return apiClient<{ data: AdminUser }>(`/v1/users/${id}/branches`, {
    method: 'POST',
    body: JSON.stringify({ branch_ids: branchIds, primary_branch_id: primaryBranchId ?? null }),
  });
}

export interface LoginHistoryRow {
  id: number;
  user_id: string | null;
  email: string;
  success: boolean;
  ip_address: string | null;
  user_agent: string | null;
  device_name: string | null;
  failure_reason: string | null;
  attempted_at: string;
}

export async function userLoginHistory(id: string): Promise<{ data: LoginHistoryRow[] }> {
  return apiClient<{ data: LoginHistoryRow[] }>(`/v1/users/${id}/login-history`);
}

// ============================================================================
// Roles & Permissions
// ============================================================================

export interface AdminRole {
  id: number;
  code: string;
  name: string;
  description: string | null;
  company_id: string | null;
  is_system_role: boolean;
  users_count?: number;
  permissions?: { id: number; code: string; name: string; module: string }[] | null;
  created_at?: string;
  updated_at?: string;
}

export interface AdminPermission {
  id: number;
  code: string;
  name: string;
  module: string;
  description: string | null;
}

export async function listRoles(): Promise<{ data: AdminRole[] }> {
  return apiClient<{ data: AdminRole[] }>('/v1/roles');
}

export async function createRole(payload: {
  code: string;
  name: string;
  description?: string;
  permission_ids?: number[];
}): Promise<{ data: AdminRole }> {
  return apiClient<{ data: AdminRole }>('/v1/roles', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateRole(
  id: number,
  payload: { code?: string; name?: string; description?: string | null; permission_ids?: number[] },
): Promise<{ data: AdminRole }> {
  return apiClient<{ data: AdminRole }>(`/v1/roles/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteRole(id: number): Promise<{ message: string }> {
  return apiClient<{ message: string }>(`/v1/roles/${id}`, { method: 'DELETE' });
}

export async function syncRolePermissions(id: number, permissionIds: number[]): Promise<{ data: AdminRole }> {
  return apiClient<{ data: AdminRole }>(`/v1/roles/${id}/permissions`, {
    method: 'POST',
    body: JSON.stringify({ permission_ids: permissionIds }),
  });
}

export async function listPermissions(): Promise<{ data: AdminPermission[] }> {
  return apiClient<{ data: AdminPermission[] }>('/v1/permissions');
}

// ============================================================================
// Branches
// ============================================================================

export interface Branch {
  id: string;
  company_id: string | null;
  code: string;
  name: string;
  city: string | null;
  country_code: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  users_count?: number;
  created_at?: string;
  updated_at?: string;
}

type AuthMeResponse = {
  data: {
    user: AdminUser;
    permissions?: string[];
  };
};

function currentSessionUserId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('df_session');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { user?: { id?: string } };
    return parsed.user?.id ?? null;
  } catch {
    return null;
  }
}

function currentSessionRole(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('df_session');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { user?: { role?: string } };
    return parsed.user?.role ?? null;
  } catch {
    return null;
  }
}

function isAdminOrDirecteur(): boolean {
  const role = currentSessionRole();
  return role === 'ADMIN' || role === 'DIRECTEUR';
}

export async function listBranches(): Promise<{ data: Branch[] }> {
  if (!isAdminOrDirecteur()) {
    const me = await apiClient<AuthMeResponse>('/v1/auth/me');
    const meBranches = me.data.user.branches ?? [];
    return {
      data: meBranches.map((b) => ({
        id: b.id,
        company_id: null,
        code: b.code,
        name: b.name,
        city: null,
        country_code: 'MA',
        phone: null,
        email: null,
        is_active: true,
      })),
    };
  }

  try {
    return await apiClient<{ data: Branch[] }>('/v1/branches');
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 403) {
      throw error;
    }

    // Non-admin roles cannot use `/v1/branches`; use self-scoped branches from `/v1/auth/me`.
    const me = await apiClient<AuthMeResponse>('/v1/auth/me');
    const meBranches = me.data.user.branches ?? [];

    return {
      data: meBranches.map((b) => ({
        id: b.id,
        company_id: null,
        code: b.code,
        name: b.name,
        city: null,
        country_code: 'MA',
        phone: null,
        email: null,
        is_active: true,
      })),
    };
  }
}

export async function createBranch(payload: Partial<Branch>): Promise<{ data: Branch }> {
  return apiClient<{ data: Branch }>('/v1/branches', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateBranch(id: string, payload: Partial<Branch>): Promise<{ data: Branch }> {
  return apiClient<{ data: Branch }>(`/v1/branches/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteBranch(id: string): Promise<{ message: string }> {
  return apiClient<{ message: string }>(`/v1/branches/${id}`, { method: 'DELETE' });
}

// ============================================================================
// Password reset (public)
// ============================================================================

export async function requestPasswordReset(email: string): Promise<{ data: { message: string; debug_token?: string; debug_email?: string } }> {
  return apiClient<{ data: { message: string; debug_token?: string; debug_email?: string } }>(
    '/v1/auth/forgot-password',
    { method: 'POST', body: JSON.stringify({ email }) },
    { auth: false },
  );
}

export async function confirmPasswordReset(payload: {
  email: string;
  token: string;
  password: string;
  password_confirmation: string;
}): Promise<{ data: { message: string } }> {
  return apiClient<{ data: { message: string } }>(
    '/v1/auth/reset-password',
    { method: 'POST', body: JSON.stringify(payload) },
    { auth: false },
  );
}

export async function uploadMyAvatar(file: File): Promise<{ data: { user: AdminUser } }> {
  const body = new FormData();
  body.append('avatar', file);
  return apiClient<{ data: { user: AdminUser } }>('/v1/auth/me/avatar', {
    method: 'POST',
    body,
  });
}
