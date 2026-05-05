import { apiClient } from '@/services/apiClient';
import type { Paginated } from '@/services/adminApi';

// ============================================================================
// Types
// ============================================================================

export type UsedCarStage = 'draft' | 'evaluated' | 'published' | 'reserved' | 'sold' | 'cancelled';

export interface UsedCarListing {
  id: string;
  vehicle_id: string;
  company_id?: string | null;
  branch_id?: string | null;
  listing_code: string;
  stage: UsedCarStage;
  publication_channel?: string | null;
  asking_price?: number | null;
  min_acceptable_price?: number | null;
  estimated_value?: number | null;
  valuation_score?: number | null;
  inspection_score?: number | null;
  inspection_notes?: unknown;
  mileage_at_listing?: number | null;
  published_at?: string | null;
  reserved_at?: string | null;
  reserved_by_customer_id?: string | null;
  reserved_until?: string | null;
  sold_at?: string | null;
  sold_to_customer_id?: string | null;
  final_sale_price?: number | null;
  currency_code: string;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
  vehicle?: {
    id: string;
    registration_number?: string | null;
    vin?: string | null;
    year?: number | null;
    color?: string | null;
    odometer?: number | null;
    brand?: { id: string; name: string } | null;
    model?: { id: string; name: string } | null;
  } | null;
  reserved_by?: { id: string; full_name?: string | null } | null;
  sold_to?: { id: string; full_name?: string | null } | null;
  valuations?: UsedCarValuation[];
  sales?: UsedCarSale[];
}

export interface UsedCarValuation {
  id: string;
  listing_id: string;
  method: 'expert' | 'argus' | 'comparable' | 'automated';
  market_value?: number | null;
  trade_in_value?: number | null;
  suggested_price?: number | null;
  condition_score?: number | null;
  mileage?: number | null;
  factors?: Record<string, unknown> | null;
  notes?: string | null;
  valued_by_user_id?: string | null;
  valued_at?: string | null;
  created_at?: string;
}

export interface UsedCarSale {
  id: string;
  listing_id: string;
  vehicle_id: string;
  buyer_customer_id: string;
  branch_id?: string | null;
  sale_number: string;
  sale_price: number;
  discount_amount?: number | null;
  vat_mode?: 'standard' | 'margin' | 'exempt';
  vat_rate?: number | null;
  tax_amount?: number | null;
  taxable_base?: number | null;
  net_sale_amount?: number | null;
  total_amount: number;
  currency_code: string;
  payment_method: 'cash' | 'bank_transfer' | 'check' | 'card' | 'financed';
  payment_status: 'pending' | 'partial' | 'paid';
  amount_paid?: number | null;
  sale_date: string;
  invoice_id?: string | null;
  accounting_entry_id?: string | null;
  accounting_status?: 'pending' | 'posted' | 'skipped_override';
  transfer_status?: 'initiated' | 'docs_submitted' | 'stamped' | 'completed' | 'failed';
  contract_id?: string | null;
  notes?: string | null;
  buyer?: { id: string; full_name?: string | null } | null;
  ownership_transfers?: VehicleOwnershipTransfer[];
}

export interface VehicleOwnershipTransfer {
  id: string;
  vehicle_id: string;
  sale_id?: string | null;
  to_customer_id?: string | null;
  transfer_type: 'sale' | 'lease_buyout' | 'scrap' | 'return';
  transfer_status: 'initiated' | 'docs_submitted' | 'stamped' | 'completed' | 'failed';
  transfer_date?: string | null;
  admin_reference?: string | null;
  documents?: unknown;
  notes?: string | null;
  completed_at?: string | null;
}

// ============================================================================
// Params
// ============================================================================

export interface ListingListParams {
  stage?: UsedCarStage;
  branch_id?: string;
  publication_channel?: string;
  search?: string;
  page?: number;
  per_page?: number;
}

export interface ListingCreatePayload {
  vehicle_id: string;
  branch_id?: string;
  asking_price?: number;
  min_acceptable_price?: number;
  publication_channel?: string;
  mileage_at_listing?: number;
  inspection_score?: number;
  inspection_notes?: Record<string, unknown>;
  notes?: string;
}

export interface ListingUpdatePayload {
  asking_price?: number;
  min_acceptable_price?: number;
  publication_channel?: string;
  stage?: UsedCarStage;
  notes?: string;
}

export interface ValuationPayload {
  method: 'expert' | 'argus' | 'comparable' | 'automated';
  market_value?: number;
  trade_in_value?: number;
  suggested_price?: number;
  condition_score?: number;
  mileage?: number;
  factors?: Record<string, unknown>;
  notes?: string;
}

