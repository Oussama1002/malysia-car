import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Address text input with Google Places autocomplete.
 *
 * Requires `VITE_GOOGLE_MAPS_API_KEY` (Places API enabled). When the key is
 * missing or the Google script fails to load, it falls back to the free
 * OpenStreetMap Nominatim geocoder so the field keeps working.
 */

const GOOGLE_KEY: string = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? '';

/* ── Google Maps JS loader (singleton) ─────────────────────────────── */

// Minimal typings for the pieces of the Places API we use.
interface GooglePrediction { description: string }
interface GoogleAutocompleteService {
  getPlacePredictions(
    req: { input: string; componentRestrictions?: { country: string }; language?: string },
    cb: (predictions: GooglePrediction[] | null, status: string) => void,
  ): void;
}
interface GoogleWindow extends Window {
  google?: { maps?: { places?: { AutocompleteService: new () => GoogleAutocompleteService } } };
}

let googleLoader: Promise<GoogleAutocompleteService | null> | null = null;

function loadGooglePlaces(): Promise<GoogleAutocompleteService | null> {
  if (googleLoader) return googleLoader;
  googleLoader = new Promise((resolve) => {
    const w = window as GoogleWindow;
    if (w.google?.maps?.places) {
      resolve(new w.google.maps.places.AutocompleteService());
      return;
    }
    if (!GOOGLE_KEY) {
      resolve(null);
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_KEY)}&libraries=places&language=fr&region=MA`;
    script.async = true;
    script.onload = () => {
      const places = (window as GoogleWindow).google?.maps?.places;
      resolve(places ? new places.AutocompleteService() : null);
    };
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
  return googleLoader;
}

async function googleSuggestions(query: string): Promise<string[]> {
  const service = await loadGooglePlaces();
  if (!service) return nominatimSuggestions(query);
  return new Promise((resolve) => {
    service.getPlacePredictions(
      { input: query, componentRestrictions: { country: 'ma' }, language: 'fr' },
      (predictions, status) => {
        if (status !== 'OK' || !predictions) {
          resolve([]);
          return;
        }
        resolve(predictions.map((p) => p.description));
      },
    );
  });
}

/* ── Nominatim fallback (no API key required) ──────────────────────── */

async function nominatimSuggestions(query: string): Promise<string[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '6',
    countrycodes: 'ma',
    'accept-language': 'fr',
  });
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const json = (await res.json()) as { display_name: string }[];
    return json.map((r) => r.display_name);
  } catch {
    return [];
  }
}

/* ── Component ─────────────────────────────────────────────────────── */

export interface AddressAutocompleteInputProps {
  value: string;
  onChange: (address: string) => void;
  placeholder?: string;
  inputClassName?: string;
  disabled?: boolean;
}

export const AddressAutocompleteInput: React.FC<AddressAutocompleteInputProps> = ({
  value,
  onChange,
  placeholder,
  inputClassName,
  disabled,
}) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);
  // Skip the lookup triggered by programmatic changes (suggestion click).
  const skipNextRef = useRef(false);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const handleType = useCallback((text: string) => {
    onChange(text);
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const seq = ++requestSeq.current;
      setLoading(true);
      const results = await googleSuggestions(text);
      if (seq === requestSeq.current) {
        setSuggestions(results);
        setOpen(results.length > 0);
        setLoading(false);
      }
    }, 350);
  }, [onChange]);

  return (
    <div className="relative">
      <input
        type="text"
        className={inputClassName ?? 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-colors'}
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        onChange={(e) => handleType(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
      />
      {loading && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">…</span>
      )}
      {open && suggestions.length > 0 && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
            {suggestions.map((s, i) => (
              <button
                key={`${s}-${i}`}
                type="button"
                className="block w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-indigo-50 transition-colors"
                onClick={() => {
                  skipNextRef.current = true;
                  onChange(s);
                  setSuggestions([]);
                  setOpen(false);
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
