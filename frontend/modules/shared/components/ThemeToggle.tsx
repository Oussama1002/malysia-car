import React from 'react';
import { useUIPrefs } from '@/providers/UIPreferencesProvider';
import { Icon } from './Icon';

export const ThemeToggle: React.FC<{ className?: string }> = ({ className }) => {
  const { theme, toggleTheme } = useUIPrefs();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`df-btn df-btn--ghost df-btn--sm df-btn--icon ${className ?? ''}`}
      aria-label={theme === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}
      title={theme === 'dark' ? 'Thème clair' : 'Thème sombre'}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
    </button>
  );
};
