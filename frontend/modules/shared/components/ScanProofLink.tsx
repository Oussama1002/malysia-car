import React, { useState } from 'react';
import { documentCenterApi } from '@/services/documentCenterApi';

/**
 * Opens the scan kept as proof for a record — the cheque behind a payment, a
 * franchise or a supplier payment. The document is fetched on click, so a long
 * history costs nothing to render.
 */
export const ScanProofLink: React.FC<{
  entityType: 'payment' | 'sub_rental_payment' | 'contract_deposit';
  entityId: string;
  label?: string;
  className?: string;
}> = ({ entityType, entityId, label = 'Preuve', className = '' }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await documentCenterApi.byEntity(entityType, entityId);
      const doc = (res.data?.attachments ?? [])[0];
      if (!doc) {
        setError('Aucun scan joint.');
        return;
      }
      await documentCenterApi.openInNewTab(doc.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ouverture impossible.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={open}
        disabled={busy}
        title="Voir le scan joint"
        className={className || 'text-xs font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-50'}
      >
        {busy ? '…' : `📎 ${label}`}
      </button>
      {error && <span className="text-[10px] font-semibold text-slate-400">{error}</span>}
    </span>
  );
};

export default ScanProofLink;
