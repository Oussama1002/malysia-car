import React, { useEffect, useMemo, useRef, useState } from 'react';

export interface SearchableSelectOption {
  value: string | number;
  label: React.ReactNode;
  displayText: string;
  searchText: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string | number | null;
  onChange: (value: string | number | null) => void;
  placeholder?: string;
  emptyMessage?: string;
  id?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Rechercher…',
  emptyMessage = 'Aucun résultat',
  id,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)),
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.searchText.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const inputValue = open ? query : (selected?.displayText ?? query);

  return (
    <div ref={containerRef} className="relative">
      <input
        id={id}
        type="text"
        className="df-input"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        placeholder={placeholder}
        value={inputValue}
        onFocus={() => {
          setOpen(true);
          setQuery(selected?.displayText ?? '');
        }}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          setOpen(true);
          if (selected && next !== selected.displayText) {
            onChange(null);
          }
        }}
      />
      {open && (
        <ul
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-[color:var(--df-border)] bg-[color:var(--df-surface-solid)] py-1 shadow-lg"
          role="listbox"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-[13px] text-[color:var(--df-text-muted)]">{emptyMessage}</li>
          ) : (
            filtered.map((option) => {
              const active = String(option.value) === String(value);
              return (
                <li key={String(option.value)} role="option" aria-selected={active}>
                  <button
                    type="button"
                    className={`flex w-full items-center px-3 py-2 text-left text-[13px] transition hover:bg-[color:var(--df-surface-sunk)] ${
                      active ? 'bg-[color:var(--df-brand-50)] font-semibold dark:bg-[color:var(--df-brand-100)]' : ''
                    }`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(option.value);
                      setQuery('');
                      setOpen(false);
                    }}
                  >
                    {option.label}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
};
