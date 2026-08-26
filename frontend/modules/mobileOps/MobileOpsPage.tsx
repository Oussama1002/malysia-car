import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthSession } from '@/modules/auth/AuthContext';
import { getApiBase } from '@/services/apiClient';
import { chatApi } from '@/services/chatApi';
import { notificationsApi } from '@/services/notificationsApi';
import { Icon, type IconName } from '@/modules/shared/components/Icon';
import { AgentMobileView } from './views/AgentMobileView';
import { AdminOpsView } from './views/AdminOpsView';

/**
 * DriveFlow Mobile — mini-app hub for field operations.
 *
 * Mobile-only surface: on tablets and desktops it renders a "please use on
 * mobile" gate. On phones it acts as a full-screen launcher for the CRM with
 * a bottom tab bar (Accueil, Missions, Scanner, Chat, Profil).
 *
 * The AGENT_LIVRAISON role keeps its dedicated mission workflow; other roles
 * see the admin monitoring view under the Missions tab.
 */

type Tab = 'home' | 'missions' | 'scanner' | 'chat' | 'profile';

type AppTile = {
  to: string;
  icon: IconName;
  label: string;
  tone: string;
};

const APPS: AppTile[] = [
  { to: '/contracts?tab=locations', icon: 'calendar',    label: 'Réservations',   tone: '#5b5bf4' },
  { to: '/customers',               icon: 'users',       label: 'Clients',        tone: '#22c55e' },
  { to: '/fleet',                   icon: 'car',         label: 'Flotte',         tone: '#f59e0b' },
  { to: '/contracts',               icon: 'sign',        label: 'Contrats',       tone: '#06b6d4' },
  { to: '/finance/payments',        icon: 'coin',        label: 'Paiements',      tone: '#10b981' },
  { to: '/documents',               icon: 'folder',      label: 'Documents',      tone: '#8b5cf6' },
  { to: '/documents/reader',        icon: 'scan',        label: 'Scanner',        tone: '#ec4899' },
  { to: '/gps',                     icon: 'map',         label: 'GPS',            tone: '#0ea5e9' },
  { to: '/chat',                    icon: 'chat',        label: 'Discussions',    tone: '#3b82f6' },
  { to: '/notifications',           icon: 'bell',        label: 'Notifications',  tone: '#f43f5e' },
  { to: '/dashboard',               icon: 'home',        label: 'Tableau',        tone: '#6366f1' },
  { to: '/profile',                 icon: 'user',        label: 'Profil',         tone: '#64748b' },
];

/* ─────────────────────────────────────────────────────────────────────── */

export const MobileOpsPage: React.FC = () => {
  const isMobile = useIsMobile();
  if (!isMobile) return <MobileOnlyGate />;
  return <MobileApp />;
};

/* ─── Mobile detection ────────────────────────────────────────────────── */

function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return mobile;
}

/* ─── Desktop gate ────────────────────────────────────────────────────── */

const MobileOnlyGate: React.FC = () => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
    <div className="relative">
      <div className="flex h-64 w-32 items-center justify-center rounded-[2.5rem] border-[6px] border-slate-800 bg-slate-900 shadow-2xl">
        <Icon name="mobile" size={56} className="text-indigo-400" />
      </div>
      <div className="absolute -bottom-2 left-1/2 h-1.5 w-16 -translate-x-1/2 rounded-full bg-slate-700" />
    </div>
    <div className="max-w-md space-y-2">
      <h1 className="text-2xl font-black text-slate-900">DriveFlow Mobile</h1>
      <p className="text-sm text-slate-500">
        Cette expérience est optimisée pour le terrain. Ouvrez DriveFlow sur votre téléphone
        pour accéder au mini-app des opérations avec l'ensemble des modules CRM à portée de main.
      </p>
    </div>
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
      💡 Astuce : réduisez la fenêtre à moins de 768&nbsp;px pour prévisualiser sur ordinateur.
    </div>
  </div>
);

/* ─── Mobile app shell ────────────────────────────────────────────────── */

