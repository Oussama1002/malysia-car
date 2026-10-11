/**
 * Logo d'une marque automobile, servi depuis /brands.
 *
 * Les marques sont saisies à la main : « Mercedes-Benz », « VW », « Land Rover »,
 * avec ou sans accent ni tiret. On ramène tout à un identifiant simple avant de
 * chercher le fichier, et on renvoie null quand la marque n'a pas de logo —
 * l'appelant affiche alors son propre repli.
 */

/** Fichiers présents dans public/brands (sans l'extension). */
const AVAILABLE = new Set([
  'abarth', 'alfa-romeo', 'audi', 'bmw', 'chery', 'chevrolet', 'chrysler', 'citroen',
  'cupra', 'dacia', 'daihatsu', 'dfsk', 'dodge', 'ds', 'fiat', 'ford', 'foton', 'gaz',
  'honda', 'hummer', 'hyundai', 'isuzu', 'jaguar', 'jeep', 'kia', 'lancia', 'land-rover',
  'lexus', 'mahindra', 'maserati', 'mazda', 'mercedes', 'mini', 'mitsubishi', 'nissan',
  'opel', 'peugeot', 'porsche', 'renault', 'seat', 'skoda', 'ssangyong', 'subaru',
  'suzuki', 'tesla', 'toyota', 'volkswagen', 'volvo',
]);

/** Ce que les gens tapent → le fichier correspondant. */
const ALIASES: Record<string, string> = {
  'mercedes-benz': 'mercedes',
  'mercedesbenz': 'mercedes',
  mb: 'mercedes',
  vw: 'volkswagen',
  'volks-wagen': 'volkswagen',
  'land-rover': 'land-rover',
  landrover: 'land-rover',
  'range-rover': 'land-rover',
  rangerover: 'land-rover',
  'alfa-romeo': 'alfa-romeo',
  alfaromeo: 'alfa-romeo',
  'alfa': 'alfa-romeo',
  'ds-automobiles': 'ds',
  'citroën': 'citroen',
  'skoda': 'skoda',
  'škoda': 'skoda',
  'ssang-yong': 'ssangyong',
  byd: '',
};

function slugify(brand: string): string {
  return brand
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** URL du logo, ou null si la marque n'en a pas. */
export function brandLogoUrl(brand?: string | null): string | null {
  if (!brand) {
    return null;
  }

  const slug = slugify(brand);
  if (slug === '') {
    return null;
  }

  const resolved = ALIASES[slug] ?? slug;
  if (resolved === '' || !AVAILABLE.has(resolved)) {
    // « Mercedes Classe C » : la marque est parfois collée au modèle.
    const firstWord = resolved.split('-')[0];
    return AVAILABLE.has(firstWord) ? `/brands/${firstWord}.png` : null;
  }

  return `/brands/${resolved}.png`;
}
