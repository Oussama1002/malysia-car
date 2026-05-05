import type { AppRole } from '@/domain/appRole';

export type { AppRole };

/** Session stored client-side (replace with JWT + refresh with real API). */
export interface AuthSession {
  user: {
    /** Laravel uses UUID strings; mock layer may still use numeric ids. */
    id: string | number;
    name: string;
    email: string;
    role: AppRole;
    avatar?: string;
    branchIds?: number[];
  };
  token: string;
  expiresAt: number; // epoch ms
}

export interface ExecutiveDashboardDto {
  kpis: {
    fleetValueMad: number;
    monthlyRevenueMad: number;
    overdueRatePct: number;
    cashForecast30dMad: number;
    profitabilityPerVehicleMad: number;
    profitabilityPerClientMad: number;
  };
  revenueSeries: { month: string; value: number }[];
  overdueTrend: { month: string; value: number }[];
  contractMix: { name: string; value: number }[];
  fleetOccupancy: { label: string; value: number }[];
  maintenanceCostTrend: { month: string; value: number }[];
}

export type FleetVehicleStatus =
  | 'AVAILABLE'
  | 'RESERVED'
  | 'RENTED'
  | 'UNDER_LOA'
  | 'UNDER_CREDIT'
  | 'IN_DELIVERY'
  | 'MAINTENANCE'
  | 'BLOCKED'
  | 'SOLD';

export interface FleetVehicleDto {
  id: number;
  registration: string;
  vin?: string;
  brand: string;
  model: string;
  version?: string;
  year: number;
  color?: string;
  fuel?: string;
  transmission?: string;
  mileageKm?: number;
  status: FleetVehicleStatus;
  acquisitionType?: string;
  purchaseCostMad?: number;
  currentValueMad?: number;
  branchId?: number;
  assignedClientId?: number | null;
  linkedContractId?: number | null;
  insuranceExpiry?: string;
  techControlExpiry?: string;
  vignetteExpiry?: string;
  registrationCard?: string;
  pricePerDay?: number;
  image?: string;
}

export type CustomerKind = 'PARTICULIER' | 'ENTREPRISE';

export type ComplianceStatus =
  | 'INCOMPLETE'
  | 'UNDER_REVIEW'
  | 'VERIFIED'
  | 'REJECTED'
  | 'BLACKLISTED'
  | 'ARCHIVED';

export interface CustomerDto {
  id: number;
  kind: CustomerKind;
  name: string;
  email: string;
  phone: string;
  address?: string;
  idNumber?: string;
  ice?: string;
  rc?: string;
  complianceStatus: ComplianceStatus;
  createdAt: string;
  licenseNumber?: string;
  licenseExpiry?: string;
}

export type ContractType = 'LLD' | 'LOA' | 'CREDIT_AUTO' | 'VENTE_VO' | 'LOCATION_COURTE';

export interface ContractDto {
  id: number;
  reference: string;
  type: ContractType;
  clientId: number;
  vehicleId?: number;
  status: string;
  startDate: string;
  endDate?: string;
  amountMad: number;
  createdAt: string;
}

export type CreditCaseStatus =
  | 'DRAFT'
  | 'DOCUMENTS_PENDING'
  | 'UNDER_ANALYSIS'
  | 'APPROVED'
  | 'CONDITIONALLY_APPROVED'
  | 'REJECTED'
  | 'BLACKLISTED';

export interface CreditCaseDto {
  id: number;
  clientId: number;
  status: CreditCaseStatus;
  score?: number;
  assignedTo?: string;
  updatedAt: string;
}

export interface PaymentScheduleRowDto {
  id: number;
  contractId: number;
  dueDate: string;
  principal: number;
  interest: number;
  tax: number;
  penalty: number;
  paid: boolean;
  partialPaidMad?: number;
}

export type ArrearsStatus =
  | 'REMINDER_1'
  | 'REMINDER_2'
  | 'FORMAL_NOTICE'
  | 'LITIGATION_REVIEW'
  | 'LEGAL_PROCEDURE'
  | 'SETTLED'
  | 'CLOSED';

export interface ArrearsCaseDto {
  id: number;
  contractId: number;
  clientName: string;
  daysLate: number;
  amountDueMad: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  status: ArrearsStatus;
  lastAction?: string;
  nextAction?: string;
  owner?: string;
}

export type UsedCarStage =
  | 'READY_EVAL'
  | 'EVALUATED'
  | 'PRICED'
  | 'PUBLISHED'
  | 'RESERVED'
  | 'PAYMENT_PENDING'
  | 'SOLD'
  | 'OWNERSHIP_TRANSFERRED';

export interface UsedCarListingDto {
  id: number;
  vehicleId: number;
  condition?: string;
  inspectionScore?: number;
  askingPriceMad: number;
  negotiable: boolean;
  publication: 'DRAFT' | 'LIVE' | 'OFF';
  reservation?: 'NONE' | 'HELD';
  stage: UsedCarStage;
}

export interface GeofenceDto {
  id: number;
  name: string;
  vehicleIds: number[];
  contractIds: number[];
}

export interface GpsAlertDto {
  id: number;
  type: string;
  vehicleId: number;
  message: string;
  at: string;
  severity: 'INFO' | 'WARN' | 'CRITICAL';
}

export interface NotificationDto {
  id: number;
  category: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface MissionDto {
  id: number;
  title: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'DONE';
  scheduledAt: string;
  clientName: string;
  address?: string;
}

export interface AuditLogDto {
  id: number;
  module: string;
  entityId: string;
  actor: string;
  action: string;
  before?: string;
  after?: string;
  at: string;
}

export interface SystemUserDto {
  id: number;
  name: string;
  email: string;
  role: AppRole;
  branchIds: number[];
  active: boolean;
}

export interface BranchDto {
  id: number;
  name: string;
  country: string;
}