export interface SellPayload {
  buyer_customer_id: string;
  sale_price: number;
  discount_amount?: number;
  vat_mode?: 'standard' | 'margin' | 'exempt';
  vat_rate?: number;
  payment_method: 'cash' | 'bank_transfer' | 'check' | 'card' | 'financed';
  amount_paid?: number;
  sale_date?: string;
  branch_id?: string;
  contract_id?: string;
  notes?: string;
  override_without_invoice?: boolean;
  override_unpaid_transfer?: boolean;
  override_reason?: string;
}

export interface ReservePayload {
  customer_id: string;
  reserved_until?: string;
}

// ============================================================================
// Helpers
// ============================================================================

function q(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') sp.append(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ============================================================================
// API calls
// ============================================================================

export function listUsedCarListings(
  params: ListingListParams = {},
): Promise<Paginated<UsedCarListing>> {
  return apiClient<Paginated<UsedCarListing>>(`/v1/used-cars/listings${q(params as Record<string, unknown>)}`);
}

export function getUsedCarListing(id: string): Promise<{ data: UsedCarListing }> {
  return apiClient<{ data: UsedCarListing }>(`/v1/used-cars/listings/${id}`);
}

export function createUsedCarListing(payload: ListingCreatePayload): Promise<{ data: UsedCarListing }> {
  return apiClient<{ data: UsedCarListing }>(`/v1/used-cars/listings`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateUsedCarListing(
  id: string,
  payload: ListingUpdatePayload,
): Promise<{ data: UsedCarListing }> {
  return apiClient<{ data: UsedCarListing }>(`/v1/used-cars/listings/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function deleteUsedCarListing(id: string): Promise<{ message: string }> {
  return apiClient<{ message: string }>(`/v1/used-cars/listings/${id}`, { method: 'DELETE' });
}

export function evaluateListing(id: string, payload: ValuationPayload): Promise<{ data: UsedCarValuation }> {
  return apiClient<{ data: UsedCarValuation }>(`/v1/used-cars/listings/${id}/evaluate`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listValuations(id: string): Promise<{ data: UsedCarValuation[] }> {
  return apiClient<{ data: UsedCarValuation[] }>(`/v1/used-cars/listings/${id}/valuations`);
}

export function publishListing(id: string): Promise<{ data: UsedCarListing }> {
  return apiClient<{ data: UsedCarListing }>(`/v1/used-cars/listings/${id}/publish`, { method: 'POST' });
}

export function reserveListing(id: string, payload: ReservePayload): Promise<{ data: UsedCarListing }> {
  return apiClient<{ data: UsedCarListing }>(`/v1/used-cars/listings/${id}/reserve`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function cancelReservation(id: string): Promise<{ data: UsedCarListing }> {
  return apiClient<{ data: UsedCarListing }>(`/v1/used-cars/listings/${id}/reserve`, {
    method: 'DELETE',
  });
}

export function sellListing(id: string, payload: SellPayload): Promise<{ data: UsedCarSale }> {
  return apiClient<{ data: UsedCarSale }>(`/v1/used-cars/listings/${id}/sell`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function sellAndInvoiceListing(
  id: string,
  payload: SellPayload,
): Promise<{
  data: {
    sale: UsedCarSale;
    invoice?: { id: string; status: string; amount_due?: number | null; total_amount?: number | null } | null;
    payment?: { id: string; amount?: number | null } | null;
    transfer?: VehicleOwnershipTransfer | null;
    warnings?: string[];
  };
}> {
  return apiClient(`/v1/used-cars/listings/${id}/sell-and-invoice`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listTransfers(id: string): Promise<{ data: VehicleOwnershipTransfer[] }> {
  return apiClient<{ data: VehicleOwnershipTransfer[] }>(`/v1/used-cars/listings/${id}/transfers`);
}

export function updateTransfer(
  id: string,
  payload: {
    transfer_status: VehicleOwnershipTransfer['transfer_status'];
    admin_reference?: string;
    transfer_date?: string;
    notes?: string;
    documents?: Record<string, unknown>;
  },
): Promise<{ data: VehicleOwnershipTransfer }> {
  return apiClient<{ data: VehicleOwnershipTransfer }>(`/v1/vehicle-ownership-transfers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// Labels for stage badges
export const USED_CAR_STAGE_LABEL: Record<UsedCarStage, string> = {
  draft: 'Brouillon',
  evaluated: 'Évalué',
  published: 'Publié',
  reserved: 'Réservé',
  sold: 'Vendu',
  cancelled: 'Annulé',
};

export function usedCarStageTone(stage: UsedCarStage): 'default' | 'success' | 'warning' | 'danger' | 'info' {
  switch (stage) {
    case 'sold':
      return 'success';
    case 'published':
      return 'info';
    case 'reserved':
      return 'warning';
    case 'cancelled':
      return 'danger';
    case 'evaluated':
      return 'info';
    default:
      return 'default';
  }
}
