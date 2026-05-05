import React from 'react';

export const TabsSection: React.FC<{
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}> = ({ tabs, active, onChange }) => (
  <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
    {tabs.map((t) => (
      <button
        key={t.id}
        type="button"
        onClick={() => onChange(t.id)}
        className={`rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wide transition ${
          active === t.id ? 'bg-indigo-600 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
        }`}
      >
        {t.label}
      </button>
    ))}
  </div>
);
