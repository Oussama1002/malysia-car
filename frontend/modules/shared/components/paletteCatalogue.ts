import { GROUPS } from '@/modules/layout/navConfig';
import type { IconName } from './Icon';

export interface PaletteEntry {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon?: IconName;
  to?: string;
  shortcut?: string;
  /** Mots que l'utilisateur tape sans qu'ils figurent dans le libellé. */
  keywords?: string[];
}

/** Sans accents ni casse : « Réservations » se trouve en tapant « reservation ». */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Chaque onglet de Paramètres, avec ce qu'il contient. */
const SETTINGS_ENTRIES: PaletteEntry[] = [
  {
    id: 'set-invoicing',
    group: 'Paramètres',
    label: 'Facturation',
    hint: 'TVA par défaut, préfixe de facture, jours nets, mentions légales',
    icon: 'doc',
    to: '/settings/parameters?tab=invoicing',
    keywords: ['tva', 'taxe', 'taux', 'facture', 'facturation', 'numerotation', 'prefixe', 'echeance', 'mentions legales', 'devise'],
  },
  {
    id: 'set-contracts',
    group: 'Paramètres',
    label: 'Contrats',
    hint: 'Km inclus, franchise par défaut, jour de prélèvement, seuil d’approbation',
    icon: 'sign',
    to: '/settings/parameters?tab=contracts',
    keywords: ['km', 'kilometrage', 'kilometres inclus', 'franchise', 'caution', 'depot', 'penalite', 'approbation', 'prelevement', 'numerotation contrat'],
  },
  {
    id: 'set-reservations',
    group: 'Paramètres',
    label: 'Réservations',
    hint: 'Auto-annulation, rappels, type par défaut, seuil LCD / LLD',
    icon: 'calendar',
    to: '/settings/parameters?tab=reservations',
    keywords: ['annulation', 'rappel', 'lcd', 'lld', 'duree', 'seuil', 'caution obligatoire'],
  },
  {
    id: 'set-payments',
    group: 'Paramètres',
    label: 'Paiements',
    hint: 'Devise, paiements partiels, délai de grâce chèque',
    icon: 'coin',
    to: '/settings/parameters?tab=payments',
    keywords: ['devise', 'partiel', 'cheque', 'grace', 'prefixe paiement'],
  },
  {
    id: 'set-notifications',
    group: 'Paramètres',
    label: 'Notifications',
    hint: 'Alertes assurance, visite technique, vignette, maintenance',
    icon: 'bell',
    to: '/settings/parameters?tab=notifications',
    keywords: ['alerte', 'rappel', 'assurance', 'visite technique', 'vignette', 'maintenance', 'echeance'],
  },
  {
    id: 'set-branding',
    group: 'Paramètres',
    label: 'Entreprise',
    hint: 'Identité légale, ICE, RC, IF, CNSS, langue, fuseau horaire',
    icon: 'gear',
    to: '/settings/parameters?tab=branding',
    keywords: ['ice', 'rc', 'patente', 'cnss', 'raison sociale', 'societe', 'logo', 'langue', 'fuseau'],
  },
  {
    id: 'set-gps',
    group: 'Paramètres',
    label: 'GPS',
    hint: 'Fournisseur, endpoint API, clés, intervalle de rafraîchissement',
    icon: 'map',
    to: '/settings/parameters?tab=gps',
    keywords: ['gps', 'api', 'cle', 'tracking', 'geolocalisation'],
  },
];

/** Actions fréquentes, et raccourcis vers ce qu'on cherche souvent par son nom. */
const ACTION_ENTRIES: PaletteEntry[] = [
  { id: 'new-contract', group: 'Actions', label: 'Nouveau contrat', icon: 'plus', to: '/contracts/new', shortcut: 'N C', keywords: ['creer contrat', 'location'] },
  { id: 'new-reservation', group: 'Actions', label: 'Nouvelle réservation', icon: 'plus', to: '/reservations', keywords: ['reserver', 'louer'] },
  { id: 'new-customer', group: 'Actions', label: 'Nouveau client', icon: 'plus', to: '/customers', keywords: ['creer client', 'locataire'] },
  { id: 'new-vehicle', group: 'Actions', label: 'Nouveau véhicule', icon: 'plus', to: '/fleet', keywords: ['ajouter voiture', 'immatriculation', 'franchise vehicule'] },
  { id: 'go-payments', group: 'Actions', label: 'Encaisser un paiement', icon: 'coin', to: '/finance/payments', keywords: ['paiement', 'cheque', 'encaissement', 'especes', 'virement'] },
  { id: 'go-invoices', group: 'Actions', label: 'Factures', icon: 'doc', to: '/finance/invoices', keywords: ['facture', 'tva', 'avoir'] },
];

/**
 * Tout ce que la palette sait ouvrir : chaque page du menu, chaque onglet de
 * Paramètres, et les actions courantes.
 */
export function buildPaletteEntries(t: (key: string) => string): PaletteEntry[] {
  const navigation: PaletteEntry[] = GROUPS.flatMap((group) =>
    group.items.map((item) => ({
      id: 'nav-'.concat(item.to),
      group: t(group.labelKey),
      label: t(item.labelKey),
      icon: item.icon,
      to: item.to,
    })),
  );

  return [...navigation, ...ACTION_ENTRIES, ...SETTINGS_ENTRIES];
}

/** Tous les mots tapés doivent se retrouver quelque part dans l'entrée. */
export function matchesQuery(entry: PaletteEntry, query: string): boolean {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return true;
  }
  const haystack = normalizeSearch(
    [entry.label, entry.group, entry.hint ?? '', (entry.keywords ?? []).join(' ')].join(' '),
  );

  return words.every((word) => haystack.includes(word));
}
