import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/services/apiClient';

/** Emplacement d'un champ sur le formulaire, en millimètres. */
interface FieldSpot {
  x: number;
  y: number;
  size?: number;
  bold?: boolean;
}

interface FormLayout {
  fields: Record<string, FieldSpot>;
  offset_x: number;
  offset_y: number;
}

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/**
 * Aperçu du contrat : le formulaire vierge de l'agence, avec les valeurs posées
 * exactement là où le PDF les imprimera. Les emplacements viennent du serveur
 * (config/contract_form.php), donc l'écran ne peut pas diverger du papier.
 */
export const ContractPaperPreview: React.FC<{
  values: Record<string, string | number | null | undefined>;
  papers?: Record<string, boolean>;
}> = ({ values, papers }) => {
  const layoutQ = useQuery({
    queryKey: ['contract-form-layout'],
    queryFn: async () => (await apiClient<{ data: FormLayout }>('/v1/contract-form-layout')).data,
    staleTime: 60 * 60 * 1000,
  });

  const layout = layoutQ.data;

  // La taille du texte suit la largeur réelle de l'aperçu : 8,5 pt sur une page
  // A4 doivent rester 8,5 pt une fois la page réduite à l'écran.
  const pageRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(0);
  useEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setPageWidth(entry.contentRect.width));
    observer.observe(el);
    setPageWidth(el.clientWidth);

    return () => observer.disconnect();
  }, []);
  const mmToPx = pageWidth / A4_WIDTH_MM;

  const marks: Array<[string, FieldSpot, string]> = [];
  if (layout) {
    const dx = layout.offset_x ?? 0;
    const dy = layout.offset_y ?? 0;

    for (const [key, spot] of Object.entries(layout.fields)) {
      let text: string | null = null;

      if (key.startsWith('papers_')) {
        const [, name, answer] = key.split('_');
        const ok = papers?.[name];
        if (ok !== undefined && ((ok && answer === 'yes') || (!ok && answer === 'no'))) {
          text = 'X';
        }
      } else {
        const raw = values[key];
        text = raw === null || raw === undefined || raw === '' ? null : String(raw);
      }

      if (text !== null) {
        marks.push([key, { ...spot, x: spot.x + dx, y: spot.y + dy }, text]);
      }
    }
  }

  return (
    <div className="rounded-2xl border border-[color:var(--df-border)] bg-[color:var(--df-surface-sunk)] p-5">
      <div className="df-card__hint mb-3">
        Aperçu du contrat — le formulaire de l'agence, rempli comme à l'impression
      </div>

      <div
        ref={pageRef}
        className="relative mx-auto w-full overflow-hidden rounded-xl border border-[color:var(--df-border)] bg-white shadow-sm"
        style={{ aspectRatio: `${A4_WIDTH_MM} / ${A4_HEIGHT_MM}`, maxWidth: 820 }}
      >
        <img src="/contract-form.jpg" alt="Contrat de location" className="absolute inset-0 h-full w-full object-fill" />

        {marks.map(([key, spot, text]) => (
          <span
            key={key}
            className="absolute whitespace-nowrap text-slate-900"
            style={{
              left: `${(spot.x / A4_WIDTH_MM) * 100}%`,
              top: `${(spot.y / A4_HEIGHT_MM) * 100}%`,
              fontSize: mmToPx > 0 ? `${(spot.size ?? 8.5) * 0.3528 * mmToPx}px` : undefined,
              fontWeight: spot.bold ? 800 : 600,
            }}
          >
            {text}
          </span>
        ))}

        {layoutQ.isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-semibold text-slate-500">
            Chargement de l'aperçu…
          </div>
        )}
      </div>

      <p className="mt-2 text-center text-[11px] text-[color:var(--df-text-muted)]">
        À l'impression sur le formulaire pré-imprimé, seules les valeurs sont envoyées à l'imprimante.
      </p>
    </div>
  );
};

export default ContractPaperPreview;
