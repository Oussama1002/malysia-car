import { apiClient, endpoints, getApiBase } from '@/services/apiClient';

type ApiListResponse<T> = { data: T[]; meta?: unknown; links?: unknown };

function hasBackend(): boolean {
  return !!getApiBase();
}

export type ReservationDto = {
  id: string;
  reservation_number: string;
  customer_id: string;
  vehicle_id: string;
  reservation_type: string;
  status: string;
  desired_start_at: string;
  desired_end_at: string;
  pickup_address?: string | null;
  delivery_address?: string | null;
  estimated_price?: number | null;
  created_at: string;
};

export type RentalAvailabilityDto = {
  available: boolean;
  reasons: string[];
  primary_code?: string | null;
  messages?: Record<string, string>;
};

export type MissionDto = {
  id: string;
  title?: string; // frontend convenience
  status: string;
  mission_type: string;
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
  actual_start_at?: string | null;
  actual_end_at?: string | null;
  reservation_id?: string | null;
  vehicle_id?: string | null;
  assigned_user_id?: string | null;
  origin_address?: string | null;
  destination_address?: string | null;
  notes?: string | null;
};

export const opsApi = {
  async missions(): Promise<any[]> {
    if (!hasBackend()) throw new Error('Backend API is required for missions.');
    const res = await apiClient<ApiListResponse<MissionDto>>(endpoints.missions.list);
    return res.data.map((m) => ({
      id: m.id,
      title: m.title ?? `${m.mission_type} #${m.id.slice(0, 6)}`,
      status: m.status === 'planned' ? 'PENDING' : m.status === 'in_progress' ? 'IN_PROGRESS' : m.status === 'completed' ? 'DONE' : 'PENDING',
      scheduledAt: m.scheduled_start_at ?? new Date().toISOString(),
      clientName: m.reservation_id ? `Reservation ${m.reservation_id.slice(0, 6)}` : 'Client',
      address: m.destination_address ?? m.origin_address ?? '',
    }));
  },

  async reservations(): Promise<ReservationDto[] | any[]> {
    if (!hasBackend()) throw new Error('Backend API is required for reservations.');
    const res = await apiClient<ApiListResponse<ReservationDto>>(endpoints.reservations.list);
    return res.data;
  },

  async reservation(id: string): Promise<any> {
    const res = await apiClient<{ data: any }>(endpoints.reservations.one(id));
    return res.data;
  },

  async createReservation(input: {
    customer_id: string;
    vehicle_id: string;
    reservation_type: string;
    desired_start_at: string;
    desired_end_at: string;
    pickup_address?: string;
    delivery_address?: string;
    estimated_price?: number;
  }): Promise<ReservationDto> {
    const res = await apiClient<{ data: ReservationDto }>(endpoints.reservations.create, { method: 'POST', body: JSON.stringify(input) });
    return res.data;
  },

  async createMission(reservationId: string, input: { mission_type: string; assigned_user_id?: string | null; scheduled_start_at?: string; scheduled_end_at?: string; origin_address?: string; destination_address?: string; notes?: string }): Promise<MissionDto> {
    const res = await apiClient<{ data: MissionDto }>(endpoints.reservations.createMission(reservationId), { method: 'POST', body: JSON.stringify(input) });
    return res.data;
  },

  async rentalAvailability(
    vehicleId: string,
    startAt: string,
    endAt: string,
    ignoreReservationId?: string,
    ignoreContractId?: string
  ): Promise<RentalAvailabilityDto> {
    const params = new URLSearchParams({
      vehicle_id: vehicleId,
      start_at: startAt,
      end_at: endAt,
      ...(ignoreReservationId ? { ignore_reservation_id: ignoreReservationId } : {}),
      ...(ignoreContractId ? { ignore_contract_id: ignoreContractId } : {}),
    });
    const res = await apiClient<{ data: RentalAvailabilityDto }>(`${endpoints.rentals.availability}?${params.toString()}`);
    return res.data;
  },

  async confirmReservation(id: string): Promise<ReservationDto> {
    const res = await apiClient<{ data: ReservationDto }>(endpoints.reservations.confirm(id), { method: 'POST', body: JSON.stringify({}) });
    return res.data;
  },

  async cancelReservation(id: string): Promise<ReservationDto> {
    const res = await apiClient<{ data: ReservationDto }>(endpoints.reservations.cancel(id), { method: 'POST', body: JSON.stringify({}) });
    return res.data;
  },

  async handoverPickup(id: string, payload: Record<string, unknown>): Promise<any> {
    const res = await apiClient<{ data: any }>(endpoints.reservations.handoverPickup(id), { method: 'POST', body: JSON.stringify(payload) });
    return res.data;
  },

  async requestExtension(id: string, payload: Record<string, unknown>): Promise<any> {
    const res = await apiClient<{ data: any }>(endpoints.reservations.requestExtension(id), { method: 'POST', body: JSON.stringify(payload) });
    return res.data;
  },

  async handoverReturn(id: string, payload: Record<string, unknown>): Promise<any> {
    const res = await apiClient<{ data: any }>(endpoints.reservations.handoverReturn(id), { method: 'POST', body: JSON.stringify(payload) });
    return res.data;
  },

  async damageReport(id: string, payload: Record<string, unknown>): Promise<any> {
    const res = await apiClient<{ data: any }>(endpoints.reservations.damageReport(id), { method: 'POST', body: JSON.stringify(payload) });
    return res.data;
  },

  async closeBilling(id: string, payload?: Record<string, unknown>): Promise<any> {
    const res = await apiClient<{ data: any }>(endpoints.reservations.closeBilling(id), { method: 'POST', body: JSON.stringify(payload ?? {}) });
    return res.data;
  },

  async startMission(missionId: string): Promise<MissionDto> {
    const res = await apiClient<{ data: MissionDto }>(endpoints.missions.start(missionId), { method: 'POST', body: JSON.stringify({}) });
    return res.data;
  },

  async completeMission(missionId: string, status: 'completed' | 'failed', notes?: string): Promise<MissionDto> {
    const res = await apiClient<{ data: MissionDto }>(endpoints.missions.complete(missionId), { method: 'POST', body: JSON.stringify({ status, notes }) });
    return res.data;
  },

  async getMission(missionId: string): Promise<any> {
    const res = await apiClient<{ data: any }>(endpoints.missions.one(missionId));
    return res.data;
  },

  async addChecklistItem(missionId: string, input: { checklist_phase: string; item_label: string; item_value?: string; item_status?: string; notes?: string }): Promise<any> {
    const res = await apiClient<{ data: any }>(endpoints.missions.checklistItems(missionId), { method: 'POST', body: JSON.stringify(input) });
    return res.data;
  },

  async uploadPhoto(missionId: string, file: File, input?: { phase?: string; label?: string }): Promise<any> {
    const base = getApiBase();
    if (!base) throw new Error('Backend API is required for mission photo upload.');
    const raw = localStorage.getItem('df_session');
    const token = raw ? (JSON.parse(raw) as { token?: string }).token : undefined;

    const form = new FormData();
    form.append('file', file);
    if (input?.phase) form.append('phase', input.phase);
    if (input?.label) form.append('label', input.label);

    const res = await fetch(`${base}${endpoints.missions.photos(missionId)}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
    const text = await res.text();
    const json = text ? (JSON.parse(text) as any) : null;
    if (!res.ok) throw new Error(json?.message ?? res.statusText);
    return json.data;
  },
};

