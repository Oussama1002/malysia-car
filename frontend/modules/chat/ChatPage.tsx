import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { chatApi, type ChatConversation, type ChatUser } from '@/services/chatApi';
import { getApiBase } from '@/services/apiClient';
import { Icon } from '@/modules/shared/components/Icon';

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return new Date(iso).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit' });
}

function clock(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit' }) : '';
}

export const ChatPage: React.FC = () => {
  const apiReady = !!getApiBase();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const activePeer = params.get('with');
  const [draft, setDraft] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState('');
  const threadEndRef = useRef<HTMLDivElement>(null);

  const convQ = useQuery({
    queryKey: ['chat', 'conversations'],
    queryFn: () => chatApi.conversations(),
    enabled: apiReady,
    refetchInterval: 10000,
  });
  const usersQ = useQuery({
    queryKey: ['chat', 'users'],
    queryFn: () => chatApi.users(),
    enabled: apiReady && showNew,
  });
  const threadQ = useQuery({
    queryKey: ['chat', 'thread', activePeer],
    queryFn: () => chatApi.messages(activePeer!),
    enabled: apiReady && !!activePeer,
    refetchInterval: activePeer ? 5000 : false,
  });

  const conversations = convQ.data?.data ?? [];
  const users = usersQ.data?.data ?? [];
  const messages = threadQ.data?.data ?? [];

  const peerName = useMemo(() => {
    const c = conversations.find((x) => x.user_id === activePeer);
    if (c) return c.name;
    const u = users.find((x) => x.id === activePeer);
    return u?.name ?? 'Discussion';
  }, [conversations, users, activePeer]);

  const sendM = useMutation({
    mutationFn: (arg: { body: string; file?: File }) => chatApi.send(activePeer!, arg.body, arg.file),
    onSuccess: () => {
      setDraft('');
      qc.invalidateQueries({ queryKey: ['chat', 'thread', activePeer] });
      qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      qc.invalidateQueries({ queryKey: ['chat', 'unread-count'] });
    },
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const onPickFile = (f: File | undefined) => {
    if (f && activePeer && !sendM.isPending) sendM.mutate({ body: draft, file: f });
  };

  // Selecting a conversation marks it read on the server (messages endpoint) —
  // refresh the unread badge/count when the thread loads.
  useEffect(() => {
    if (activePeer && threadQ.data) {
      qc.invalidateQueries({ queryKey: ['chat', 'unread-count'] });
      qc.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    }
  }, [activePeer, threadQ.data, qc]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const openPeer = (id: string) => { setShowNew(false); setParams({ with: id }); };

  if (!apiReady) {
    return <div className="rounded-2xl border border-[color:var(--df-border)] bg-[color:var(--df-surface)] p-6 text-sm text-[color:var(--df-text-muted)]">Backend non configuré.</div>;
  }

  return (
    <div className="flex h-[calc(100vh-11rem)] gap-4">
      {/* ── Conversations / users list ── */}
      <aside className="flex w-72 shrink-0 flex-col rounded-2xl border border-[color:var(--df-border)] bg-[color:var(--df-surface)] overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-[color:var(--df-border)] p-3">
          <h2 className="text-sm font-black text-[color:var(--df-text)]">Discussions</h2>
          <button
            type="button"
            onClick={() => setShowNew((v) => !v)}
            className="rounded-lg bg-[color:var(--df-brand-500)] px-2.5 py-1 text-[11px] font-black text-white"
          >
            {showNew ? 'Retour' : '+ Nouveau'}
          </button>
        </div>

        {showNew && (
          <div className="border-b border-[color:var(--df-border)] p-2">
            <input
              className="df-input w-full text-xs"
              placeholder="Rechercher un collègue…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {showNew ? (
            users
              .filter((u: ChatUser) => u.name.toLowerCase().includes(search.trim().toLowerCase()))
              .map((u) => (
                <button key={u.id} type="button" onClick={() => openPeer(u.id)}
                  className="flex w-full items-center gap-3 border-b border-[color:var(--df-border)] p-3 text-left hover:bg-[color:var(--df-surface-sunk)]">
                  <Avatar name={u.name} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-[color:var(--df-text)]">{u.name}</div>
                    <div className="truncate text-[11px] text-[color:var(--df-text-faint)]">{(u.role ?? '').replaceAll('_', ' ')}</div>
                  </div>
                </button>
              ))
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center text-xs text-[color:var(--df-text-muted)]">
              Aucune discussion. Cliquez sur « Nouveau » pour écrire à un collègue.
            </div>
          ) : (
            conversations.map((c: ChatConversation) => (
              <button key={c.user_id} type="button" onClick={() => openPeer(c.user_id)}
                className={`flex w-full items-center gap-3 border-b border-[color:var(--df-border)] p-3 text-left hover:bg-[color:var(--df-surface-sunk)] ${activePeer === c.user_id ? 'bg-[color:var(--df-surface-sunk)]' : ''}`}>
                <Avatar name={c.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-bold text-[color:var(--df-text)]">{c.name}</span>
                    <span className="shrink-0 text-[10px] text-[color:var(--df-text-faint)]">{timeAgo(c.last_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] text-[color:var(--df-text-muted)]">
                      {c.last_from_me ? 'Vous : ' : ''}{c.last_message}
                    </span>
                    {c.unread > 0 && (
                      <span className="shrink-0 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{c.unread}</span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── Thread ── */}
      <section className="flex flex-1 flex-col rounded-2xl border border-[color:var(--df-border)] bg-[color:var(--df-surface)] overflow-hidden">
        {!activePeer ? (
          <div className="flex flex-1 items-center justify-center text-sm text-[color:var(--df-text-muted)]">
            Sélectionnez une discussion pour commencer.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-[color:var(--df-border)] p-3">
              <Avatar name={peerName} />
              <div className="text-sm font-black text-[color:var(--df-text)]">{peerName}</div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.from_me ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${m.from_me ? 'bg-[color:var(--df-brand-500)] text-white' : 'bg-[color:var(--df-surface-sunk)] text-[color:var(--df-text)]'}`}>
                    {m.attachment && (m.attachment.is_image ? (
                      <a href={m.attachment.url} target="_blank" rel="noreferrer" className="block">
                        <img src={m.attachment.url} alt={m.attachment.name} className="mb-1 max-h-56 max-w-full rounded-lg object-contain" />
                      </a>
                    ) : (
                      <a href={m.attachment.url} target="_blank" rel="noreferrer"
                        className={`mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-semibold ${m.from_me ? 'bg-white/15 text-white' : 'bg-[color:var(--df-surface)] text-[color:var(--df-text)]'}`}>
                        <Icon name="doc" size={16} />
                        <span className="truncate">{m.attachment.name}</span>
                      </a>
                    ))}
                    {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
                    <div className={`mt-0.5 text-[10px] ${m.from_me ? 'text-white/70' : 'text-[color:var(--df-text-faint)]'}`}>{clock(m.created_at)}</div>
                  </div>
                </div>
              ))}
              <div ref={threadEndRef} />
            </div>

            <form
              className="flex items-center gap-2 border-t border-[color:var(--df-border)] p-3"
              onSubmit={(e) => { e.preventDefault(); const b = draft.trim(); if (b && !sendM.isPending) sendM.mutate({ body: b }); }}
            >
              {/* Attach a file (documents, images…) */}
              <button type="button" title="Joindre un fichier" disabled={sendM.isPending}
                onClick={() => fileRef.current?.click()}
                className="df-btn df-btn--subtle df-btn--icon shrink-0">
                <Icon name="upload" size={16} />
              </button>
              {/* Take a photo (opens the camera on mobile) */}
              <button type="button" title="Prendre une photo" disabled={sendM.isPending}
                onClick={() => cameraRef.current?.click()}
                className="df-btn df-btn--subtle df-btn--icon shrink-0">
                <Icon name="scan" size={16} />
              </button>
              <input ref={fileRef} type="file" className="hidden"
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                onChange={(e) => { onPickFile(e.target.files?.[0]); e.target.value = ''; }} />
              <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => { onPickFile(e.target.files?.[0]); e.target.value = ''; }} />

              <input
                className="df-input flex-1"
                placeholder="Écrire un message…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
              />
              <button type="submit" disabled={!draft.trim() || sendM.isPending}
                className="rounded-xl bg-[color:var(--df-brand-500)] px-4 py-2 text-sm font-black text-white disabled:opacity-50">
                {sendM.isPending ? '…' : 'Envoyer'}
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
};

const Avatar: React.FC<{ name: string }> = ({ name }) => (
  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--df-brand-500)]/[0.12] text-[11px] font-black text-[color:var(--df-brand-500)]">
    {initials(name)}
  </span>
);

export default ChatPage;
