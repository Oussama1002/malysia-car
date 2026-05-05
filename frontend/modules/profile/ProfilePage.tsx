import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getUser, updateUser, uploadMyAvatar, type AdminUser } from '@/services/adminApi';
import { useAuthSession } from '@/modules/auth/AuthContext';
import { getApiBase } from '@/services/apiClient';

const ROLE_LABELS: Record<string, string> = {
  ADMIN: 'Administrateur',
  DIRECTEUR: 'Directeur',
  COMPTABLE: 'Comptable',
  AGENT_COMMERCIAL: 'Agent commercial',
  ANALYSTE_CREDIT: 'Analyste crédit',
  CONTENTIEUX: 'Contentieux',
  CHAUFFEUR: 'Chauffeur',
};

const LOCALE_OPTIONS = [
  { value: 'fr', label: 'Français' },
  { value: 'ar', label: 'العربية' },
  { value: 'en', label: 'English' },
];

export const ProfilePage: React.FC = () => {
  const { session } = useAuthSession();
  const qc = useQueryClient();
  const userId = String(session?.user.id ?? '');
  const apiReady = !!getApiBase() && !!userId;

  const { data, isLoading } = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => getUser(userId),
    enabled: apiReady,
  });

  const user: AdminUser | null = data?.data ?? null;

  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    phone: '',
    locale: 'fr',
    password: '',
    password_confirm: '',
  });
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pwError, setPwError] = useState('');
  const [avatarError, setAvatarError] = useState('');
  const [avatarSaved, setAvatarSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setForm({
        first_name: user.first_name ?? '',
        last_name: user.last_name ?? '',
        phone: user.phone ?? '',
        locale: user.locale ?? 'fr',
        password: '',
        password_confirm: '',
      });
      setAvatarPreview(user.avatar ?? null);
    }
  }, [user]);

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateUser>[1]) => updateUser(userId, payload),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['profile', userId] });
      if (session) {
        const updated = { ...session, user: { ...session.user, name: res.data.name, avatar: res.data.avatar ?? session.user.avatar } };
        localStorage.setItem('df_session', JSON.stringify(updated));
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const avatarMutation = useMutation({
    mutationFn: (file: File) => uploadMyAvatar(file),
    onSuccess: (res) => {
      const updatedUser = res.data.user;
      setAvatarPreview(updatedUser.avatar ?? null);
      qc.invalidateQueries({ queryKey: ['profile', userId] });
      if (session) {
        const updated = { ...session, user: { ...session.user, avatar: updatedUser.avatar ?? session.user.avatar, name: updatedUser.name } };
        localStorage.setItem('df_session', JSON.stringify(updated));
      }
      setAvatarSaved(true);
      setTimeout(() => setAvatarSaved(false), 3000);
    },
    onError: (e: unknown) => {
      setAvatarError((e as { message?: string })?.message ?? "Erreur lors de l'upload de l'image.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (form.password && form.password !== form.password_confirm) {
      setPwError('Les mots de passe ne correspondent pas.');
      return;
    }
    const payload: Parameters<typeof updateUser>[1] = {
      first_name: form.first_name || undefined,
      last_name: form.last_name || undefined,
      name: [form.first_name, form.last_name].filter(Boolean).join(' ') || undefined,
      phone: form.phone || undefined,
      locale: form.locale as 'fr' | 'en' | 'ar',
    };
    if (form.password) payload.password = form.password;
    mutation.mutate(payload);
  };

  const handleAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError('');
    setAvatarSaved(false);
    avatarMutation.mutate(file);
  };

  const avatarSrc = avatarPreview
    ?? session?.user.avatar
    ?? `https://i.pravatar.cc/200?u=${encodeURIComponent(session?.user.email ?? '')}`;

  const inp = 'w-full px-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 font-medium text-sm transition';
  const lbl = 'text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1 block';

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500 pb-10 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-500">Mon compte</p>
        <h1 className="text-3xl font-black tracking-tight text-slate-900">Profil</h1>
        <p className="text-slate-500">Gérez vos informations personnelles et vos préférences.</p>
      </div>

      {/* Avatar card */}
      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-8">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          <div className="relative flex-shrink-0">
            <img src={avatarSrc} alt="Avatar" className="w-24 h-24 rounded-[1.25rem] object-cover border-2 border-slate-100 shadow" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-2 -right-2 w-8 h-8 bg-indigo-600 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-indigo-700 transition"
              title="Changer la photo"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatar} />
          </div>
          <div className="text-center sm:text-left">
            <h2 className="text-2xl font-black text-slate-900">{session?.user.name}</h2>
            <p className="text-slate-400 font-medium">{session?.user.email}</p>
            <div className="mt-2 flex flex-wrap gap-2 justify-center sm:justify-start">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">
                {ROLE_LABELS[session?.user.role ?? ''] ?? session?.user.role}
              </span>
              {user?.status && (
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold border ${
                  user.status === 'active' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
                  'bg-rose-50 border-rose-100 text-rose-700'
                }`}>
                  {user.status === 'active' ? 'Actif' : 'Inactif'}
                </span>
              )}
            </div>
            <div className="mt-2 min-h-5">
              {avatarMutation.isPending && <p className="text-xs font-semibold text-indigo-600">Upload de la photo...</p>}
              {!avatarMutation.isPending && avatarSaved && <p className="text-xs font-semibold text-emerald-600">Photo mise a jour.</p>}
              {!avatarMutation.isPending && avatarError && <p className="text-xs font-semibold text-rose-600">{avatarError}</p>}
            </div>
          </div>

          {/* Read-only info */}
          <div className="sm:ml-auto grid grid-cols-2 gap-4 text-center">
            {user?.last_login_at && (
              <div className="bg-slate-50 rounded-2xl p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dernière connexion</p>
                <p className="text-sm font-bold text-slate-700 mt-0.5">{new Date(user.last_login_at).toLocaleDateString('fr-MA')}</p>
              </div>
            )}
            {user?.branches && user.branches.length > 0 && (
              <div className="bg-slate-50 rounded-2xl p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Agences</p>
                <p className="text-sm font-bold text-slate-700 mt-0.5">{user.branches.length}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit form */}
      {isLoading && !user ? (
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-8 animate-pulse space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-12 bg-slate-100 rounded-2xl" />)}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-8 space-y-6">
          <h3 className="text-xs font-black text-indigo-500 uppercase tracking-[0.2em]">Informations personnelles</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className={lbl}>Prénom</label>
              <input className={inp} value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} placeholder="ex: Mohamed" />
            </div>
            <div>
              <label className={lbl}>Nom</label>
              <input className={inp} value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} placeholder="ex: Alaoui" />
            </div>
            <div>
              <label className={lbl}>Téléphone</label>
              <input className={inp} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+212 6XX XXX XXX" />
            </div>
            <div>
              <label className={lbl}>Langue</label>
              <select className={inp} value={form.locale} onChange={e => setForm(f => ({ ...f, locale: e.target.value }))}>
                {LOCALE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-4">
            <h3 className="text-xs font-black text-rose-500 uppercase tracking-[0.2em]">Changer le mot de passe</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className={lbl}>Nouveau mot de passe</label>
                <input type="password" className={inp} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Laisser vide pour ne pas changer" autoComplete="new-password" />
              </div>
              <div>
                <label className={lbl}>Confirmer</label>
                <input type="password" className={inp} value={form.password_confirm} onChange={e => setForm(f => ({ ...f, password_confirm: e.target.value }))} placeholder="Répéter le mot de passe" autoComplete="new-password" />
              </div>
            </div>
            {pwError && <p className="text-rose-600 text-sm font-semibold">{pwError}</p>}
          </div>

          <div className="flex items-center gap-4 pt-2">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="flex-1 py-4 bg-indigo-600 text-white font-black uppercase text-xs tracking-widest rounded-2xl shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-60 transition-all"
            >
              {mutation.isPending ? 'Enregistrement…' : 'Enregistrer les modifications'}
            </button>
            {saved && (
              <span className="inline-flex items-center gap-2 text-emerald-600 font-bold text-sm animate-in fade-in duration-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
                Sauvegardé
              </span>
            )}
          </div>
          {mutation.isError && (
            <p className="text-rose-600 text-sm font-semibold">{(mutation.error as any)?.message ?? 'Erreur lors de la sauvegarde.'}</p>
          )}
        </form>
      )}

      {/* Branches */}
      {user?.branches && user.branches.length > 0 && (
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-8 space-y-4">
          <h3 className="text-xs font-black text-emerald-500 uppercase tracking-[0.2em]">Agences assignées</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {user.branches.map(b => (
              <div key={b.id} className={`flex items-center gap-3 rounded-2xl border p-4 ${b.is_primary ? 'border-indigo-200 bg-indigo-50' : 'border-slate-100 bg-slate-50'}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${b.is_primary ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                  {b.code.slice(0, 2)}
                </div>
                <div>
                  <p className="font-bold text-slate-900 text-sm">{b.name}</p>
                  <p className="text-[10px] font-mono text-slate-400">{b.code}{b.is_primary ? ' · Principale' : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
