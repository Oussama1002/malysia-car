import React from 'react';

export const DrawerPanel: React.FC<{
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  widthClass?: string;
}> = ({ open, title, onClose, children, widthClass = 'max-w-lg' }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex">
      <button type="button" className="df-overlay-backdrop absolute inset-0 bg-slate-900/50" aria-label="Close" onClick={onClose} />
      <div className={`relative ml-auto flex h-full w-full ${widthClass} flex-col bg-white shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-black text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-900">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
};
