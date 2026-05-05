import React, { useState } from 'react';
import { documentsApi } from '@/services/documentsApi';
import { ApiError } from '@/services/apiError';

type Kind = 'contract' | 'invoice';

export const GeneratePdfButton: React.FC<{
  kind: Kind;
  entityId: string;
  className?: string;
  label?: string;
}> = ({ kind, entityId, className, label }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setBusy(true);
    setError(null);
    try {
      const res =
        kind === 'contract'
          ? await documentsApi.generateContractPdf(entityId)
          : await documentsApi.generateInvoicePdf(entityId);
      const url = documentsApi.downloadUrl(res.data.id);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Échec de génération');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy || !entityId}
        className={
          className ??
          'rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white disabled:opacity-50'
        }
      >
        {busy ? 'Génération…' : (label ?? 'Générer PDF')}
      </button>
      {error && <span className="text-[11px] text-rose-600">{error}</span>}
    </div>
  );
};
