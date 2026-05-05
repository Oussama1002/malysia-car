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
};

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
  // Home crumb points at "/" (which redirects to /dashboard) so it never
  // collides with a segment crumb when the user is sitting on /dashboard.
  const items: { to: string; label: string }[] = [{ to: '/', label: t('shell.home') }];

  let acc = '';
  for (const seg of segments) {
    acc = `${acc}/${seg}`;
    const k = NAV_KEYS[seg] ?? `shell.segment.${seg}`;
    const label = t(k, { defaultValue: seg });
    items.push({ to: acc, label: String(label) });
  }

  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-600" aria-label="Breadcrumb">
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          // Compose the key with the index to stay safe against any future
          // pathname that legitimately contains a repeated segment.
          <span key={`${i}-${item.to}`} className="flex items-center gap-2">
            {i > 0 && <span className="text-slate-300">/</span>}
            {last ? (
              <span className="font-semibold text-slate-900">{item.label}</span>
            ) : (
              <Link to={item.to} className="font-medium text-indigo-700 hover:underline">
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
};
