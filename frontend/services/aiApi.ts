import { apiClient } from '@/services/apiClient';
import { endpoints } from '@/services/endpoints';

export type AiEntityLink = {
  type: string;
  id: string;
  path: string;
};

export type AiPredictionItem = {
  entity_id?: string | null;
  score: number;
  risk_level: string;
  summary: string;
  label: string;
  requires_human_validation: boolean;
  entity_links: AiEntityLink[];
  [key: string]: unknown;
};

export type AiPredictionResponse = {
  generated_at: string;
  model_mode: string;
  items: AiPredictionItem[];
  [key: string]: unknown;
};

export const aiApi = {
  overview: async () => {
    const res = await apiClient<{ data: any }>(endpoints.ai.overview);
    return res.data;
  },
  assistantMessages: async (message: string, conversationId?: string) => {
    const res = await apiClient<{ data: any }>(endpoints.ai.assistantMessages, {
      method: 'POST',
      body: JSON.stringify({
        message,
        conversation_id: conversationId ?? null,
      }),
    });
    return res.data;
  },
  assistantConversations: async () => {
    const res = await apiClient<{ data: any[] }>(endpoints.ai.assistantConversations);
    return res.data;
  },
  maintenance: async (): Promise<AiPredictionResponse> => {
    const res = await apiClient<{ data: AiPredictionResponse }>(endpoints.ai.maintenance);
    return res.data;
  },
  creditRisk: async (): Promise<AiPredictionResponse> => {
    const res = await apiClient<{ data: AiPredictionResponse }>(endpoints.ai.creditRisk);
    return res.data;
  },
  cashFlow: async (): Promise<AiPredictionResponse> => {
    const res = await apiClient<{ data: AiPredictionResponse }>(endpoints.ai.cashFlow);
    return res.data;
  },
  vehiclePricing: async (): Promise<AiPredictionResponse> => {
    const res = await apiClient<{ data: AiPredictionResponse }>(endpoints.ai.vehiclePricing);
    return res.data;
  },
  anomalies: async (): Promise<AiPredictionResponse> => {
    const res = await apiClient<{ data: AiPredictionResponse }>(endpoints.ai.anomalies);
    return res.data;
  },
};
