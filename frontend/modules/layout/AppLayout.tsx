import React, { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { canAccessModule, type ModuleKey } from '@/domain/appRole';
import { useAuthSession } from '@/modules/auth/AuthContext';
import { setLanguage } from '@/i18n';
import { useUIPrefs } from '@/providers/UIPreferencesProvider';
import { Icon, type IconName } from '@/modules/shared/components/Icon';
import { ThemeToggle } from '@/modules/shared/components/ThemeToggle';
import { DensityToggle } from '@/modules/shared/components/DensityToggle';
import { CommandPalette, useCommandPaletteShortcut } from '@/modules/shared/components/CommandPalette';
import { AICopilotDrawer, AICopilotFab } from '@/modules/shared/components/AICopilot';
import { AppBreadcrumbs } from '@/modules/layout/AppBreadcrumbs';
import { notificationsApi } from '@/services/notificationsApi';
import { maintenanceApi } from '@/services/maintenanceApi';
import { isExperimentalEnabled, isModuleHiddenInDemo } from '@/config/runtimeFlags';

type NavItem = { to: string; module: ModuleKey; labelKey: string; icon: IconName };
type NavGroup = { key: string; labelKey: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    key: 'overview',
    labelKey: 'nav.group.overview',
    items: [{ to: '/dashboard', module: 'dashboard', labelKey: 'nav.dashboard', icon: 'home' }],
  },
  {
    key: 'operations',
    labelKey: 'nav.group.operations',
    items: [
      { to: '/fleet', module: 'fleet', labelKey: 'nav.fleet', icon: 'car' },
      { to: '/fleet/compliance', module: 'fleet', labelKey: 'nav.fleetCompliance', icon: 'shield' },
      { to: '/fleet/sub-rentals', module: 'subRentals', labelKey: 'nav.subRentals', icon: 'key' },
      { to: '/gps', module: 'gps', labelKey: 'nav.gps', icon: 'map' },
      { to: '/customers', module: 'customers', labelKey: 'nav.customers', icon: 'users' },
      { to: '/contracts', module: 'contracts', labelKey: 'nav.contracts', icon: 'doc' },
      { to: '/rentals', module: 'rentals', labelKey: 'nav.rentals', icon: 'key' },
      { to: '/used-cars', module: 'usedCars', labelKey: 'nav.usedCars', icon: 'marketplace' },
    ],
  },
  {
    key: 'finance',
    labelKey: 'nav.group.finance',
    items: [
      { to: '/credit', module: 'credit', labelKey: 'nav.credit', icon: 'credit' },
      { to: '/finance', module: 'finance', labelKey: 'nav.finance', icon: 'coin' },
      { to: '/finance/fixed-charges', module: 'finance', labelKey: 'nav.fixedCharges', icon: 'coin' },
      { to: '/accounting', module: 'accounting', labelKey: 'nav.accounting', icon: 'coin' },
      { to: '/arrears', module: 'arrears', labelKey: 'nav.arrears', icon: 'alert' },
    ],
  },
  {
    key: 'intelligence',
    labelKey: 'nav.group.intelligence',
    items: [
      { to: '/ai', module: 'ai', labelKey: 'nav.ai', icon: 'sparkles' },
      { to: '/mobile-ops', module: 'mobileOps', labelKey: 'nav.mobileOps', icon: 'mobile' },
    ],
  },
  {
    key: 'system',
    labelKey: 'nav.group.system',
    items: [
      { to: '/notifications', module: 'notifications', labelKey: 'nav.notifications', icon: 'bell' },
      { to: '/documents', module: 'documents', labelKey: 'nav.documents', icon: 'doc' },
      { to: '/audit', module: 'audit', labelKey: 'nav.audit', icon: 'audit' },
      { to: '/settings', module: 'settings', labelKey: 'nav.settings', icon: 'gear' },
    ],
  },
];

function useBreadcrumb(): { group: string; current: string } {
  const { t } = useTranslation();
  const loc = useLocation();
  const all = GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, groupKey: g.labelKey })));
  const match = all.find((it) => loc.pathname === it.to || loc.pathname.startsWith(it.to + '/'));
  return {
    group: match ? t(match.groupKey) : t('app.name'),
    current: match ? t(match.labelKey) : t('app.name'),
  };
}

