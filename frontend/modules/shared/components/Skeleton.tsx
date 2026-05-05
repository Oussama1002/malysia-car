import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = 'h-4 w-full' }) => (
  <div className={`animate-pulse rounded-md bg-slate-200 ${className}`} />
);

export const SkeletonTable: React.FC<{ cols: number; rows: number }> = ({ cols, rows }) => (
  <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
    {Array.from({ length: rows }).map((_, r) => (
      <div key={r} className="flex gap-2">
        {Array.from({ length: cols }).map((__, c) => (
          <Skeleton key={c} className="h-8 flex-1" />
        ))}
      </div>
    ))}
  </div>
);
