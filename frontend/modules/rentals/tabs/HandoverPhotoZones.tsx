import React, { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { documentCenterApi } from '@/services/documentCenterApi';

const ZONES = ['Avant', 'Arrière', 'Gauche', 'Droite', 'Intérieur', 'Tableau de bord'];

/**
 * Grille 6 vignettes "Photos du véhicule" sur Check-Out / Check-In.
 * Chaque vignette ouvre la caméra (ou le picker fichier) et upload
 * la photo au centre documentaire du véhicule (category = handover_photo).
 */
export const HandoverPhotoZones: React.FC<{
  vehicleId?: string;
  kind: 'checkout' | 'checkin';
}> = ({ vehicleId, kind }) => {
  return (
    <div className="mt-4">
      <label className="mb-2 block text-[10px] font-bold text-slate-400">Photos du véhicule</label>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {ZONES.map((zone) => (
          <PhotoZoneTile key={zone} zone={zone} vehicleId={vehicleId} kind={kind} />
        ))}
      </div>
    </div>
  );
};

const PhotoZoneTile: React.FC<{
  zone: string;
  vehicleId?: string;
  kind: 'checkout' | 'checkin';
}> = ({ zone, vehicleId, kind }) => {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadM = useMutation({
    mutationFn: async (file: File) => {
      if (!vehicleId) throw new Error('Véhicule inconnu.');
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', `handover_photo`);
      fd.append('document_number', zone);
      fd.append('notes', kind === 'checkout' ? 'Check-Out' : 'Check-In');
      return documentCenterApi.uploadToEntity('vehicle', vehicleId, fd);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['entity-documents', 'vehicle', vehicleId] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Upload impossible.'),
  });

  const onPicked = (file?: File | null) => {
    if (!file) return;
    setError(null);
    setPreview(URL.createObjectURL(file));
    uploadM.mutate(file);
  };

  const uploaded = uploadM.isSuccess;
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-3 text-center transition ${
        uploaded ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-white hover:border-slate-300'
      } ${uploadM.isPending ? 'opacity-70' : ''}`}
    >
      {preview ? (
        <img src={preview} alt={zone} className="mb-1 h-12 w-full rounded object-cover" />
      ) : (
        <div className="h-6" />
      )}
      <div className="mt-1 text-[10px] font-bold text-slate-500">{zone}</div>
      <div className="mt-1 flex items-center gap-1">
        <button
          type="button"
          disabled={uploadM.isPending || !vehicleId}
          onClick={() => cameraRef.current?.click()}
          className="rounded bg-indigo-600 px-2 py-0.5 text-[9px] font-black text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Photo
        </button>
        <button
          type="button"
          disabled={uploadM.isPending || !vehicleId}
          onClick={() => fileRef.current?.click()}
          className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[9px] font-black text-slate-700 hover:bg-slate-100 disabled:opacity-50"
        >
          Choisir
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { onPicked(e.target.files?.[0] ?? null); e.target.value = ''; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { onPicked(e.target.files?.[0] ?? null); e.target.value = ''; }} />
      {uploadM.isPending && (
        <div className="mt-1 text-[9px] font-semibold text-indigo-600">Envoi…</div>
      )}
      {uploaded && !uploadM.isPending && (
        <div className="mt-1 text-[9px] font-black text-emerald-700">✓ Enregistrée</div>
      )}
      {error && <div className="mt-1 text-[9px] font-semibold text-rose-600 truncate max-w-full">{error}</div>}
    </div>
  );
};
