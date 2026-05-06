import { apiClient } from '@/services/apiClient';

export type SupplierAgencyStatus = 'active' | 'inactive' | 'blacklisted';

export interface SupplierAgency {
  id: string;
  company_id: string;
  branch_id?: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  ice?: string;
  rc?: string;
  status: SupplierAgencyStatus;
  notes?: string;
  sub_rental_contracts_count?: number;
  active_contracts_count?: number;
  created_at: string;
  updated_at: string;
}

export type SubRentalStatus = 'draft' | 'active' | 'returned' | 'closed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'partial' | 'paid';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'cheque' | 'card' | 'other';

export interface ExternalVehicleIdentity {
  registration_number?: string;
  brand_name?: string;
  model_name?: string;
  year?: number;
  color?: string;
  mileage?: number;
}

export interface SubRentalContract {
  id: string;
  company_id: string;
  branch_id?: string;
  supplier_agency_id: string;
  vehicle_id?: string;
  contract_number: string;
  external_vehicle_identity?: ExternalVehicleIdentity;
  start_date: string;
  end_date: string;
  daily_cost: number;
  total_cost: number;
  deposit_amount?: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  status: SubRentalStatus;
  notes?: string;
  supplier_agency?: SupplierAgency;
  vehicle?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  activated_at?: string;
  returned_at?: string;
  closed_at?: string;
}

export interface SubRentalPayment {
  id: string;
  sub_rental_contract_id: string;
  amount: number;
  payment_method: PaymentMethod;
  payment_date: string;
  reference?: string;
  notes?: string;
  created_at: string;
}

export interface SubRentalProfitability {
  supplier_cost: number;
  customer_revenue: number;
  margin: number;
  margin_percentage: number;
  total_paid: number;
  remaining_balance: number;
  days_count: number;
  daily_cost: number;
}

export interface SubRentalDashboard {
  active_sub_rentals: number;
  due_soon: number;
  overdue: number;
  monthly_supplier_cost: number;
  total_margin: number;
}

type ApiList<T> = { data: T[]; meta?: { total: number; current_page: number; last_page: number; per_page: number } };

// Supplier agencies
export const supplierAgencyApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiClient<ApiList<SupplierAgency>>(`/v1/supplier-agencies${qs}`);
  },
  get: (id: string) => apiClient<{ data: SupplierAgency }>(`/v1/supplier-agencies/${id}`),
  create: (body: Partial<SupplierAgency>) =>
    apiClient<{ data: SupplierAgency }>('/v1/supplier-agencies', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Partial<SupplierAgency>) =>
    apiClient<{ data: SupplierAgency }>(`/v1/supplier-agencies/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  delete: (id: string) => apiClient<{ message: string }>(`/v1/supplier-agencies/${id}`, { method: 'DELETE' }),
};

// Sub-rental contracts
export const subRentalApi = {
  dashboard: () => apiClient<{ data: SubRentalDashboard }>('/v1/sub-rentals/dashboard'),
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return apiClient<ApiList<SubRentalContract>>(`/v1/sub-rentals${qs}`);
  },
  get: (id: string) => apiClient<{ data: SubRentalContract }>(`/v1/sub-rentals/${id}`),
  create: (body: Record<string, unknown>) =>
    apiClient<{ data: SubRentalContract }>('/v1/sub-rentals', { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: Record<string, unknown>) =>
    apiClient<{ data: SubRentalContract }>(`/v1/sub-rentals/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  activate: (id: string) =>
    apiClient<{ data: SubRentalContract }>(`/v1/sub-rentals/${id}/activate`, { method: 'POST' }),
  returnToSupplier: (id: string, body: Record<string, unknown>) =>
    apiClient<{ data: SubRentalContract }>(`/v1/sub-rentals/${id}/return`, { method: 'POST', body: JSON.stringify(body) }),
  close: (id: string, forceClose = false) =>
    apiClient<{ data: SubRentalContract }>(`/v1/sub-rentals/${id}/close`, {
      method: 'POST',
      body: JSON.stringify({ force_close: forceClose }),
    }),
  profitability: (id: string) => apiClient<{ data: SubRentalProfitability }>(`/v1/sub-rentals/${id}/profitability`),
  payments: (id: string) =>
    apiClient<{ payments: SubRentalPayment[]; total_paid: number; remaining_balance: number; payment_status: PaymentStatus }>(
      `/v1/sub-rentals/${id}/payments`
    ),
  addPayment: (id: string, body: { amount: number; payment_method: PaymentMethod; payment_date: string; reference?: string; notes?: string }) =>
    apiClient<{ payment: SubRentalPayment; total_paid: number; remaining_balance: number; payment_status: PaymentStatus }>(
      `/v1/sub-rentals/${id}/payments`,
      { method: 'POST', body: JSON.stringify(body) }
    ),
};
