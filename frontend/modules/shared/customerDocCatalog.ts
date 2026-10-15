export interface CustomerDoc {
  code: string;
  label: string;
  sub: string;
}

export const CUSTOMER_DOC_CATALOG_INDIVIDUAL: CustomerDoc[] = [
  { code: 'cin',             label: "Pièce d'identité (CIN)",      sub: 'Recto / verso de la carte nationale' },
  { code: 'passport',        label: 'Passeport',                    sub: 'Pour les clients étrangers' },
  { code: 'driving_license', label: 'Permis de conduire',           sub: 'Recto obligatoire — verso recommandé' },
  { code: 'address_proof',   label: 'Justificatif de domicile',     sub: 'Facture < 3 mois, attestation, contrat de bail' },
  { code: 'income_proof',    label: 'Justificatif de revenus / CNSS', sub: 'Bulletin de paie, attestation employeur, CNSS' },
  { code: 'rib',             label: 'RIB',                          sub: 'Pour prélèvements et remboursement de caution' },
  { code: 'cnss_cert',       label: 'Attestation CNSS',             sub: 'Si demandée par le dossier LLD' },
];

export const CUSTOMER_DOC_CATALOG_ENTERPRISE: CustomerDoc[] = [
  { code: 'rc_cert',             label: 'Registre de commerce (RC)',          sub: "Modèle J ou extrait récent" },
  { code: 'ice_cert',             label: 'Attestation ICE',                    sub: "Identifiant commun de l'entreprise" },
  { code: 'if_cert',               label: 'Attestation IF',                     sub: 'Identifiant fiscal' },
  { code: 'cnss_cert',             label: 'Attestation CNSS',                   sub: 'Déclaration à jour' },
  { code: 'statuts',               label: 'Statuts de la société',              sub: 'Mise à jour la plus récente' },
  { code: 'rib',                   label: 'RIB entreprise',                     sub: 'Compte bancaire de la société' },
  { code: 'power_of_attorney',     label: 'Pouvoir du signataire',              sub: "Mandat autorisant la signature du contrat" },
  { code: 'financial_statements',  label: 'Bilans financiers (3 exercices)',    sub: 'Requis pour dossiers CREDIT_AUTO / LLD longue durée' },
];

export function parseRequiredDocsCsv(csv: string | undefined | null): Set<string> {
  const trimmed = (csv ?? '').trim();
  if (!trimmed) return new Set();
  return new Set(trimmed.split(',').map((s) => s.trim()).filter(Boolean));
}

/** Returns the catalog entries, filtered to the ones whose codes appear in `csv`.
 *  Preserves catalog order (never the user's CSV order) so the UI stays stable. */
export function requiredDocsFor(
  kind: 'PARTICULIER' | 'ENTREPRISE',
  csv: string | undefined | null,
): CustomerDoc[] {
  const picked = parseRequiredDocsCsv(csv);
  const catalog = kind === 'ENTREPRISE'
    ? CUSTOMER_DOC_CATALOG_ENTERPRISE
    : CUSTOMER_DOC_CATALOG_INDIVIDUAL;
  return catalog.filter((d) => picked.has(d.code));
}
