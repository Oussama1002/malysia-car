import { useEffect, useState } from 'react';
import { apiClient } from '@/services/apiClient';

/**
 * Tells whether a cheque number is already on record — client payment,
 * supplier payment or franchise. Runs while the number is typed or filled by
 * the scan, so the warning never waits for the form to be submitted.
 */
export function useChequeDuplicate(number: string | null | undefined, bank?: string | null): string | null {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const value = (number ?? '').trim();
    if (value.length < 4) {
      setMessage(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ number: value });
        if (bank) params.set('bank', bank);
        const res = await apiClient<{ data: { duplicate: boolean; message: string | null } }>(
          `/v1/cheques/check?${params.toString()}`,
        );
        if (!cancelled) {
          setMessage(res.data?.duplicate ? res.data.message : null);
        }
      } catch {
        // Le contrôle serveur refusera de toute façon à l'enregistrement.
        if (!cancelled) setMessage(null);
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [number, bank]);

  return message;
}
