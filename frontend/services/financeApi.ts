import { apiClient } from '@/services/apiClient';
import type { Paginated } from '@/services/adminApi';

// ============================================================================
// Invoice types
// ============================================================================

export type InvoiceStatus = 'draft' | 'issued' | 'partial' | 'paid' | 'overdue' | 'cancelled';
export type InvoiceType = 'contract' | 'sale' | 'service' | 'credit_note';

export interface InvoiceLine {
  id: string;
  invoice_id: string;
  position: number;
  line_type: 'installment' | 'fee' | 'penalty' | 'sale' | 'adjustment';
  contract_installment_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  line_total: number;
  metadata?: Record<string, unknown> | null;
}

export interface Invoice {
  id: string;
  company_id?: string | null;
  branch_id?: string | null;
  invoice_number: string;
  invoice_type: InvoiceType;
  customer_id: string;
  contract_id?: string | null;
  sale_id?: string | null;
  issue_date: string;
  due_date?: string | null;
  currency_code: string;
  subtotal_amount: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  status: InvoiceStatus;
  issued_at?: string | null;
  sent_at?: string | null;
  paid_at?: string | null;
  cancelled_at?: string | null;
  notes?: string | null;
  lines?: InvoiceLine[];
  customer?: { id: string; full_name?: string | null; customer_code?: string | null } | null;
  contract?: { id: string; contract_number?: string | null } | null;
  allocations?: PaymentAllocation[];
  created_at?: string;
  updated_at?: string;
}

export interface InvoiceListParams {
  status?: InvoiceStatus;
  customer_id?: string;
  contract_id?: string;
  branch_id?: string;
  invoice_type?: InvoiceType;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  per_page?: number;
}

export interface InvoiceCreatePayload {
  customer_id: string;
  contract_id?: string;
  sale_id?: string;
  branch_id?: string;
  invoice_type: InvoiceType;
  issue_date: string;
  due_date?: string;
  currency_code?: string;
  discount_amount?: number;
  notes?: string;
  lines: Array<{
    line_type: InvoiceLine['line_type'];
    contract_installment_id?: string;
    description: string;
    quantity?: number;
    unit_price: number;
    discount_amount?: number;
    tax_rate?: number;
    metadata?: Record<string, unknown>;
  }>;
}

// ============================================================================
// Payment types
// ============================================================================

export type PaymentStatus = 'received' | 'allocated' | 'refunded' | 'reversed';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'check' | 'card' | 'compensation';

export interface PaymentAllocation {
  id: string;
  payment_id: string;
  invoice_id?: string | null;
  contract_installment_id?: string | null;
  amount_allocated: number;
  allocated_at?: string | null;
  allocated_by_user_id?: string | null;
  notes?: string | null;
  invoice?: Invoice | null;
  installment?: { id: string; installment_number?: number | null; due_date?: string | null } | null;
  payment?: Payment | null;
}

export interface Payment {
  id: string;
  company_id?: string | null;
  branch_id?: string | null;
  payment_number: string;
  customer_id: string;
  payment_method: PaymentMethod;
  payment_direction: 'incoming' | 'outgoing';
  amount: number;
  currency_code: string;
  amount_allocated: number;
  amount_unallocated: number;
  status: PaymentStatus;
  payment_date: string;
  bank_account_id?: string | null;
  external_reference?: string | null;
  check_number?: string | null;
  check_date?: string | null;
  check_bank?: string | null;
  notes?: string | null;
  customer?: { id: string; full_name?: string | null; customer_code?: string | null } | null;
  bank_account?: BankAccount | null;
  allocations?: PaymentAllocation[];
}

export interface PaymentListParams {
  status?: PaymentStatus;
  payment_method?: PaymentMethod;
  payment_direction?: 'incoming' | 'outgoing';
  customer_id?: string;
  branch_id?: string;
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  per_page?: number;
}

export interface PaymentCreatePayload {
  customer_id: string;
  branch_id?: string;
  bank_account_id?: string;
  payment_method: PaymentMethod;
  payment_direction: 'incoming' | 'outgoing';
  amount: number;
  currency_code?: string;
  payment_date: string;
  external_reference?: string;
  check_number?: string;
  check_date?: string;
  check_bank?: string;
  notes?: string;
  allocations?: Array<{
    invoice_id?: string;
    contract_installment_id?: string;
    amount_allocated: number;
    notes?: string;
  }>;
}

export interface AllocatePayload {
  allocations: Array<{
    invoice_id?: string;
    contract_installment_id?: string;
    amount_allocated: number;
    notes?: string;
  }>;
}

