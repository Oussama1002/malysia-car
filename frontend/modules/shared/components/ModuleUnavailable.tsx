import React from 'react';
import { Icon } from '@/modules/shared/components/Icon';

type Props = {
  /** Optional title override; defaults to a safe French label. */
  title?: string;
  /** Optional message override; defaults to a safe French label. */
  message?: string;
  /** Optional retry callback (e.g. refetch). */
  onRetry?: () => void;
};

/**
 * Safe placeholder shown when a module's data cannot be loaded
 * (API unreachable, 5xx, 403). Never exposes raw error messages.
 *
 * Use it as a render fallback inside pages/sections:
 *
 *   if (query.isError) return <ModuleUnavailable onRetry={query.refetch} />;
 */
export const ModuleUnavailable: React.FC<Props> = ({ title, message, onRetry }) => (
  <div className="rounded-2xl border border-[color:var(--df-border)] bg-[color:var(--df-surface)] p-8 text-center">
    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--df-surface-sunk)]">
      <Icon name="alert" size={20} />
    </div>
    <h3 className="text-base font-bold text-[color:var(--df-text)]">
      {title ?? 'Module temporairement indisponible'}
    </h3>
    <p className="mx-auto mt-1 max-w-md text-sm text-[color:var(--df-text-muted)]">
      {message ?? 'Nous n’arrivons pas à charger cette section pour le moment. Merci de réessayer dans quelques instants.'}
    </p>
    {onRetry && (
      <button type="button" onClick={onRetry} className="df-btn df-btn--subtle df-btn--sm mt-4">
        <Icon name="external" size={14} />
        Réessayer
      </button>
    )}
  </div>
);
