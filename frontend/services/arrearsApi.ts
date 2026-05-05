import { apiClient } from '@/services/apiClient';
import type { Paginated } from '@/services/adminApi';

// ============================================================================
// Types
// ============================================================================

export type ArrearsStage = 'new' | 'reminder_1' | 'reminder_2' | 'formal_notice' | 'promise' | 'legal' | 'repossession' | 'closed';
export type ArrearsResolution = 'paid' | 'written_off' | 'settlement' | 'legal_judgment' | 'repossessed' | 'pending';
export type ActionType = 'note' | 'reminder_call' | 'reminder_sms' | 'reminder_email' | 'formal_notice' | 'payment_promise' | 'partial_payment' | 'legal_transfer' | 'repossession_order' | 'repossession_done' | 'settlement' | 'write_off' | 'stage_change' | 'close';

export interface ArrearsCase {
  id: string;
  company_id?: string | null;
  branch_id?: string | null;
  case_number: string;
  customer_id: string;
  contract_id?: string | null;
  total_overdue: number;
  total_recovered: number;
  overdue_installments_count: number;
  days_overdue: number;
  stage: ArrearsStage;
  resolution: ArrearsResolution;
  notes?: string | null;
  next_action_date?: string | null;
  assigned_to_user_id?: string | null;
  closed_at?: string | null;
  customer?: { id: string; full_name?: string | null; customer_code?: string | null } | null;
  contract?: { id: string; contract_number?: string | null } | null;
  actions?: ArrearsAction[];
  legal_case?: LegalCase | null;
}

export interface ArrearsAction {
  id: string;
  case_id: string;
  action_type: ActionType;
  description: string;
  action_date: string;
  amount?: number | null;
  promise_date?: string | null;
  new_stage?: string | null;
  attachments?: unknown;
  performed_by_user_id?: string | null;
  created_at?: string;
}

export interface LegalCase {
  id: string;
  arrears_case_id: string;
  case_number: string;
  customer_id: string;
  contract_id?: string | null;
  vehicle_id?: string | null;
  case_type: 'recovery' | 'repossession' | 'judgment' | 'settlement';
  status: 'open' | 'in_progress' | 'judgment_obtained' | 'appeal' | 'settled' | 'closed';
  lawyer_name?: string | null;
  lawyer_contact?: string | null;
  court_reference?: string | null;
  court_name?: string | null;
  filing_date?: string | null;
  hearing_date?: string | null;
  judgment_date?: string | null;
  claimed_amount: number;
  awarded_amount?: number | null;
  judgment_summary?: string | null;
  documents?: unknown;
  notes?: string | null;
  customer?: { id: string; full_name?: string | null } | null;
  arrears_case?: ArrearsCase | null;
  repossession_orders?: RepossessionOrder[];
}