// ============================================================================
// Treasury types
// ============================================================================

export interface BankAccount {
  id: string;
  company_id?: string | null;
  branch_id?: string | null;
  account_name: string;
  bank_name: string;
  account_number?: string | null;
  iban?: string | null;
  swift_code?: string | null;
  currency_code: string;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
  is_primary: boolean;
  notes?: string | null;
}

export interface BankTransaction {
  id: string;
  bank_account_id: string;
  transaction_type: 'debit' | 'credit';
  amount: number;
  currency_code: string;
  value_date: string;
  posted_date?: string | null;
  description?: string | null;
  external_reference?: string | null;
  counterparty_name?: string | null;
  counterparty_iban?: string | null;
  matched_payment_id?: string | null;
  reconciliation_status: 'unmatched' | 'matched' | 'ignored';
  import_batch_id?: string | null;
}

export interface TreasurySummary {
  balances_by_currency: Record<string, { current_balance: number; opening_balance: number; accounts_count: number }>;
  accounts: BankAccount[];
  projected_inflows_next_30d: number;
  projected_installments_next_30d: number;
  overdue_total: number;
  overdue_invoices_count: number;
  recent_payments_7d: number;
  generated_at: string;
}

export interface CustomerBalance {
  customer_id: string;
  currency_code: string;
  total_invoiced: number;
  total_paid: number;
  total_due: number;
  overdue_amount: number;
  overdue_invoices_count: number;
  unallocated_payments: number;
  invoices_count: number;
}

export interface CustomerStatementEntry {
  date: string;
  type: 'invoice' | 'payment';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  running_balance: number;
  source_id: string;
  status: string;
}

export interface CustomerStatement {
  customer: { id: string; customer_code?: string | null; full_name?: string | null; customer_type?: string | null };
  entries: CustomerStatementEntry[];
  total_debit: number;
  total_credit: number;
  closing_balance: number;
  from?: string | null;
  to?: string | null;
}

// ============================================================================
// Helpers
// ============================================================================

function q(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.append(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ============================================================================
// Invoice endpoints
// ============================================================================

export function listInvoices(params: InvoiceListParams = {}): Promise<Paginated<Invoice>> {
  return apiClient<Paginated<Invoice>>(`/v1/invoices${q(params as Record<string, unknown>)}`);
}

export function getInvoice(id: string): Promise<{ data: Invoice }> {
  return apiClient<{ data: Invoice }>(`/v1/invoices/${id}`);
}

export function createInvoice(payload: InvoiceCreatePayload): Promise<{ data: Invoice }> {
  return apiClient<{ data: Invoice }>(`/v1/invoices`, { method: 'POST', body: JSON.stringify(payload) });
}

export function updateInvoice(
  id: string,
  payload: Partial<Pick<InvoiceCreatePayload, 'issue_date' | 'due_date' | 'discount_amount' | 'notes'>>,
): Promise<{ data: Invoice }> {
  return apiClient<{ data: Invoice }>(`/v1/invoices/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

export function issueInvoice(id: string): Promise<{ data: Invoice }> {
  return apiClient<{ data: Invoice }>(`/v1/invoices/${id}/issue`, { method: 'POST' });
}

export function cancelInvoice(id: string, reason?: string): Promise<{ data: Invoice }> {
  return apiClient<{ data: Invoice }>(`/v1/invoices/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason: reason ?? '' }),
  });
}

export function deleteInvoice(id: string): Promise<{ message: string }> {
  return apiClient<{ message: string }>(`/v1/invoices/${id}`, { method: 'DELETE' });
}

