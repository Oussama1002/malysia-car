import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { savedLocationsApi, mapsEmbedUrl, type SavedLocationDto } from '@/services/savedLocationsApi';

/**
 * Localisation helper: pick a Google Maps location from the shared library or
 * add a new one (title + pasted Maps URL + optional address). Shows a map
 * preview and an "open in Google Maps" link for the chosen location. Saved
 * locations persist company-wide and reappear on every later mission form.
 */

const INPUT = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400 outline-none transition-colors';
const LABEL = 'mb-1 block text-xs font-bold text-slate-500 uppercase tracking-wide';

const SAVED_LOCATIONS_KEY = ['saved-locations'] as const;

export interface SavedLocationPickerProps {
  /** Currently selected saved-location id (or null). */
  value: string | null;
  /** Fired when a location is selected, created, or cleared. */
  onChange: (location: SavedLocationDto | null) => void;
}

export const SavedLocationPicker: React.FC<SavedLocationPickerProps> = ({ value, onChange }) => {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  const [address, setAddress] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const locationsQ = useQuery({
    queryKey: SAVED_LOCATIONS_KEY,
    queryFn: () => savedLocationsApi.list(),
    staleTime: 2 * 60_000,
  });

  const locations = locationsQ.data ?? [];
  const selected = useMemo(
    () => (value ? locations.find((l) => l.id === value) ?? null : null),
    [value, locations],
  );

  const createMut = useMutation({
    mutationFn: () => savedLocationsApi.create({ title: title.trim(), maps_url: mapsUrl.trim(), address: address.trim() || undefined }),
    onSuccess: async (created) => {
      await qc.invalidateQueries({ queryKey: SAVED_LOCATIONS_KEY });
      onChange(created);
      setAdding(false);
      setTitle('');
      setMapsUrl('');
      setAddress('');
      setFormError(null);
    },
    onError: (e: unknown) => {
      setFormError(e instanceof Error ? e.message : "Impossible d'enregistrer le lieu.");
    },
  });

  const canSave = title.trim().length > 0 && /^https?:\/\//i.test(mapsUrl.trim());
  const embedUrl = selected ? mapsEmbedUrl(selected) : null;

  return (
    <div className="col-span-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className={LABEL}>Lieu enregistré (Google Maps)</label>
          <select
            className={INPUT}
            value={value ?? ''}
            disabled={locationsQ.isLoading}
            onChange={(e) => {
              const id = e.target.value;
              onChange(id ? locations.find((l) => l.id === id) ?? null : null);
            }}
          >
            <option value="">{locationsQ.isLoading ? 'Chargement…' : '— Aucun —'}</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.title}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-xl bg-slate-800 px-3 py-2.5 text-xs font-black text-white hover:bg-slate-700"
          onClick={() => { setAdding((v) => !v); setFormError(null); }}
        >
          {adding ? 'Fermer' : '+ Nouveau lieu'}
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-white p-3">
          <div>
            <label className={LABEL}>Titre du lieu *</label>
            <input type="text" className={INPUT} placeholder="Ex. Aéroport Marrakech Menara" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Lien Google Maps *</label>
            <input type="url" className={INPUT} placeholder="https://maps.app.goo.gl/… ou https://www.google.com/maps/…" value={mapsUrl} onChange={(e) => setMapsUrl(e.target.value)} />
            <p className="mt-1 text-[11px] text-slate-400">Collez le lien depuis l'application ou le site Google Maps (bouton Partager).</p>
          </div>
          <div>
            <label className={LABEL}>Adresse (facultatif)</label>
            <input type="text" className={INPUT} placeholder="Adresse lisible du lieu" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          {formError && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-700">{formError}</p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50" onClick={() => { setAdding(false); setFormError(null); }}>
              Annuler
            </button>
            <button
              type="button"
              className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-50"
              disabled={!canSave || createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              {createMut.isPending ? 'Enregistrement…' : 'Enregistrer le lieu'}
            </button>
          </div>
        </div>
      )}

      {/* Selected location preview + link */}
      {selected && !adding && (
        <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-800">{selected.title}</p>
              {selected.address && <p className="truncate text-xs text-slate-500">{selected.address}</p>}
            </div>
            <a
              href={selected.maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-lg bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100"
            >
              Ouvrir dans Google Maps ↗
            </a>
          </div>
          {embedUrl ? (
            <iframe
              title={`Carte — ${selected.title}`}
              src={embedUrl}
              className="h-48 w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : (
            <p className="px-3 py-4 text-center text-xs text-slate-400">Aperçu indisponible — ouvrez le lien pour voir la carte.</p>
          )}
        </div>
      )}
    </div>
  );
};
