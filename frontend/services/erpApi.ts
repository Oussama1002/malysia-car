import type { AppRole } from '@/domain/appRole';
import type {
  ArrearsCaseDto,
  AuditLogDto,
  AuthSession,
  BranchDto,
  ContractDto,
  CreditCaseDto,
  CustomerDto,
  ExecutiveDashboardDto,
  FleetVehicleDto,
  GeofenceDto,
  GpsAlertDto,
  MissionDto,
  NotificationDto,
  PaymentScheduleRowDto,
  SystemUserDto,
  UsedCarListingDto,
} from '@/services/dtos';
import { loadErpState, saveErpState } from '@/services/erpStore';
import { isMockFallbackAllowed } from '@/config/runtimeFlags';
import type { Client, DashboardStats, Reservation, User, Vehicle } from '@/types';
import { ReservationStatus, UserRole, VehicleStatus } from '@/types';

function mutate(fn: (s: ReturnType<typeof loadErpState>) => void): void {
  const s = loadErpState();
  fn(s);
  saveErpState(s);
}

function toLegacyUser(session: AuthSession): User {
  const r = session.user.role;
  const role =
    r === 'ADMIN'
      ? UserRole.ADMIN
      : r === 'AGENT_COMMERCIAL' || r === 'AGENT_LIVRAISON' || r === 'GESTIONNAIRE_FLOTTE'
        ? UserRole.AGENT
        : UserRole.CLIENT;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role,
    avatar: session.user.avatar,
  };
}

