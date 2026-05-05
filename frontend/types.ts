/**
 * @deprecated Legacy 3-value role enum kept for retro-compatibility with old
 * `screens/*` and `services/erpApi.ts` mock layer only. New code MUST use
 * `AppRole` from `@/domain/appRole` (10 specialized backend roles).
 *
 * Mapping convention if you must consume this:
 * - ADMIN/DIRECTEUR backend roles → UserRole.ADMIN
 * - CLIENT_PORTAL backend role    → UserRole.CLIENT
 * - All other specialized roles   → UserRole.AGENT (informational only — do
 *   NOT base RBAC decisions on this collapse; gate on `AppRole` instead).
 */
export enum UserRole {
  ADMIN = 'ADMIN',
  AGENT = 'AGENT',
  CLIENT = 'CLIENT'
}

export enum VehicleStatus {
  AVAILABLE = 'AVAILABLE',
  RENTED = 'RENTED',
  MAINTENANCE = 'MAINTENANCE'
}

export enum ReservationStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  ONGOING = 'ONGOING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export interface User {
  id: string | number;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
}

export interface Client {
  id: number;
  name: string;
  phone: string;
  email: string;
  idNumber: string; // CIN au Maroc
  licenseNumber: string;
  licenseExpiry: string; // Date expiration permis
  createdAt: string;
}

export interface Vehicle {
  id: number | string;
  /** UUID from API when using catalog selects */
  brand_id?: string | null;
  model_id?: string | null;
  brand: string;
  model: string;
  year: number;
  registration: string; // Immatriculation (ex: 12345-A-1)
  registrationCard: string; // N° de Carte Grise
  insuranceExpiry: string; // Date expiration assurance
  techControlExpiry: string; // Date expiration visite technique
  vignetteExpiry: string; // Date expiration vignette
  status: VehicleStatus;
  pricePerDay: number;
  image: string;
}

export interface Reservation {
  id: number;
  clientId: number;
  vehicleId: number;
  startDate: string;
  endDate: string;
  totalPrice: number;
  status: ReservationStatus;
  createdAt: string;
}

export interface DashboardStats {
  dailyReservations: number;
  availableVehicles: number;
  ongoingRentals: number;
  revenueDaily: number;
  revenueMonthly: number;
}
