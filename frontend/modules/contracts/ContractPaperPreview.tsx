import React from 'react';
import { formatCurrencyMad, formatDate } from '@/modules/shared/formatters';

/**
 * Aperçu du contrat dans la mise en page du contrat papier de l'agence — mêmes
 * blocs, même ordre que le PDF généré, remplis avec ce que l'assistant a saisi.
 */
export const ContractPaperPreview: React.FC<{
  clientName?: string | null;
  clientId?: string | null;
  clientLicense?: string | null;
  clientAddress?: string | null;
  clientPhone?: string | null;
  secondDriver?: string | null;
  brandModel?: string | null;
  registration?: string | null;
  fuel?: string | null;
  insuranceExpiry?: string | null;
  vignetteExpiry?: string | null;
  techControlExpiry?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  days: number;
  kmPerMonth: number;
  totalAmount: number;
  deposit: number;
  paymentTerms?: string | null;
}> = (p) => {
  const dash = (v?: string | number | null) => (v === null || v === undefined || v === '' ? '—' : String(v));
  const date = (v?: string | null) => (v ? formatDate(v) : '—');
  const valid = (v?: string | null) => !!v && new Date(v).getTime() >= Date.now();

  const papers: Array<[string, boolean]> = [
    ["L'Assurance", valid(p.insuranceExpiry)],
    ['La Carte Grise', !!p.registration],
    ['Autorisation de circulation', !!p.registration],
    ['Vignette', valid(p.vignetteExpiry)],
    ['La visite technique', valid(p.techControlExpiry)],
  ];

  return (
    <div className="rounded-2xl border border-[color:var(--df-border)] bg-[color:var(--df-surface-sunk)] p-5">
      <div className="df-card__hint mb-3">Aperçu du contrat — mise en page du PDF généré</div>

      <div className="space-y-3 rounded-xl border border-[color:var(--df-border)] bg-[color:var(--df-surface-solid)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[color:var(--df-border-strong)] pb-2">
          <div className="rounded bg-slate-900 px-3 py-1.5 text-center text-white">
            <div className="text-[13px] font-black tracking-wider">MALYSIA CAR PRO</div>
            <div className="text-[8px] tracking-[0.2em] text-amber-400">LOCATION DE VOITURES</div>
          </div>
          <div className="text-end">
            <div className="text-[15px] font-black tracking-wide">CONTRAT DE LOCATION</div>
            <div className="text-[12px] font-bold text-[color:var(--df-text-muted)]">
              N° attribué à l’enregistrement / {new Date(p.startDate ?? Date.now()).getFullYear()}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-3">
            <Box title="Locataire">
              <Line k="Nom :" v={dash(p.clientName)} />
              <Line k="CIN :" v={dash(p.clientId)} />
              <Line k="Permis de conduite N° :" v={dash(p.clientLicense)} />
              <Line k="Adresse :" v={dash(p.clientAddress)} />
              <Line k="Tél. :" v={dash(p.clientPhone)} />
            </Box>

            <Box title="Deuxième conducteur">
              <Line k="Nom :" v={dash(p.secondDriver)} />
            </Box>

            <Box title="Check list — état du véhicule">
              <p className="py-4 text-center text-[11px] text-[color:var(--df-text-muted)]">
                Rempli à la remise puis au retour du véhicule (km, carburant, état).
              </p>
            </Box>
          </div>

          <div className="space-y-3">
            <Box title="Information sur véhicule">
              <Line k="Marque :" v={dash(p.brandModel)} />
              <Line k="Immatriculation :" v={dash(p.registration)} />
              <Line k="Date de départ :" v={date(p.startDate)} />
              <Line k="Date de retour :" v={date(p.endDate)} />
              <Line k="Carburant :" v={dash(p.fuel)} />
              <Line k="Nombre de jours :" v={p.days > 0 ? p.days : '—'} />
              <Line k="Km inclus / mois :" v={p.kmPerMonth ? p.kmPerMonth.toLocaleString('fr-MA') : '—'} />
              <Line k="Prix unitaire :" v={p.days > 0 ? formatCurrencyMad(p.totalAmount / p.days) : '—'} />
              <Line k="Montant T.T.C :" v={formatCurrencyMad(p.totalAmount)} />
              <Line k="Franchise d'assurance :" v={formatCurrencyMad(p.deposit)} />
              <Line k="Mode de règlement :" v={dash(p.paymentTerms)} />
            </Box>

            <Box title="Contrôle papiers véhicule">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="text-[10px] uppercase text-[color:var(--df-text-muted)]">
                    <th />
                    <th className="w-12 text-center">Oui</th>
                    <th className="w-12 text-center">Non</th>
                  </tr>
                </thead>
                <tbody>
                  {papers.map(([label, ok]) => (
                    <tr key={label} className="border-t border-[color:var(--df-border)]">
                      <td className="py-1">{label}</td>
                      <td className="text-center font-black text-emerald-600">{ok ? '×' : ''}</td>
                      <td className="text-center font-black text-rose-600">{ok ? '' : '×'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 border-t border-[color:var(--df-border)] pt-2 text-[11px] font-bold leading-5">
                <div>Pneu Petite Voiture 600,00 Dhs</div>
                <div>Pneu Moyenne Voiture 1500,00 Dhs</div>
                <div>Pneu Voiture 4*4 3000,00 Dhs Ou Plus</div>
              </div>
            </Box>
          </div>
        </div>

        <div className="rounded-lg border border-[color:var(--df-border-strong)] px-3 py-1.5 text-center text-[12px] font-bold">
          Si le retour de la voiture dépasse 19h vous devez payer une pénalité de retard de 200 Dhs
        </div>
        <p className="text-center text-[11px] italic text-[color:var(--df-text-muted)]">
          * Je reconnais avoir pris connaissance des conditions générales de location au verso du contrat
          et j’accepte de m’y conformer.
        </p>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {['Deuxième Conducteur', 'Signature du Locataire', 'Signature Agent', 'Restitution'].map((l) => (
            <div key={l} className="rounded-lg border border-[color:var(--df-border-strong)]">
              <div className="border-b border-[color:var(--df-border-strong)] bg-[color:var(--df-surface-sunk)] px-2 py-1 text-center text-[10px] font-bold">
                {l}
              </div>
              <div className="h-14" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const Line: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <div className="flex gap-1.5 border-b border-dotted border-[color:var(--df-border)] py-[3px] text-[12px]">
    <span className="shrink-0 text-[color:var(--df-text-muted)]">{k}</span>
    <span className="font-semibold">{v}</span>
  </div>
);

const Box: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-lg border border-[color:var(--df-border-strong)]">
    <div className="border-b border-[color:var(--df-border-strong)] bg-[color:var(--df-surface-sunk)] px-3 py-1.5 text-center text-[11px] font-black uppercase tracking-wider">
      {title}
    </div>
    <div className="px-3 py-2">{children}</div>
  </div>
);

export default ContractPaperPreview;
