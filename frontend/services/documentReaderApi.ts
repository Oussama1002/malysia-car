import { apiClient, endpoints, getApiBase } from '@/services/apiClient';

export type ReaderDocumentType =
  | 'cin'
  | 'passport'
  | 'driving_license'
  | 'vehicle_registration'
  | 'rental_contract'
  | 'other';

export type ReaderDocumentStatus = 'pending' | 'processing' | 'extracted' | 'validated' | 'failed';

export type ReaderExtractionStatus = 'draft' | 'reviewed' | 'validated' | 'rejected';

export interface ReaderExtraction {
  id: string;
  provider: string;
  status: ReaderExtractionStatus;
  confidence_score: number | null;
  extracted_data: Record<string, unknown> | null;
  validated_data: Record<string, unknown> | null;
  raw_text: string | null;
  validated_at: string | null;
}

export interface ReaderDocument {
  id: string;
  file_name: string;
  mime_type: string | null;
  file_size: number;
  document_type: ReaderDocumentType;
  status: ReaderDocumentStatus;
  error_message: string | null;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  extraction: ReaderExtraction | null;
}

export const documentReaderApi = {
  list(params: { document_type?: string; status?: string; page?: number; per_page?: number } = {}) {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '' && v !== null) qs.set(k, String(v));
    });
    const q = qs.toString();
    return apiClient<{ data: ReaderDocument[]; meta: Record<string, number> }>(
      `${endpoints.documentReader.list}${q ? `?${q}` : ''}`,
    );
  },
  get(id: string) {
    return apiClient<{ data: ReaderDocument }>(endpoints.documentReader.one(id));
  },
  upload(file: File, documentType?: ReaderDocumentType) {
    const fd = new FormData();
    fd.append('file', file);
    if (documentType) fd.append('document_type', documentType);
    return apiClient<{ data: ReaderDocument }>(endpoints.documentReader.upload, {
      method: 'POST',
      body: fd,
    });
  },
  extract(id: string, documentType?: ReaderDocumentType) {
    return apiClient<{ data: ReaderDocument }>(endpoints.documentReader.extract(id), {
      method: 'POST',
      body: JSON.stringify(documentType ? { document_type: documentType } : {}),
    });
  },
  validate(
    id: string,
    validatedData: Record<string, unknown>,
    link?: { entity_type: string; entity_id: string },
  ) {
    return apiClient<{ data: ReaderDocument }>(endpoints.documentReader.validate(id), {
      method: 'POST',
      body: JSON.stringify({
        validated_data: validatedData,
        linked_entity_type: link?.entity_type,
        linked_entity_id: link?.entity_id,
      }),
    });
  },
  link(id: string, entityType: string, entityId: string) {
    return apiClient<{ data: ReaderDocument }>(endpoints.documentReader.link(id), {
      method: 'POST',
      body: JSON.stringify({ entity_type: entityType, entity_id: entityId }),
    });
  },
  remove(id: string) {
    return apiClient<{ message: string }>(endpoints.documentReader.remove(id), { method: 'DELETE' });
  },
  previewUrl(id: string) {
    return `${getApiBase()}${endpoints.documentReader.preview(id)}`;
  },
};