const MobileApp: React.FC = () => {
  const { session } = useAuthSession();
  const [tab, setTab] = useState<Tab>('home');
  const apiReady = !!getApiBase();

  const chatUnreadQ = useQuery({
    queryKey: ['chat', 'unread-count'],
    queryFn: () => chatApi.unreadCount(),
    refetchInterval: 30000,
    enabled: apiReady,
  });
  const chatUnread = chatUnreadQ.data?.data?.unread ?? 0;

  const notifUnreadQ = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => notificationsApi.unreadCount(),
    refetchInterval: 30000,
    enabled: apiReady,
  });
  const notifUnread = notifUnreadQ.data?.data?.unread ?? 0;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-50">
      <MobileHeader user={session?.user} />

      <main className="flex-1 overflow-y-auto pb-24">
        {tab === 'home'     && <HomeTab notifUnread={notifUnread} chatUnread={chatUnread} />}
        {tab === 'missions' && <MissionsTab />}
        {tab === 'scanner'  && <ScannerTab />}
        {tab === 'chat'     && <ChatTab />}
        {tab === 'profile'  && <ProfileTab />}
      </main>

      <MobileTabBar active={tab} onChange={setTab} chatBadge={chatUnread} />
    </div>
  );
};

/* ─── Header ──────────────────────────────────────────────────────────── */

const MobileHeader: React.FC<{ user?: { name?: string; email?: string; avatar?: string | null } }> = ({ user }) => {
  const navigate = useNavigate();
  return (
    <header
      className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 pb-3 shadow-sm"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
    >
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-md">
        <Icon name="bolt" size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-bold uppercase tracking-widest text-slate-500">DriveFlow</div>
        <div className="truncate text-sm font-black text-slate-900">
          Bonjour {(user?.name ?? '').split(' ')[0] || 'agent'} 👋
        </div>
      </div>
      <button
        type="button"
        onClick={() => navigate('/notifications')}
        className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700"
        aria-label="Notifications"
      >
        <Icon name="bell" size={18} />
      </button>
    </header>
  );
};

/* ─── Bottom tab bar ──────────────────────────────────────────────────── */

const MobileTabBar: React.FC<{
  active: Tab;
  onChange: (t: Tab) => void;
  chatBadge: number;
}> = ({ active, onChange, chatBadge }) => {
  const items: { id: Tab; label: string; icon: IconName; badge?: number }[] = [
    { id: 'home',     label: 'Accueil',  icon: 'home' },
    { id: 'missions', label: 'Missions', icon: 'map' },
    { id: 'scanner',  label: 'Scanner',  icon: 'scan' },
    { id: 'chat',     label: 'Chat',     icon: 'chat', badge: chatBadge },
    { id: 'profile',  label: 'Profil',   icon: 'user' },
  ];
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex items-stretch border-t border-slate-200 bg-white shadow-[0_-2px_16px_rgba(0,0,0,0.06)]"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 6px)' }}
    >
      {items.map((it) => {
        const isActive = active === it.id;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange(it.id)}
            className={`relative flex flex-1 flex-col items-center justify-center gap-1 pb-1.5 pt-2 transition-colors ${
              isActive ? 'text-indigo-600' : 'text-slate-500'
            }`}
          >
            <div className="relative">
              <Icon name={it.icon} size={22} />
              {!!it.badge && it.badge > 0 && (
                <span className="absolute -top-1.5 -right-2 min-w-4 rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white ring-2 ring-white">
                  {it.badge > 9 ? '9+' : it.badge}
                </span>
              )}
            </div>
            <span className={`text-[10px] font-bold ${isActive ? '' : 'text-slate-500'}`}>{it.label}</span>
            {isActive && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-indigo-600" />}
          </button>
        );
      })}
    </nav>
  );
};

/* ─── Home tab (app grid) ─────────────────────────────────────────────── */

const HomeTab: React.FC<{ notifUnread: number; chatUnread: number }> = ({ notifUnread, chatUnread }) => (
  <div className="space-y-5 px-4 pt-4">
    <div className="rounded-2xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-700 p-5 text-white shadow-lg">
      <div className="text-[11px] font-bold uppercase tracking-widest opacity-80">Opérations terrain</div>
      <div className="mt-1 text-lg font-black leading-tight">Toute la CRM dans votre poche</div>
      <div className="mt-3 flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1">
          <Icon name="bell" size={12} />
          <span className="font-bold">{notifUnread}</span> notif.
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1">
          <Icon name="chat" size={12} />
          <span className="font-bold">{chatUnread}</span> messages
        </div>
      </div>
    </div>

    <div>
      <div className="mb-2 px-1 text-[11px] font-bold uppercase tracking-widest text-slate-500">Modules</div>
      <div className="grid grid-cols-3 gap-3">
        {APPS.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm transition active:scale-95"
          >
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-md"
              style={{ background: a.tone }}
            >
              <Icon name={a.icon} size={20} />
            </div>
            <div className="text-center text-[11px] font-bold leading-tight text-slate-800">{a.label}</div>
          </Link>
        ))}
      </div>
    </div>
  </div>
);