export function generateInvoiceFromContract(
  contractId: string,
  payload: { installment_ids?: string[]; issue_date?: string; due_date?: string } = {},
): Promise<{ data: Invoice }> {
  return apiClient<{ data: Invoice }>(`/v1/contracts/${contractId}/generate-invoice`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ============================================================================
// Payment endpoints
// ============================================================================

export function listPayments(params: PaymentListParams = {}): Promise<Paginated<Payment>> {
  return apiClient<Paginated<Payment>>(`/v1/payments${q(params as Record<string, unknown>)}`);
}

export function getPayment(id: string): Promise<{ data: Payment }> {
  return apiClient<{ data: Payment }>(`/v1/payments/${id}`);
}

export function createPayment(payload: PaymentCreatePayload): Promise<{ data: Payment }> {
  return apiClient<{ data: Payment }>(`/v1/payments`, { method: 'POST', body: JSON.stringify(payload) });
}

export function allocatePayment(id: string, payload: AllocatePayload): Promise<{ data: Payment }> {
  return apiClient<{ data: Payment }>(`/v1/payments/${id}/allocate`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function removeAllocation(allocationId: string): Promise<{ message: string }> {
  return apiClient<{ message: string }>(`/v1/payment-allocations/${allocationId}`, { method: 'DELETE' });
}

// ============================================================================
// Treasury endpoints
// ============================================================================

export function getTreasurySummary(params: { branch_id?: string } = {}): Promise<{ data: TreasurySummary }> {
  return apiClient<{ data: TreasurySummary }>(`/v1/treasury/summary${q(params as Record<string, unknown>)}`);
}

export function listBankAccounts(params: { branch_id?: string; is_active?: boolean } = {}): Promise<{ data: BankAccount[] }> {
  return apiClient<{ data: BankAccount[] }>(`/v1/treasury/bank-accounts${q(params as Record<string, unknown>)}`);
}

export function createBankAccount(payload: Partial<BankAccount>): Promise<{ data: BankAccount }> {
  return apiClient<{ data: BankAccount }>(`/v1/treasury/bank-accounts`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateBankAccount(id: string, payload: Partial<BankAccount>): Promise<{ data: BankAccount }> {
  return apiClient<{ data: BankAccount }>(`/v1/treasury/bank-accounts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function listBankTransactions(
  accountId: string,
  params: {
    reconciliation_status?: 'unmatched' | 'matched' | 'ignored';
    transaction_type?: 'debit' | 'credit';
    from?: string;
    to?: string;
    page?: number;
    per_page?: number;
  } = {},
): Promise<Paginated<BankTransaction>> {
  return apiClient<Paginated<BankTransaction>>(
    `/v1/treasury/bank-accounts/${accountId}/transactions${q(params as Record<string, unknown>)}`,
  );
}

export function importBankTransactions(
  accountId: string,
  payload: {
    batch_id?: string;
    transactions: Array<{
      transaction_type: 'debit' | 'credit';
      amount: number;
      value_date: string;
      posted_date?: string;
      description?: string;
      external_reference?: string;
      counterparty_name?: string;
      counterparty_iban?: string;
      raw_payload?: Record<string, unknown>;
    }>;
  },
): Promise<{ data: { batch_id: string; created_count: number; transactions: BankTransaction[] } }> {
  return apiClient<{ data: { batch_id: string; created_count: number; transactions: BankTransaction[] } }>(
    `/v1/treasury/bank-accounts/${accountId}/transactions/import`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function matchBankTransaction(
  transactionId: string,
  payload: { action: 'match' | 'ignore' | 'unmatch'; payment_id?: string },
): Promise<{ data: BankTransaction }> {
  return apiClient<{ data: BankTransaction }>(`/v1/treasury/bank-transactions/${transactionId}/match`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ============================================================================
// Customer balance & statement
// ============================================================================

export function getCustomerBalance(customerId: string): Promise<{ data: CustomerBalance }> {
  return apiClient<{ data: CustomerBalance }>(`/v1/customers/${customerId}/balance`);
}

export function getCustomerStatement(
  customerId: string,
  params: { from?: string; to?: string } = {},
): Promise<{ data: CustomerStatement }> {
  return apiClient<{ data: CustomerStatement }>(
    `/v1/customers/${customerId}/statement${q(params as Record<string, unknown>)}`,
  );
}

// ============================================================================
// Labels
// ============================================================================

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Brouillon',
  issued: 'Émise',
  partial: 'Partielle',
  paid: 'Payée',
  overdue: 'En retard',
  cancelled: 'Annulée',
};

export function invoiceStatusTone(status: InvoiceStatus): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'paid':
      return 'success';
    case 'partial':
      return 'warning';
    case 'overdue':
      return 'danger';
    case 'cancelled':
      return 'default';
    case 'issued':
      return 'info';
    default:
      return 'default';
  }
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Espèces',
  bank_transfer: 'Virement',
  check: 'Chèque',
  card: 'Carte',
  compensation: 'Compensation',
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  received: 'Reçu',
  allocated: 'Alloué',
  refunded: 'Remboursé',
  reversed: 'Annulé',
};

export function paymentStatusTone(status: PaymentStatus): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'allocated':
      return 'success';
    case 'received':
      return 'info';
    case 'refunded':
      return 'warning';
    case 'reversed':
      return 'danger';
    default:
      return 'default';
  }
}