export const AppLayout: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { session, logout } = useAuthSession();
  const navigate = useNavigate();
  const { theme, sidebarCollapsed, toggleSidebar } = useUIPrefs();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const crumb = useBreadcrumb();

  useCommandPaletteShortcut(() => setCmdOpen(true));

  const groups = useMemo(() => {
    const role = session?.user.role ?? 'AGENT_COMMERCIAL';
    const showExperimental = isExperimentalEnabled();
    return GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((it) => {
        if (it.module === 'ai' && !showExperimental) return false;
        if (isModuleHiddenInDemo(it.module)) return false;
        return canAccessModule(role, it.module);
      }),
    })).filter((g) => g.items.length > 0);
  }, [session?.user.role]);

  const unreadQ = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => notificationsApi.unreadCount(),
    refetchInterval: 30000,
  });
  const unreadCount = unreadQ.data?.data?.unread ?? 0;
  const maintenanceQ = useQuery({
    queryKey: ['fleet', 'maintenance', 'alerts', 'badge'],
    queryFn: () => maintenanceApi.alerts(),
    refetchInterval: 60000,
  });
  const criticalMaintenanceCount = maintenanceQ.data?.data?.criticalAlertsCount ?? 0;

  const renderNavLink = (it: NavItem) => (
    <NavLink
      to={it.to}
      className={({ isActive }) => `df-nav-link ${isActive ? 'df-nav-link--active' : ''}`}
      onClick={() => setMobileOpen(false)}
      title={sidebarCollapsed ? t(it.labelKey) : undefined}
    >
      <Icon name={it.icon} size={18} />
      {!sidebarCollapsed && <span className="truncate">{t(it.labelKey)}</span>}
      {!sidebarCollapsed && it.to === '/fleet' && criticalMaintenanceCount > 0 && (
        <span className="ms-auto rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
          {criticalMaintenanceCount > 99 ? '99+' : criticalMaintenanceCount}
        </span>
      )}
    </NavLink>
  );

  const Sidebar = (
    <aside className="df-sidebar">
      <div className="flex items-center gap-3 px-4 py-4">
        <div className="df-heroMark flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl">
          <Icon name="bolt" size={20} />
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <div className="text-sm font-black tracking-tight text-[color:var(--df-text)]">DriveFlow <span className="text-[10px] font-bold text-[color:var(--df-text-faint)]">OS</span></div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[color:var(--df-text-faint)]">Automobile & Leasing</div>
          </div>
        )}
      </div>

      <div className="mx-3 mb-3">
        <button
          type="button"
          onClick={() => setCmdOpen(true)}
          className="flex h-10 w-full items-center gap-2 rounded-xl border border-[color:var(--df-border-strong)] bg-[color:var(--df-surface-sunk)] px-3 text-[12px] text-[color:var(--df-text-muted)] transition hover:bg-[color:var(--df-surface)]"
        >
          <Icon name="search" size={14} />
          {!sidebarCollapsed && <span className="flex-1 text-start">Rechercher…</span>}
          {!sidebarCollapsed && <span className="df-kbd">⌘K</span>}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-1">
        {groups.map((g) => (
          <div key={g.key} className="mb-3">
            {!sidebarCollapsed && <div className="df-nav-section">{t(g.labelKey)}</div>}
            <div className="flex flex-col gap-0.5">
              {g.items.map((it) => (
                <React.Fragment key={it.to}>{renderNavLink(it)}</React.Fragment>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-[color:var(--df-border)] p-3">
        {!sidebarCollapsed && (
          <div className="mb-3 relative group">
            <div className="flex items-center gap-3 rounded-2xl border border-[color:var(--df-border)] bg-[color:var(--df-surface)] p-2.5 cursor-pointer hover:border-[color:var(--df-brand-500)] transition-colors">
              <img
                src={session?.user.avatar ?? `https://i.pravatar.cc/100?u=${encodeURIComponent(session?.user.email ?? '')}`}
                alt=""
                className="h-9 w-9 rounded-xl border border-[color:var(--df-border)] flex-shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold">{session?.user.name}</div>
                <div className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--df-text-faint)]">
                  {session?.user.role.replaceAll('_', ' ')}
                </div>
              </div>
              <Icon name="chevron-up" size={12} className="text-[color:var(--df-text-faint)] flex-shrink-0" />
            </div>
            {/* Dropdown */}
            <div className="absolute bottom-full left-0 right-0 mb-1 hidden group-hover:block z-50">
              <div className="rounded-2xl border border-[color:var(--df-border)] bg-[color:var(--df-surface-solid)] shadow-2xl overflow-hidden py-1">
                <NavLink to="/profile" className="flex items-center gap-3 px-4 py-2.5 text-[13px] font-semibold hover:bg-[color:var(--df-surface-elev)] transition-colors">
                  <Icon name="user" size={14} className="text-[color:var(--df-text-faint)]" />
                  Mon profil
                </NavLink>
                <NavLink to="/agence" className="flex items-center gap-3 px-4 py-2.5 text-[13px] font-semibold hover:bg-[color:var(--df-surface-elev)] transition-colors">
                  <Icon name="pin" size={14} className="text-[color:var(--df-text-faint)]" />
                  Mon agence
                </NavLink>
                <div className="h-px bg-[color:var(--df-border)] my-1" />
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-[13px] font-semibold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                >
                  <Icon name="log-out" size={14} />
                  Déconnexion
                </button>
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={toggleSidebar}
          className="df-btn df-btn--subtle df-btn--sm w-full"
        >
          <Icon name={sidebarCollapsed ? 'chevron-right' : 'chevron-left'} size={14} />
          {!sidebarCollapsed && 'Réduire'}
        </button>
      </div>
    </aside>
  );

  return (
    <div
      className="df-shell"
      data-sidebar={sidebarCollapsed ? 'collapsed' : 'expanded'}
    >
      {/* Desktop sidebar */}
      <div className="hidden md:block">{Sidebar}</div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button type="button" className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm" aria-label="close" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-[86%] max-w-sm flex-col bg-[color:var(--df-surface-solid)] shadow-2xl">
            {Sidebar}
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-col">
        {/* Top bar */}
        <header className="df-topbar flex items-center gap-3 px-4 md:px-6">
          <button
            type="button"
            className="df-btn df-btn--subtle df-btn--sm df-btn--icon md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="menu"
          >
            <Icon name="density" size={16} />
          </button>

          <div className="min-w-0 flex-1">
            <div className="df-crumb">
              <span>{crumb.group}</span>
              <span className="df-crumb__sep"><Icon name="chevron-right" size={12} /></span>
              <span className="df-crumb__current">{crumb.current}</span>
            </div>
          </div>

          <button
            type="button"
            className="df-btn df-btn--ghost df-btn--sm hidden lg:inline-flex"
            onClick={() => setCmdOpen(true)}
          >
            <Icon name="search" size={14} />
            <span>Rechercher</span>
            <span className="df-kbd">⌘K</span>
          </button>

          <ThemeToggle />

          <div className="hidden sm:flex rounded-xl border border-[color:var(--df-border-strong)] bg-[color:var(--df-surface-sunk)] p-0.5">
            {(['fr', 'en', 'ar'] as const).map((lng) => {
              const active = i18n.language.startsWith(lng);
              return (
                <button
                  key={lng}
                  type="button"
                  onClick={() => setLanguage(lng)}
                  className={`h-8 px-2 text-[10px] font-black uppercase tracking-[0.14em] rounded-lg transition ${
                    active ? 'bg-[color:var(--df-surface-elev)] text-[color:var(--df-text)] shadow' : 'text-[color:var(--df-text-muted)]'
                  }`}
                >
                  {lng}
                </button>
              );
            })}
          </div>

          <button type="button" className="df-btn df-btn--subtle df-btn--sm df-btn--icon relative" aria-label="Notifications" onClick={() => navigate('/notifications')}>
            <Icon name="bell" size={16} />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -end-1.5 min-w-4 rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-[color:var(--df-surface-solid)]">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              void (async () => {
                await logout();
                navigate('/login', { replace: true });
              })();
            }}
            className="df-btn df-btn--ghost df-btn--sm"
          >
            <Icon name="external" size={14} />
            <span className="hidden md:inline">{t('auth.logout')}</span>
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
            <div className="mb-4">
              <AppBreadcrumbs />
            </div>
            <Outlet />
          </div>
        </main>
      </div>

      {/* Global AI copilot FAB */}
      {isExperimentalEnabled() && (
        <>
          <AICopilotFab onClick={() => setAiOpen(true)} />
          <AICopilotDrawer open={aiOpen} onClose={() => setAiOpen(false)} />
        </>
      )}

      {/* Command palette */}
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />

      {/* Theme chrome tweak: meta */}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '${theme === 'dark' ? '#05060d' : '#ffffff'}');`,
        }}
      />
    </div>
  );
};
