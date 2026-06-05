import { apiClient, getApiBase } from '@/services/apiClient';

/**
 * Mobile Ops API client — field operations module.
 *
 * Endpoints under `/v1/mobile-ops/*`.
 * Row-scoping enforced server-side.
 */

// ── Status & type enums ──────────────────────────────────────────────

export type MobileOpsMissionStatus =
  | 'pending'
  | 'assigned'
  | 'accepted'
  | 'in_progress'
  | 'arrived'
  | 'completed'
  | 'cancelled'
  | 'failed';

export type MissionType = 'delivery' | 'pickup' | 'check_in' | 'check_out' | 'inspection' | 'assistance';

export type InspectionType = 'check_in' | 'check_out';

export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IssueType = 'vehicle_damage' | 'customer_absent' | 'wrong_address' | 'mechanical' | 'other';

export type ConditionLevel = 'good' | 'minor_damage' | 'major_damage';

// ── DTOs ─────────────────────────────────────────────────────────────

export interface MobileOpsMissionDto {
  id: string;
  company_id?: string | null;
  branch_id?: string | null;
  mission_number?: string | null;
  reservation_id?: string | null;
  contract_id?: string | null;
  vehicle_id?: string | null;
  client_id?: string | null;
  assigned_user_id?: string | null;
  mission_type: string;
  status: MobileOpsMissionStatus;
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
  planned_at?: string | null;
  accepted_at?: string | null;
  actual_start_at?: string | null;
  arrived_at?: string | null;
  actual_end_at?: string | null;
  origin_address?: string | null;
  destination_address?: string | null;
  pickup_address?: string | null;
  dropoff_address?: string | null;
  customer_signature_file_id?: string | null;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  // Eager-loaded relations
  vehicle?: { id: string; registration_number: string } | null;
  assigned_agent?: { id: string; email: string } | null;
  client?: { id: string; customer_code: string; customer_type: string } | null;
  // Counts
  photos_count?: number;
  inspections_count?: number;
  issues_count?: number;
  // Full relations (on detail)
  checklist_items?: MobileOpsChecklistItem[];
  photos?: MobileOpsPhoto[];
  inspections?: FieldInspectionDto[];
  signatures?: FieldSignatureDto[];
  issues?: FieldIssueDto[];
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

export interface FieldInspectionDto {
  id: string;
  mission_id: string;
  vehicle_id?: string | null;
  inspection_type: InspectionType;
  odometer_km?: number | null;
  fuel_level?: number | null;
  exterior_condition?: ConditionLevel | null;
  interior_condition?: ConditionLevel | null;
  damage_notes?: string | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
  inspected_by?: string | null;
  created_at?: string;
}

export interface FieldSignatureDto {
  id: string;
  mission_id: string;
  signer_name: string;
  signed_at?: string | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
  created_at?: string;
}

export interface FieldIssueDto {
  id: string;
  mission_id: string;
  issue_type: string;
  severity: IssueSeverity;
  description: string;
  reported_by?: string | null;
  resolved_at?: string | null;
  resolution_notes?: string | null;
  created_at?: string;
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

// Admin proof bundle
export interface MissionProofBundle {
  mission_id: string;
  mission_number: string;
  photos_by_phase: Record<string, MobileOpsPhoto[]>;
  photos_count: number;
  inspections: FieldInspectionDto[];
  signatures: FieldSignatureDto[];
  issues: FieldIssueDto[];
  checklist: MobileOpsChecklistItem[];
}

// Paginated response meta
export interface PaginationMeta {
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

// ── Internal helpers ─────────────────────────────────────────────────

interface ApiResponseEnvelope<T> {
  data: T;
  meta?: PaginationMeta;
}

function authToken(): string | undefined {
  const raw = localStorage.getItem('df_session');
  return raw ? (JSON.parse(raw) as { token?: string }).token : undefined;
}

async function uploadFormData<T>(path: string, form: FormData): Promise<T> {
  const base = getApiBase();
  if (!base) throw new Error('Backend non configuré');
  const token = authToken();
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as ApiResponseEnvelope<T> | { message?: string }) : null;
  if (!res.ok) throw new Error((json as { message?: string } | null)?.message ?? res.statusText);
  return (json as ApiResponseEnvelope<T>).data;
}

// ── API Client ───────────────────────────────────────────────────────

export const mobileOpsApi = {
  // ── Agent missions ────────────────────────────────────────────────

  myMissions(params?: { status?: string; mission_type?: string; include_all?: boolean; per_page?: number; page?: number }): Promise<{ data: MobileOpsMissionDto[]; meta?: PaginationMeta }> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.mission_type) qs.set('mission_type', params.mission_type);
    if (params?.include_all) qs.set('include_all', '1');
    if (params?.per_page) qs.set('per_page', String(params.per_page));
    if (params?.page) qs.set('page', String(params.page));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiClient<ApiResponseEnvelope<MobileOpsMissionDto[]>>(`/v1/mobile-ops/my-missions${suffix}`).then((r) => ({
      data: r.data,
      meta: r.meta,
    }));
  },

