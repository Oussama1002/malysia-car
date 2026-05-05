import React from 'react';
import { isDangerousActionDisabled } from '@/config/runtimeFlags';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Mark the button as dangerous (delete, financial override, admin-only).
   *  In demo mode it will be disabled with a tooltip explanation. */
  dangerous?: boolean;
};

/**
 * Drop-in replacement for <button> that automatically disables itself
 * in demo mode for dangerous actions, without changing the visible label.
 *
 *   <DemoSafeButton dangerous onClick={handleDelete}>Supprimer</DemoSafeButton>
 */
export const DemoSafeButton: React.FC<Props> = ({ dangerous, disabled, title, children, ...rest }) => {
  const blocked = dangerous === true && isDangerousActionDisabled();
  return (
    <button
      {...rest}
      disabled={disabled || blocked}
      title={blocked ? 'Action désactivée en mode démo' : title}
      aria-disabled={disabled || blocked}
    >
      {children}
    </button>
  );
};
