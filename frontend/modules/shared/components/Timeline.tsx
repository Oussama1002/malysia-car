import React from 'react';
import { formatDate } from '@/modules/shared/formatters';

export type TimelineItem = { id: string; title: string; at: string; meta?: string; tone?: 'info' | 'success' | 'danger' };

const toneDot: Record<NonNullable<TimelineItem['tone']>, string> = {
  info: 'bg-indigo-500',
  success: 'bg-emerald-500',
  danger: 'bg-rose-500',
};

export const Timeline: React.FC<{ items: TimelineItem[] }> = ({ items }) => (
  <div className="space-y-4">
    {items.map((it) => (
      <div key={it.id} className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className={`h-3 w-3 rounded-full ${toneDot[it.tone ?? 'info']}`} />
          <div className="mt-1 w-px flex-1 bg-slate-200" />
        </div>
        <div className="pb-4">
          <p className="text-sm font-bold text-slate-900">{it.title}</p>
          <p className="text-xs text-slate-500">{formatDate(it.at)}</p>
          {it.meta && <p className="mt-1 text-xs text-slate-600">{it.meta}</p>}
        </div>
      </div>
    ))}
  </div>
);
