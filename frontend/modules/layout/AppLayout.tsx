import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { canAccessModule } from '@/domain/appRole';
import { useAuthSession } from '@/modules/auth/AuthContext';
import { setLanguage } from '@/i18n';
import { useUIPrefs } from '@/providers/UIPreferencesProvider';
import { Icon } from '@/modules/shared/components/Icon';
import { ThemeToggle } from '@/modules/shared/components/ThemeToggle';
import { DensityToggle } from '@/modules/shared/components/DensityToggle';
import { CommandPalette, useCommandPaletteShortcut } from '@/modules/shared/components/CommandPalette';
import { AICopilotDrawer, AICopilotFab } from '@/modules/shared/components/AICopilot';
import { AppBreadcrumbs } from '@/modules/layout/AppBreadcrumbs';
import { GROUPS, type NavItem } from '@/modules/layout/navConfig';
import { notificationsApi, type NotificationDto } from '@/services/notificationsApi';
import { chatApi } from '@/services/chatApi';
import { maintenanceApi } from '@/services/maintenanceApi';
import { isExperimentalEnabled, isModuleHiddenInDemo } from '@/config/runtimeFlags';

// Departments/sub-departments now live in navConfig.ts (shared with the
// Départements hub page). GROUPS + NavItem are imported above.

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
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const crumb = useBreadcrumb();

  // Collapsible sidebar department groups (persisted). A group key present in
  // the set is collapsed; absent = expanded (default all expanded).
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('df.sidebar.collapsedGroups');
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
    } catch {
      return new Set<string>();
    }
  });
  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem('df.sidebar.collapsedGroups', JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

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
  const chatUnreadQ = useQuery({
    queryKey: ['chat', 'unread-count'],
    queryFn: () => chatApi.unreadCount(),
    refetchInterval: 20000,
  });
  const chatUnread = chatUnreadQ.data?.data?.unread ?? 0;
  const maintenanceQ = useQuery({
    queryKey: ['fleet', 'maintenance', 'alerts', 'badge'],
    queryFn: () => maintenanceApi.alerts(),
    refetchInterval: 60000,
  });
  const criticalMaintenanceCount = maintenanceQ.data?.data?.criticalAlertsCount ?? 0;

  const carteGriseQ = useQuery({
    queryKey: ['fleet', 'carte-grise-pending'],
    queryFn: async () => {
      const { apiClient: api, getApiBase: base } = await import('@/services/apiClient');
      if (!base()) return [];
      const res = await api<{ data: any[] }>('/v1/vehicles?per_page=200');
      return res.data.filter((v: any) => !v.registration_card_number && !v.registrationCard && !v.registration_card);
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const carteGrisePending = carteGriseQ.data ?? [];

  const queryClient = useQueryClient();
  const notifListQ = useQuery({
    queryKey: ['notifications', 'popup'],
    queryFn: () => notificationsApi.list({ per_page: 8 }),
    enabled: notifOpen,
    refetchInterval: notifOpen ? 15000 : false,
  });
  const popupNotifs: NotificationDto[] = (notifListQ.data as any)?.data ?? [];

  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [notifOpen]);

  const handleMarkRead = async (id: string) => {
    await notificationsApi.markRead(id);
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const handleMarkAllRead = async () => {
    await notificationsApi.markAllRead();
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "À l'instant";
    if (mins < 60) return `Il y a ${mins}min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Il y a ${hours}h`;
    const days = Math.floor(hours / 24);
    return `Il y a ${days}j`;
  };

  const translateNotifText = (text: string, payload?: Record<string, unknown> | null) => {
    const types: Record<string, string> = { OIL_CHANGE:'Vidange', TIRES:'Pneus', BRAKES:'Freins', FILTER:'Filtre', BATTERY:'Batterie', TIMING_BELT:'Courroie de distribution', TECH_CONTROL:'Contrôle technique', INSPECTION:'Inspection' };
    let t = text;
    for (const [code, fr] of Object.entries(types)) t = t.replace(new RegExp(`\\b${code}\\b`, 'g'), fr);
    t = t.replace(/Entretien bientot du\b/g, 'Entretien bientôt dû').replace(/Entretien depasse\b/g, 'Entretien dépassé').replace(/Vehicule\b/g, 'Véhicule').replace(/expiree\b/gi, 'expirée').replace(/bientot/gi, 'bientôt');
    if (payload) {
      const brand = payload.vehicle_brand as string | undefined;
      const model = payload.vehicle_model as string | undefined;
      const reg = payload.registration_number as string | undefined;
      const vLabel = [brand, model].filter(Boolean).join(' ');
      if (vLabel && reg) {
        const escaped = reg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        t = t.replace(new RegExp(`pour\\s+${escaped}\\b`), `pour ${vLabel} (${reg})`);
        t = t.replace(new RegExp(`Véhicule\\s+${escaped}\\b`), `Véhicule ${vLabel} (${reg})`);
      }
    }
    return t;
  };

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
        {groups.map((g) => {
          // Collapsed icon-rail: no room for dropdown headers, show items flat.
          if (sidebarCollapsed) {
            return (
              <div key={g.key} className="mb-3 flex flex-col gap-0.5">
                {g.items.map((it) => (
                  <React.Fragment key={it.to}>{renderNavLink(it)}</React.Fragment>
                ))}
              </div>
            );
          }
          const open = !collapsedGroups.has(g.key);
          return (
            <div key={g.key} className="mb-1.5">
              <button
                type="button"
                onClick={() => toggleGroup(g.key)}
                className="df-nav-link w-full"
                aria-expanded={open}
              >
                <Icon name={g.icon} size={18} />
                <span className="truncate">{t(g.labelKey)}</span>
                <Icon name="chevron-down" size={14}
                  className={`ms-auto text-[color:var(--df-text-faint)] transition-transform ${open ? '' : '-rotate-90'}`} />
              </button>
              {open && (
                <div className="mt-0.5 flex flex-col gap-0.5 ps-3">
                  {g.items.map((it) => (
                    <React.Fragment key={it.to}>{renderNavLink(it)}</React.Fragment>
                  ))}
                </div>
              )}
            </div>
          );
        })}
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

          <button
            type="button"
            className="df-btn df-btn--subtle df-btn--sm df-btn--icon relative"
            aria-label="Discussions"
            title="Discussions"
            onClick={() => navigate('/chat')}
          >
            <Icon name="chat" size={16} />
            {chatUnread > 0 && (
              <span className="absolute -top-1.5 -end-1.5 min-w-4 rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-[color:var(--df-surface-solid)]">
                {chatUnread > 99 ? '99+' : chatUnread}
              </span>
            )}
          </button>

          <div className="relative" ref={notifRef}>
            <button type="button" className="df-btn df-btn--subtle df-btn--sm df-btn--icon relative" aria-label="Notifications" onClick={() => setNotifOpen((v) => !v)}>
              <Icon name="bell" size={16} />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -end-1.5 min-w-4 rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-[color:var(--df-surface-solid)]">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="absolute end-0 top-full mt-2 w-[380px] rounded-2xl border border-[color:var(--df-border)] bg-[color:var(--df-surface-solid)] shadow-2xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--df-border)]">
                  <h3 className="text-[13px] font-bold text-[color:var(--df-text)]">Notifications</h3>
                  {unreadCount > 0 && (
                    <button type="button" onClick={handleMarkAllRead} className="text-[11px] font-semibold text-[color:var(--df-brand-500)] hover:underline">
                      Tout marquer comme lu
                    </button>
                  )}
                </div>

                <div className="max-h-[360px] overflow-y-auto">
                  {popupNotifs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-[color:var(--df-text-muted)]">
                      <Icon name="bell" size={28} className="mb-2 opacity-30" />
                      <p className="text-[12px] font-semibold">Aucune notification</p>
                    </div>
                  ) : (
                    popupNotifs.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        className={`w-full text-start flex gap-3 px-4 py-3 transition hover:bg-[color:var(--df-surface-elev)] ${!n.read_at ? 'bg-[color:var(--df-brand-500)]/[0.04]' : ''}`}
                        onClick={() => {
                          if (!n.read_at) handleMarkRead(n.id);
                          if (n.link_url) navigate(n.link_url);
                          setNotifOpen(false);
                        }}
                      >
                        <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${!n.read_at ? 'bg-[color:var(--df-brand-500)]' : 'bg-transparent'}`} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-[12.5px] leading-snug ${!n.read_at ? 'font-bold text-[color:var(--df-text)]' : 'font-medium text-[color:var(--df-text-muted)]'}`}>
                            {translateNotifText(n.title, n.payload)}
                          </p>
                          {n.body && (
                            <p className="mt-0.5 text-[11.5px] text-[color:var(--df-text-faint)] line-clamp-2">{translateNotifText(n.body, n.payload)}</p>
                          )}
                          <p className="mt-1 text-[10px] font-semibold text-[color:var(--df-text-faint)]">{formatTimeAgo(n.created_at)}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div className="border-t border-[color:var(--df-border)]">
                  <button
                    type="button"
                    className="w-full py-3 text-center text-[12px] font-bold text-[color:var(--df-brand-500)] hover:bg-[color:var(--df-surface-elev)] transition"
                    onClick={() => { setNotifOpen(false); navigate('/notifications'); }}
                  >
                    Voir tout
                  </button>
                </div>
              </div>
            )}
          </div>

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

        {carteGrisePending.length > 0 && (
          <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 dark:border-amber-900 dark:bg-amber-950/40">
            <span className="text-lg">⚠️</span>
            <p className="flex-1 text-[12.5px] font-semibold text-amber-900 dark:text-amber-300">
              {carteGrisePending.length === 1
                ? `1 véhicule sans carte grise — ${(carteGrisePending[0] as any).registration ?? ''}`
                : `${carteGrisePending.length} véhicules sans carte grise`}
              {' '}· Statut <strong>En attente</strong> — uploadez le document pour lever cette alerte.
            </p>
            <NavLink
              to="/fleet"
              className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-black text-white hover:bg-amber-700"
            >
              Voir le parc →
            </NavLink>
          </div>
        )}

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
