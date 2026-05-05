import { apiClient, endpoints, getApiBase } from '@/services/apiClient';
import type { FleetVehicleDto, GpsAlertDto, GeofenceDto } from '@/services/dtos';

type ApiListResponse<T> = { data: T[]; meta?: unknown; links?: unknown };

function hasBackend(): boolean {
  return !!getApiBase();
}

export type LiveVehicleRow = {
  vehicle_id: string;
  registration?: string | null;
  status?: string | null;
  recorded_at: string;
  latitude: number;
  longitude: number;
  speed_kmh?: number | null;
  odometer_km?: number | null;
};

export const gpsApi = {
  async alerts(): Promise<GpsAlertDto[]> {
    if (!hasBackend()) throw new Error('Backend API is required for GPS alerts.');
    const res = await apiClient<{ data: any[] }>(endpoints.gps.alerts);
    // map backend shape to GpsAlertDto-ish
    return res.data.map((a) => ({
      id: a.id,
      type: a.alert_type ?? a.type,
      vehicleId: Number.NaN,
      message: a.description ?? a.title ?? '',
      at: a.triggered_at ?? a.created_at,
      severity: a.severity ?? 'INFO',
    }));
  },

  async liveVehicles(): Promise<LiveVehicleRow[]> {
    const res = await apiClient<{ data: LiveVehicleRow[] }>(endpoints.gps.vehiclesLive);
    return res.data;
  },

  async vehiclePositions(vehicleId: number | string): Promise<any[]> {
    const res = await apiClient<{ data: any[] }>(endpoints.vehicleGps.positions(vehicleId));
    return res.data;
  },

  async vehicleTrips(vehicleId: number | string): Promise<any[]> {
    const res = await apiClient<{ data: any[] }>(endpoints.vehicleGps.trips(vehicleId));
    return res.data;
  },

  async geofences(): Promise<GeofenceDto[]> {
    if (!hasBackend()) throw new Error('Backend API is required for geofences.');
    const res = await apiClient<{ data: any[] }>(endpoints.geofences.list);
    return res.data.map((g) => ({ id: g.id, name: g.name, vehicleIds: [], contractIds: [] }));
  },

  async createGeofence(input: { name: string; geofence_type: 'CIRCLE' | 'POLYGON'; center_latitude?: number; center_longitude?: number; radius_meters?: number; polygon_geojson?: any }): Promise<any> {
    const res = await apiClient<{ data: any }>(endpoints.geofences.create, { method: 'POST', body: JSON.stringify(input) });
    return res.data;
  },

  async assignGeofences(vehicleId: number | string, geofenceIds: string[]): Promise<any> {
    const res = await apiClient<{ data: any }>(endpoints.vehicleGps.geofencesAssign(vehicleId), {
      method: 'POST',
      body: JSON.stringify({ geofence_ids: geofenceIds }),
    });
    return res.data;
  },

  async fleetVehicles(): Promise<FleetVehicleDto[]> {
    if (!hasBackend()) throw new Error('Backend API is required for fleet vehicles.');
    const res = await apiClient<ApiListResponse<any>>(endpoints.fleet.list);
    return res.data;
  },
};

