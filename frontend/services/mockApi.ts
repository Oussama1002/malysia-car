/**
 * Backward-compatible facade over {@link erpApi}.
 * Demo-only facade. Production mode must never rely on this layer.
 */
import { erpApi } from '@/services/erpApi';
import { isMockFallbackAllowed } from '@/config/runtimeFlags';
import type { Client, DashboardStats, Reservation, User, Vehicle } from '@/types';
import { ReservationStatus, VehicleStatus } from '@/types';

export const api = {
  login: (email: string) => {
    if (!isMockFallbackAllowed()) throw new Error('Mock API is disabled in production mode.');
    return erpApi.legacyLogin(email);
  },

  getClients: () => {
    if (!isMockFallbackAllowed()) throw new Error('Mock API is disabled in production mode.');
    return erpApi.getClientsLegacy();
  },
  addClient: (client: Omit<Client, 'id' | 'createdAt'>) => {
    if (!isMockFallbackAllowed()) throw new Error('Mock API is disabled in production mode.');
    return erpApi.addClientLegacy(client);
  },
  updateClient: (id: number, data: Partial<Client>) => {
    if (!isMockFallbackAllowed()) throw new Error('Mock API is disabled in production mode.');
    return erpApi.updateClientLegacy(id, data);
  },
  deleteClient: (id: number) => {
    if (!isMockFallbackAllowed()) throw new Error('Mock API is disabled in production mode.');
    return erpApi.deleteClientLegacy(id);
  },

  getVehicles: () => {
    if (!isMockFallbackAllowed()) throw new Error('Mock API is disabled in production mode.');
    return erpApi.getVehiclesLegacy();
  },
  addVehicle: (vehicle: Omit<Vehicle, 'id'>) => {
    if (!isMockFallbackAllowed()) throw new Error('Mock API is disabled in production mode.');
    return erpApi.addVehicleLegacy(vehicle);
  },
  updateVehicle: (id: number, data: Partial<Vehicle>) => {
    if (!isMockFallbackAllowed()) throw new Error('Mock API is disabled in production mode.');
    return erpApi.updateVehicleLegacy(id, data);
  },
  deleteVehicle: (id: number) => {
    if (!isMockFallbackAllowed()) throw new Error('Mock API is disabled in production mode.');
    return erpApi.deleteVehicleLegacy(id);
  },
  updateVehicleStatus: async (id: number, status: VehicleStatus) => {
    if (!isMockFallbackAllowed()) throw new Error('Mock API is disabled in production mode.');
    await erpApi.updateVehicleLegacy(id, { status });
  },

  getReservations: () => {
    if (!isMockFallbackAllowed()) throw new Error('Mock API is disabled in production mode.');
    return erpApi.getReservations();
  },
  createReservation: (data: Omit<Reservation, 'id' | 'createdAt'>) => {
    if (!isMockFallbackAllowed()) throw new Error('Mock API is disabled in production mode.');
    return erpApi.createReservation(data);
  },
  updateReservationStatus: (id: number, status: ReservationStatus) => {
    if (!isMockFallbackAllowed()) throw new Error('Mock API is disabled in production mode.');
    return erpApi.updateReservationStatus(id, status);
  },
  deleteReservation: (id: number) => {
    if (!isMockFallbackAllowed()) throw new Error('Mock API is disabled in production mode.');
    return erpApi.deleteReservation(id);
  },

  getStats: () => {
    if (!isMockFallbackAllowed()) throw new Error('Mock API is disabled in production mode.');
    return erpApi.getStats();
  },
};
