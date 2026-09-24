import React, { useState } from 'react';
import { brandLogoUrl } from '@/modules/shared/brandLogo';

/**
 * Logo de la marque, avec repli sur ses initiales : une marque sans fichier —
 * ou un fichier qui ne charge pas — ne doit pas laisser un trou dans la liste.
 */
export const BrandLogo: React.FC<{
  brand?: string | null;
  size?: number;
  className?: string;
}> = ({ brand, size = 28, className = '' }) => {
  const [failed, setFailed] = useState(false);
  const url = brandLogoUrl(brand);
  const initials = (brand ?? '?').trim().slice(0, 2).toUpperCase();

  if (!url || failed) {
    return (
      <span
        title={brand ?? undefined}
        className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-slate-100 font-black text-slate-500 ${className}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      >
        {initials}
      </span>
    );
  }

  return (
    <img
      src={url}
      alt={brand ?? ''}
      title={brand ?? undefined}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
};

export default BrandLogo;
