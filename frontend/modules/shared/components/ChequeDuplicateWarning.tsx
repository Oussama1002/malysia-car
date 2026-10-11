import React, { useEffect } from 'react';
import { useChequeDuplicate } from '@/modules/shared/hooks/useChequeDuplicate';

/**
 * Red banner shown as soon as the cheque number entered matches one already on
 * record — client payment, supplier payment or franchise. `onResult` lets the
 * form block its own submit while the number is taken.
 */
export const ChequeDuplicateWarning: React.FC<{
  number?: string | null;
  bank?: string | null;
  onResult?: (message: string | null) => void;
}> = ({ number, bank, onResult }) => {
  const message = useChequeDuplicate(number, bank);

  useEffect(() => {
    onResult?.(message);
  }, [message, onResult]);

  if (!message) {
    return null;
  }

  return (
    <div className="rounded-xl border-2 border-rose-300 bg-rose-50 px-3.5 py-3 text-xs font-bold text-rose-800">
      ⚠ {message}
    </div>
  );
};

export default ChequeDuplicateWarning;
