import React, { useEffect, useRef, useState } from 'react';

/**
 * Date (and optionally time) field that always reads JJ/MM/AAAA HH:MM.
 *
 * A native <input type="date"> is drawn by the browser and formatted from the
 * browser's own language — a Chrome in English shows 09/24/2026 05:18 PM and no
 * attribute, style or script can change that. So the visible field is a plain
 * text input we format ourselves, with the native picker kept one button away
 * for the calendar and for touch.
 *
 * `value` and `onChange` keep the native contract: 'yyyy-MM-dd', or
 * 'yyyy-MM-ddTHH:mm' when `withTime`, and '' when empty.
 */
export const DateField: React.FC<{
  value: string;
  onChange: (value: string) => void;
  withTime?: boolean;
  className?: string;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  id?: string;
}> = ({ value, onChange, withTime = false, className = 'df-input w-full', required, disabled, min, max, id }) => {
  const [text, setText] = useState(() => isoToFr(value, withTime));
  const [focused, setFocused] = useState(false);
  const nativeRef = useRef<HTMLInputElement>(null);

  // Follow the value while the user is not the one editing it.
  useEffect(() => {
    if (!focused) {
      setText(isoToFr(value, withTime));
    }
  }, [value, withTime, focused]);

  const handleText = (raw: string) => {
    const masked = mask(raw, withTime);
    setText(masked);
    if (masked === '') {
      onChange('');
      return;
    }
    const iso = frToIso(masked, withTime);
    if (iso) {
      onChange(iso);
    }
  };

  const openPicker = () => {
    const el = nativeRef.current;
    if (!el) return;
    // showPicker() is the supported way in; older browsers only react to focus.
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
        return;
      } catch {
        // Safari throws when the input is not visible enough — fall through.
      }
    }
    el.focus();
    el.click();
  };

  return (
    <span className="relative inline-flex w-full items-center">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        className={className}
        style={{ paddingInlineEnd: 34 }}
        value={text}
        placeholder={withTime ? 'JJ/MM/AAAA HH:MM' : 'JJ/MM/AAAA'}
        required={required}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setText(isoToFr(value, withTime));
        }}
        onChange={(e) => handleText(e.target.value)}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label="Ouvrir le calendrier"
        disabled={disabled}
        onClick={openPicker}
        className="absolute inset-y-0 end-0 flex w-8 items-center justify-center text-slate-400 hover:text-slate-700 disabled:opacity-40"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 11h18" />
        </svg>
      </button>
      {/* The native control stays in the DOM for its picker only. */}
      <input
        ref={nativeRef}
        type={withTime ? 'datetime-local' : 'date'}
        className="pointer-events-none absolute end-0 bottom-0 h-0 w-0 opacity-0"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          setText(isoToFr(e.target.value, withTime));
        }}
      />
    </span>
  );
};

/** 'yyyy-MM-ddTHH:mm' → 'JJ/MM/AAAA HH:MM' */
function isoToFr(value: string, withTime: boolean): string {
  if (!value) return '';
  const [date, time = ''] = value.split('T');
  const [y, m, d] = date.split('-');
  if (!y || !m || !d) return '';
  const day = `${d}/${m}/${y}`;

  return withTime && time ? `${day} ${time.slice(0, 5)}` : day;
}

/** 'JJ/MM/AAAA HH:MM' → 'yyyy-MM-ddTHH:mm', or '' while incomplete/invalid. */
function frToIso(text: string, withTime: boolean): string {
  const digits = text.replace(/\D/g, '');
  if (digits.length < 8) return '';
  const d = digits.slice(0, 2);
  const m = digits.slice(2, 4);
  const y = digits.slice(4, 8);
  const day = Number(d);
  const month = Number(m);
  const year = Number(y);
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900) return '';

  const date = `${y}-${m}-${d}`;
  if (!withTime) return date;

  const hh = digits.slice(8, 10).padEnd(2, '0');
  const mm = digits.slice(10, 12).padEnd(2, '0');
  if (Number(hh) > 23 || Number(mm) > 59) return '';

  return `${date}T${digits.length > 8 ? `${hh}:${mm}` : '00:00'}`;
}

/** Keep the separators in place as the user types digits. */
function mask(raw: string, withTime: boolean): string {
  const digits = raw.replace(/\D/g, '').slice(0, withTime ? 12 : 8);
  if (digits === '') return '';

  let out = digits.slice(0, 2);
  if (digits.length > 2) out += `/${digits.slice(2, 4)}`;
  if (digits.length > 4) out += `/${digits.slice(4, 8)}`;
  if (digits.length > 8) out += ` ${digits.slice(8, 10)}`;
  if (digits.length > 10) out += `:${digits.slice(10, 12)}`;

  return out;
}
