import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const NAV_KEYS: Record<string, string> = {
  dashboard: 'nav.dashboard',
  fleet: 'nav.fleet',
  compliance: 'nav.fleetCompliance',
  customers: 'nav.customers',
  contracts: 'nav.contracts',
  credit: 'nav.credit',
  finance: 'nav.finance',
  arrears: 'nav.arrears',
  'used-cars': 'nav.usedCars',
  gps: 'nav.gps',
  ai: 'nav.ai',
  'mobile-ops': 'nav.mobileOps',
  notifications: 'nav.notifications',
  documents: 'nav.documents',
  settings: 'nav.settings',
  audit: 'nav.audit',
  rentals: 'nav.rentals',
  new: 'shell.new',
  users: 'shell.userManagement',
  templates: 'shell.templates',
  vehicles: 'nav.fleet',
  branches: 'shell.branches',
  roles: 'shell.roles',
  'sub-rentals': 'nav.subRentals',
};

/** Prefix shown in the breadcrumb for each parent resource segment */
const ID_PREFIX: Record<string, string> = {
  customers: 'CLT',
  fleet: 'VHL',
  contracts: 'CTR',
  rentals: 'RES',
  'sub-rentals': 'SUB',
  credit: 'CRD',
  users: 'USR',
  arrears: 'IMP',
  documents: 'DOC',
};

/** True if the segment looks like a UUID or a long hex/numeric ID */
function isIdSegment(seg: string): boolean {
  // Full UUID v4 pattern
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return true;
  // Long bare hex string (no dashes, 16+ chars)
  if (/^[0-9a-f]{16,}$/i.test(seg)) return true;
  // Pure integer ID ≥ 4 digits
  if (/^\d{4,}$/.test(seg)) return true;
  return false;
}

/** Return a short professional ID label from a raw segment + its parent segment */
function shortId(seg: string, parentSeg: string): string {
  const prefix = ID_PREFIX[parentSeg] ?? 'ID';
  // Strip dashes and take the first 8 hex chars
  const hex = seg.replace(/-/g, '').slice(0, 8).toUpperCase();
  return `${prefix}-${hex}`;
}

/**
 * Breadcrumb path segments → i18n labels. Extend `NAV_KEYS` as you add deep routes.
 */
export const AppBreadcrumbs: React.FC = () => {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  if (pathname === '/' || pathname === '/login') {
    return null;
  }
  const segments = pathname.split('/').filter(Boolean);
  const items: { to: string; label: string; isId: boolean }[] = [
    { to: '/', label: t('shell.home'), isId: false },
  ];

  let acc = '';
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    acc = `${acc}/${seg}`;

    if (isIdSegment(seg)) {
      const parentSeg = segments[i - 1] ?? '';
      items.push({ to: acc, label: shortId(seg, parentSeg), isId: true });
    } else {
      const k = NAV_KEYS[seg] ?? `shell.segment.${seg}`;
      items.push({ to: acc, label: String(t(k, { defaultValue: seg })), isId: false });
    }
  }

  return (
    <nav className="flex flex-wrap items-center gap-1.5 text-sm text-slate-600" aria-label="Breadcrumb">
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <span key={`${i}-${item.to}`} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-slate-300">/</span>}
            {last ? (
              <span className={`font-semibold text-slate-900 ${item.isId ? 'font-mono text-[12px] tracking-tight' : ''}`}>
                {item.label}
              </span>
            ) : (
              <Link
                to={item.to}
                className={`font-medium text-indigo-700 hover:underline ${item.isId ? 'font-mono text-[12px] tracking-tight' : ''}`}
              >
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
};
