import React from 'react';

/**
 * Radial risk gauge 0–100 — maps to colour bands for credit scoring.
 * 0–40  danger, 41–60 warning, 61–80 info, 81–100 success
 */
export const RiskMeter: React.FC<{
  score: number;
  size?: number;
  label?: string;
  caption?: string;
}> = ({ score, size = 140, label = 'Score', caption }) => {
  const clamped = Math.max(0, Math.min(100, score));
  const r = 52;
  const c = 2 * Math.PI * r;
  const dash = (clamped / 100) * c;

  const color =
    clamped < 41 ? 'var(--df-danger-500)'
    : clamped < 61 ? 'var(--df-warning-500)'
    : clamped < 81 ? 'var(--df-info-500)'
    : 'var(--df-success-500)';

  const rating =
    clamped < 41 ? 'Élevé'
    : clamped < 61 ? 'Modéré'
    : clamped < 81 ? 'Correct'
    : 'Excellent';

  return (
    <div className="relative inline-flex flex-col items-center" style={{ width: size }}>
      <svg width={size} height={size} viewBox="0 0 140 140" className="df-risk">
        <circle cx="70" cy="70" r={r} strokeWidth="12" className="df-risk__track" />
        <circle
          cx="70"
          cy="70"
          r={r}
          strokeWidth="12"
          stroke={color}
          className="df-risk__value"
          strokeDasharray={`${dash} ${c}`}
          style={{ filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" style={{ transform: 'rotate(0)' }}>
        <div className="df-num" style={{ fontSize: 28, fontWeight: 800, color: 'var(--df-text)' }}>{clamped}</div>
        <div className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color }}>{rating}</div>
      </div>
      <div className="mt-2 text-center">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--df-text-faint)]">{label}</div>
        {caption && <div className="text-[11px] text-[color:var(--df-text-muted)]">{caption}</div>}
      </div>
    </div>
  );
};
