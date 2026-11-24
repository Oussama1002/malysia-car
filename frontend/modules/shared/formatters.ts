const MAD = 'MAD';

export function formatCurrencyMad(amount: number, locale = 'fr-MA'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: MAD, maximumFractionDigits: 0 }).format(amount);
}

export function formatCurrency(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/**
 * AGENTS §5.6 — every date in the web UI reads as dd/MM/yyyy (and dd/MM/yyyy HH:mm
 * when the time matters). The French-medium style ("23 nov. 2026") that was the
 * previous default is what QA 2026-11-24 flagged as Major across Payments,
 * Invoices, Documents, Audit, and notification bodies. Formatting manually
 * avoids the Intl.DateTimeFormat drift between 'fr-FR' and 'fr-MA'.
 */
export function formatDate(iso: string | Date, _locale?: string): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function formatDateTime(iso: string | Date, _locale?: string): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mn = String(d.getMinutes()).padStart(2, '0');
  return `${formatDate(d)} ${hh}:${mn}`;
}

export function formatNumber(n: number, locale = 'fr-MA'): string {
  return new Intl.NumberFormat(locale).format(n);
}
