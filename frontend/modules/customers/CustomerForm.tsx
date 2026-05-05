import React, { useState } from 'react';
import type {
  Customer,
  CustomerCreatePayload,
  CustomerType,
  IndividualProfile,
  CompanyProfile,
} from '@/services/customersApi';
import type { Branch } from '@/services/adminApi';

export const CustomerForm: React.FC<{
  mode: 'create' | 'edit';
  initial?: Customer | null;
  error: string | null;
  submitting: boolean;
  branches: Branch[];
  onCancel: () => void;
  onSubmit: (payload: CustomerCreatePayload) => void;
}> = ({ mode, initial, error, submitting, branches, onCancel, onSubmit }) => {
  const [type, setType] = useState<CustomerType>(initial?.customer_type ?? 'PARTICULIER');
  const [customerCode, setCustomerCode] = useState(initial?.customer_code ?? '');
  const [status, setStatus] = useState<Customer['status']>(initial?.status ?? 'active');
  const [language, setLanguage] = useState(initial?.preferred_language ?? 'fr');
  const [branchId, setBranchId] = useState<string>(initial?.branch_id ?? '');
  const [sourceChannel, setSourceChannel] = useState(initial?.source_channel ?? '');

  const [individual, setIndividual] = useState<Partial<IndividualProfile>>(
    initial?.individual_profile ?? {
      first_name: '',
      last_name: '',
      nationality: 'MA',
    },
  );
  const [company, setCompany] = useState<Partial<CompanyProfile>>(initial?.company_profile ?? { legal_name: '' });

  // Optional primary contact + address created with the customer
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [city, setCity] = useState('');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload: CustomerCreatePayload = {
      customer_type: type,
      customer_code: customerCode || undefined,
      status,
      preferred_language: language as 'fr' | 'en' | 'ar',
      branch_id: branchId || null,
      source_channel: sourceChannel || undefined,
      contacts: [],
      addresses: [],
    };
    if (type === 'PARTICULIER') {
      payload.individual_profile = {
        ...individual,
        first_name: individual.first_name ?? '',
        last_name: individual.last_name ?? '',
      };
    } else {
      payload.company_profile = { ...company, legal_name: company.legal_name ?? '' };
    }
    if (phone) {
      payload.contacts!.push({ contact_type: 'phone', value: phone, is_primary: true });
    }
    if (email) {
      payload.contacts!.push({ contact_type: 'email', value: email, is_primary: true });
    }
    if (addressLine) {
      payload.addresses!.push({
        address_type: 'home',
        address_line_1: addressLine,
        city: city || null,
        country_code: 'MA',
        is_primary: true,
      });
    }
    onSubmit(payload);
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
          {error}
        </div>
      )}

      {/* Type selector */}
      <div>
        <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Type de client</div>
        <div className="grid grid-cols-2 gap-2">
          {(['PARTICULIER', 'ENTREPRISE'] as CustomerType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              disabled={mode === 'edit'}
              className={`rounded-xl border px-4 py-3 text-sm font-bold transition ${
                type === t ? 'border-indigo-400 bg-indigo-50 text-indigo-900' : 'border-slate-200 text-slate-600'
              } ${mode === 'edit' ? 'opacity-60' : ''}`}
            >
              {t === 'PARTICULIER' ? 'Particulier' : 'Entreprise'}
            </button>
          ))}
        </div>
      </div>

      <section className="space-y-3">
        <SectionTitle>Dossier</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Code client (laisser vide pour auto)">
            <input
              className="df-input"
              value={customerCode}
              onChange={(e) => setCustomerCode(e.target.value.toUpperCase())}
              placeholder="AUTO"
            />
          </Field>
          <Field label="Agence">
            <select className="df-input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="">—</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Statut">
            <select
              className="df-input"
              value={status}
              onChange={(e) => setStatus(e.target.value as Customer['status'])}
            >
              <option value="active">Actif</option>
              <option value="inactive">Inactif</option>
              <option value="suspended">Suspendu</option>
            </select>
          </Field>
          <Field label="Langue">
            <select className="df-input" value={language} onChange={(e) => setLanguage(e.target.value)}>
              <option value="fr">Français</option>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </select>
          </Field>
          <Field label="Canal d'acquisition">
            <input
              className="df-input"
              value={sourceChannel}
              onChange={(e) => setSourceChannel(e.target.value)}
              placeholder="web, agence, apporteur, …"
            />
          </Field>
        </div>
      </section>

      {type === 'PARTICULIER' ? (
        <section className="space-y-3">
          <SectionTitle>Identité particulier</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Prénom">
              <input
                className="df-input"
                required
                value={individual.first_name ?? ''}
                onChange={(e) => setIndividual((p) => ({ ...p, first_name: e.target.value }))}
              />
            </Field>
            <Field label="Nom">
              <input
                className="df-input"
                required
                value={individual.last_name ?? ''}
                onChange={(e) => setIndividual((p) => ({ ...p, last_name: e.target.value }))}
              />
            </Field>
            <Field label="CIN">
              <input
                className="df-input"
                value={individual.national_id_number ?? ''}
                onChange={(e) => setIndividual((p) => ({ ...p, national_id_number: e.target.value }))}
              />
            </Field>
            <Field label="Date de naissance">
              <input
                type="date"
                className="df-input"
                value={individual.date_of_birth ?? ''}
                onChange={(e) => setIndividual((p) => ({ ...p, date_of_birth: e.target.value }))}
              />
            </Field>
            <Field label="Nationalité">
              <input
                className="df-input"
                maxLength={2}
                value={individual.nationality ?? ''}
                onChange={(e) => setIndividual((p) => ({ ...p, nationality: e.target.value.toUpperCase() }))}
              />
            </Field>
            <Field label="Permis de conduire n°">
              <input
                className="df-input"
                value={individual.driving_license_number ?? ''}
                onChange={(e) => setIndividual((p) => ({ ...p, driving_license_number: e.target.value }))}
              />
            </Field>
            <Field label="Expiration permis">
              <input
                type="date"
                className="df-input"
                value={individual.driving_license_expiry ?? ''}
                onChange={(e) => setIndividual((p) => ({ ...p, driving_license_expiry: e.target.value }))}
              />
            </Field>
            <Field label="Profession">
              <input
                className="df-input"
                value={individual.profession ?? ''}
                onChange={(e) => setIndividual((p) => ({ ...p, profession: e.target.value }))}
              />
            </Field>
            <Field label="Employeur">
              <input
                className="df-input"
                value={individual.employer_name ?? ''}
                onChange={(e) => setIndividual((p) => ({ ...p, employer_name: e.target.value }))}
              />
            </Field>
            <Field label="Revenu mensuel (MAD)">
              <input
                type="number"
                step="0.01"
                className="df-input"
                value={individual.monthly_income ?? ''}
                onChange={(e) =>
                  setIndividual((p) => ({ ...p, monthly_income: e.target.value ? Number(e.target.value) : null }))
                }
              />
            </Field>
          </div>
        </section>
      ) : (
        <section className="space-y-3">
          <SectionTitle>Identité entreprise</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Raison sociale">
              <input
                className="df-input"
                required
                value={company.legal_name ?? ''}
                onChange={(e) => setCompany((p) => ({ ...p, legal_name: e.target.value }))}
              />
            </Field>
            <Field label="Nom commercial">
              <input
                className="df-input"
                value={company.trade_name ?? ''}
                onChange={(e) => setCompany((p) => ({ ...p, trade_name: e.target.value }))}
              />
            </Field>
            <Field label="RC (Registre de commerce)">
              <input
                className="df-input"
                value={company.registration_number ?? ''}
                onChange={(e) => setCompany((p) => ({ ...p, registration_number: e.target.value }))}
              />
            </Field>
            <Field label="ICE">
              <input
                className="df-input"
                value={company.ice ?? ''}
                onChange={(e) => setCompany((p) => ({ ...p, ice: e.target.value }))}
              />
            </Field>
            <Field label="Identifiant fiscal (IF)">
              <input
                className="df-input"
                value={company.tax_identifier ?? ''}
                onChange={(e) => setCompany((p) => ({ ...p, tax_identifier: e.target.value }))}
              />
            </Field>
            <Field label="N° CNSS">
              <input
                className="df-input"
                value={company.cnss_number ?? ''}
                onChange={(e) => setCompany((p) => ({ ...p, cnss_number: e.target.value }))}
              />
            </Field>
            <Field label="Date d'immatriculation">
              <input
                type="date"
                className="df-input"
                value={company.incorporation_date ?? ''}
                onChange={(e) => setCompany((p) => ({ ...p, incorporation_date: e.target.value }))}
              />
            </Field>
            <Field label="Activité">
              <input
                className="df-input"
                value={company.business_activity ?? ''}
                onChange={(e) => setCompany((p) => ({ ...p, business_activity: e.target.value }))}
              />
            </Field>
            <Field label="CA annuel (MAD)">
              <input
                type="number"
                step="0.01"
                className="df-input"
                value={company.annual_turnover ?? ''}
                onChange={(e) =>
                  setCompany((p) => ({ ...p, annual_turnover: e.target.value ? Number(e.target.value) : null }))
                }
              />
            </Field>
            <Field label="Représentant légal">
              <input
                className="df-input"
                value={company.legal_representative_name ?? ''}
                onChange={(e) => setCompany((p) => ({ ...p, legal_representative_name: e.target.value }))}
              />
            </Field>
            <Field label="CIN du représentant">
              <input
                className="df-input"
                value={company.legal_representative_id_number ?? ''}
                onChange={(e) => setCompany((p) => ({ ...p, legal_representative_id_number: e.target.value }))}
              />
            </Field>
          </div>
        </section>
      )}

      {mode === 'create' && (
        <section className="space-y-3">
          <SectionTitle>Coordonnées (facultatif)</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Téléphone">
              <input className="df-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Email">
              <input type="email" className="df-input" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Adresse">
              <input
                className="df-input"
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                placeholder="Rue, n°, appartement"
              />
            </Field>
            <Field label="Ville">
              <input className="df-input" value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
          </div>
        </section>
      )}

      <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t border-slate-100 bg-white/90 px-5 py-4 backdrop-blur">
        <button type="button" onClick={onCancel} className="df-btn df-btn--ghost">
          Annuler
        </button>
        <button type="submit" disabled={submitting} className="df-btn df-btn--primary disabled:opacity-60">
          {submitting ? 'Enregistrement…' : mode === 'create' ? 'Créer le client' : 'Mettre à jour'}
        </button>
      </div>
    </form>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-500">{label}</label>
    {children}
  </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="text-sm font-black uppercase tracking-wider text-slate-700">{children}</h3>
);
