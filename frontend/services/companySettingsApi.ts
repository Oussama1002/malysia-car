import { apiClient } from '@/services/apiClient';

export interface CompanySettingsPayload {
  reservations: {
    auto_cancel_hours: number;
    confirmation_lead_hours: number;
    allow_same_day_pickup: boolean;
    default_type: string;
    require_deposit: boolean;
    lld_threshold_months: number;
  };
  contracts: {
    default_km_per_month: number;
    default_deposit_mad: number;
    default_deposit_pct: number;
    default_expected_day: number;
    default_payment_terms: string;
    approval_threshold_mad: number;
    default_penalty_per_day: number;
    contract_number_prefix: string;
    contract_number_padding: number;
    auto_generate_pdf: boolean;
    /** CSV of allowed contract types ('LLD,LOCATION_COURTE,LOA,…').
     *  Empty / unset means the business default (LLD + LCD only). */
    enabled_contract_types: string;
  };
  invoicing: {
    invoice_number_prefix: string;
    invoice_number_padding: number;
    default_tva_pct: number;
    default_net_days: number;
    due_date_source: 'reservation_end' | 'issue_date_plus_net';
    legal_footer: string;
    currency_code: string;
  };
  payments: {
    default_currency: string;
    accept_partial: boolean;
    cheque_grace_days: number;
    payment_number_prefix: string;
  };
  notifications: {
    insurance_warning_days: number;
    tech_control_warning_days: number;
    vignette_warning_days: number;
    maintenance_warning_km: number;
    contract_expiry_warning_days: number;
    send_whatsapp_confirmation: boolean;
    send_email_reminders: boolean;
  };
  branding: {
    company_display_name: string;
    company_ice: string;
    company_rc: string;
    company_if: string;
    company_cnss: string;
    default_language: string;
    timezone: string;
  };
  gps: {
    provider: string;
    api_base_url: string;
    api_key: string;
    api_secret: string;
    account_id: string;
    refresh_interval_seconds: number;
    live_tracking_enabled: boolean;
    trip_recording_enabled: boolean;
    geofences_enabled: boolean;
    idle_alert_minutes: number;
    speed_alert_kmh: number;
    position_retention_days: number;
  };
  clients: {
    /** CSV of document codes required BEFORE a contract can be generated,
     *  for individual customers. Document codes match the EntityDocuments
     *  / mobile Annexes keys: cin, passport, driving_license,
     *  address_proof, income_proof, rib, cnss_cert. */
    required_documents_individual: string;
    /** Same for enterprise customers: rc_cert, ice_cert, cnss_cert,
     *  financial_statements, rib, etc. */
    required_documents_entreprise: string;
    min_client_age: number;
    min_driving_license_months: number;
    document_expiry_warning_days: number;
    require_compliance_before_contract: boolean;
    block_contract_if_documents_missing: boolean;
    require_second_driver_license: boolean;
    kyc_manual_approval_required: boolean;
    max_active_contracts_per_client: number;
    blacklist_blocks_new_reservations: boolean;
    customer_code_prefix: string;
    customer_code_padding: number;
    customer_code_auto_generate: boolean;
    default_customer_type: 'individual' | 'entreprise';
    default_customer_language: 'fr' | 'ar' | 'en';
  };
}

export const companySettingsApi = {
  get: () => apiClient<{ data: CompanySettingsPayload }>('/v1/company-settings'),
  update: (payload: Partial<CompanySettingsPayload>) =>
    apiClient<{ data: CompanySettingsPayload }>('/v1/company-settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
};
