import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './Icon';
import { isExperimentalEnabled } from '@/config/runtimeFlags';

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon?: IconName;
  to?: string;
  shortcut?: string;
  onRun?: () => void;
}

const DEFAULT_CMDS: PaletteCommand[] = [
  { id: 'go-dash', group: 'Navigation', label: 'Tableau de bord direction', icon: 'home', to: '/dashboard', shortcut: 'G D' },
  { id: 'go-fleet', group: 'Navigation', label: 'Flotte', icon: 'car', to: '/fleet', shortcut: 'G F' },
  { id: 'go-gps', group: 'Navigation', label: 'GPS & géolocalisation', icon: 'map', to: '/gps', shortcut: 'G L' },
  { id: 'go-customers', group: 'Navigation', label: 'Clients & conformité', icon: 'users', to: '/customers' },
  { id: 'go-contracts', group: 'Navigation', label: 'Contrats', icon: 'doc', to: '/contracts' },
  { id: 'go-credit', group: 'Navigation', label: 'Analyse crédit', icon: 'credit', to: '/credit' },
  { id: 'go-finance', group: 'Navigation', label: 'Finance & fiscalité', icon: 'coin', to: '/finance' },
  { id: 'go-arrears', group: 'Navigation', label: 'Impayés & contentieux', icon: 'alert', to: '/arrears' },
  { id: 'go-vo', group: 'Navigation', label: 'Véhicules d\u2019occasion', icon: 'marketplace', to: '/used-cars' },
  { id: 'go-ai', group: 'Navigation', label: 'Assistant IA', icon: 'sparkles', to: '/ai' },
  { id: 'new-contract', group: 'Actions', label: 'Nouveau contrat', icon: 'plus', to: '/contracts/new', shortcut: 'N C' },
  { id: 'new-customer', group: 'Actions', label: 'Nouveau client', icon: 'plus', to: '/customers' },
];

interface Props {
  open: boolean;
  onClose: () => void;
  commands?: PaletteCommand[];
}

export const CommandPalette: React.FC<Props> = ({ open, onClose, commands = DEFAULT_CMDS }) => {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();

  const effectiveCommands = useMemo(
    () => commands.filter((cmd) => (isExperimentalEnabled() ? true : cmd.to !== '/ai')),
    [commands],
  );

  const filtered = useMemo(() => {
    if (!q.trim()) return effectiveCommands;
    const t = q.toLowerCase();
    return effectiveCommands.filter((c) => c.label.toLowerCase().includes(t) || c.group.toLowerCase().includes(t));
  }, [q, effectiveCommands]);

  const grouped = useMemo(() => {
    const map = new Map<string, PaletteCommand[]>();
    filtered.forEach((c) => {
      const arr = map.get(c.group) ?? [];
      arr.push(c);
      map.set(c.group, arr);
    });
    return Array.from(map.entries());
  }, [filtered]);

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  useEffect(() => setIdx(0), [q]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(filtered.length - 1, i + 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
      if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered[idx];
        if (cmd) run(cmd);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filtered, idx]);

  function run(cmd: PaletteCommand) {
    onClose();
    if (cmd.onRun) cmd.onRun();
    if (cmd.to) navigate(cmd.to);
  }

  if (!open) return null;

  let cursor = 0;

  return createPortal(
    <div className="df-cmd-overlay df-fadein" onMouseDown={onClose} role="dialog" aria-modal="true">
      <div className="df-cmd df-rise" onMouseDown={(e) => e.stopPropagation()}>
        <div className="relative">
          <Icon name="search" size={18} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-[color:var(--df-text-faint)]" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un contrat, véhicule, client, action…"
            className="df-cmd__input !pl-12"
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {grouped.length === 0 && (
            <div className="px-5 py-8 text-center text-sm text-[color:var(--df-text-muted)]">Aucun résultat pour « {q} »</div>
          )}
          {grouped.map(([group, items]) => (
            <div key={group}>
              <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[color:var(--df-text-faint)]">{group}</div>
              {items.map((it) => {
                const selected = cursor === idx;
                const myIdx = cursor;
                cursor += 1;
                return (
                  <div
                    key={it.id}
                    className="df-cmd__item"
                    aria-selected={selected}
                    onMouseEnter={() => setIdx(myIdx)}
                    onClick={() => run(it)}
                  >
                    {it.icon && <Icon name={it.icon} size={16} className="text-[color:var(--df-brand-500)]" />}
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.shortcut && <span className="df-cmd__kbd">{it.shortcut}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-[color:var(--df-border)] bg-[color:var(--df-surface-sunk)] px-4 py-2 text-[11px] text-[color:var(--df-text-muted)]">
          <span className="inline-flex items-center gap-1"><span className="df-kbd">↑</span><span className="df-kbd">↓</span> Naviguer</span>
          <span className="inline-flex items-center gap-1"><span className="df-kbd">↵</span> Ouvrir</span>
          <span className="inline-flex items-center gap-1"><span className="df-kbd">Esc</span> Fermer</span>
          <span className="ml-auto inline-flex items-center gap-1">DriveFlow <span className="df-kbd">⌘K</span></span>
        </div>
      </div>
    </div>,
    document.body,
  );
};

/** Hook that toggles palette on ⌘K / Ctrl+K */
export function useCommandPaletteShortcut(onOpen: () => void): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        onOpen();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpen]);
}
