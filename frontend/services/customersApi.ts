import { apiClient, getApiBase } from '@/services/apiClient';
import type { Paginated } from '@/services/adminApi';

// ============================================================================
// Customer types
// ============================================================================

export type CustomerType = 'PARTICULIER' | 'ENTREPRISE';
export type CustomerStatus = 'active' | 'inactive' | 'suspended';
export type RiskLevel = 'low' | 'normal' | 'elevated' | 'high';
export type KycStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'expired';

export interface IndividualProfile {
  first_name: string;
  last_name: string;
  gender?: string | null;
  date_of_birth?: string | null;
  place_of_birth?: string | null;
  nationality?: string | null;
  marital_status?: string | null;
  national_id_number?: string | null;
  passport_number?: string | null;
  driving_license_number?: string | null;
  driving_license_expiry?: string | null;
  profession?: string | null;
  employer_name?: string | null;
  monthly_income?: number | null;
}

export interface CompanyProfile {
  legal_name: string;
  trade_name?: string | null;
  registration_number?: string | null;
  ice?: string | null;
  tax_identifier?: string | null;
  cnss_number?: string | null;
  incorporation_date?: string | null;
  business_activity?: string | null;
  annual_turnover?: number | null;
  employee_count?: number | null;
  legal_representative_name?: string | null;
  legal_representative_id_number?: string | null;
}

export interface CustomerContact {
  id?: number;
  customer_id?: string;
  contact_type: 'phone' | 'mobile' | 'email' | 'fax' | string;
  value: string;
  is_primary?: boolean;
  verified_at?: string | null;
  created_at?: string;
}

export interface CustomerAddress {
  id?: number;
  customer_id?: string;
  address_type: 'home' | 'billing' | 'shipping' | 'work' | string;
  address_line_1: string;
  address_line_2?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country_code?: string;
  is_primary?: boolean;
}

export interface CustomerBankAccount {
  id?: string;
  customer_id?: string;
  bank_name: string;
  iban?: string | null;
  rib?: string | null;
  swift_code?: string | null;
  account_holder_name?: string | null;
  is_default?: boolean;
}

export interface KycCase {
  id: string;
  customer_id: string;
  kyc_status: KycStatus;
  risk_score: number | null;
  verification_level: 'basic' | 'enhanced';
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
  expires_at?: string | null;
  documents?: KycDocument[];
  created_at?: string;
  updated_at?: string;
}

export interface KycDocument {
  id: string;
  kyc_case_id: string;
  document_type: string;
  file_path?: string | null;
  file_name?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  document_number?: string | null;
  issued_at?: string | null;
  expires_at?: string | null;
  verification_status: 'pending' | 'verified' | 'rejected';
  verified_by?: string | null;
  verified_at?: string | null;
  notes?: string | null;
}

export interface BlacklistEntry {
  id: string;
  customer_id: string;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  source_module?: string | null;
  added_by?: string | null;
  added_at: string;
  removed_at?: string | null;
  removed_by?: string | null;
  removal_reason?: string | null;
}

export interface CustomerNote {
  id: number;
  customer_id: string;
  note_type: string;
  note_text: string;
  created_by?: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  customer_code: string;
  customer_type: CustomerType;
  status: CustomerStatus;
  risk_level: RiskLevel;
  is_blacklisted: boolean;
  preferred_language: string;
  source_channel?: string | null;
  assigned_to_user_id?: string | null;
  company_id?: string | null;
  branch_id?: string | null;
  display_name: string;
  kyc_status: KycStatus;
  individual_profile?: IndividualProfile | null;
  company_profile?: CompanyProfile | null;
  addresses?: CustomerAddress[];
  contacts?: CustomerContact[];
  bank_accounts?: CustomerBankAccount[];
  latest_kyc_case?: Partial<KycCase> | null;
  created_at?: string;
  updated_at?: string;
}

export interface Dossier {
  customer: Customer;
  identity: {
    individual_profile?: IndividualProfile | null;
    company_profile?: CompanyProfile | null;
    employment_profile?: unknown | null;
  };
  addresses: CustomerAddress[];
  contacts: CustomerContact[];
  bank_accounts: CustomerBankAccount[];
  kyc: { cases: KycCase[]; latest_status: KycStatus };
  blacklist: { active: BlacklistEntry[]; history: BlacklistEntry[] };
  notes: CustomerNote[];
  contracts: unknown[];
  payments: unknown[];
  risk: { level: RiskLevel; is_blacklisted: boolean; score: number | null };
}

