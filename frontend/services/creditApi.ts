import { apiClient, endpoints, getApiBase } from '@/services/apiClient';

type ApiListResponse<T> = { data: T[]; meta?: unknown; links?: unknown };

export type CreditApplicationDto = {
  id: string;
  customerId: string;
  vehicleId?: string | null;
  applicationType: string;
  requestedAmount: number;
  downPaymentAmount?: number | null;
  requestedDurationMonths: number;
  monthlyIncome?: number | null;
  monthlyDebt?: number | null;
  debtRatio?: number | null;
  scoringStatus?: string | null;
  decisionStatus?: string | null;
  submittedAt?: string | null;
  decidedAt?: string | null;
  rejectionReason?: string | null;
  createdAt?: string | null;
};

export type CreditApplicationDetailResponse = {
  application: CreditApplicationDto;
  decisions: unknown[];
  scores?: CreditScoreDto[];
};

export type CreditScoreDto = {
  id: string;
  credit_application_id: string;
  customer_id: string;
  score: number;
  risk_band: 'A' | 'B' | 'C' | 'D';
  recommendation: string;
  factors_positive?: string[];
  factors_negative?: string[];
  breakdown?: Record<string, unknown>;
  scored_at: string;
};

function hasBackend(): boolean {
  return !!getApiBase();
}

export const creditApi = {
  async list(): Promise<CreditApplicationDto[]> {
    if (!hasBackend()) {
      throw new Error('Backend API is required for credit module.');
    }
    const res = await apiClient<ApiListResponse<CreditApplicationDto>>(endpoints.credit.applications);
    return res.data;
  },

  async get(id: string): Promise<CreditApplicationDetailResponse> {
    const res = await apiClient<{ data: CreditApplicationDetailResponse }>(endpoints.credit.one(id));
    return res.data;
  },

  async score(id: string): Promise<unknown> {
    const res = await apiClient<{ data: CreditScoreDto & { factors_positive?: string[]; factors_negative?: string[]; risk_band?: string; recommendation?: string } }>(endpoints.credit.score(id), { method: 'POST', body: JSON.stringify({}) });
    return res.data;
  },

  async scores(id: string): Promise<CreditScoreDto[]> {
    const res = await apiClient<{ data: CreditScoreDto[] }>(endpoints.credit.scores(id));
    return res.data;
  },

  async latestScore(id: string): Promise<CreditScoreDto | null> {
    const res = await apiClient<{ data: CreditScoreDto | null }>(endpoints.credit.latestScore(id));
    return res.data;
  },

  async decision(
    id: string,
    input: { decision: 'pending' | 'approved' | 'rejected'; note?: string; score?: number; recommendation?: string; rejection_reason?: string; create_contract?: boolean; director_override?: boolean },
  ): Promise<unknown> {
    const res = await apiClient<{ data: unknown }>(endpoints.credit.decision(id), {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.data;
  },
};

