import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { documentCenterApi, type DocumentCenterItem } from '@/services/documentCenterApi';
import { endpoints, getApiBase } from '@/services/apiClient';

/**
 * Carte "Documents véhicule" affichée sur Check-Out / Check-In :
 *   - si le véhicule n'a AUCUN document, on expose 5 vignettes
 *     d'upload dédiées (Carte grise recto, verso, Assurance,
 *     Autorisation de circulation, Visite technique) pour guider
 *     l'agent sur le dossier minimum à constituer avant de remettre
 *     le véhicule.
 *   - sinon on affiche une grille de prévisualisations : miniature du
 *     document + case à cocher pour que l'agent valide pièce par pièce
 *     ce qu'il a bien vérifié avant de valider la remise.
 */
export const VehicleHandoverDocs: React.FC<{ vehicleId: string }> = ({ vehicleId }) => {
  const q = useQuery({
    queryKey: ['entity-documents', 'vehicle', vehicleId],
    queryFn: () => documentCenterApi.byEntity('vehicle', vehicleId),
    enabled: !!vehicleId,
  });

  const attachments = q.data?.data?.attachments ?? [];
  const generated = q.data?.data?.generated ?? [];
  const docs = [...attachments, ...generated];

  if (q.isLoading) {
    return (
      <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <h3 className="text-sm font-black uppercase tracking-wider text-slate-700 mb-3">Documents véhicule</h3>
        <p className="text-sm text-slate-500">Chargement…</p>
      </section>
    );
  }

  if (docs.length === 0) {
    return <VehicleDocsStarterGrid vehicleId={vehicleId} />;
  }

  return <VehicleDocsPreviewGrid docs={docs} />;
};

const CATEGORY_FR: Record<string, string> = {
  carte_grise_recto: 'Carte grise — Recto',
  carte_grise_verso: 'Carte grise — Verso',
  insurance: 'Assurance',
  circulation_authorization: 'Autorisation de circulation',
  technical_inspection: 'Visite technique',
};

const VehicleDocsPreviewGrid: React.FC<{ docs: DocumentCenterItem[] }> = ({ docs }) => {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setChecked((s) => ({ ...s, [id]: !s[id] }));
  const checkedCount = Object.values(checked).filter(Boolean).length;

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <div className="text-sm font-black uppercase tracking-wider text-slate-700">Documents véhicule</div>
        <div className="text-[11px] font-semibold text-slate-500">
          {checkedCount} / {docs.length} vérifié{checkedCount > 1 ? 's' : ''}
        </div>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        Cochez chaque pièce après l'avoir contrôlée avec le client.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {docs.map((d) => (
          <DocPreviewTile
            key={d.id}
            doc={d}
            checked={!!checked[d.id]}
            onToggle={() => toggle(d.id)}
          />
        ))}
      </div>
    </section>
  );
};

const DocPreviewTile: React.FC<{
  doc: DocumentCenterItem;
  checked: boolean;
  onToggle: () => void;
}> = ({ doc, checked, onToggle }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const mime = (doc.mimeType ?? '').toLowerCase();
  const isImage = mime.startsWith('image/');
  const isPdf = mime.includes('pdf');

  // Charge le fichier côté client (route protégée Sanctum) et transforme la
  // réponse en blob: URL — permet d'afficher la miniature en <img> ou
  // <iframe> sans exposer le token dans un href. On tente systématiquement
  // la requête, même quand le mime est inconnu (certaines pièces OCR n'ont
  // pas mime_type en base) : si le blob est une image ou un PDF on le
  // montre quand même.
  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    setLoading(true);
    setPreviewError(null);
    setPreviewUrl(null);
    (async () => {
      try {
        const base = getApiBase();
        if (!base) throw new Error('API indisponible');
        const session = localStorage.getItem('df_session');
        let token: string | undefined;
        try {
          token = session ? (JSON.parse(session) as { token?: string }).token : undefined;
        } catch { /* ignore */ }
        const res = await fetch(`${base}${endpoints.documents.download(doc.id)}`, {
          headers: token ? { Authorization: `Bearer ${token}`, Accept: '*/*' } : { Accept: '*/*' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!revoked) setPreviewUrl(objectUrl);
      } catch (e) {
        if (!revoked) setPreviewError(e instanceof Error ? e.message : 'Aperçu impossible');
      } finally {
        if (!revoked) setLoading(false);
      }
    })();
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc.id]);

  const label = CATEGORY_FR[doc.category ?? ''] ?? doc.title ?? doc.category ?? 'Document';
  const showAsImage = isImage || (!isPdf && !!previewUrl && !mime);
  const showAsPdf = isPdf;

  return (
    <label
      className={`flex cursor-pointer flex-col rounded-xl border p-3 transition ${
        checked ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className="relative mb-2 flex h-40 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
        {loading && (
          <div className="text-[11px] font-semibold text-slate-400">Chargement…</div>
        )}
        {!loading && previewUrl && showAsImage && (
          <img src={previewUrl} alt={label} className="h-full w-full object-contain" />
        )}
        {!loading && previewUrl && showAsPdf && (
          <iframe
            src={`${previewUrl}#toolbar=0&navpanes=0&view=FitH`}
            title={label}
            className="h-full w-full"
            style={{ border: 0 }}
          />
        )}
        {!loading && !previewUrl && !previewError && (
          <div className="text-center text-[11px] font-semibold text-slate-500">
            <div className="text-2xl">📄</div>
            <div className="mt-1">{doc.mimeType ?? 'Fichier'}</div>
          </div>
        )}
        {!loading && previewError && (
          <div className="px-2 text-center text-[10px] font-semibold text-rose-500">
            Aperçu indisponible<br />{previewError}
          </div>
        )}
      </div>

      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-emerald-600"
          checked={checked}
          onChange={onToggle}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-black text-slate-800">{label}</div>
          {doc.expiryDate && (
            <div className="truncate text-[10px] text-slate-500">
              Expire le {new Date(doc.expiryDate).toLocaleDateString('fr-MA')}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); documentCenterApi.openInNewTab(doc.id).catch(() => {}); }}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-100"
          title="Ouvrir en grand"
        >
          Ouvrir
        </button>
      </div>
    </label>
  );
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
