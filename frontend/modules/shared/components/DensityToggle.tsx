import React from 'react';
import { useUIPrefs, type Density } from '@/providers/UIPreferencesProvider';

const OPTIONS: { value: Density; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'comfort', label: 'Confort' },
  { value: 'executive', label: 'Exécutif' },
];

export const DensityToggle: React.FC = () => {
  const { density, setDensity } = useUIPrefs();
  return (
    <div className="df-tabs" role="radiogroup" aria-label="Densité d'affichage">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={density === o.value}
          onClick={() => setDensity(o.value)}
          className={`df-tab ${density === o.value ? 'df-tab--active' : ''}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
};
