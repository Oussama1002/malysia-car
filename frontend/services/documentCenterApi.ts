import { apiClient, endpoints, getApiBase } from '@/services/apiClient';

export interface DocumentCenterItem {
  id: string;
  source: 'upload' | 'generated';
  title: string;
  category: string | null;
  entityType: string | null;
  entityId: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  checksum: string | null;
  expiryDate: string | null;
  issueDate: string | null;
  documentNumber: string | null;
  visibility: string | null;
  status: string;
  uploadedBy: { id: string; name?: string } | null;
  createdAt: string | null;
  notes: string | null;
  expiryBucket?: 'missing' | 'expired' | 'expiring_soon' | 'ok' | 'none';
}

export interface DocumentsListResponse {
  data: DocumentCenterItem[];
  meta?: { current_page: number; last_page: number; per_page: number; total: number };
}

export interface ExpiringDocumentsResponse {
  data: { withinDays: number; items: DocumentCenterItem[] };
}

export const documentCenterApi = {
  list(filters: Record<string, string | number | undefined> = {}) {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined && v !== null && String(v) !== '') qs.set(k, String(v));
    });
    const q = qs.toString();
    return apiClient<DocumentsListResponse>(`${endpoints.documents.list}${q ? `?${q}` : ''}`);
  },
  expiring(withinDays = 30) {
    return apiClient<ExpiringDocumentsResponse>(`${endpoints.documents.expiring}?within_days=${withinDays}`);
  },
  byEntity(entityType: string, entityId: string | number) {
    return apiClient<{ data: { attachments: DocumentCenterItem[]; generated: DocumentCenterItem[] } }>(
      endpoints.documents.byEntity(entityType, entityId),
    );
  },
  upload(payload: FormData) {
    return apiClient<{ data: { file: Record<string, unknown>; attachment: DocumentCenterItem | null } }>(
      endpoints.documents.upload,
      { method: 'POST', body: payload },
    );
  },
  uploadToEntity(entityType: string, entityId: string | number, payload: FormData) {
    return apiClient<{ data: DocumentCenterItem }>(endpoints.documents.byEntity(entityType, entityId), {
      method: 'POST',
      body: payload,
    });
  },
  remove(id: string) {
    return apiClient<{ message: string }>(endpoints.documents.one(id), { method: 'DELETE' });
  },
  downloadUrl(id: string) {
    return `${getApiBase()}${endpoints.documents.download(id)}`;
  },
};