/* ─── Missions tab ────────────────────────────────────────────────────── */

const MissionsTab: React.FC = () => {
  const { appRole } = useAuthSession();
  const apiReady = !!getApiBase();

  if (!apiReady) {
    return (
      <div className="m-4 rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        Backend non configuré.
      </div>
    );
  }

  if (appRole === 'AGENT_LIVRAISON') {
    return <div className="p-2"><AgentMobileView /></div>;
  }
  return <div className="p-2"><AdminOpsView /></div>;
};

/* ─── Scanner tab (redirect to reader) ────────────────────────────────── */

const ScannerTab: React.FC = () => (
  <div className="space-y-4 px-4 pt-4">
    <div className="rounded-2xl bg-gradient-to-br from-pink-500 to-fuchsia-600 p-5 text-white shadow-lg">
      <Icon name="scan" size={28} />
      <div className="mt-3 text-lg font-black">Softnovation Document Reader</div>
      <div className="mt-1 text-xs opacity-90">
        Scannez CIN, permis, carte grise, assurance, chèques et attestations directement depuis votre téléphone.
      </div>
    </div>
    <Link
      to="/documents/reader"
      className="flex items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-3.5 text-sm font-black text-white shadow-md active:scale-95"
    >
      <Icon name="scan" size={18} />
      Ouvrir le scanner
    </Link>
    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
      Astuce : la photo doit être nette, cadrée sur l'ensemble du document et sans reflet.
    </div>
  </div>
);

/* ─── Chat tab (link) ─────────────────────────────────────────────────── */

const ChatTab: React.FC = () => (
  <div className="space-y-4 px-4 pt-4">
    <div className="rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 p-5 text-white shadow-lg">
      <Icon name="chat" size={28} />
      <div className="mt-3 text-lg font-black">Discussions internes</div>
      <div className="mt-1 text-xs opacity-90">
        Échangez avec vos collègues, partagez fichiers et photos, coordonnez les livraisons.
      </div>
    </div>
    <Link
      to="/chat"
      className="flex items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3.5 text-sm font-black text-white shadow-md active:scale-95"
    >
      <Icon name="chat" size={18} />
      Ouvrir les discussions
    </Link>
  </div>
);

/* ─── Profile tab ─────────────────────────────────────────────────────── */

const ProfileTab: React.FC = () => {
  const { session, logout } = useAuthSession();
  const navigate = useNavigate();
  const user = session?.user;

  return (
    <div className="space-y-4 px-4 pt-4">
      <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4">
        <img
          src={user?.avatar ?? `https://i.pravatar.cc/100?u=${encodeURIComponent(user?.email ?? '')}`}
          alt=""
          className="h-16 w-16 rounded-2xl border border-slate-200"
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-black text-slate-900">{user?.name}</div>
          <div className="truncate text-xs text-slate-500">{user?.email}</div>
          <div className="mt-1 inline-flex rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700">
            {user?.role.replaceAll('_', ' ')}
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => navigate('/profile')}
          className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3.5 text-left active:bg-slate-50"
        >
          <Icon name="user" size={18} className="text-slate-400" />
          <span className="flex-1 text-sm font-semibold text-slate-800">Mon profil</span>
          <Icon name="chevron-right" size={16} className="text-slate-400" />
        </button>
        <button
          type="button"
          onClick={() => navigate('/agence')}
          className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3.5 text-left active:bg-slate-50"
        >
          <Icon name="pin" size={18} className="text-slate-400" />
          <span className="flex-1 text-sm font-semibold text-slate-800">Mon agence</span>
          <Icon name="chevron-right" size={16} className="text-slate-400" />
        </button>
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-slate-50"
        >
          <Icon name="gear" size={18} className="text-slate-400" />
          <span className="flex-1 text-sm font-semibold text-slate-800">Paramètres</span>
          <Icon name="chevron-right" size={16} className="text-slate-400" />
        </button>
      </div>

      <button
        type="button"
        onClick={() => {
          void (async () => {
            await logout();
            navigate('/login', { replace: true });
          })();
        }}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white py-3.5 text-sm font-black text-rose-600 active:bg-rose-50"
      >
        <Icon name="log-out" size={16} />
        Déconnexion
      </button>
    </div>
  );
};

export default MobileOpsPage;
