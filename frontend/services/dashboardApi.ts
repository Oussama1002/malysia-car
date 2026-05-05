import { apiClient } from '@/services/apiClient';

// ============================================================================
// Types
// ============================================================================

export interface DashboardKpis {
  fleet_value_mad: number;
  monthly_revenue_mad: number;
  overdue_rate_pct: number;
  cash_forecast_30d_mad: number;
  profitability_per_vehicle_mad: number;
  profitability_per_client_mad: number;
  active_contracts: number;
  arrears_active_count: number;
  arrears_total_overdue_mad: number;
  pending_credit_count: number;
  dues_today_count: number;
  gps_alerts_today: number;
  fleet_vehicle_count: number;
  customer_count: number;
}

export interface ChartPoint {
  month: string;
  value: number;
}

export interface NameValue {
  name: string;
  value: number;
}

export interface LabelValue {
  label: string;
  value: number;
}

export interface ExecutiveDashboard {
  kpis: DashboardKpis;
  revenue_series: ChartPoint[];
  overdue_trend: ChartPoint[];
  contract_mix: NameValue[];
  fleet_occupancy: LabelValue[];
  maintenance_cost_trend: ChartPoint[];
  period: { from: string; to: string };
}

export interface FinanceDashboard {
  invoiced: { total: number; paid: number; outstanding: number; count: number };
  overdue: { amount: number; count: number };
  collected: { total: number; count: number };
  vat_collected: number;
  by_method: Array<{ method: string; total: number }>;
  top_overdue: Array<{ id: string; name: string; overdue_amount: number; invoice_count: number }>;
  period: { from: string; to: string };
}

export interface RiskDashboard {
  arrears: {
    total_active: number;
    total_overdue: number;
    total_recovered: number;
    recovery_rate: number;
    by_stage: Array<{ stage: string; cnt: number; overdue: number }>;
    upcoming_promises: number;
  };
  credit: {
    by_status: Array<{ status: string; cnt: number }>;
  };
  legal: {
    by_status: Array<{ status: string; cnt: number; amount: number }>;
    repo_orders: Array<{ status: string; cnt: number }>;
  };
  period: { from: string; to: string };
}

export interface FleetDashboard {
  status_counts: Array<{ status: string; cnt: number }>;
  maintenance_scheduled_30d: number;
  maintenance_cost_period: number;
  km_overrun_count: number;
  contracts_expiring_30d: number;
  fixed_assets: { total_cost: number; total_dep: number; total_vnc: number };
  period: { from: string; to: string };
}

export interface GpsDashboardSummary {
  alerts_by_type: Array<{ alert_type: string; cnt: number }>;
  unresolved: { total: number; speeding: number; geofence: number };
  devices_online: number;
  devices_total: number;
  top_speeding: Array<{ id: string; registration_number: string; make: string; model: string; alert_count: number }>;
  period: { from: string; to: string };
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

export type DashboardRange = '7d' | '30d' | '90d' | 'ytd';

export interface DashboardParams {
  range?: DashboardRange;
  from?: string;
  to?: string;
  branch_id?: string;
}

// ============================================================================
// API Functions
// ============================================================================

export function getExecutiveDashboard(params: DashboardParams = {}): Promise<{ data: ExecutiveDashboard }> {
  return apiClient<{ data: ExecutiveDashboard }>(`/v1/dashboard/executive${q(params as Record<string, unknown>)}`);
}

export function getFinanceDashboard(params: DashboardParams = {}): Promise<{ data: FinanceDashboard }> {
  return apiClient<{ data: FinanceDashboard }>(`/v1/dashboard/finance${q(params as Record<string, unknown>)}`);
}

export function getRiskDashboard(params: DashboardParams = {}): Promise<{ data: RiskDashboard }> {
  return apiClient<{ data: RiskDashboard }>(`/v1/dashboard/risk${q(params as Record<string, unknown>)}`);
}

export function getFleetDashboard(params: DashboardParams = {}): Promise<{ data: FleetDashboard }> {
  return apiClient<{ data: FleetDashboard }>(`/v1/dashboard/fleet${q(params as Record<string, unknown>)}`);
}

export function getGpsDashboardSummary(params: DashboardParams = {}): Promise<{ data: GpsDashboardSummary }> {
  return apiClient<{ data: GpsDashboardSummary }>(`/v1/dashboard/gps${q(params as Record<string, unknown>)}`);
}
