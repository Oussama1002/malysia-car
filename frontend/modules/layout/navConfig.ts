import { type ModuleKey } from '@/domain/appRole';
import { type IconName } from '@/modules/shared/components/Icon';

export type NavItem = { to: string; module: ModuleKey; labelKey: string; icon: IconName };
export type NavGroup = { key: string; labelKey: string; icon: IconName; items: NavItem[] };

/**
 * Single source of truth for the app's departments (groups) and their
 * sub-departments (modules). Consumed by the sidebar (AppLayout) and the
 * Départements hub page. Each group carries a department-level icon chosen to
 * match its meaning; each item keeps its own module icon.
 */
export const GROUPS: NavGroup[] = [
  {
    key: 'overview',
    labelKey: 'nav.group.overview',
    icon: 'home',
    items: [{ to: '/dashboard', module: 'dashboard', labelKey: 'nav.dashboard', icon: 'home' }],
  },
  {
    key: 'operations',
    labelKey: 'nav.group.operations',
    icon: 'car',
    items: [
      { to: '/fleet', module: 'fleet', labelKey: 'nav.fleet', icon: 'car' },
      { to: '/fleet/sub-rentals', module: 'subRentals', labelKey: 'nav.subRentals', icon: 'key' },
      { to: '/gps', module: 'gps', labelKey: 'nav.gps', icon: 'map' },
      { to: '/customers', module: 'customers', labelKey: 'nav.customers', icon: 'users' },
      { to: '/contracts', module: 'contracts', labelKey: 'nav.contractsSidebar', icon: 'calendar' },
      { to: '/used-cars', module: 'usedCars', labelKey: 'nav.usedCars', icon: 'marketplace' },
    ],
  },
  {
    key: 'finance',
    labelKey: 'nav.group.finance',
    icon: 'coin',
    items: [
      { to: '/credit', module: 'credit', labelKey: 'nav.credit', icon: 'credit' },
      { to: '/finance', module: 'finance', labelKey: 'nav.finance', icon: 'coin' },
      { to: '/finance/fixed-charges', module: 'finance', labelKey: 'nav.fixedCharges', icon: 'receipt' },
      { to: '/accounting', module: 'accounting', labelKey: 'nav.accounting', icon: 'calculator' },
      { to: '/arrears', module: 'arrears', labelKey: 'nav.arrears', icon: 'alert' },
    ],
  },
  {
    key: 'intelligence',
    labelKey: 'nav.group.intelligence',
    icon: 'sparkles',
    items: [
      { to: '/ai', module: 'ai', labelKey: 'nav.ai', icon: 'sparkles' },
      { to: '/mobile-ops', module: 'mobileOps', labelKey: 'nav.mobileOps', icon: 'mobile' },
    ],
  },
  {
    key: 'system',
    labelKey: 'nav.group.system',
    icon: 'gear',
    items: [
      { to: '/notifications', module: 'notifications', labelKey: 'nav.notifications', icon: 'bell' },
      { to: '/documents', module: 'documents', labelKey: 'nav.documents', icon: 'folder' },
      { to: '/documents/reader', module: 'documents', labelKey: 'nav.documentReader', icon: 'scan' },
      { to: '/audit', module: 'audit', labelKey: 'nav.audit', icon: 'audit' },
      { to: '/settings', module: 'settings', labelKey: 'nav.settings', icon: 'gear' },
    ],
  },
];
