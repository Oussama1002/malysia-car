import { apiClient } from '@/services/apiClient';

/**
 * Règles de Franchise d'assurance par marque / modèle.
 *
 * Résolution pour un véhicule : franchise propre du véhicule → règle modèle →
 * règle marque → valeur par défaut société (default_deposit_mad). La fonction
 * `resolveFranchise` applique cette priorité côté client (wizard de contrat).
 */
export interface FranchiseRule {
  id: string;
  brand_id: string | null;
  model_id: string | null;
  brand_name: string | null;
  model_name: string | null;
  amount_mad: number;
}

export interface FranchiseRulePayload {
  brand_id?: string | null;
  model_id?: string | null;
  amount_mad: number;
}

export async function listFranchiseRules(): Promise<{ data: FranchiseRule[] }> {
  return apiClient<{ data: FranchiseRule[] }>('/v1/franchise-rules');
}

export async function createFranchiseRule(payload: FranchiseRulePayload): Promise<{ data: FranchiseRule }> {
  return apiClient<{ data: FranchiseRule }>('/v1/franchise-rules', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateFranchiseRule(id: string, payload: FranchiseRulePayload): Promise<{ data: FranchiseRule }> {
  return apiClient<{ data: FranchiseRule }>(`/v1/franchise-rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteFranchiseRule(id: string): Promise<unknown> {
  return apiClient<unknown>(`/v1/franchise-rules/${id}`, { method: 'DELETE' });
}

/**
 * Montant de franchise pour un véhicule donné : règle modèle d'abord (la plus
 * spécifique), puis règle marque, sinon null (le wizard retombe alors sur la
 * valeur par défaut de la société). Les ids peuvent être absents.
 */
export function resolveFranchise(
  rules: FranchiseRule[],
  brandId: string | null | undefined,
  modelId: string | null | undefined,
): number | null {
  if (modelId) {
    const byModel = rules.find((r) => r.model_id && String(r.model_id) === String(modelId));
    if (byModel) return byModel.amount_mad;
  }
  if (brandId) {
    const byBrand = rules.find((r) => !r.model_id && r.brand_id && String(r.brand_id) === String(brandId));
    if (byBrand) return byBrand.amount_mad;
  }
  return null;
}
