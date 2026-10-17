import React, { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { documentCenterApi } from '@/services/documentCenterApi';
import { EntityDocuments } from '@/modules/shared/components/EntityDocuments';

/**
 * Carte "Documents véhicule" affichée sur Check-Out / Check-In :
 *   - si le véhicule n'a AUCUN document, on expose 5 vignettes
 *     d'upload dédiées (Carte grise recto, verso, Assurance,
 *     Autorisation de circulation, Visite technique) pour guider
 *     l'agent sur le dossier minimum à constituer avant de remettre
 *     le véhicule.
 *   - sinon on affiche l'EntityDocuments habituel qui liste tout
 *     (incluant les uploads ad hoc).
 */
export const VehicleHandoverDocs: React.FC<{ vehicleId: string }> = ({ vehicleId }) => {
  const q = useQuery({
    queryKey: ['entity-documents', 'vehicle', vehicleId],
    queryFn: () => documentCenterApi.byEntity('vehicle', vehicleId),
    enabled: !!vehicleId,
  });

  const attachments = q.data?.data?.attachments ?? [];
  const generated = q.data?.data?.generated ?? [];
  const total = attachments.length + generated.length;

  if (q.isLoading) {
    return (
      <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-black uppercase tracking-wider text-slate-700 mb-3">Documents véhicule</h3>
        <p className="text-sm text-slate-500">Chargement…</p>
      </section>
    );
  }

  if (total === 0) {
    return <VehicleDocsStarterGrid vehicleId={vehicleId} />;
  }

  return <EntityDocuments entityType="vehicle" entityId={vehicleId} title="Documents véhicule" />;
};

interface StarterSlot {
  key: string;
  label: string;
  description: string;
  category: string;
}

const SLOTS: StarterSlot[] = [
  { key: 'carte_grise_recto', label: 'Carte grise — Recto', description: 'Immatriculation, 1ère mise en circulation', category: 'carte_grise_recto' },
  { key: 'carte_grise_verso', label: 'Carte grise — Verso', description: 'Marque, modèle, châssis', category: 'carte_grise_verso' },
  { key: 'insurance', label: 'Assurance', description: 'Attestation en cours de validité', category: 'insurance' },
  { key: 'circulation_authorization', label: 'Autorisation de circulation', description: 'Autorisation / vignette TSAV', category: 'circulation_authorization' },
  { key: 'technical_inspection', label: 'Visite technique', description: 'Certificat de visite technique', category: 'technical_inspection' },
];

const VehicleDocsStarterGrid: React.FC<{ vehicleId: string }> = ({ vehicleId }) => {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="mb-1 text-sm font-black uppercase tracking-wider text-slate-700">Documents véhicule</div>
      <p className="mb-4 text-xs text-slate-500">
        Aucun document au dossier. Ajoutez au minimum ces pièces avant de remettre le véhicule au client.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SLOTS.map((slot) => (
          <StarterSlotTile key={slot.key} vehicleId={vehicleId} slot={slot} />
        ))}
      </div>
    </section>
  );
};

const StarterSlotTile: React.FC<{ vehicleId: string; slot: StarterSlot }> = ({ vehicleId, slot }) => {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadM = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('category', slot.category);
      return documentCenterApi.uploadToEntity('vehicle', vehicleId, fd);
    },
    onSuccess: async () => {
      setError(null);
      await qc.invalidateQueries({ queryKey: ['entity-documents', 'vehicle', vehicleId] });
      await qc.invalidateQueries({ queryKey: ['documents-center'] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Upload impossible'),
  });

  const onPicked = (file?: File | null) => {
    if (!file) return;
    uploadM.mutate(file);
  };

  return (
    <div className={`rounded-xl border p-3 ${uploadM.isPending ? 'border-indigo-300 bg-indigo-50/40' : 'border-slate-200 bg-white'}`}>
      <div className="text-xs font-black text-slate-800">{slot.label}</div>
      <p className="mt-1 text-[11px] text-slate-500">{slot.description}</p>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={uploadM.isPending}
          onClick={() => fileRef.current?.click()}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          Choisir
        </button>
        <button
          type="button"
          disabled={uploadM.isPending}
          onClick={() => cameraRef.current?.click()}
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          Photo
        </button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf,.pdf,.heic,.heif,.webp,.tiff,.bmp"
        className="hidden"
        onChange={(e) => { onPicked(e.target.files?.[0] ?? null); e.target.value = ''; }}
      />
      {/* Camera input: accept image/* without capture so the OS can offer "Take photo" / gallery. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { onPicked(e.target.files?.[0] ?? null); e.target.value = ''; }}
      />

      {uploadM.isPending && (
        <div className="mt-2 text-[11px] font-bold text-indigo-600">Envoi en cours…</div>
      )}
      {error && (
        <div className="mt-2 text-[11px] font-semibold text-rose-600">{error}</div>
      )}
    </div>
  );
};
