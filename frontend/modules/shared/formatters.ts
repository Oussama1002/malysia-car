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

export function formatDate(iso: string | Date, locale = 'fr-MA'): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(d);
}

export function formatNumber(n: number, locale = 'fr-MA'): string {
  return new Intl.NumberFormat(locale).format(n);
}
