import { apiClient, endpoints, getApiBase } from '@/services/apiClient';
import type { ContractDto } from '@/services/dtos';

type ApiListResponse<T> = { data: T[]; meta?: unknown; links?: unknown };

export type ContractListFilters = {
  type?: string;
  status?: string;
  customer_id?: string;
  vehicle_id?: string;
};

export type ContractDetailResponse = {
  contract: ContractDto;
  history: Array<{
    id: string;
    action: string;
    from_status?: string | null;
    to_status?: string | null;
    note?: string | null;
    actor_id?: string | null;
    at: string;
  }>;
};

function hasBackend(): boolean {
  return !!getApiBase();
}

export const contractsApi = {
  async list(filters?: ContractListFilters): Promise<ContractDto[]> {
    if (!hasBackend()) {
      throw new Error('Backend API is required for contracts.');
    }
    const qs = new URLSearchParams();
    if (filters?.type) qs.set('type', filters.type);
    if (filters?.status) qs.set('status', filters.status);
    if (filters?.customer_id) qs.set('customer_id', filters.customer_id);
    if (filters?.vehicle_id) qs.set('vehicle_id', filters.vehicle_id);
    const path = `${endpoints.contracts.list}${qs.toString() ? `?${qs.toString()}` : ''}`;
    const res = await apiClient<ApiListResponse<ContractDto>>(path);
    return res.data;
  },

  async create(payload: Partial<ContractDto> & { type: string; clientId: number | string }): Promise<ContractDto> {
    if (!hasBackend()) {
      throw new Error('Backend required for contract creation (set VITE_API_BASE).');
    }
    const body = {
      contract_type: payload.type,
      customer_id: String(payload.clientId),
      vehicle_id: payload.vehicleId ? String(payload.vehicleId) : null,
      start_date: payload.startDate ?? null,
      end_date: payload.endDate ?? null,
      duration_months: (payload as any).durationMonths ?? null,
      currency_code: 'MAD',
      base_amount: payload.amountMad ?? payload.baseAmount ?? null,
      monthly_payment: (payload as any).monthlyPayment ?? null,
      allowed_km: (payload as any).allowedKm ?? null,
      excess_km_rate: (payload as any).excessKmRate ?? null,
      deposit_amount: (payload as any).depositAmount ?? null,
      notes: (payload as any).notes ?? null,
    };
    const res = await apiClient<{ data: ContractDto }>(endpoints.contracts.list, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return res.data;
  },

  async get(id: number | string): Promise<ContractDetailResponse> {
    if (!hasBackend()) {
      throw new Error('Backend API is required for contract details.');
    }
    const res = await apiClient<{ data: ContractDetailResponse }>(endpoints.contracts.one(id));
    return res.data;
  },

  async approve(id: number | string, note?: string): Promise<ContractDto> {
    const res = await apiClient<{ data: ContractDto }>(endpoints.contracts.approve(id), {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
    return res.data;
  },

  async activate(id: number | string, note?: string): Promise<ContractDto> {
    const res = await apiClient<{ data: ContractDto }>(endpoints.contracts.activate(id), {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
    return res.data;
  },

  async terminate(id: number | string, reason: string, note?: string): Promise<ContractDto> {
    const res = await apiClient<{ data: ContractDto }>(endpoints.contracts.terminate(id), {
      method: 'POST',
      body: JSON.stringify({ reason, note }),
    });
    return res.data;
  },

  async installments(id: number | string): Promise<unknown[]> {
    const res = await apiClient<{ data: unknown[] }>(endpoints.contracts.installments(id));
    return res.data;
  },

  async generateSchedule(
    id: number | string,
    input: { start_date?: string; months?: number; monthly_amount?: number; tax_rate?: number },
  ): Promise<{ installments: unknown[] }> {
    const res = await apiClient<{ data: { installments: unknown[] } }>(endpoints.contracts.generateSchedule(id), {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.data;
  },
};