export interface CustomerListParams {
  search?: string;
  type?: CustomerType;
  status?: CustomerStatus;
  risk_level?: RiskLevel;
  kyc_status?: KycStatus;
  is_blacklisted?: boolean;
  branch_id?: string;
  page?: number;
  per_page?: number;
}

function q(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.append(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ============================================================================
// Customer CRUD
// ============================================================================

export async function listCustomers(params: CustomerListParams = {}): Promise<Paginated<Customer>> {
  return apiClient<Paginated<Customer>>(`/v1/customers${q(params as Record<string, unknown>)}`);
}

export async function getCustomer(id: string): Promise<{ data: Customer }> {
  return apiClient<{ data: Customer }>(`/v1/customers/${id}`);
}

export async function getCustomerDossier(id: string): Promise<{ data: Dossier }> {
  return apiClient<{ data: Dossier }>(`/v1/customers/${id}/dossier`);
}

export interface CustomerCreatePayload {
  customer_type: CustomerType;
  customer_code?: string;
  status?: CustomerStatus;
  risk_level?: RiskLevel;
  preferred_language?: 'fr' | 'en' | 'ar';
  source_channel?: string;
  branch_id?: string | null;
  assigned_to_user_id?: string | null;
  individual_profile?: Partial<IndividualProfile>;
  company_profile?: Partial<CompanyProfile>;
  contacts?: CustomerContact[];
  addresses?: CustomerAddress[];
}

export async function createCustomer(payload: CustomerCreatePayload): Promise<{ data: Customer }> {
  return apiClient<{ data: Customer }>('/v1/customers', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateCustomer(id: string, payload: Partial<CustomerCreatePayload>): Promise<{ data: Customer }> {
  return apiClient<{ data: Customer }>(`/v1/customers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteCustomer(id: string): Promise<{ message: string }> {
  return apiClient<{ message: string }>(`/v1/customers/${id}`, { method: 'DELETE' });
}

// ============================================================================
// Sub-resources
// ============================================================================

export async function addCustomerAddress(customerId: string, payload: CustomerAddress): Promise<{ data: CustomerAddress }> {
  return apiClient<{ data: CustomerAddress }>(`/v1/customers/${customerId}/addresses`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
export async function updateCustomerAddress(customerId: string, addressId: number, payload: Partial<CustomerAddress>): Promise<{ data: CustomerAddress }> {
  return apiClient<{ data: CustomerAddress }>(`/v1/customers/${customerId}/addresses/${addressId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
export async function deleteCustomerAddress(customerId: string, addressId: number): Promise<{ message: string }> {
  return apiClient<{ message: string }>(`/v1/customers/${customerId}/addresses/${addressId}`, { method: 'DELETE' });
}

export async function addCustomerContact(customerId: string, payload: CustomerContact): Promise<{ data: CustomerContact }> {
  return apiClient<{ data: CustomerContact }>(`/v1/customers/${customerId}/contacts`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
export async function deleteCustomerContact(customerId: string, contactId: number): Promise<{ message: string }> {
  return apiClient<{ message: string }>(`/v1/customers/${customerId}/contacts/${contactId}`, { method: 'DELETE' });
}

export async function addCustomerBankAccount(customerId: string, payload: CustomerBankAccount): Promise<{ data: CustomerBankAccount }> {
  return apiClient<{ data: CustomerBankAccount }>(`/v1/customers/${customerId}/bank-accounts`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
export async function deleteCustomerBankAccount(customerId: string, bankAccountId: string): Promise<{ message: string }> {
  return apiClient<{ message: string }>(`/v1/customers/${customerId}/bank-accounts/${bankAccountId}`, { method: 'DELETE' });
}

export async function listCustomerNotes(customerId: string): Promise<{ data: CustomerNote[] }> {
  return apiClient<{ data: CustomerNote[] }>(`/v1/customers/${customerId}/notes`);
}
export async function addCustomerNote(customerId: string, noteText: string, noteType = 'general'): Promise<{ data: CustomerNote }> {
  return apiClient<{ data: CustomerNote }>(`/v1/customers/${customerId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ note_text: noteText, note_type: noteType }),
  });
}

// ============================================================================
// Blacklist
// ============================================================================

export async function blacklistCustomer(customerId: string, reason: string, severity: BlacklistEntry['severity'] = 'high'): Promise<{ data: { customer_id: string; is_blacklisted: boolean } }> {
  return apiClient<{ data: { customer_id: string; is_blacklisted: boolean } }>(`/v1/customers/${customerId}/blacklist`, {
    method: 'POST',
    body: JSON.stringify({ reason, severity }),
  });
}

export async function unblacklistCustomer(customerId: string, removalReason: string): Promise<{ data: { customer_id: string; is_blacklisted: boolean } }> {
  return apiClient<{ data: { customer_id: string; is_blacklisted: boolean } }>(`/v1/customers/${customerId}/blacklist`, {
    method: 'DELETE',
    body: JSON.stringify({ removal_reason: removalReason }),
  });
}

// ============================================================================
// KYC
// ============================================================================

export async function listKycCases(customerId: string): Promise<{ data: KycCase[] }> {
  return apiClient<{ data: KycCase[] }>(`/v1/customers/${customerId}/kyc-cases`);
}

export async function createKycCase(customerId: string, level: 'basic' | 'enhanced' = 'basic'): Promise<{ data: KycCase }> {
  return apiClient<{ data: KycCase }>(`/v1/customers/${customerId}/kyc-cases`, {
    method: 'POST',
    body: JSON.stringify({ verification_level: level }),
  });
}

export async function approveKycCase(caseId: string, riskScore?: number, level?: 'basic' | 'enhanced'): Promise<{ data: KycCase }> {
  return apiClient<{ data: KycCase }>(`/v1/kyc-cases/${caseId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ ...(riskScore !== undefined ? { risk_score: riskScore } : {}), ...(level ? { verification_level: level } : {}) }),
  });
}

export async function rejectKycCase(caseId: string, reason: string): Promise<{ data: KycCase }> {
  return apiClient<{ data: KycCase }>(`/v1/kyc-cases/${caseId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

/**
 * Upload a KYC document — uses multipart/form-data directly against the API base.
 */
export async function uploadKycDocument(
  caseId: string,
  file: File,
  documentType: string,
  extras?: { document_number?: string; issued_at?: string; expires_at?: string; notes?: string },
): Promise<{ data: KycDocument }> {
  const base = getApiBase();
  if (!base) {
    throw new Error('Backend API is required for KYC document upload.');
  }
  const form = new FormData();
  form.append('file', file);
  form.append('document_type', documentType);
  Object.entries(extras ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') form.append(k, v);
  });
  const raw = localStorage.getItem('df_session');
  const token = raw ? (JSON.parse(raw) as { token?: string }).token : undefined;
  const res = await fetch(`${base}/v1/kyc-cases/${caseId}/documents`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    throw new Error((json as { message?: string })?.message ?? `Upload failed (${res.status})`);
  }
  return json as { data: KycDocument };
}

export async function verifyKycDocument(documentId: string, status: 'verified' | 'rejected' | 'pending', notes?: string): Promise<{ data: KycDocument }> {
  return apiClient<{ data: KycDocument }>(`/v1/kyc-documents/${documentId}/verify`, {
    method: 'POST',
    body: JSON.stringify({ verification_status: status, notes }),
  });
}

export async function deleteKycDocument(documentId: string): Promise<{ message: string }> {
  return apiClient<{ message: string }>(`/v1/kyc-documents/${documentId}`, { method: 'DELETE' });
}

// Canonical KYC document checklist per customer type
export const KYC_CHECKLIST: Record<CustomerType, { key: string; label: string; required: boolean }[]> = {
  PARTICULIER: [
    { key: 'cin', label: 'CIN (recto/verso)', required: true },
    { key: 'proof_of_address', label: 'Justificatif de domicile', required: true },
    { key: 'driving_license', label: 'Permis de conduire', required: true },
    { key: 'payslip', label: 'Fiches de paie (3 derniers mois)', required: true },
    { key: 'cnss', label: 'Attestation CNSS', required: false },
    { key: 'rib', label: 'RIB / IBAN', required: true },
  ],
  ENTREPRISE: [
    { key: 'ice', label: 'Attestation ICE', required: true },
    { key: 'rc', label: 'Registre de commerce (RC)', required: true },
    { key: 'tax_identifier', label: 'Attestation fiscale (IF)', required: true },
    { key: 'cnss', label: 'Attestation CNSS employeur', required: false },
    { key: 'statuts', label: 'Statuts de la société', required: true },
    { key: 'legal_rep_cin', label: 'CIN représentant légal', required: true },
    { key: 'rib', label: 'RIB entreprise', required: true },
    { key: 'bilan', label: 'Bilan 3 derniers exercices', required: false },
  ],
};
