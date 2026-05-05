import { apiClient } from '@/services/apiClient';
import type { Paginated } from '@/services/adminApi';

// ============================================================================
// Types
// ============================================================================

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense' | 'contra';
export type NormalBalance = 'debit' | 'credit';
export type EntryStatus = 'draft' | 'posted' | 'cancelled';
export type JournalType = 'sales' | 'purchases' | 'cash' | 'bank' | 'general' | 'payroll' | 'stock';

export interface AccountingAccount {
  id: string;
  company_id?: string | null;
  code: string;
  name: string;
  account_type: AccountType;
  normal_balance: NormalBalance;
  parent_code?: string | null;
  is_detail: boolean;
  is_active: boolean;
  allow_direct_posting: boolean;
  opening_balance: number;
  current_balance: number;
  currency_code: string;
  notes?: string | null;
  lines_count?: number;
}

export interface AccountingJournal {
  id: string;
  code: string;
  name: string;
  journal_type: JournalType;
  default_account_code?: string | null;
  is_default: boolean;
  is_active: boolean;
  sequence_prefix?: string | null;
  sequence_next: number;
}

export interface Tax {
  id: string;
  code: string;
  name: string;
  rate: number;
  tax_type: 'vat' | 'withholding' | 'stamp' | 'other';
  applies_to?: string | null;
  is_active: boolean;
  account_code?: string | null;
}

export interface FiscalYear {
  id: string;
  code: string;
  start_date: string;
  end_date: string;
  status: 'open' | 'closed' | 'locked';
  closed_at?: string | null;
  periods?: FiscalPeriod[];
}

export interface FiscalPeriod {
  id: string;
  fiscal_year_id: string;
  period_number: number;
  start_date: string;
  end_date: string;
  status: 'open' | 'closed';
}

export interface AccountingMappings {
  account_client: string;
  account_tva_collectee: string;
  account_banque: string;
  account_caisse: string;
  account_produit_location: string;
  account_vente_vo: string;
  account_immobilisation_vehicule: string;
  account_amortissement: string;
  account_amortissement_cumule: string;
  account_penalites_retard: string;
  account_produits_financiers: string;
}

export interface AccountingEntryLine {
  id: string;
  entry_id: string;
  account_code: string;
  account_id?: string | null;
  line_order: number;
  label: string;
  debit: number;
  credit: number;
  currency_code: string;
  tax_id?: string | null;
  tax_amount?: number | null;
  third_party_type?: string | null;
  third_party_id?: string | null;
  branch_id?: string | null;
  cost_center?: string | null;
}

export interface AccountingEntry {
  id: string;
  journal_id: string;
  fiscal_period_id?: string | null;
  entry_number: string;
  entry_date: string;
  description: string;
  reference?: string | null;
  status: EntryStatus;
  source_type?: string | null;
  source_id?: string | null;
  currency_code: string;
  total_debit: number;
  total_credit: number;
  posted_at?: string | null;
  lines?: AccountingEntryLine[];
  journal?: AccountingJournal | null;
  fiscal_period?: FiscalPeriod | null;
}

export interface FixedAsset {
  id: string;
  asset_number: string;
  name: string;
  category: 'vehicle' | 'equipment' | 'furniture' | 'building' | 'intangible' | 'other';
  vehicle_id?: string | null;
  acquisition_date: string;
  acquisition_cost: number;
  residual_value: number;
  useful_life_months: number;
  depreciation_method: 'linear' | 'declining' | 'none';
  accumulated_depreciation: number;
  book_value: number;
  asset_account_code?: string | null;
  depreciation_account_code?: string | null;
  accumulated_dep_account_code?: string | null;
  status: 'active' | 'disposed' | 'impaired';
  disposal_date?: string | null;
  disposal_amount?: number | null;
  notes?: string | null;
  depreciation_lines?: DepreciationLine[];
}

export interface DepreciationLine {
  id: string;
  asset_id: string;
  period_date: string;
  amount: number;
  cumulative_depreciation: number;
  book_value: number;
  is_posted: boolean;
  entry_id?: string | null;
}

// Reports
export interface TrialBalanceLine {
  account_code: string;
  account_name: string;
  account_type: AccountType;
  opening_balance: number;
  period_debit: number;
  period_credit: number;
  closing_balance: number;
  debit_balance: number;
  credit_balance: number;
}

export interface BalanceSheetSection {
  lines: Array<{ code: string; name: string; parent_code?: string | null; balance: number }>;
  total: number;
}

