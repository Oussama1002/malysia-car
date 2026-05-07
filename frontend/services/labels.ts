// Centralized French display labels for enum-style values.
// Use these helpers anywhere a backend code (e.g. "bank_transfer", "partially_paid")
// would otherwise leak into the UI.

const PAYMENT_METHOD: Record<string, string> = {
  cash: 'Espèces',
  bank_transfer: 'Virement bancaire',
  check: 'Chèque',
  cheque: 'Chèque',
  card: 'Carte bancaire',
  financed: 'Financement',
  other: 'Autre',
};

const PAYMENT_STATUS: Record<string, string> = {
  unpaid: 'Impayé',
  partial: 'Partiel',
  paid: 'Payé',
  pending: 'En attente',
  partially_paid: 'Payé partiellement',
  partially_allocated: 'Allocation partielle',
  unallocated: 'Non allouée',
  allocated: 'Allouée',
  overdue: 'En retard',
  reversed: 'Annulée',
  failed: 'Échouée',
};

const INSTALLMENT_STATUS: Record<string, string> = {
  pending: 'En attente',
  invoiced: 'Facturée',
  paid: 'Payée',
  partially_paid: 'Partiellement payée',
  overdue: 'En retard',
  cancelled: 'Annulée',
};

const FREQUENCY: Record<string, string> = {
  monthly: 'Mensuel',
  quarterly: 'Trimestriel',
  yearly: 'Annuel',
  one_time: 'Unique',
};

const CONTRACT_STATUS: Record<string, string> = {
  draft: 'Brouillon',
  pending_approval: 'En attente d\'approbation',
  approved: 'Approuvé',
  active: 'Actif',
  suspended: 'Suspendu',
  terminated: 'Résilié',
  expired: 'Expiré',
  cancelled: 'Annulé',
  closed: 'Clôturé',
  // Some envelopes return uppercase
  DRAFT: 'Brouillon',
  ACTIVE: 'Actif',
  PENDING: 'En attente',
  TERMINATED: 'Résilié',
  CLOSED: 'Clôturé',
};

const CONTRACT_TYPE: Record<string, string> = {
  LLD: 'Location longue durée',
  LOA: 'Location avec option d\'achat',
  CREDIT_AUTO: 'Crédit automobile',
  VENTE_VO: 'Vente véhicule d\'occasion',
  LOCATION_COURTE: 'Location courte durée',
};

const RESERVATION_STATUS: Record<string, string> = {
  draft: 'Brouillon',
  reserved: 'Réservée',
  confirmed: 'Confirmée',
  pickup_scheduled: 'Remise planifiée',
  handed_over: 'Remise effectuée',
  active: 'En cours',
  extension_requested: 'Extension demandée',
  return_scheduled: 'Retour planifié',
  returned: 'Retournée',
  inspection_pending: 'Inspection en attente',
  damage_pending: 'Dommage en attente',
  billing_pending: 'Facturation en attente',
  closed: 'Clôturée',
  cancelled: 'Annulée',
};

const ENVELOPE_STATUS: Record<string, string> = {
  draft: 'Brouillon',
  sent: 'Envoyée',
  in_progress: 'En cours',
  completed: 'Complétée',
  declined: 'Refusée',
  voided: 'Annulée',
  expired: 'Expirée',
  failed: 'Échec',
};

const ARREARS_STAGE: Record<string, string> = {
  new: 'Nouveau',
  reminder_1: '1er rappel',
  reminder_2: '2ème rappel',
  formal_notice: 'Mise en demeure',
  promise: 'Promesse de paiement',
  legal: 'Procédure judiciaire',
  repossession: 'Reprise du véhicule',
  closed: 'Clôturé',
  in_dunning: 'Relance en cours',
  escalated: 'Escaladé',
};

const SUPPLIER_AGENCY_STATUS: Record<string, string> = {
  active: 'Actif',
  inactive: 'Inactif',
  blacklisted: 'Liste noire',
};

const SUB_RENTAL_STATUS: Record<string, string> = {
  draft: 'Brouillon',
  active: 'Actif',
  returned: 'Retourné',
  closed: 'Clôturé',
  cancelled: 'Annulé',
};

const USED_CAR_STAGE: Record<string, string> = {
  draft: 'Brouillon',
  evaluated: 'Évalué',
  published: 'Publié',
  reserved: 'Réservé',
  sold: 'Vendu',
  cancelled: 'Annulé',
};

const PUBLICATION_CHANNEL: Record<string, string> = {
  internal: 'Interne',
  marketplace: 'Marketplace',
  auction: 'Enchère',
  partner: 'Partenaire',
};

// Generic fallback that turns "bank_transfer" or "PARTIALLY_PAID" into "Bank transfer" / "Partially paid"
export function humanize(raw: string | null | undefined): string {
  if (!raw) return '—';
  return String(raw)
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}

function get(map: Record<string, string>, value: string | null | undefined): string {
  if (value == null || value === '') return '—';
  return map[value] ?? map[String(value).toLowerCase()] ?? humanize(value);
}

export const labelPaymentMethod      = (v: string | null | undefined): string => get(PAYMENT_METHOD, v);
export const labelPaymentStatus      = (v: string | null | undefined): string => get(PAYMENT_STATUS, v);
export const labelInstallmentStatus  = (v: string | null | undefined): string => get(INSTALLMENT_STATUS, v);
export const labelFrequency          = (v: string | null | undefined): string => get(FREQUENCY, v);
export const labelContractStatus     = (v: string | null | undefined): string => get(CONTRACT_STATUS, v);
export const labelContractType       = (v: string | null | undefined): string => get(CONTRACT_TYPE, v);
export const labelReservationStatus  = (v: string | null | undefined): string => get(RESERVATION_STATUS, v);
export const labelEnvelopeStatus     = (v: string | null | undefined): string => get(ENVELOPE_STATUS, v);
export const labelArrearsStage       = (v: string | null | undefined): string => get(ARREARS_STAGE, v);
export const labelSupplierStatus     = (v: string | null | undefined): string => get(SUPPLIER_AGENCY_STATUS, v);
export const labelSubRentalStatus    = (v: string | null | undefined): string => get(SUB_RENTAL_STATUS, v);
export const labelUsedCarStage       = (v: string | null | undefined): string => get(USED_CAR_STAGE, v);
export const labelPublicationChannel = (v: string | null | undefined): string => get(PUBLICATION_CHANNEL, v);
