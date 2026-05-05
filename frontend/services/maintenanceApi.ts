import { apiClient, endpoints } from '@/services/apiClient';

export interface MaintenanceAlertDto {
  id: string;
  type: string;
  severity: 'low' | 'normal' | 'high' | 'critical';
  title: string;
  description: string | null;
  triggeredAt: string | null;
  vehicle: { id: string; registration: string | null } | null;
  payload: Record<string, unknown>;
}

export interface MaintenanceAlertsResponse {
  criticalAlertsCount: number;
  upcomingMaintenanceCount: number;
  immobilizedVehiclesCount: number;
  monthlyMaintenanceCost: number;
  alerts: MaintenanceAlertDto[];
}

export const maintenanceApi = {
  alerts: () => apiClient<{ data: MaintenanceAlertsResponse }>(endpoints.fleet.maintenanceAlerts),
  calendar: () => apiClient<{ data: { items: Array<Record<string, unknown>> } }>(endpoints.fleet.maintenanceCalendar),
};
