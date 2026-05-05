import React from 'react';

export const SearchFilterBar: React.FC<{
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  children?: React.ReactNode;
}> = ({ placeholder = 'Rechercher…', value, onChange, children }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="relative max-w-md flex-1">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="df-input"
        style={{ paddingLeft: '2.25rem' }}
      />
    </div>
    {children && <div className="flex flex-wrap gap-2">{children}</div>}
  </div>
);
