import { apiClient } from '@/services/apiClient';

export interface WalletTransaction {
  id: string;
  direction: 'credit' | 'debit';
  type: string;
  type_label: string;
  amount: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  description: string | null;
  reason: string | null;
  performed_by: string | null;
  created_at: string;
}

export interface WalletSummary {
  wallet_id: string;
  customer_id: string;
  balance: number;
  currency_code: string;
  recent_transactions: WalletTransaction[];
  updated_at: string;
}

export interface EarlyReturnPreview {
  contract_id: string;
  contract_number: string;
  planned_end_date: string | null;
  return_date: string;
  unused_days: number;
  monthly_payment: number;
  daily_rate: number;
  credit_amount: number;
  currency_code: string;
  current_balance: number;
  balance_after_credit: number;
}

export const walletApi = {
  async get(customerId: string): Promise<WalletSummary> {
    const res = await apiClient<{ data: WalletSummary }>(`/v1/customers/${customerId}/wallet`);
    return res.data;
  },

  async transactions(customerId: string, page = 1): Promise<{
    data: WalletTransaction[];
    total: number;
    per_page: number;
    current_page: number;
    last_page: number;
  }> {
    const res = await apiClient<{ data: any }>(`/v1/customers/${customerId}/wallet/transactions?page=${page}`);
    return res.data;
  },

  async adjust(customerId: string, payload: {
    direction: 'credit' | 'debit';
    amount: number;
    reason: string;
    description?: string;
  }): Promise<WalletTransaction> {
    const res = await apiClient<{ data: WalletTransaction }>(
      `/v1/customers/${customerId}/wallet/adjust`,
      { method: 'POST', body: JSON.stringify(payload) },
    );
    return res.data;
  },

  async apply(customerId: string, payload: {
    amount: number;
    reference_type: 'contract' | 'reservation';
    reference_id: string;
    description?: string;
  }): Promise<WalletTransaction> {
    const res = await apiClient<{ data: WalletTransaction }>(
      `/v1/customers/${customerId}/wallet/apply`,
      { method: 'POST', body: JSON.stringify(payload) },
    );
    return res.data;
  },

  async previewEarlyReturn(customerId: string, contractId: string, returnDate?: string): Promise<EarlyReturnPreview> {
    const body: any = { contract_id: contractId };
    if (returnDate) body.return_date = returnDate;
    const res = await apiClient<{ data: EarlyReturnPreview }>(
      `/v1/customers/${customerId}/wallet/preview-early-return`,
      { method: 'POST', body: JSON.stringify(body) },
    );
    return res.data;
  },
};
