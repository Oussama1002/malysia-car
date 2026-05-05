/**
 * Boundary for future AI services — no fake scoring in domain code.
 * Implement with HTTP client + provider keys when ready.
 */
export interface AiInsightRequest {
  question: string;
  locale: 'fr' | 'en' | 'ar';
}

export interface AiInsightResponse {
  summary: string;
  sources: { label: string; href?: string }[];
}

export interface AiInsightAdapter {
  ask(req: AiInsightRequest): Promise<AiInsightResponse>;
}
