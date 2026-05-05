import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useMutation } from '@tanstack/react-query';
import { aiApi } from '@/services/aiApi';
import { Link } from 'react-router-dom';

export const AICopilotFab: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button type="button" onClick={onClick} className="df-copilot-fab" aria-label="Ouvrir l'assistant IA">
    <Icon name="sparkles" size={20} />
  </button>
);

type Msg = { role: 'user' | 'assistant'; text: string; chips?: string[] };

const SUGGESTIONS = [
  'Quels clients sont en retard de plus de 30 jours ?',
  'Prévision de cash-flow sur 30 jours',
  'Top 3 véhicules à renouveler (rentabilité faible)',
  'Clients à risque selon scoring CNSS',
  'Maintenance prédictive — flotte utilitaire',
];

export const AICopilotDrawer: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      text:
        'Bonjour — je suis votre assistant DriveFlow. Reponses basees sur les donnees backend en mode deterministe.',
      chips: SUGGESTIONS,
    },
  ]);
  const [draft, setDraft] = useState('');
  const [refs, setRefs] = useState<Array<{ type: string; id: string; path: string }>>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);

  const askMutation = useMutation({
    mutationFn: (message: string) => aiApi.assistantMessages(message, conversationId),
    onSuccess: (data) => {
      setConversationId(data.conversation_id);
      setMessages((m) => [...m, { role: 'assistant', text: data.answer }]);
      setRefs(data.references ?? []);
    },
    onError: (error) => {
      const text = error instanceof Error ? error.message : 'Erreur assistant';
      setMessages((m) => [...m, { role: 'assistant', text: `Erreur backend: ${text}` }]);
    },
  });

  if (!open) return null;

  function send(text: string) {
    const q = text.trim();
    if (!q) return;
    setMessages((m) => [...m, { role: 'user', text: q }]);
    askMutation.mutate(q);
    setDraft('');
  }

  return createPortal(
    <>
      <div className="df-drawer-overlay" onClick={onClose} aria-hidden />
      <aside className="df-drawer" role="dialog" aria-label="Assistant IA">
        <header className="flex items-center gap-3 border-b border-[color:var(--df-border)] px-5 py-4">
          <div className="df-heroMark flex h-9 w-9 items-center justify-center rounded-xl">
            <Icon name="sparkles" size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold">Assistant DriveFlow</div>
            <div className="flex items-center gap-1.5 text-[11px] text-[color:var(--df-text-muted)]">
              <span className="df-pulse-dot" style={{ color: 'var(--df-success-500)', background: 'var(--df-success-500)' }} />
              En ligne · modèle stratégique
            </div>
          </div>
          <button type="button" className="df-btn df-btn--subtle df-btn--sm df-btn--icon" onClick={onClose} aria-label="Fermer">
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-[color:var(--df-brand-500)] text-white'
                    : 'border border-[color:var(--df-border)] bg-[color:var(--df-surface)]'
                }`}
              >
                {m.text}
                {m.chips && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.chips.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => send(s)}
                        className="df-chip df-chip--brand hover:opacity-80"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          {refs.length > 0 && (
            <div className="rounded-xl border border-[color:var(--df-border)] bg-[color:var(--df-surface)] p-3 text-xs">
              <div className="mb-2 font-bold">Liens entites</div>
              <div className="flex flex-wrap gap-2">
                {refs.map((r, i) => (
                  <Link key={`${r.type}-${r.id}-${i}`} to={r.path} className="rounded bg-indigo-50 px-2 py-1 font-semibold text-indigo-700">
                    {r.type}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        <footer className="border-t border-[color:var(--df-border)] p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
            className="relative"
          >
            <input
              className="df-input !pr-28"
              placeholder="Posez votre question — ex : top 5 véhicules rentables…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              type="submit"
              className="df-btn df-btn--primary df-btn--sm absolute top-1/2 -translate-y-1/2 end-1.5"
              disabled={!draft.trim() || askMutation.isPending}
            >
              <Icon name="arrow-right" size={14} /> Envoyer
            </button>
          </form>
          <div className="mt-2 text-[10px] text-[color:var(--df-text-faint)]">
            IA conforme Loi 09-08 · les données ne quittent pas votre infrastructure.
          </div>
        </footer>
      </aside>
    </>,
    document.body,
  );
};
