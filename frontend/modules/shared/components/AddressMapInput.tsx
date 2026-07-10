import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';

/* Leaflet default icon fix (module-scoped, safe to run more than once) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

/* ── Nominatim (OpenStreetMap) geocoding ───────────────────────────── */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

export interface GeoSuggestion {
  display_name: string;
  lat: string;
  lon: string;
}

async function searchAddress(query: string, signal?: AbortSignal): Promise<GeoSuggestion[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '0',
    limit: '6',
    countrycodes: 'ma',
    'accept-language': 'fr',
  });
  const res = await fetch(`${NOMINATIM_BASE}/search?${params}`, { signal, headers: { Accept: 'application/json' } });
  if (!res.ok) return [];
  return (await res.json()) as GeoSuggestion[];
}

async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    format: 'jsonv2',
    'accept-language': 'fr',
  });
  const res = await fetch(`${NOMINATIM_BASE}/reverse?${params}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  const json = (await res.json()) as { display_name?: string };
  return json.display_name ?? null;
}

/* ── Map helpers ───────────────────────────────────────────────────── */

const DEFAULT_CENTER: [number, number] = [33.5731, -7.5898]; // Casablanca

const ClickHandler: React.FC<{ onPick: (lat: number, lon: number) => void }> = ({ onPick }) => {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
};

const RecenterOnChange: React.FC<{ center: [number, number] }> = ({ center }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, Math.max(map.getZoom(), 14));
  }, [center, map]);
  return null;
};

/* ── Component ─────────────────────────────────────────────────────── */

export interface AddressMapInputProps {
  value: string;
  onChange: (address: string, coords?: { lat: number; lon: number }) => void;
  placeholder?: string;
  inputClassName?: string;
  disabled?: boolean;
}

/**
 * Address input backed by OpenStreetMap:
 * - typing shows Nominatim autocomplete suggestions (Morocco, French labels);
 * - the map toggle opens a Leaflet mini-map — clicking or dragging the
 *   marker reverse-geocodes the point and fills the field.
 */
export const AddressMapInput: React.FC<AddressMapInputProps> = ({
  value,
  onChange,
  placeholder,
  inputClassName,
  disabled,
}) => {
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [marker, setMarker] = useState<[number, number] | null>(null);
  const [reversing, setReversing] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Suppress the autocomplete fetch when the value change comes from a
  // suggestion click or a map pick rather than typing.
  const skipNextSearchRef = useRef(false);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    abortRef.current?.abort();
  }, []);

  const handleType = useCallback((text: string) => {
    onChange(text);
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 3) {
      setSuggestions([]);
      setSuggestionsOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      try {
        const results = await searchAddress(text, controller.signal);
        if (!controller.signal.aborted) {
          setSuggestions(results);
          setSuggestionsOpen(true);
        }
      } catch {
        /* aborted or network error — ignore */
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 400);
  }, [onChange]);

  const pickSuggestion = useCallback((s: GeoSuggestion) => {
    skipNextSearchRef.current = true;
    const lat = Number(s.lat);
    const lon = Number(s.lon);
    onChange(s.display_name, { lat, lon });
    setMarker([lat, lon]);
    setSuggestions([]);
    setSuggestionsOpen(false);
  }, [onChange]);

  const pickOnMap = useCallback(async (lat: number, lon: number) => {
    setMarker([lat, lon]);
    setReversing(true);
    try {
      const addr = await reverseGeocode(lat, lon);
      skipNextSearchRef.current = true;
      onChange(addr ?? `${lat.toFixed(6)}, ${lon.toFixed(6)}`, { lat, lon });
    } finally {
      setReversing(false);
    }
  }, [onChange]);

  const mapCenter = useMemo<[number, number]>(() => marker ?? DEFAULT_CENTER, [marker]);

  return (
    <div className="relative">
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <input
            type="text"
            className={inputClassName ?? 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-colors'}
            placeholder={placeholder}
            value={value}
            disabled={disabled}
            onChange={(e) => handleType(e.target.value)}
            onFocus={() => { if (suggestions.length > 0) setSuggestionsOpen(true); }}
          />
          {(searching || reversing) && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">…</span>
          )}
          {suggestionsOpen && suggestions.length > 0 && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setSuggestionsOpen(false)} />
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                {suggestions.map((s, i) => (
                  <button
                    key={`${s.lat}-${s.lon}-${i}`}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-indigo-50 transition-colors"
                    onClick={() => pickSuggestion(s)}
                  >
                    {s.display_name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          title={mapOpen ? 'Masquer la carte' : 'Choisir sur la carte'}
          className={`shrink-0 rounded-xl border px-3 py-2 text-sm transition-colors ${mapOpen ? 'border-indigo-300 bg-indigo-50 text-indigo-600' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
          disabled={disabled}
          onClick={() => setMapOpen((v) => !v)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </button>
      </div>

      {mapOpen && (
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
          <MapContainer center={mapCenter} zoom={marker ? 14 : 11} style={{ height: 220, width: '100%' }} scrollWheelZoom>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              attribution="&copy; OpenStreetMap, &copy; CARTO"
            />
            <ClickHandler onPick={pickOnMap} />
            {marker && (
              <>
                <RecenterOnChange center={marker} />
                <Marker
                  position={marker}
                  draggable
                  eventHandlers={{
                    dragend: (e) => {
                      const ll = (e.target as L.Marker).getLatLng();
                      void pickOnMap(ll.lat, ll.lng);
                    },
                  }}
                />
              </>
            )}
          </MapContainer>
          <p className="bg-slate-50 px-3 py-1.5 text-[10px] text-slate-400">
            Cliquez sur la carte ou déplacez le marqueur pour définir l'adresse.
          </p>
        </div>
      )}
    </div>
  );
};
