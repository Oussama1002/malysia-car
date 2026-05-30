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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((d) => (
            <DocumentCard key={d.id} item={d} onDelete={(id) => deleteM.mutate(id)} />
          ))}
        </div>
      )}
    </section>
  );
};

/** French label + tone + emoji for each known document category. */
const CATEGORY_META: Record<string, { label: string; icon: string; tone: string }> = {
  cin:                  { label: 'CIN',                       icon: '🆔', tone: 'bg-indigo-50 text-indigo-700' },
  passport:             { label: 'Passeport',                 icon: '📕', tone: 'bg-sky-50 text-sky-700' },
  driving_license:      { label: 'Permis de conduire',        icon: '🚗', tone: 'bg-emerald-50 text-emerald-700' },
  vehicle_registration: { label: 'Carte grise',               icon: '📋', tone: 'bg-amber-50 text-amber-700' },
  rental_contract:      { label: 'Contrat de location',       icon: '📑', tone: 'bg-violet-50 text-violet-700' },
  proof_of_address:     { label: 'Justificatif de domicile',  icon: '🏠', tone: 'bg-slate-100 text-slate-700' },
  payslip:              { label: 'Fiche de paie',             icon: '💶', tone: 'bg-teal-50 text-teal-700' },
  identity_document:    { label: "Pièce d'identité",          icon: '🆔', tone: 'bg-indigo-50 text-indigo-700' },
  insurance:            { label: 'Assurance',                 icon: '🛡️', tone: 'bg-blue-50 text-blue-700' },
  general:              { label: 'Document',                  icon: '📄', tone: 'bg-slate-100 text-slate-700' },
};

const DocumentCard: React.FC<{ item: DocumentCenterItem; onDelete: (id: string) => void }> = ({ item, onDelete }) => {
  const meta = CATEGORY_META[item.category ?? ''] ?? {
    label: item.category ? item.category.replace(/_/g, ' ') : 'Document',
    icon: '📄',
    tone: 'bg-slate-100 text-slate-700',
  };
  const expired = item.expiryDate ? new Date(item.expiryDate) < new Date() : false;
  return (
    <article className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-indigo-200 hover:shadow-md">
      {/* Header: category icon + label, optional status pill */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${meta.tone}`}>
          <span aria-hidden>{meta.icon}</span>
          {meta.label}
        </span>
        {item.expiryDate && (
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${expired ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {expired ? 'Expiré' : 'Valide'}
          </span>
        )}
      </div>

      {/* Title */}
      <h4 className="line-clamp-2 text-base font-black text-slate-900">
        {item.title || meta.label}
      </h4>

      {/* Metadata — only human-meaningful bits, no UUIDs */}
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        {item.issueDate && (
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Émis le</dt>
            <dd className="font-semibold text-slate-700">{formatDate(item.issueDate)}</dd>
          </div>
        )}
        {item.expiryDate && (
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Expire le</dt>
            <dd className={`font-semibold ${expired ? 'text-rose-700' : 'text-slate-700'}`}>{formatDate(item.expiryDate)}</dd>
          </div>
        )}
        {item.createdAt && !item.issueDate && (
          <div className="col-span-2">
            <dt className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Ajouté le</dt>
            <dd className="font-semibold text-slate-700">{formatDate(item.createdAt)}</dd>
          </div>
        )}
      </dl>

      {/* Actions */}
      <div className="mt-auto flex items-center gap-2 pt-4">
        <a
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-black uppercase tracking-wider text-white shadow-sm hover:bg-indigo-700"
          href={documentCenterApi.downloadUrl(item.id)}
          target="_blank"
          rel="noreferrer"
        >
          Ouvrir
        </a>
        {item.source === 'upload' && (
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 hover:border-rose-200"
            onClick={() => onDelete(item.id)}
            title="Supprimer ce document"
          >
            Supprimer
          </button>
        )}
      </div>
    </article>
  );
};
