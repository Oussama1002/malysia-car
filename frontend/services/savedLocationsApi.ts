import { apiClient, endpoints } from '@/services/apiClient';

/**
 * Shared library of Google Maps locations. An agent pastes a Maps URL, gives
 * it a title (+ optional address) on the mission form; it is stored company-
 * wide and reused on every later form. See SavedLocationController on the API.
 */
export type SavedLocationDto = {
  id: string;
  title: string;
  address?: string | null;
  maps_url: string;
  latitude?: number | null;
  longitude?: number | null;
  created_by?: string | null;
  created_at?: string;
};

export type SavedLocationInput = {
  title: string;
  maps_url: string;
  address?: string;
};

export const savedLocationsApi = {
  async list(): Promise<SavedLocationDto[]> {
    const res = await apiClient<{ data: SavedLocationDto[] }>(endpoints.savedLocations.list);
    return res.data ?? [];
  },

  async create(input: SavedLocationInput): Promise<SavedLocationDto> {
    const res = await apiClient<{ data: SavedLocationDto }>(endpoints.savedLocations.create, {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.data;
  },

  async remove(id: string): Promise<void> {
    await apiClient<unknown>(endpoints.savedLocations.one(id), { method: 'DELETE' });
  },
};

/* ── Google Maps helpers ───────────────────────────────────────────────── */

/**
 * Pull lat/lng out of a pasted Google Maps URL (mirrors the backend parser).
 * Short links (maps.app.goo.gl) carry no coordinates — returns null then.
 */
export function coordsFromMapsUrl(url: string): { lat: number; lng: number } | null {
  const patterns = [
    /@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
    /!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/,
    /[?&](?:q|query|ll)=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) {
      const lat = Number(m[1]);
      const lng = Number(m[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
    }
  }
  return null;
}

/**
 * Build an embeddable Google Maps preview URL (no API key required). Prefers
 * stored/extracted coordinates, then a free-text address/title query.
 */
export function mapsEmbedUrl(loc: { latitude?: number | null; longitude?: number | null; maps_url?: string; address?: string | null; title?: string }): string | null {
  let lat = loc.latitude ?? null;
  let lng = loc.longitude ?? null;
  if ((lat == null || lng == null) && loc.maps_url) {
    const c = coordsFromMapsUrl(loc.maps_url);
    if (c) { lat = c.lat; lng = c.lng; }
  }
  if (lat != null && lng != null) {
    return `https://maps.google.com/maps?q=${lat},${lng}&z=15&hl=fr&output=embed`;
  }
  const query = (loc.address || loc.title || '').trim();
  if (query) {
    return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=14&hl=fr&output=embed`;
  }
  return null;
}
