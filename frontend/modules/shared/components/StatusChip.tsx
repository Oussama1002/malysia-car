import React from 'react';

export type ChipTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const toneClass: Record<ChipTone, string> = {
  neutral: 'df-chip',
  brand: 'df-chip df-chip--brand',
  success: 'df-chip df-chip--success',
  warning: 'df-chip df-chip--warning',
  danger: 'df-chip df-chip--danger',
  info: 'df-chip df-chip--info',
};

export const StatusChip: React.FC<{
  label: string;
  tone?: ChipTone;
  dot?: boolean;
  icon?: React.ReactNode;
  className?: string;
}> = ({ label, tone = 'neutral', dot, icon, className }) => (
  <span className={`${toneClass[tone]} ${className ?? ''}`}>
    {dot && <span className="df-chip__dot" />}
    {icon}
    {label}
  </span>
);
