import React, { useRef, useState } from 'react';
import { apiClient } from '@/services/apiClient';

/**
 * Joint une preuve à un paiement : reçu, photo du chèque, avis de virement.
 * Le fichier est stocké dès son choix ; l'enregistrement du paiement le
 * rattache ensuite à la ligne, où le lien « Preuve » l'ouvre.
 */
export const ProofUploader: React.FC<{
  documentId?: string | null;
  onUploaded: (documentId: string, fileName: string) => void;
  onCleared: () => void;
  label?: string;
}> = ({ documentId, onUploaded, onCleared, label = 'Preuve (reçu, photo, PDF)' }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await apiClient<{ data: { id: string; fileName?: string } }>('/v1/document-reader/uploads', {
        method: 'POST',
        body,
      });
      if (!res.data?.id) {
        throw new Error('Le serveur n’a pas renvoyé de document.');
      }
      setName(file.name);
      onUploaded(res.data.id, file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec du téléversement.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">{label}</span>

        {documentId && name ? (
          <span className="flex items-center gap-2 text-xs font-semibold text-emerald-700">
            📎 {name}
            <button
              type="button"
              onClick={() => {
                setName(null);
                onCleared();
                if (inputRef.current) inputRef.current.value = '';
              }}
              className="rounded-lg px-2 py-0.5 text-[10px] font-black uppercase text-rose-600 hover:bg-rose-50"
            >
              Retirer
            </button>
          </span>
        ) : (
          <label className="cursor-pointer rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100">
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) await upload(file);
              }}
            />
            {busy ? 'Envoi…' : 'Choisir un fichier'}
          </label>
        )}
      </div>

      {error && <div className="mt-1.5 text-[11px] font-semibold text-rose-700">{error}</div>}
    </div>
  );
};

export default ProofUploader;
