import { apiClient, endpoints, getApiBase } from '@/services/apiClient';

export interface GeneratedDocumentDto {
  id: string;
  company_id: string | null;
  generated_by_user_id: string | null;
  document_type: string;
  entity_type: string | null;
  entity_id: string | null;
  title: string;
  disk: string;
  storage_path: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface PaginatedDto<T> {
  data: T[];
  meta?: { current_page: number; last_page: number; total: number };
}

interface SingleDto<T> {
  data: T;
}

export const documentsApi = {
  list(params: { entity_type?: string; entity_id?: string; document_type?: string } = {}) {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && q.set(k, String(v)));
    const qs = q.toString();
    return apiClient<PaginatedDto<GeneratedDocumentDto>>(
      `${endpoints.documents.list}${qs ? `?${qs}` : ''}`,
    );
  },
  generateContractPdf(contractId: string) {
    return apiClient<SingleDto<GeneratedDocumentDto>>(endpoints.contracts.generatePdf(contractId), {
      method: 'POST',
    });
  },
  generateInvoicePdf(invoiceId: string) {
    return apiClient<SingleDto<GeneratedDocumentDto>>(endpoints.documents.generateInvoicePdf(invoiceId), {
      method: 'POST',
    });
  },
  /** Returns the absolute URL to download a generated document. */
  downloadUrl(id: string): string {
    return `${getApiBase()}${endpoints.documents.download(id)}`;
  },
};
