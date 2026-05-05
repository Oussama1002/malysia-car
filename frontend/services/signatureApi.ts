import { apiClient } from '@/services/apiClient';
import type { Paginated } from '@/services/adminApi';

// ============================================================================
// Types
// ============================================================================

export type SignatureProvider = 'internal' | 'docusign' | 'yousign' | 'adobe';
export type EnvelopeStatus = 'draft' | 'sent' | 'in_progress' | 'completed' | 'declined' | 'voided' | 'expired' | 'failed';
export type SignerStatus = 'pending' | 'sent' | 'opened' | 'otp_verified' | 'signed' | 'declined';
export type SignerRole = 'client' | 'guarantor' | 'company_rep' | 'witness' | 'notary';

export type SignatureEventType =
  | 'envelope_created'
  | 'sent'
  | 'opened'
  | 'otp_sent'
  | 'otp_verified'
  | 'signed'
  | 'declined'
  | 'expired'
  | 'completed';

export interface SignatureSigner {
  id: string;
  envelope_id: string;
  signer_order: number;
  name: string;
  email: string;
  phone?: string | null;
  role: SignerRole;
  status: SignerStatus;
  provider_signer_id?: string | null;
  signed_at?: string | null;
  opened_at?: string | null;
  declined_at?: string | null;
  decline_reason?: string | null;
  ip_address?: string | null;
}

export interface SignatureEvent {
  id: string;
  envelope_id: string;
  signer_id?: string | null;
  event_type: SignatureEventType;
  event_data?: Record<string, unknown> | null;
  occurred_at: string;
  signer?: Pick<SignatureSigner, 'id' | 'name' | 'email'> | null;
}

export interface SignatureEnvelope {
  id: string;
  company_id?: string | null;
  provider: SignatureProvider;
  provider_envelope_id?: string | null;
  subject: string;
  message?: string | null;
  status: EnvelopeStatus;
  signable_type?: string | null;
  signable_id?: string | null;
  source_file_id?: string | null;
  signed_file_id?: string | null;
  certificate_file_id?: string | null;
  document_path?: string | null;
  signed_document_path?: string | null;
  metadata?: Record<string, unknown> | null;
  proof_metadata?: Record<string, unknown> | null;
  expires_at?: string | null;
  sent_at?: string | null;
  completed_at?: string | null;
  created_by_user_id?: string | null;
  signers?: SignatureSigner[];
  events?: SignatureEvent[];
  created_at?: string;
  updated_at?: string;
}

export interface CreateEnvelopePayload {
  subject: string;
  message?: string;
  provider?: SignatureProvider;
  signable_type?: string;
  signable_id?: string;
  source_file_id?: string;
  document_path?: string;
  expires_at?: string;
  signers: Array<{
    name: string;
    email: string;
    phone?: string;
    role?: SignerRole;
    signer_order?: number;
  }>;
}

