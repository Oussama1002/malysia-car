import React from 'react';

/**
 * Outline icon system — single source of truth.
 * All icons 24x24, stroke currentColor, line pattern.
 */
export type IconName =
  | 'home' | 'car' | 'users' | 'doc' | 'credit' | 'coin' | 'alert'
  | 'marketplace' | 'map' | 'sparkles' | 'mobile' | 'bell' | 'key'
  | 'audit' | 'gear' | 'search' | 'plus' | 'minus' | 'close' | 'check'
  | 'chevron-left' | 'chevron-right' | 'chevron-down' | 'chevron-up'
  | 'sun' | 'moon' | 'density' | 'filter' | 'download' | 'upload'
  | 'arrow-up' | 'arrow-down' | 'arrow-right' | 'trend-up' | 'trend-down'
  | 'play' | 'pause' | 'pin' | 'shield' | 'sign' | 'bolt' | 'wifi'
  | 'refresh' | 'more' | 'external' | 'star' | 'eye' | 'eye-off' | 'pdf' | 'filter-2';

const P = (d: string) => (
  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.75" d={d} />
);

const MAP: Record<IconName, React.ReactNode> = {
  home: P('M3 11.5 12 4l9 7.5M5 10v10h4v-6h6v6h4V10'),
  car: P('M4 14v4h3m13-4v4h-3M4 14l1.8-5.2A2 2 0 0 1 7.7 7.4h8.6a2 2 0 0 1 1.9 1.4L20 14M4 14h16M7.5 17.5h.01m9 0h.01'),
  users: P('M16 18v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 16.5V18M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm10 7v-1.5a3 3 0 0 0-2.3-2.9M15.5 4.1a3.5 3.5 0 0 1 0 6.8'),
  doc: P('M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M9 13h6M9 17h4'),
  credit: P('M3 6.5h18v11a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 17.5v-11Zm0 4h18M7 15h3'),
  coin: P('M12 3v18m4-14h-5a2.5 2.5 0 0 0 0 5h2a2.5 2.5 0 0 1 0 5H7'),
  alert: P('M12 9v4m0 4h.01M10.3 3.9 2.8 16.5A2 2 0 0 0 4.5 19.5h15a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z'),
  marketplace: P('M3 7.5 5 4h14l2 3.5M3 7.5V20a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7.5M3 7.5h18M8 11h8'),
  map: P('M9 20 3 18V5l6 2m0 13 6-2m-6 2V7m6 11 6 2V7l-6-2m0 13V5'),
  sparkles: P('M12 3v4m0 10v4m9-9h-4M7 12H3m14.5-6.5-2.8 2.8m-5.4 5.4-2.8 2.8m0-11 2.8 2.8m5.4 5.4 2.8 2.8'),
  mobile: P('M8 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm3 15h2'),
  bell: P('M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 0 0-4-5.7V5a2 2 0 1 0-4 0v.3A6 6 0 0 0 6 11v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9'),
  key: P('M15 7a4 4 0 1 1 0 8 4 4 0 0 1-3.7-2.5L3 21l2-2 2 2 2-2 2.3-2.3A4 4 0 0 1 15 7Zm0 2.5h.01'),
  audit: P('M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 14h6m-6-4h3'),
  gear: P('M10.3 4.3c.4-1.7 2.9-1.7 3.4 0a1.7 1.7 0 0 0 2.6 1c1.5-.9 3.3.8 2.4 2.4a1.7 1.7 0 0 0 1 2.6c1.7.4 1.7 2.9 0 3.4a1.7 1.7 0 0 0-1 2.6c.9 1.5-.8 3.3-2.4 2.4a1.7 1.7 0 0 0-2.6 1c-.4 1.7-2.9 1.7-3.4 0a1.7 1.7 0 0 0-2.6-1c-1.5.9-3.3-.8-2.4-2.4a1.7 1.7 0 0 0-1-2.6c-1.7-.4-1.7-2.9 0-3.4a1.7 1.7 0 0 0 1-2.6c-.9-1.5.8-3.3 2.4-2.4a1.7 1.7 0 0 0 2.6-1ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'),
  search: P('M21 21l-4.3-4.3M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z'),
  plus: P('M12 5v14M5 12h14'),
  minus: P('M5 12h14'),
  close: P('M6 6l12 12M6 18L18 6'),
  check: P('M5 12.5l4.5 4.5L19 7.5'),
  'chevron-left': P('M15 6l-6 6 6 6'),
  'chevron-right': P('M9 6l6 6-6 6'),
  'chevron-down': P('M6 9l6 6 6-6'),
  'chevron-up': P('M6 15l6-6 6 6'),
  sun: P('M12 4V2m0 20v-2m8-8h2M2 12h2m14.2-6.2 1.4-1.4M4.4 19.6l1.4-1.4m0-12.8L4.4 4M19.6 19.6l-1.4-1.4M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z'),
  moon: P('M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z'),
  density: P('M3 6h18M3 12h18M3 18h18'),
  filter: P('M4 5h16l-6 8v5l-4 2v-7L4 5Z'),
  'filter-2': P('M4 6h16M7 12h10m-7 6h4'),
  download: P('M12 3v12m0 0 4-4m-4 4-4-4M5 21h14'),
  upload: P('M12 21V9m0 0 4 4m-4-4-4 4M5 3h14'),
  'arrow-up': P('M12 19V5m0 0-6 6m6-6 6 6'),
  'arrow-down': P('M12 5v14m0 0-6-6m6 6 6-6'),
  'arrow-right': P('M5 12h14m0 0-6-6m6 6-6 6'),
  'trend-up': P('M3 17l6-6 4 4 8-8m0 0h-5m5 0v5'),
  'trend-down': P('M3 7l6 6 4-4 8 8m0 0h-5m5 0v-5'),
  play: P('M7 4.5v15l13-7.5-13-7.5Z'),
  pause: P('M8 4h3v16H8zm5 0h3v16h-3z'),
  pin: P('M12 21V14m0 0a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z'),
  shield: P('M12 3 4 6v6c0 4.5 3.2 8.3 8 9 4.8-.7 8-4.5 8-9V6l-8-3Z'),
  sign: P('M4 20h16M6 16c1-2 3-8 6-8s5 6 6 8'),
  bolt: P('M13 3 4 14h7l-1 7 9-11h-7l1-7Z'),
  wifi: P('M12 18h.01M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a15 15 0 0 1 20 0'),
  refresh: P('M20 11A8 8 0 0 0 6 6.3L4 8m0-4v4h4M4 13a8 8 0 0 0 14 4.7L20 16m0 4v-4h-4'),
  more: P('M5 12h.01M12 12h.01M19 12h.01'),
  external: P('M14 4h6v6M10 14 20 4M17 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h5'),
  star: P('M12 3.5 14.5 9 20 9.8l-4 3.9.9 5.6L12 16.8 7.1 19.3 8 13.7 4 9.8l5.5-.8L12 3.5Z'),
  eye: P('M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z'),
  'eye-off': P('M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22'),
  pdf: P('M9 13v4m3-4v4m3-4h-2m0 0v4m2-2h-2m-6-9H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5'),
};

export const Icon: React.FC<{ name: IconName; className?: string; size?: number; strokeWidth?: number }> = ({
  name,
  className,
  size = 18,
  strokeWidth,
}) => {
  const node = MAP[name];
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {node}
    </svg>
  );
};
