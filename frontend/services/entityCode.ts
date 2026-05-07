// Display-only short codes for UUID-keyed entities.
//
// When an entity already has a human code (customer_code, vehicle_code,
// reference, contract_number, …) prefer that. Otherwise derive a stable
// 3-digit display code from the UUID so users never see a raw UUID in the UI.

const UUID_RE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

function looksLikeUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Deterministic 3-digit display number derived from a UUID.
 * Same UUID always maps to the same 3-digit string, but uniqueness is not guaranteed.
 */
function uuidToDisplayNumber(uuid: string): string {
  const hex = uuid.replace(/-/g, '').slice(0, 8) || '0';
  const n = parseInt(hex, 16);
  if (!Number.isFinite(n)) return '000';
  const three = n % 1000;
  return three.toString().padStart(3, '0');
}

/**
 * Format any UUID/code for display.
 * - Empty / null → '—'
 * - Already-coded values (CUST-XXX, V-001, contract numbers, …) → returned as-is
 * - Raw UUID → `${prefix}${3-digit-derived}` e.g. C047
 */
export function formatEntityCode(prefix: string, idOrCode: string | number | null | undefined): string {
  if (idOrCode == null || idOrCode === '') return '—';
  const s = String(idOrCode);
  if (!looksLikeUuid(s)) return s;
  return `${prefix}${uuidToDisplayNumber(s)}`;
}

export const formatClientCode   = (id: string | number | null | undefined): string => formatEntityCode('C', id);
export const formatVehicleCode  = (id: string | number | null | undefined): string => formatEntityCode('V', id);
export const formatContractCode = (id: string | number | null | undefined): string => formatEntityCode('CTR', id);
export const formatReservationCode = (id: string | number | null | undefined): string => formatEntityCode('R', id);
export const formatInvoiceCode  = (id: string | number | null | undefined): string => formatEntityCode('INV', id);
export const formatSupplierCode = (id: string | number | null | undefined): string => formatEntityCode('S', id);
