import React from 'react';
import { Sparkline } from './Sparkline';
import { Icon, type IconName } from './Icon';

export type KpiTone = 'brand' | 'success' | 'warning' | 'danger' | 'info';

interface KpiCardProps {
  title: string;
  value: React.ReactNode;
  hint?: string;
  tone?: KpiTone;
  icon?: IconName;
  /** Trend in percent (negative = down). Optional. */
  delta?: number;
  /** Direction in which positive delta is "good". Default: 'up'. */
  goodDirection?: 'up' | 'down';
  sparklineData?: number[];
  insight?: string;
  onClick?: () => void;
  /**
   * @deprecated legacy tailwind class support (kept to avoid breakage).
   */
  accentClass?: string;
}

const toneColors: Record<KpiTone, { fg: string; accent: string }> = {
  brand: { fg: 'text-[color:var(--df-brand-600)] dark:text-indigo-300', accent: 'var(--df-brand-500)' },
  success: { fg: 'text-emerald-600 dark:text-emerald-300', accent: 'var(--df-success-500)' },
  warning: { fg: 'text-amber-600 dark:text-amber-300', accent: 'var(--df-warning-500)' },
  danger: { fg: 'text-rose-600 dark:text-rose-300', accent: 'var(--df-danger-500)' },
  info: { fg: 'text-sky-600 dark:text-sky-300', accent: 'var(--df-info-500)' },
};

export const KpiCard: React.FC<KpiCardProps> = ({
  title,
  value,
  hint,
  tone = 'brand',
  icon,
  delta,
  goodDirection = 'up',
  sparklineData,
  insight,
  onClick,
}) => {
  const c = toneColors[tone];
  const toneMod = `df-kpi--${tone === 'brand' ? '' : tone}`.replace(/--$/, '');
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta);
  const good = hasDelta && ((goodDirection === 'up' && delta! >= 0) || (goodDirection === 'down' && delta! <= 0));
  const bad = hasDelta && !good;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`df-kpi ${toneMod} text-start w-full`}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      disabled={!onClick}
      aria-label={title}
    >
      <div className="flex items-start gap-3">
        {icon && (
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{
              color: c.accent,
              background: `color-mix(in srgb, ${c.accent} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${c.accent} 20%, transparent)`,
            }}
          >
            <Icon name={icon} size={18} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="df-kpi__label">{title}</p>
          <p className="df-kpi__value">{value}</p>
          {hint && <p className="mt-1 text-[11px] font-medium text-[color:var(--df-text-faint)]">{hint}</p>}
        </div>
      </div>

      <div className="df-kpi__row">
        {hasDelta && (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold ${
              good
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                : bad
                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300'
                  : 'border-slate-400/30 bg-slate-500/10 text-slate-500'
            }`}
          >
            <Icon name={delta! >= 0 ? 'trend-up' : 'trend-down'} size={12} />
            {delta! >= 0 ? '+' : ''}
            {delta!.toFixed(1)}%
          </span>
        )}
        {sparklineData && sparklineData.length > 0 && (
          <div className="ml-auto" style={{ color: c.accent }}>
            <Sparkline data={sparklineData} width={96} height={32} />
          </div>
        )}
      </div>

      {insight && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-[color:var(--df-border)] bg-[color:var(--df-surface-sunk)] px-2.5 py-1.5">
          <Icon name="sparkles" size={12} className="mt-0.5 shrink-0 text-[color:var(--df-brand-500)]" />
          <span className={`text-[11px] font-medium leading-snug ${c.fg}`}>{insight}</span>
        </div>
      )}
    </button>
  );
};