export interface RepossessionOrder {
  id: string;
  legal_case_id: string;
  vehicle_id: string;
  customer_id: string;
  order_number: string;
  status: 'ordered' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  ordered_at: string;
  completed_at?: string | null;
  recovery_agent?: string | null;
  recovery_location?: string | null;
  notes?: string | null;
  photos?: unknown;
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
// Arrears cases
// ============================================================================
export interface ArrearsCaseListParams { stage?: ArrearsStage; customer_id?: string; branch_id?: string; assigned_to_user_id?: string; search?: string; page?: number; per_page?: number; }

export function listArrearsCases(params: ArrearsCaseListParams = {}): Promise<Paginated<ArrearsCase>> {
  return apiClient<Paginated<ArrearsCase>>(`/v1/arrears/cases${q(params as Record<string, unknown>)}`);
}
export function getArrearsCase(id: string): Promise<{ data: ArrearsCase }> {
  return apiClient<{ data: ArrearsCase }>(`/v1/arrears/cases/${id}`);
}
export function createArrearsCase(payload: {
  customer_id: string;
  contract_id?: string;
  branch_id?: string;
  total_overdue?: number;
  overdue_installments_count?: number;
  days_overdue?: number;
  notes?: string;
  next_action_date?: string;
  assigned_to_user_id?: string;
}): Promise<{ data: ArrearsCase }> {
  return apiClient<{ data: ArrearsCase }>('/v1/arrears/cases', { method: 'POST', body: JSON.stringify(payload) });
}
export function updateArrearsCase(id: string, payload: Partial<ArrearsCase>): Promise<{ data: ArrearsCase }> {
  return apiClient<{ data: ArrearsCase }>(`/v1/arrears/cases/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}
export function addArrearsAction(
  caseId: string,
  payload: {
    action_type: ActionType;
    description: string;
    action_date: string;
    amount?: number;
    promise_date?: string;
    attachments?: unknown[];
  },
): Promise<{ data: ArrearsCase }> {
  return apiClient<{ data: ArrearsCase }>(`/v1/arrears/cases/${caseId}/action`, { method: 'POST', body: JSON.stringify(payload) });
}
export function escalateArrearsCase(caseId: string, reason: string): Promise<{ data: ArrearsCase }> {
  return apiClient<{ data: ArrearsCase }>(`/v1/arrears/cases/${caseId}/escalate`, { method: 'POST', body: JSON.stringify({ reason }) });
}

// ============================================================================
// Legal cases
// ============================================================================
export interface LegalCaseListParams { status?: string; case_type?: string; customer_id?: string; search?: string; page?: number; per_page?: number; }
export function listLegalCases(params: LegalCaseListParams = {}): Promise<Paginated<LegalCase>> {
  return apiClient<Paginated<LegalCase>>(`/v1/legal-cases${q(params as Record<string, unknown>)}`);
}
export function getLegalCase(id: string): Promise<{ data: LegalCase }> {
  return apiClient<{ data: LegalCase }>(`/v1/legal-cases/${id}`);
}
export function createLegalCase(payload: {
  arrears_case_id: string;
  customer_id: string;
  contract_id?: string;
  vehicle_id?: string;
  case_type: LegalCase['case_type'];
  claimed_amount: number;
  lawyer_name?: string;
  lawyer_contact?: string;
  court_reference?: string;
  court_name?: string;
  filing_date?: string;
  hearing_date?: string;
  notes?: string;
  assigned_to_user_id?: string;
}): Promise<{ data: LegalCase }> {
  return apiClient<{ data: LegalCase }>('/v1/legal-cases', { method: 'POST', body: JSON.stringify(payload) });
}
export function updateLegalCase(id: string, payload: Partial<LegalCase>): Promise<{ data: LegalCase }> {
  return apiClient<{ data: LegalCase }>(`/v1/legal-cases/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}
export function createRepossessionOrder(legalCaseId: string, payload: { vehicle_id: string; ordered_at: string; recovery_agent?: string; recovery_location?: string; notes?: string }): Promise<{ data: RepossessionOrder }> {
  return apiClient<{ data: RepossessionOrder }>(`/v1/legal-cases/${legalCaseId}/repossession-orders`, { method: 'POST', body: JSON.stringify(payload) });
}
export function updateRepossessionOrder(id: string, payload: Partial<RepossessionOrder>): Promise<{ data: RepossessionOrder }> {
  return apiClient<{ data: RepossessionOrder }>(`/v1/repossession-orders/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

// ============================================================================
// Labels
// ============================================================================
export const ARREARS_STAGE_LABEL: Record<ArrearsStage, string> = {
  new: 'Nouveau',
  reminder_1: 'Relance 1',
  reminder_2: 'Relance 2',
  formal_notice: 'Mise en demeure',
  promise: 'Promesse',
  legal: 'Juridique',
  repossession: 'Saisie',
  closed: 'Clôturé',
};
export function arrearsStageTone(s: ArrearsStage): 'default' | 'info' | 'warning' | 'danger' | 'success' {
  switch (s) {
    case 'closed': return 'success';
    case 'new': return 'default';
    case 'reminder_1': case 'reminder_2': return 'info';
    case 'formal_notice': case 'promise': return 'warning';
    case 'legal': case 'repossession': return 'danger';
    default: return 'default';
  }
}

export const ACTION_TYPE_LABEL: Record<ActionType, string> = {
  note: 'Note',
  reminder_call: 'Appel relance',
  reminder_sms: 'SMS relance',
  reminder_email: 'Email relance',
  formal_notice: 'Mise en demeure',
  payment_promise: 'Promesse de paiement',
  partial_payment: 'Paiement partiel',
  legal_transfer: 'Transfert juridique',
  repossession_order: 'Ordre de saisie',
  repossession_done: 'Saisie effectuée',
  settlement: 'Accord amiable',
  write_off: 'Passage en perte',
  stage_change: 'Changement étape',
  close: 'Clôture',
};