  getMission(id: string): Promise<MobileOpsMissionDto> {
    return apiClient<ApiResponseEnvelope<MobileOpsMissionDto>>(`/v1/mobile-ops/missions/${id}`).then((r) => r.data);
  },

  // ── Lifecycle transitions ─────────────────────────────────────────

  accept(id: string): Promise<MobileOpsMissionDto> {
    return apiClient<ApiResponseEnvelope<MobileOpsMissionDto>>(`/v1/mobile-ops/missions/${id}/accept`, {
      method: 'POST',
      body: JSON.stringify({}),
    }).then((r) => r.data);
  },

  start(id: string): Promise<MobileOpsMissionDto> {
    return apiClient<ApiResponseEnvelope<MobileOpsMissionDto>>(`/v1/mobile-ops/missions/${id}/start`, {
      method: 'POST',
      body: JSON.stringify({}),
    }).then((r) => r.data);
  },

  arrive(id: string): Promise<MobileOpsMissionDto> {
    return apiClient<ApiResponseEnvelope<MobileOpsMissionDto>>(`/v1/mobile-ops/missions/${id}/arrive`, {
      method: 'POST',
      body: JSON.stringify({}),
    }).then((r) => r.data);
  },

  complete(id: string, status: 'completed' | 'failed' = 'completed', notes?: string): Promise<MobileOpsMissionDto> {
    return apiClient<ApiResponseEnvelope<MobileOpsMissionDto>>(`/v1/mobile-ops/missions/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ status, ...(notes ? { notes } : {}) }),
    }).then((r) => r.data);
  },

  // ── Inspection ────────────────────────────────────────────────────

  submitInspection(
    missionId: string,
    data: {
      inspection_type: InspectionType;
      odometer_km?: number;
      fuel_level?: number;
      exterior_condition?: ConditionLevel;
      interior_condition?: ConditionLevel;
      damage_notes?: string;
      gps_lat?: number;
      gps_lng?: number;
    },
  ): Promise<FieldInspectionDto> {
    return apiClient<ApiResponseEnvelope<FieldInspectionDto>>(`/v1/mobile-ops/missions/${missionId}/inspection`, {
      method: 'POST',
      body: JSON.stringify(data),
    }).then((r) => r.data);
  },

  // ── Issues ────────────────────────────────────────────────────────

  reportIssue(
    missionId: string,
    data: { issue_type: IssueType; severity: IssueSeverity; description: string },
  ): Promise<FieldIssueDto> {
    return apiClient<ApiResponseEnvelope<FieldIssueDto>>(`/v1/mobile-ops/missions/${missionId}/issues`, {
      method: 'POST',
      body: JSON.stringify(data),
    }).then((r) => r.data);
  },

  resolveIssue(missionId: string, issueId: string, resolution_notes: string): Promise<FieldIssueDto> {
    return apiClient<ApiResponseEnvelope<FieldIssueDto>>(`/v1/mobile-ops/missions/${missionId}/issues/${issueId}`, {
      method: 'PATCH',
      body: JSON.stringify({ resolution_notes }),
    }).then((r) => r.data);
  },

  // ── Checklist ─────────────────────────────────────────────────────

  addChecklistItem(
    id: string,
    item: { checklist_phase: string; item_label: string; item_value?: string; item_status?: string; notes?: string },
  ): Promise<MobileOpsChecklistItem> {
    return apiClient<ApiResponseEnvelope<MobileOpsChecklistItem>>(`/v1/mobile-ops/missions/${id}/checklist`, {
      method: 'POST',
      body: JSON.stringify(item),
    }).then((r) => r.data);
  },

  // ── Photos ────────────────────────────────────────────────────────

  uploadPhotos(
    id: string,
    files: File[],
    meta?: { phase?: string; label?: string },
  ): Promise<Array<{ photo: MobileOpsPhoto; document_ref: string }>> {
    const form = new FormData();
    files.forEach((f) => form.append('file[]', f));
    if (meta?.phase) form.append('phase', meta.phase);
    if (meta?.label) form.append('label', meta.label);
    return uploadFormData(`/v1/mobile-ops/missions/${id}/photos`, form);
  },

  // ── Signature ─────────────────────────────────────────────────────

  captureSignature(
    missionId: string,
    data: { signer_name: string; data_url?: string; gps_lat?: number; gps_lng?: number },
  ): Promise<{ mission_id: string; signature_id: string; signer_name: string; signed_at: string }> {
    return apiClient<ApiResponseEnvelope<{ mission_id: string; signature_id: string; signer_name: string; signed_at: string }>>(
      `/v1/mobile-ops/missions/${missionId}/signature`,
      { method: 'POST', body: JSON.stringify(data) },
    ).then((r) => r.data);
  },

  /** Legacy file-based signature upload */
  customerSignature(
    id: string,
    file: File,
    signedByName?: string,
  ): Promise<{ mission_id: string; signature_file_id: string; document_ref: string }> {
    const form = new FormData();
    form.append('file', file);
    if (signedByName) form.append('signed_by_name', signedByName);
    return uploadFormData(`/v1/mobile-ops/missions/${id}/customer-signature`, form);
  },

  // ── Customer tracking ─────────────────────────────────────────────

  customerTracking(customerId?: string): Promise<MobileOpsCustomerTrackingRow[]> {
    const qs = customerId ? `?customer_id=${encodeURIComponent(customerId)}` : '';
    return apiClient<ApiResponseEnvelope<MobileOpsCustomerTrackingRow[]>>(
      `/v1/mobile-ops/customer-tracking${qs}`,
    ).then((r) => r.data);
  },

  // ── Admin endpoints ───────────────────────────────────────────────

  adminListMissions(params?: {
    status?: string;
    mission_type?: string;
    assigned_user_id?: string;
    vehicle_id?: string;
    client_id?: string;
    date_from?: string;
    date_to?: string;
    q?: string;
    per_page?: number;
    page?: number;
  }): Promise<{ data: MobileOpsMissionDto[]; meta?: PaginationMeta }> {
    const qs = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
      });
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiClient<ApiResponseEnvelope<MobileOpsMissionDto[]>>(`/v1/mobile-ops/admin/missions${suffix}`).then((r) => ({
      data: r.data,
      meta: r.meta,
    }));
  },

  adminCreateMission(data: {
    mission_type: MissionType;
    vehicle_id?: string;
    client_id?: string;
    reservation_id?: string;
    contract_id?: string;
    assigned_user_id?: string;
    pickup_address?: string;
    dropoff_address?: string;
    planned_at?: string;
    notes?: string;
  }): Promise<MobileOpsMissionDto> {
    return apiClient<ApiResponseEnvelope<MobileOpsMissionDto>>('/v1/mobile-ops/admin/missions', {
      method: 'POST',
      body: JSON.stringify(data),
    }).then((r) => r.data);
  },

  adminAssignMission(missionId: string, assigned_user_id: string): Promise<MobileOpsMissionDto> {
    return apiClient<ApiResponseEnvelope<MobileOpsMissionDto>>(`/v1/mobile-ops/admin/missions/${missionId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ assigned_user_id }),
    }).then((r) => r.data);
  },

  adminCancelMission(missionId: string, notes?: string): Promise<MobileOpsMissionDto> {
    return apiClient<ApiResponseEnvelope<MobileOpsMissionDto>>(`/v1/mobile-ops/admin/missions/${missionId}/cancel`, {
      method: 'POST',
      body: JSON.stringify(notes ? { notes } : {}),
    }).then((r) => r.data);
  },

  getMissionProof(missionId: string): Promise<MissionProofBundle> {
    return apiClient<ApiResponseEnvelope<MissionProofBundle>>(`/v1/mobile-ops/admin/missions/${missionId}/proof`).then((r) => r.data);
  },
};
