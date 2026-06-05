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
  /**
   * Open a document in a new tab. We can't use a plain <a href> because the
   * download route is auth:sanctum and the browser doesn't attach the bearer
   * token on cross-tab navigation — Laravel returns 401 "Unauthenticated".
   * Instead: fetch the file ourselves (auth header included), wrap the bytes
   * in a blob: URL, and pop a new window pointing at it.
   */
  async openInNewTab(id: string): Promise<void> {
    const base = getApiBase();
    if (!base) throw new Error('API base URL not configured.');
    const session = localStorage.getItem('df_session');
    let token: string | undefined;
    try {
      token = session ? (JSON.parse(session) as { token?: string }).token : undefined;
    } catch {
      /* ignore */
    }
    const res = await fetch(`${base}${endpoints.documents.download(id)}`, {
      headers: token ? { Authorization: `Bearer ${token}`, Accept: '*/*' } : { Accept: '*/*' },
    });
    if (!res.ok) {
      throw new Error(res.status === 401 ? 'Session expirée — reconnectez-vous.' : `Échec du téléchargement (HTTP ${res.status}).`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    // Free the blob URL after a minute — long enough for the new tab to load it.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
};
