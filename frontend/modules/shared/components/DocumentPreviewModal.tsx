import React from 'react';

export const DocumentPreviewModal: React.FC<{
  open: boolean;
  title: string;
  url?: string;
  onClose: () => void;
}> = ({ open, title, url, onClose }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button type="button" className="df-overlay-backdrop absolute inset-0 bg-slate-900/70" onClick={onClose} aria-label="close" />
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h3 className="font-black text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            ✕
          </button>
        </div>
        <div className="max-h-[calc(90vh-56px)] overflow-auto bg-slate-50 p-4">
          {url ? (
            <iframe title={title} src={url} className="h-[70vh] w-full rounded-xl bg-white" />
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
              Aperçu simulé — connecter un backend de fichiers sécurisé.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