export const erpApi = {
  async loginWithPassword(_email: string, _password: string): Promise<AuthSession | null> {
    if (!isMockFallbackAllowed()) {
      throw new Error('Mock ERP API is disabled in production mode.');
    }
    return null;
  },

  async legacyLogin(email: string): Promise<User | null> {
    const session = await erpApi.loginWithPassword(email, 'password');
    if (!session) return null;
    return toLegacyUser(session);
  },

  async requestPasswordReset(_email: string): Promise<{ ok: boolean }> {
    return { ok: true };
  },

  async resetPassword(_token: string, _password: string): Promise<{ ok: boolean }> {
    return { ok: true };
  },

  getExecutiveDashboard(_filters: Record<string, string | undefined>): ExecutiveDashboardDto {
    return {
      kpis: {
        fleetValueMad: 0,
        monthlyRevenueMad: 0,
        overdueRatePct: 0,
        cashForecast30dMad: 0,
        profitabilityPerVehicleMad: 0,
        profitabilityPerClientMad: 0,
      },
      revenueSeries: [],
      overdueTrend: [],
      contractMix: [],
      fleetOccupancy: [],
      maintenanceCostTrend: [],
    };
  },

  getBranches(): BranchDto[] {
    return loadErpState().branches;
  },

  getStaffUsers(): SystemUserDto[] {
    return loadErpState().staffUsers;
  },

  getCustomers(): CustomerDto[] {
    return loadErpState().customers;
  },

  getVehicles(): FleetVehicleDto[] {
    return loadErpState().vehicles;
  },

  getVehicle(id: number): FleetVehicleDto | undefined {
    return loadErpState().vehicles.find((v) => v.id === id);
  },

  getContracts(): ContractDto[] {
    return loadErpState().contracts;
  },

  getCreditCases(): CreditCaseDto[] {
    return loadErpState().creditCases;
  },

  getPaymentSchedule(): PaymentScheduleRowDto[] {
    return loadErpState().paymentSchedule;
  },

  getArrears(): ArrearsCaseDto[] {
    return loadErpState().arrears;
  },

  getUsedCars(): UsedCarListingDto[] {
    return loadErpState().usedCars;
  },

  getGeofences(): GeofenceDto[] {
    return loadErpState().geofences;
  },

  getGpsAlerts(): GpsAlertDto[] {
    return loadErpState().gpsAlerts;
  },

  getNotifications(): NotificationDto[] {
    return loadErpState().notifications;
  },

  markNotificationRead(id: number): void {
    mutate((s) => {
      s.notifications = s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
    });
  },

  getMissions(): MissionDto[] {
    return loadErpState().missions;
  },

  getAuditLogs(): AuditLogDto[] {
    return loadErpState().auditLogs;
  },

  getReservations(): Promise<
    (Reservation & {
      clientName: string;
      clientPhone?: string;
      clientIdNumber?: string;
      vehicleName: string;
      vehicleReg: string;
      vehiclePrice: number;
    })[]
  > {
    const s = loadErpState();
    return Promise.resolve(
      s.reservations.map((res) => {
        const client = s.customers.find((c) => c.id === res.clientId);
        const vehicle = s.vehicles.find((v) => v.id === res.vehicleId);
        return {
          ...res,
          clientName: client?.name ?? '',
          clientPhone: client?.phone,
          clientIdNumber: client?.idNumber,
          vehicleName: vehicle ? `${vehicle.brand} ${vehicle.model}` : '',
          vehicleReg: vehicle?.registration ?? '',
          vehiclePrice: vehicle?.pricePerDay ?? 0,
        };
      }),
    );
  },

  async createReservation(data: Omit<Reservation, 'id' | 'createdAt'>): Promise<Reservation> {
    const res: Reservation = { ...data, id: Date.now(), createdAt: new Date().toISOString() };
    mutate((s) => {
      s.reservations.push(res);
      if (data.status === ReservationStatus.ONGOING) {
        const vi = s.vehicles.findIndex((v) => v.id === data.vehicleId);
        if (vi >= 0) s.vehicles[vi] = { ...s.vehicles[vi], status: 'RENTED' };
      }
    });
    return res;
  },

  async updateReservationStatus(id: number, status: ReservationStatus): Promise<void> {
    mutate((s) => {
      s.reservations = s.reservations.map((r) => (r.id === id ? { ...r, status } : r));
      const res = s.reservations.find((r) => r.id === id);
      if (!res) return;
      const vi = s.vehicles.findIndex((v) => v.id === res.vehicleId);
      if (vi < 0) return;
      if (status === ReservationStatus.COMPLETED || status === ReservationStatus.CANCELLED) {
        s.vehicles[vi] = { ...s.vehicles[vi], status: 'AVAILABLE' };
      } else if (status === ReservationStatus.ONGOING) {
        s.vehicles[vi] = { ...s.vehicles[vi], status: 'RENTED' };
      }
    });
  },

  async deleteReservation(id: number): Promise<void> {
    mutate((s) => {
      const res = s.reservations.find((r) => r.id === id);
      s.reservations = s.reservations.filter((r) => r.id !== id);
      if (res) {
        const vi = s.vehicles.findIndex((v) => v.id === res.vehicleId);
        if (vi >= 0) s.vehicles[vi] = { ...s.vehicles[vi], status: 'AVAILABLE' };
      }
    });
  },

  async getStats(): Promise<DashboardStats> {
    const s = loadErpState();
    const today = new Date().toISOString().split('T')[0];
    return {
      dailyReservations: s.reservations.filter((r) => r.createdAt.startsWith(today)).length,
      availableVehicles: s.vehicles.filter((v) => v.status === 'AVAILABLE').length,
      ongoingRentals: s.reservations.filter((r) => r.status === ReservationStatus.ONGOING).length,
      revenueDaily: 0,
      revenueMonthly: 0,
    };
  },

  async getClientsLegacy(): Promise<(Client & { rentalCount: number; totalSpent: number })[]> {
    const s = loadErpState();
    return s.customers
      .filter((c) => c.kind === 'PARTICULIER')
      .map((c) => {
        const history = s.reservations.filter((r) => r.clientId === c.id);
        return {
          id: c.id,
          name: c.name,
          email: c.email,
          phone: c.phone,
          idNumber: c.idNumber ?? '',
          licenseNumber: c.licenseNumber ?? '',
          licenseExpiry: c.licenseExpiry ?? '',
          createdAt: c.createdAt,
          rentalCount: history.length,
          totalSpent: history.reduce((sum, r) => sum + r.totalPrice, 0),
        };
      });
  },

  async addClientLegacy(client: Omit<Client, 'id' | 'createdAt'>): Promise<Client> {
    const newClient: Client = { ...client, id: Date.now(), createdAt: new Date().toISOString() };
    mutate((s) => {
      s.customers.push({
        id: newClient.id,
        kind: 'PARTICULIER',
        name: newClient.name,
        email: newClient.email,
        phone: newClient.phone,
        idNumber: newClient.idNumber,
        complianceStatus: 'INCOMPLETE',
        createdAt: newClient.createdAt,
        licenseNumber: newClient.licenseNumber,
        licenseExpiry: newClient.licenseExpiry,
      });
    });
    return newClient;
  },

  async updateClientLegacy(id: number, data: Partial<Client>): Promise<void> {
    mutate((s) => {
      s.customers = s.customers.map((c) =>
        c.id === id ? { ...c, ...data, name: data.name ?? c.name, email: data.email ?? c.email } : c,
      );
    });
  },

  async deleteClientLegacy(id: number): Promise<void> {
    mutate((s) => {
      s.customers = s.customers.filter((c) => c.id !== id);
    });
  },

  async getVehiclesLegacy(): Promise<Vehicle[]> {
    const s = loadErpState();
    return s.vehicles.map((fv) => ({
      id: fv.id,
      brand: fv.brand,
      model: fv.model,
      year: fv.year,
      registration: fv.registration,
      registrationCard: fv.registrationCard ?? '',
      insuranceExpiry: fv.insuranceExpiry ?? '',
      techControlExpiry: fv.techControlExpiry ?? '',
      vignetteExpiry: fv.vignetteExpiry ?? '',
      status:
        fv.status === 'RENTED'
          ? VehicleStatus.RENTED
          : fv.status === 'MAINTENANCE'
            ? VehicleStatus.MAINTENANCE
            : VehicleStatus.AVAILABLE,
      pricePerDay: fv.pricePerDay ?? 0,
      image: fv.image ?? '',
    }));
  },

  async addVehicleLegacy(vehicle: Omit<Vehicle, 'id'>): Promise<Vehicle> {
    const nv = { ...vehicle, id: Date.now() };
    mutate((s) => {
      s.vehicles.push({
        id: nv.id,
        registration: nv.registration,
        brand: nv.brand,
        model: nv.model,
        year: nv.year,
        status: 'AVAILABLE',
        registrationCard: nv.registrationCard,
        insuranceExpiry: nv.insuranceExpiry,
        techControlExpiry: nv.techControlExpiry,
        vignetteExpiry: nv.vignetteExpiry,
        pricePerDay: nv.pricePerDay,
        image: nv.image,
      });
    });
    return nv;
  },

  async updateVehicleLegacy(id: number, data: Partial<Vehicle>): Promise<void> {
    mutate((s) => {
      s.vehicles = s.vehicles.map((v) => {
        if (v.id !== id) return v;
        return { ...v, ...data, brand: data.brand ?? v.brand, model: data.model ?? v.model };
      });
    });
  },

  async deleteVehicleLegacy(id: number): Promise<void> {
    mutate((s) => {
      s.vehicles = s.vehicles.filter((v) => v.id !== id);
    });
  },
};
