import { apiClient, endpoints, getApiBase } from '@/services/apiClient';

export interface AuditLogDto {
  id: string;
  company_id: string | null;
  branch_id: string | null;
  user_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  module: string;
  entity_type: string | null;
  entity_id: string | null;
  action: string;
  action_label: string | null;
  changes: { before: Record<string, unknown> | null; after: Record<string, unknown> | null } | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  legal_significance: boolean;
  ip_address: string | null;
  user_agent: string | null;
  occurred_at: string;
  created_at: string;
}

interface Paginated<T> {
  data: T[];
  meta?: { total?: number; current_page?: number; last_page?: number };
}

export interface AuditFilters {
  module?: string;
  action?: string;
  user_id?: string;
  entity_type?: string;
  entity_id?: string;
  from?: string;
  to?: string;
  legal_only?: boolean;
  q?: string;
  per_page?: number;
  page?: number;
}

function toQuery(filters?: AuditFilters): string {
  const qs = new URLSearchParams();
  Object.entries(filters ?? {}).forEach(([k, v]) => {
    if (v === undefined || v === '' || v === false) return;
    qs.set(k, String(v));
  });
  const s = qs.toString();
  return s ? `?${s}` : '';
}

async function downloadCsv(filters?: AuditFilters): Promise<void> {
  let token: string | undefined;
  try {
    const raw = localStorage.getItem('df_session');
    if (raw) token = (JSON.parse(raw) as { token?: string }).token;
  } catch {
    /* ignore */
  }
  const url = `${getApiBase()}${endpoints.audit.exportCsv}${toQuery(filters)}`;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}`, Accept: 'text/csv' } : { Accept: 'text/csv' },
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = `audit-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export const auditApi = {
  list: (filters?: AuditFilters) =>
    apiClient<Paginated<AuditLogDto>>(`${endpoints.audit.list}${toQuery(filters)}`),

  get: (id: string) => apiClient<{ data: AuditLogDto }>(endpoints.audit.one(id)),

  forEntity: (entityType: string, entityId: string, filters?: AuditFilters) =>
    apiClient<Paginated<AuditLogDto>>(
      `${endpoints.audit.forEntity(entityType, entityId)}${toQuery(filters)}`,
    ),

  exportCsv: (filters?: AuditFilters) => downloadCsv(filters),
};
