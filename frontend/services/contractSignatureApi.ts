import { apiClient, getApiBase } from '@/services/apiClient';

// ─────────────────────────────────────────────────────────────────────────
// Electronic signature module API.
// Authenticated calls: create/list signing requests for a contract.
// Public calls: the signer-facing flow keyed by an opaque token (auth: false).
// ─────────────────────────────────────────────────────────────────────────

export type SignatureRequestStatus =
  | 'sent_for_signature'
  | 'signed'
  | 'rejected'
  | 'expired';

export interface SignatureRequestDto {
  id: string;
  contract_id: string;
  status: SignatureRequestStatus;
  signer_name: string | null;
  signer_email: string | null;
  signer_phone: string | null;
  expires_at: string | null;
  sent_at: string | null;
  signed_at: string | null;
  rejected_at: string | null;
  rejected_reason: string | null;
  is_expired: boolean;
  signing_url: string | null;
  signature: {
    id: string;
    signer_name: string;
    signed_at: string | null;
    ip_address: string | null;
    proof_document_id: string | null;
  } | null;
  created_at: string | null;
}

export interface PublicContractSummary {
  contract_number: string | null;
  contract_type: string | null;
  start_date: string | null;
  end_date: string | null;
  duration_months: number | null;
  currency_code: string | null;
  base_amount: number | string | null;
  monthly_payment: number | string | null;
  deposit_amount: number | string | null;
  vehicle: { brand: string | null; model: string | null; registration: string | null } | null;
}

export interface PublicSignatureView {
  status: SignatureRequestStatus;
  is_signable: boolean;
  is_expired: boolean;
  signer_name: string | null;
  expires_at: string | null;
  signed_at: string | null;
  has_pdf: boolean;
  contract: PublicContractSummary;
}

export const contractSignatureApi = {
  // ── Authenticated (admin) ──
  list: (contractId: string) =>
    apiClient<{ data: SignatureRequestDto[] }>(`/v1/contracts/${contractId}/signature-requests`),

  create: (
    contractId: string,
    body?: { signer_name?: string; signer_email?: string; signer_phone?: string; expires_in_days?: number },
  ) =>
    apiClient<{ data: SignatureRequestDto }>(`/v1/contracts/${contractId}/signature-requests`, {
      method: 'POST',
      body: JSON.stringify(body ?? {}),
    }),

  // ── Public (signer, no auth) ──
  publicView: (token: string) =>
    apiClient<{ data: PublicSignatureView }>(`/v1/public/signature/${token}`, undefined, { auth: false }),

  /** Absolute URL to the contract PDF for inline viewing (no auth header needed). */
  publicPdfUrl: (token: string) => `${getApiBase()}/v1/public/signature/${token}/pdf`,

  publicSign: (token: string, body: { signer_name: string; signature_image: string }) =>
    apiClient<{ message: string; data: { status: string; signed_at: string; signer_name: string } }>(
      `/v1/public/signature/${token}/sign`,
      { method: 'POST', body: JSON.stringify({ ...body, accept: true }) },
      { auth: false },
    ),

  publicReject: (token: string, reason?: string) =>
    apiClient<{ message: string }>(
      `/v1/public/signature/${token}/reject`,
      { method: 'POST', body: JSON.stringify({ reason: reason ?? null }) },
      { auth: false },
    ),
};
