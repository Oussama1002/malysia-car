import type {
  ArrearsCaseDto,
  AuditLogDto,
  BranchDto,
  ContractDto,
  CreditCaseDto,
  CustomerDto,
  FleetVehicleDto,
  GeofenceDto,
  GpsAlertDto,
  MissionDto,
  NotificationDto,
  PaymentScheduleRowDto,
  SystemUserDto,
  UsedCarListingDto,
} from '@/services/dtos';
import type { Reservation } from '@/types';
import { isMockFallbackAllowed } from '@/config/runtimeFlags';

const STORAGE_KEY = 'df_erp_v2';

export interface ErpState {
  version: number;
  branches: BranchDto[];
  staffUsers: SystemUserDto[];
  customers: CustomerDto[];
  vehicles: FleetVehicleDto[];
  reservations: Reservation[];
  contracts: ContractDto[];
  creditCases: CreditCaseDto[];
  paymentSchedule: PaymentScheduleRowDto[];
  arrears: ArrearsCaseDto[];
  usedCars: UsedCarListingDto[];
  geofences: GeofenceDto[];
  gpsAlerts: GpsAlertDto[];
  notifications: NotificationDto[];
  missions: MissionDto[];
  auditLogs: AuditLogDto[];
}

function emptyState(): ErpState {
  return {
    version: 3,
    branches: [],
    staffUsers: [],
    customers: [],
    vehicles: [],
    reservations: [],
    contracts: [],
    creditCases: [],
    paymentSchedule: [],
    arrears: [],
    usedCars: [],
    geofences: [],
    gpsAlerts: [],
    notifications: [],
    missions: [],
    auditLogs: [],
  };
}

export function loadErpState(): ErpState {
  if (!isMockFallbackAllowed()) {
    throw new Error('Mock ERP store is disabled in production mode.');
  }
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return emptyState();
  try {
    const state = JSON.parse(raw) as ErpState;
    // Version 3+ means clean state — wipe any seeded v2 data
    if (!state.version || state.version < 3) {
      const clean = emptyState();
      clean.version = 3;
      saveErpState(clean);
      return clean;
    }
    return state;
  } catch {
    return emptyState();
  }
}

export function saveErpState(state: ErpState): void {
  if (!isMockFallbackAllowed()) {
    throw new Error('Mock ERP store is disabled in production mode.');
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function syncLegacyKeys(_state: ErpState): void {
  // no-op — legacy localStorage keys removed
}
