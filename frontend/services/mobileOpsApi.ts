import { apiClient, getApiBase } from '@/services/apiClient';

/**
 * Phase 3 — Mobile Ops API client.
 *
 * All endpoints sit under `/v1/mobile-ops/*`. Row-scoping is enforced by the
 * backend `MobileOpsController`; the frontend does NOT need to filter by
 * `assigned_user_id` — the server only returns what the caller is allowed to
 * see (and 404s on access to someone else's mission).
 *
 * Production-only: no in-browser fake data path. Pages relying on this client must show
 * a "Backend non configuré" message when `getApiBase()` is empty.
 */

export type MobileOpsMissionStatus = 'planned' | 'in_progress' | 'completed' | 'failed';

export interface MobileOpsMissionDto {
  id: string;
  company_id?: string | null;
  branch_id?: string | null;
  reservation_id?: string | null;
  contract_id?: string | null;
  vehicle_id?: string | null;
  assigned_user_id?: string | null;
  mission_type: string;
  status: MobileOpsMissionStatus;
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
  actual_start_at?: string | null;
  actual_end_at?: string | null;
  origin_address?: string | null;
  destination_address?: string | null;
  customer_signature_file_id?: string | null;
  notes?: string | null;
  checklist_items?: MobileOpsChecklistItem[];
  photos?: MobileOpsPhoto[];
}

export interface MobileOpsChecklistItem {
  id: number | string;
  mission_id: string;
  checklist_phase: string;
  item_label: string;
  item_value?: string | null;
  item_status?: string | null;
  notes?: string | null;
  created_at?: string;
}

export interface MobileOpsPhoto {
  id: string;
  mission_id: string;
  phase?: string | null;
  label?: string | null;
  original_filename?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  uploaded_by?: string | null;
  created_at?: string;
  document_ref?: string;
}

export interface MobileOpsCustomerTrackingRow {
  reservation_id: string;
  reservation_status?: string | null;
  reservation_start?: string | null;
  reservation_end?: string | null;
  mission_status?: MobileOpsMissionStatus | null;
  mission_type?: string | null;
  eta?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  has_customer_signature: boolean;
}

interface ApiResponseEnvelope<T> {
  data: T;
  meta?: unknown;
}

function authToken(): string | undefined {
  const raw = localStorage.getItem('df_session');
  return raw ? (JSON.parse(raw) as { token?: string }).token : undefined;
}

async function uploadFormData<T>(path: string, form: FormData): Promise<T> {
  const base = getApiBase();
  if (!base) {
    throw new Error('Backend non configuré');
  }
  const token = authToken();
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as ApiResponseEnvelope<T> | { message?: string }) : null;
  if (!res.ok) {
    throw new Error((json as { message?: string } | null)?.message ?? res.statusText);
  }
  return (json as ApiResponseEnvelope<T>).data;
}

export const mobileOpsApi = {
  myMissions(params?: { status?: string; include_all?: boolean }): Promise<MobileOpsMissionDto[]> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.include_all) qs.set('include_all', '1');
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiClient<ApiResponseEnvelope<MobileOpsMissionDto[]>>(`/v1/mobile-ops/my-missions${suffix}`).then((r) => r.data);
  },

  getMission(id: string): Promise<MobileOpsMissionDto> {
    return apiClient<ApiResponseEnvelope<MobileOpsMissionDto>>(`/v1/mobile-ops/missions/${id}`).then((r) => r.data);
  },

  start(id: string): Promise<MobileOpsMissionDto> {
    return apiClient<ApiResponseEnvelope<MobileOpsMissionDto>>(`/v1/mobile-ops/missions/${id}/start`, {
      method: 'POST',
      body: JSON.stringify({}),
    }).then((r) => r.data);
  },

  addChecklistItem(
    id: string,
    item: {
      checklist_phase: string;
      item_label: string;
      item_value?: string;
      item_status?: string;
      notes?: string;
    },
  ): Promise<MobileOpsChecklistItem> {
    return apiClient<ApiResponseEnvelope<MobileOpsChecklistItem>>(`/v1/mobile-ops/missions/${id}/checklist`, {
      method: 'POST',
      body: JSON.stringify(item),
    }).then((r) => r.data);
  },

  uploadPhotos(
    id: string,
    files: File[],
    meta?: { phase?: string; label?: string },
  ): Promise<Array<{ photo: MobileOpsPhoto; document_ref: string }>> {
    const form = new FormData();
    files.forEach((f) => form.append('file[]', f));
    if (meta?.phase) form.append('phase', meta.phase);
    if (meta?.label) form.append('label', meta.label);
    return uploadFormData<Array<{ photo: MobileOpsPhoto; document_ref: string }>>(
      `/v1/mobile-ops/missions/${id}/photos`,
      form,
    );
  },

  customerSignature(
    id: string,
    file: File,
    signedByName?: string,
  ): Promise<{ mission_id: string; signature_file_id: string; document_ref: string }> {
    const form = new FormData();
    form.append('file', file);
    if (signedByName) form.append('signed_by_name', signedByName);
    return uploadFormData<{ mission_id: string; signature_file_id: string; document_ref: string }>(
      `/v1/mobile-ops/missions/${id}/customer-signature`,
      form,
    );
  },

  complete(id: string, status: 'completed' | 'failed' = 'completed', notes?: string): Promise<MobileOpsMissionDto> {
    return apiClient<ApiResponseEnvelope<MobileOpsMissionDto>>(`/v1/mobile-ops/missions/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ status, ...(notes ? { notes } : {}) }),
    }).then((r) => r.data);
  },

  customerTracking(customerId?: string): Promise<MobileOpsCustomerTrackingRow[]> {
    const qs = customerId ? `?customer_id=${encodeURIComponent(customerId)}` : '';
    return apiClient<ApiResponseEnvelope<MobileOpsCustomerTrackingRow[]>>(
      `/v1/mobile-ops/customer-tracking${qs}`,
    ).then((r) => r.data);
  },
};
