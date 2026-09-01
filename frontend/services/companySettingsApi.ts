import { apiClient } from '@/services/apiClient';

export interface CompanySettingsPayload {
  reservations: {
    auto_cancel_hours: number;
    confirmation_lead_hours: number;
    allow_same_day_pickup: boolean;
    default_type: string;
    require_deposit: boolean;
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
}

export const companySettingsApi = {
  get: () => apiClient<{ data: CompanySettingsPayload }>('/v1/company-settings'),
  update: (payload: Partial<CompanySettingsPayload>) =>
    apiClient<{ data: CompanySettingsPayload }>('/v1/company-settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
};
