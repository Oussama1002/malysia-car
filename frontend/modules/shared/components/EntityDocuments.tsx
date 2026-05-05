import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { documentCenterApi, type DocumentCenterItem } from '@/services/documentCenterApi';
import { EmptyState } from '@/modules/shared/components/EmptyState';
import { formatDate } from '@/modules/shared/formatters';

export const EntityDocuments: React.FC<{
  entityType: string;
  entityId: string;
  title?: string;
}> = ({ entityType, entityId, title = 'Documents' }) => {
  const qc = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [category, setCategory] = useState('general');
  const [expiryDate, setExpiryDate] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [selected, setSelected] = useState<File | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ['entity-documents', entityType, entityId],
    queryFn: () => documentCenterApi.byEntity(entityType, entityId),
    enabled: !!entityType && !!entityId,
  });

  const rows = useMemo(() => {
    const attachments = q.data?.data?.attachments ?? [];
    const generated = q.data?.data?.generated ?? [];
    return [...attachments, ...generated].sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
  }, [q.data]);

  const uploadM = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Fichier requis');
      const fd = new FormData();
      fd.append('file', selected);
      fd.append('category', category);
      if (expiryDate) fd.append('expiry_date', expiryDate);
      if (issueDate) fd.append('issue_date', issueDate);
      if (documentNumber) fd.append('document_number', documentNumber);
      if (notes) fd.append('notes', notes);
      return documentCenterApi.uploadToEntity(entityType, entityId, fd);
    },
    onSuccess: async () => {
      setShowUpload(false);
      setSelected(null);
      setExpiryDate('');
      setIssueDate('');
      setDocumentNumber('');
      setNotes('');
      await qc.invalidateQueries({ queryKey: ['entity-documents', entityType, entityId] });
      await qc.invalidateQueries({ queryKey: ['documents-center'] });
    },
    onError: (e: unknown) => {
      setUploadErr(e instanceof Error ? e.message : 'Upload impossible');
    },
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => documentCenterApi.remove(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['entity-documents', entityType, entityId] });
      await qc.invalidateQueries({ queryKey: ['documents-center'] });
    },
  });

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">{title}</h3>
        <button type="button" className="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white" onClick={() => setShowUpload((s) => !s)}>
          {showUpload ? 'Fermer' : 'Ajouter'}
        </button>
      </div>

      {showUpload && (
        <div className="mb-4 grid grid-cols-1 gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-bold text-slate-600">Fichier</label>
            <input type="file" onChange={(e) => setSelected(e.target.files?.[0] ?? null)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Catégorie</label>
            <input className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">N° document</label>
            <input className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Date d'émission</label>
            <input type="date" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Date d'expiration</label>
            <input type="date" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-bold text-slate-600">Notes</label>
            <textarea className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {uploadErr && <p className="md:col-span-2 text-xs font-semibold text-red-600">{uploadErr}</p>}
          <div className="md:col-span-2">
            <button
              type="button"
              className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              disabled={uploadM.isPending || !selected}
              onClick={() => uploadM.mutate()}
            >
              {uploadM.isPending ? 'Envoi…' : 'Téléverser'}
            </button>
          </div>
        </div>
      )}

      {q.isLoading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : rows.length === 0 ? (
        <EmptyState title="Aucun document" description="Ajoutez un fichier pour construire le dossier documentaire de cette entité." />
      ) : (
        <div className="space-y-2">
          {rows.map((d) => (
            <DocumentRow key={d.id} item={d} onDelete={(id) => deleteM.mutate(id)} />
          ))}
        </div>
      )}
    </section>
  );
};

const DocumentRow: React.FC<{ item: DocumentCenterItem; onDelete: (id: string) => void }> = ({ item, onDelete }) => {
  const expired = item.expiryDate ? new Date(item.expiryDate) < new Date() : false;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
      <div>
        <div className="text-sm font-semibold text-slate-900">{item.title || item.category || item.id}</div>
        <div className="text-xs text-slate-500">
          {item.category ?? '—'} · {item.entityType ?? '—'} #{item.entityId ?? '—'}
          {item.issueDate ? ` · Émis: ${formatDate(item.issueDate)}` : ''}
          {item.expiryDate ? ` · Expire: ${formatDate(item.expiryDate)}` : ''}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {item.expiryDate && (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${expired ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {expired ? 'Expiré' : 'Valide'}
          </span>
        )}
        <a className="text-xs font-bold text-indigo-600 hover:underline" href={documentCenterApi.downloadUrl(item.id)} target="_blank" rel="noreferrer">
          Ouvrir
        </a>
        {item.source === 'upload' && (
          <button type="button" className="text-xs font-bold text-red-600 hover:underline" onClick={() => onDelete(item.id)}>
            Supprimer
          </button>
        )}
      </div>
    </div>
  );
};
