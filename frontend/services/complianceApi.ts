import { apiClient, endpoints } from '@/services/apiClient';

export interface InsurancePolicyDto {
  id: string;
  vehicle_id: string;
  insurer_name: string;
  policy_number: string;
  coverage_type?: string | null;
  start_date: string;
  end_date: string;
  premium_amount?: number | null;
  status: string;
  document_file_id?: string | null;
}

export interface TechnicalInspectionDto {
  id: string;
  vehicle_id: string;
  inspection_date: string;
  expiry_date: string;
  center_name?: string | null;
  result: 'passed' | 'conditional' | 'failed';
  defects?: string[] | null;
  document_file_id?: string | null;
  next_due_date?: string | null;
}

export interface ComplianceAlertDto {
  id: string;
  type: string;
  severity: 'low' | 'normal' | 'high' | 'critical';
  title: string;
  description: string | null;
  dueDate: string | null;
  triggeredAt: string | null;
  payload: Record<string, unknown>;
  vehicle: { id: string; registration: string | null } | null;
}

export const complianceApi = {
  insurancePolicies: (vehicleId: string) => apiClient<{ data: InsurancePolicyDto[] }>(endpoints.fleet.insurancePolicies(vehicleId)),
  createInsurancePolicy: (vehicleId: string, body: Record<string, unknown>) =>
    apiClient<{ data: InsurancePolicyDto }>(endpoints.fleet.insurancePolicies(vehicleId), { method: 'POST', body: JSON.stringify(body) }),
  updateInsurancePolicy: (id: string, body: Record<string, unknown>) =>
    apiClient<{ data: InsurancePolicyDto }>(endpoints.fleet.insurancePolicy(id), { method: 'PUT', body: JSON.stringify(body) }),

  technicalInspections: (vehicleId: string) => apiClient<{ data: TechnicalInspectionDto[] }>(endpoints.fleet.technicalInspections(vehicleId)),
  createTechnicalInspection: (vehicleId: string, body: Record<string, unknown>) =>
    apiClient<{ data: TechnicalInspectionDto }>(endpoints.fleet.technicalInspections(vehicleId), { method: 'POST', body: JSON.stringify(body) }),
  updateTechnicalInspection: (id: string, body: Record<string, unknown>) =>
    apiClient<{ data: TechnicalInspectionDto }>(endpoints.fleet.technicalInspection(id), { method: 'PUT', body: JSON.stringify(body) }),

  alerts: () => apiClient<{ data: { summary: { expired: number; expiringSoon: number; missingDocuments: number }; alerts: ComplianceAlertDto[] } }>(endpoints.fleet.complianceAlerts),
};