// ============================================================================
// Helpers
// ============================================================================
function q(p: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  Object.entries(p).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.append(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ============================================================================
// API Functions
// ============================================================================

export function listEnvelopes(params: {
  status?: EnvelopeStatus;
  provider?: SignatureProvider;
  signable_type?: string;
  signable_id?: string;
  search?: string;
  page?: number;
  per_page?: number;
} = {}): Promise<Paginated<SignatureEnvelope>> {
  return apiClient<Paginated<SignatureEnvelope>>(`/v1/signatures/envelopes${q(params as Record<string, unknown>)}`);
}

export function getEnvelope(id: string): Promise<{ data: SignatureEnvelope }> {
  return apiClient<{ data: SignatureEnvelope }>(`/v1/signatures/envelopes/${id}`);
}

export function createEnvelope(payload: CreateEnvelopePayload): Promise<{ data: SignatureEnvelope }> {
  return apiClient<{ data: SignatureEnvelope }>('/v1/signatures/envelopes', { method: 'POST', body: JSON.stringify(payload) });
}

export function sendEnvelope(id: string): Promise<{ data: SignatureEnvelope }> {
  return apiClient<{ data: SignatureEnvelope }>(`/v1/signatures/envelopes/${id}/send`, { method: 'POST' });
}

export function voidEnvelope(id: string, reason?: string): Promise<{ data: SignatureEnvelope }> {
  return apiClient<{ data: SignatureEnvelope }>(`/v1/signatures/envelopes/${id}/void`, { method: 'POST', body: JSON.stringify({ reason }) });
}

export function getEnvelopeEvents(id: string): Promise<{ data: SignatureEvent[] }> {
  return apiClient<{ data: SignatureEvent[] }>(`/v1/signatures/envelopes/${id}/events`);
}

export function getSignedPdfDownloadUrl(id: string): string {
  return `${import.meta.env.VITE_API_BASE ?? '/api'}/v1/signatures/envelopes/${id}/download-signed`;
}

export function verifyOtp(envelopeId: string, signerId: string, otp: string): Promise<{ message: string }> {
  return apiClient<{ message: string }>(`/v1/signatures/envelopes/${envelopeId}/verify-otp`, {
    method: 'POST',
    body: JSON.stringify({ signer_id: signerId, otp }),
  });
}

export function signEnvelope(envelopeId: string, signerId: string, signature: string): Promise<{ data: SignatureEnvelope }> {
  return apiClient<{ data: SignatureEnvelope }>(`/v1/signatures/envelopes/${envelopeId}/sign`, {
    method: 'POST',
    body: JSON.stringify({ signer_id: signerId, signature }),
  });
}

export function declineEnvelope(envelopeId: string, signerId: string, reason?: string): Promise<{ data: SignatureEnvelope }> {
  return apiClient<{ data: SignatureEnvelope }>(`/v1/signatures/envelopes/${envelopeId}/decline`, {
    method: 'POST',
    body: JSON.stringify({ signer_id: signerId, reason }),
  });
}

// ============================================================================
// Labels & Helpers
// ============================================================================

export const ENVELOPE_STATUS_LABEL: Record<EnvelopeStatus, string> = {
  draft: 'Brouillon',
  sent: 'Envoyé',
  in_progress: 'En cours',
  completed: 'Signé ✓',
  declined: 'Refusé',
  voided: 'Annulé',
  expired: 'Expiré',
  failed: 'Échec fournisseur',
};

export const PROVIDER_LABEL: Record<SignatureProvider, string> = {
  internal: 'OTP interne (démo)',
  yousign: 'Yousign',
  docusign: 'DocuSign',
  adobe: 'Adobe Sign',
};

export const SIGNER_STATUS_LABEL: Record<SignerStatus, string> = {
  pending: 'En attente',
  sent: 'Notifié',
  opened: 'Consulté',
  otp_verified: 'OTP vérifié',
  signed: 'Signé ✓',
  declined: 'Refusé',
};

export const SIGNER_ROLE_LABEL: Record<SignerRole, string> = {
  client: 'Client',
  guarantor: 'Garant',
  company_rep: 'Représentant',
  witness: 'Témoin',
  notary: 'Notaire',
};

export const EVENT_TYPE_LABEL: Record<SignatureEventType, string> = {
  envelope_created: 'Enveloppe créée',
  sent: 'Enveloppe envoyée',
  opened: 'Document consulté',
  otp_sent: 'OTP envoyé',
  otp_verified: 'OTP vérifié',
  signed: 'Signé ✓',
  declined: 'Refusé',
  expired: 'Expiré',
  completed: 'Enveloppe complétée ✓',
  failed: 'Échec / erreur fournisseur',
};

export function envelopeStatusTone(s: EnvelopeStatus): 'default' | 'info' | 'success' | 'warning' | 'danger' {
  switch (s) {
    case 'completed': return 'success';
    case 'sent':
    case 'in_progress': return 'info';
    case 'draft': return 'default';
    case 'declined':
    case 'voided':
    case 'expired':
    case 'failed': return 'danger';
    default: return 'default';
  }
}

export function signerStatusTone(s: SignerStatus): 'default' | 'info' | 'success' | 'warning' | 'danger' {
  switch (s) {
    case 'signed': return 'success';
    case 'otp_verified': return 'info';
    case 'sent':
    case 'opened': return 'warning';
    case 'declined': return 'danger';
    default: return 'default';
  }
}