export interface IncomeStatementSection {
  lines: Array<{ code: string; name: string; parent_code?: string | null; amount: number }>;
  total: number;
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
// Accounts
// ============================================================================
export function listAccounts(params: { account_type?: AccountType; is_active?: boolean; search?: string } = {}): Promise<{ data: AccountingAccount[] }> {
  return apiClient<{ data: AccountingAccount[] }>(`/v1/accounting/accounts${q(params as Record<string, unknown>)}`);
}
export function createAccount(payload: Omit<AccountingAccount, 'id' | 'current_balance' | 'lines_count'>): Promise<{ data: AccountingAccount }> {
  return apiClient<{ data: AccountingAccount }>('/v1/accounting/accounts', { method: 'POST', body: JSON.stringify(payload) });
}
export function updateAccount(id: string, payload: Partial<AccountingAccount>): Promise<{ data: AccountingAccount }> {
  return apiClient<{ data: AccountingAccount }>(`/v1/accounting/accounts/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}
export function deleteAccount(id: string): Promise<{ message: string }> {
  return apiClient<{ message: string }>(`/v1/accounting/accounts/${id}`, { method: 'DELETE' });
}

// ============================================================================
// Journals
// ============================================================================
export function listJournals(params: { journal_type?: JournalType; is_active?: boolean } = {}): Promise<{ data: AccountingJournal[] }> {
  return apiClient<{ data: AccountingJournal[] }>(`/v1/accounting/journals${q(params as Record<string, unknown>)}`);
}
export function createJournal(payload: Partial<AccountingJournal>): Promise<{ data: AccountingJournal }> {
  return apiClient<{ data: AccountingJournal }>('/v1/accounting/journals', { method: 'POST', body: JSON.stringify(payload) });
}

// ============================================================================
// Journal entries
// ============================================================================
export interface EntryListParams { status?: EntryStatus; journal_id?: string; fiscal_period_id?: string; from?: string; to?: string; search?: string; page?: number; per_page?: number; }
export function listEntries(params: EntryListParams = {}): Promise<Paginated<AccountingEntry>> {
  return apiClient<Paginated<AccountingEntry>>(`/v1/accounting/entries${q(params as Record<string, unknown>)}`);
}
export function getEntry(id: string): Promise<{ data: AccountingEntry }> {
  return apiClient<{ data: AccountingEntry }>(`/v1/accounting/entries/${id}`);
}
export interface EntryCreatePayload {
  journal_id: string;
  fiscal_period_id?: string;
  entry_date: string;
  description: string;
  reference?: string;
  lines: Array<{ account_code: string; label: string; debit: number; credit: number; tax_id?: string; tax_amount?: number; third_party_type?: string; third_party_id?: string; branch_id?: string; cost_center?: string; }>;
}
export function createEntry(payload: EntryCreatePayload): Promise<{ data: AccountingEntry }> {
  return apiClient<{ data: AccountingEntry }>('/v1/accounting/entries', { method: 'POST', body: JSON.stringify(payload) });
}
export function postEntry(id: string): Promise<{ data: AccountingEntry }> {
  return apiClient<{ data: AccountingEntry }>(`/v1/accounting/entries/${id}/post`, { method: 'POST' });
}
export function cancelEntry(id: string): Promise<{ data: AccountingEntry }> {
  return apiClient<{ data: AccountingEntry }>(`/v1/accounting/entries/${id}/cancel`, { method: 'POST' });
}
export function deleteEntry(id: string): Promise<{ message: string }> {
  return apiClient<{ message: string }>(`/v1/accounting/entries/${id}`, { method: 'DELETE' });
}

// ============================================================================
// Taxes
// ============================================================================
export function listTaxes(params: { tax_type?: string; is_active?: boolean } = {}): Promise<{ data: Tax[] }> {
  return apiClient<{ data: Tax[] }>(`/v1/taxes${q(params as Record<string, unknown>)}`);
}
export function createTax(payload: Partial<Tax>): Promise<{ data: Tax }> {
  return apiClient<{ data: Tax }>('/v1/taxes', { method: 'POST', body: JSON.stringify(payload) });
}
export function updateTax(id: string, payload: Partial<Tax>): Promise<{ data: Tax }> {
  return apiClient<{ data: Tax }>(`/v1/taxes/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
}

// ============================================================================
// Fiscal years
// ============================================================================
export function listFiscalYears(): Promise<{ data: FiscalYear[] }> {
  return apiClient<{ data: FiscalYear[] }>('/v1/fiscal-years');
}
export function createFiscalYear(payload: { code: string; start_date: string; end_date: string }): Promise<{ data: FiscalYear }> {
  return apiClient<{ data: FiscalYear }>('/v1/fiscal-years', { method: 'POST', body: JSON.stringify(payload) });
}
export function getCurrentPeriod(): Promise<{ data: FiscalPeriod }> {
  return apiClient<{ data: FiscalPeriod }>('/v1/fiscal-years/current-period');
}
export function closeFiscalYear(id: string): Promise<{ data: FiscalYear }> {
  return apiClient<{ data: FiscalYear }>(`/v1/fiscal-years/${id}/close`, { method: 'POST' });
}

export function getAccountingMappings(): Promise<{ data: { mappings: AccountingMappings } }> {
  return apiClient<{ data: { mappings: AccountingMappings } }>('/v1/accounting/settings/mappings');
}
export function updateAccountingMappings(mappings: Partial<AccountingMappings>): Promise<{ data: { mappings: AccountingMappings } }> {
  return apiClient<{ data: { mappings: AccountingMappings } }>('/v1/accounting/settings/mappings', {
    method: 'PUT',
    body: JSON.stringify({ mappings }),
  });
}

// ============================================================================
// Fixed assets
// ============================================================================
export function listFixedAssets(params: { category?: string; status?: string; search?: string; page?: number; per_page?: number } = {}): Promise<Paginated<FixedAsset>> {
  return apiClient<Paginated<FixedAsset>>(`/v1/fixed-assets${q(params as Record<string, unknown>)}`);
}
export function getFixedAsset(id: string): Promise<{ data: FixedAsset }> {
  return apiClient<{ data: FixedAsset }>(`/v1/fixed-assets/${id}`);
}
export function createFixedAsset(payload: Partial<FixedAsset>): Promise<{ data: FixedAsset }> {
  return apiClient<{ data: FixedAsset }>('/v1/fixed-assets', { method: 'POST', body: JSON.stringify(payload) });
}
export function disposeFixedAsset(id: string, payload: { disposal_date: string; disposal_amount?: number; notes?: string }): Promise<{ data: FixedAsset }> {
  return apiClient<{ data: FixedAsset }>(`/v1/fixed-assets/${id}/dispose`, { method: 'POST', body: JSON.stringify(payload) });
}
export function runDepreciation(id: string, period_date: string): Promise<{ data: FixedAsset }> {
  return apiClient<{ data: FixedAsset }>(`/v1/fixed-assets/${id}/depreciate`, { method: 'POST', body: JSON.stringify({ period_date }) });
}

// ============================================================================
// Reports
// ============================================================================
export function getGeneralLedger(params: { account_code?: string; from?: string; to?: string; fiscal_period_id?: string } = {}): Promise<{ data: unknown[] }> {
  return apiClient<{ data: unknown[] }>(`/v1/accounting/general-ledger${q(params as Record<string, unknown>)}`);
}
export function getTrialBalance(params: { from?: string; to?: string; fiscal_period_id?: string } = {}): Promise<{ data: { lines: TrialBalanceLine[]; totals: { total_debit: number; total_credit: number; is_balanced: boolean } } }> {
  return apiClient<{ data: { lines: TrialBalanceLine[]; totals: { total_debit: number; total_credit: number; is_balanced: boolean } } }>(`/v1/accounting/trial-balance${q(params as Record<string, unknown>)}`);
}
export function getBalanceSheet(as_of?: string): Promise<{ data: { as_of: string; assets: BalanceSheetSection; liabilities: BalanceSheetSection; equity: BalanceSheetSection; total_liabilities_equity: number; is_balanced: boolean } }> {
  return apiClient(`/v1/accounting/balance-sheet${as_of ? `?as_of=${as_of}` : ''}`);
}
export function getIncomeStatement(params: { from?: string; to?: string } = {}): Promise<{ data: { from: string; to: string; income: IncomeStatementSection; expense: IncomeStatementSection; net_income: number; is_profitable: boolean } }> {
  return apiClient(`/v1/accounting/income-statement${q(params as Record<string, unknown>)}`);
}
export function getTaxReport(params: { from?: string; to?: string } = {}): Promise<{ data: { from: string; to: string; taxes: unknown[]; total_vat_collected: number; total_withholding: number } }> {
  return apiClient(`/v1/accounting/tax-report${q(params as Record<string, unknown>)}`);
}

// Bridges
export function bridgeInvoice(invoiceId: string): Promise<{ data: AccountingEntry }> {
  return apiClient<{ data: AccountingEntry }>(`/v1/accounting/bridge/invoice/${invoiceId}`, { method: 'POST' });
}
export function bridgePayment(paymentId: string): Promise<{ data: AccountingEntry }> {
  return apiClient<{ data: AccountingEntry }>(`/v1/accounting/bridge/payment/${paymentId}`, { method: 'POST' });
}
export function bridgeDepreciation(lineId: string): Promise<{ data: AccountingEntry }> {
  return apiClient<{ data: AccountingEntry }>(`/v1/accounting/bridge/depreciation/${lineId}`, { method: 'POST' });
}
export function bridgeAssetDisposal(assetId: string): Promise<{ data: AccountingEntry }> {
  return apiClient<{ data: AccountingEntry }>(`/v1/accounting/bridge/asset-disposal/${assetId}`, { method: 'POST' });
}

// ============================================================================
// Labels
// ============================================================================
export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  asset: 'Actif',
  liability: 'Passif',
  equity: 'Capitaux propres',
  income: 'Produit',
  expense: 'Charge',
  contra: 'Contra',
};
export const ENTRY_STATUS_LABEL: Record<EntryStatus, string> = {
  draft: 'Brouillon',
  posted: 'Comptabilisé',
  cancelled: 'Annulé',
};
export function entryStatusTone(s: EntryStatus): 'default' | 'success' | 'danger' | 'warning' {
  return s === 'posted' ? 'success' : s === 'cancelled' ? 'danger' : 'default';
}
