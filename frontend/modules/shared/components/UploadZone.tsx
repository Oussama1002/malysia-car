import React from 'react';

export const UploadZone: React.FC<{
  label?: string;
  hint?: string;
  onFiles?: (files: FileList | null) => void;
}> = ({ label = 'Glisser-déposer des fichiers', hint = 'PDF, JPG — simulation locale', onFiles }) => (
  <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center hover:border-indigo-300 hover:bg-indigo-50/40">
    <input
      type="file"
      className="hidden"
      multiple
      onChange={(e) => onFiles?.(e.target.files)}
    />
    <div className="mb-2 rounded-full bg-white p-3 shadow-sm">
      <svg className="h-6 w-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5-5 5 5M12 4v12" />
      </svg>
    </div>
    <p className="text-sm font-bold text-slate-800">{label}</p>
    <p className="mt-1 text-xs text-slate-500">{hint}</p>
  </label>
);
