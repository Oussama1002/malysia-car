import React from 'react';

const tones: Record<string, string> = {
  default: 'bg-slate-100 text-slate-700 border-slate-200',
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-rose-50 text-rose-800 border-rose-200',
  info: 'bg-indigo-50 text-indigo-800 border-indigo-200',
};

export const StatusBadge: React.FC<{ label: string; tone?: keyof typeof tones }> = ({ label, tone = 'default' }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${tones[tone]}`}>
    {label}
  </span>
);
