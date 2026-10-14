import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSettings } from '@/services/adminApi';
import { getApiBase } from '@/services/apiClient';

interface FieldDef {
  key: string;
  label: string;
  type: 'number' | 'text';
  suffix?: string;
  placeholder?: string;
  section: string;
}

const FIELDS: FieldDef[] = [
  { key: 'default_km_per_day', label: 'Kilométrage journalier inclus', type: 'number', suffix: 'km/jour', section: 'Tarification par défaut' },
  { key: 'default_km_per_month', label: 'Kilométrage mensuel inclus', type: 'number', suffix: 'km/mois', section: 'Tarification par défaut' },
  { key: 'default_deposit_mad', label: 'Caution / garantie', type: 'number', suffix: 'MAD', section: 'Tarification par défaut' },
  { key: 'default_penalty_per_km', label: 'Pénalité par km excédentaire', type: 'number', suffix: 'MAD/km', section: 'Tarification par défaut' },
  { key: 'default_tax_rate', label: 'Taux de TVA', type: 'number', suffix: '%', section: 'Tarification par défaut' },

  { key: 'default_payment_day', label: 'Jour de paiement attendu (1–31)', type: 'number', section: 'Paiement' },
  { key: 'default_payment_terms', label: 'Conditions de paiement', type: 'text', placeholder: 'Ex: Net 30 jours', section: 'Paiement' },

  { key: 'lld_min_days', label: 'Durée minimum', type: 'number', suffix: 'jours', section: 'Location Longue Durée (LLD)' },
  { key: 'lld_max_days', label: 'Durée maximum', type: 'number', suffix: 'jours', section: 'Location Longue Durée (LLD)' },

  { key: 'lcd_min_days', label: 'Durée minimum', type: 'number', suffix: 'jours', section: 'Location Courte Durée (LCD)' },
  { key: 'lcd_max_days', label: 'Durée maximum', type: 'number', suffix: 'jours', section: 'Location Courte Durée (LCD)' },

  { key: 'loa_min_days', label: 'Durée minimum', type: 'number', suffix: 'jours', section: "Location avec Option d’Achat (LOA)" },
  { key: 'loa_max_days', label: 'Durée maximum', type: 'number', suffix: 'jours', section: "Location avec Option d’Achat (LOA)" },

  { key: 'credit_min_days', label: 'Durée minimum', type: 'number', suffix: 'jours', section: 'Crédit Automobile' },
  { key: 'credit_max_days', label: 'Durée maximum', type: 'number', suffix: 'jours', section: 'Crédit Automobile' },
];

const RESERVATION_FIELDS: FieldDef[] = [];

/**
 * Catalog of contract types available in the wizard. The admin picks which
 * ones agents can create; LLD + LCD are on by default per the business rule
 * (short / long rental only). The CSV in enabled_contract_types feeds
 * ContractWizardPage (web) and new_contract_from_reservation_screen (mobile).
 */
const CONTRACT_TYPE_CATALOG: { value: string; label: string; sub: string }[] = [
  { value: 'LLD', label: 'Location Longue Durée (LLD)', sub: 'Sans option d’achat' },
  { value: 'LOCATION_COURTE', label: 'Location Courte Durée (LCD)', sub: 'Journalière / hebdomadaire' },
  { value: 'LOA', label: 'Location avec Option d’Achat (LOA)', sub: 'Valeur résiduelle fixée au contrat' },
  { value: 'CREDIT_AUTO', label: 'Crédit Automobile', sub: 'Financement bancaire interne' },
  { value: 'VENTE_VO', label: 'Vente Véhicule d’Occasion', sub: 'Transfert de propriété immédiat' },
];
const DEFAULT_ENABLED_TYPES = ['LLD', 'LOCATION_COURTE'];

function groupBySection(fields: FieldDef[]): [string, FieldDef[]][] {
  const map = new Map<string, FieldDef[]>();
  for (const f of fields) {
    const arr = map.get(f.section) ?? [];
    arr.push(f);
    map.set(f.section, arr);
  }
  return Array.from(map.entries());
}

/** Parse the stored CSV; fall back to the LLD + LCD default when empty. */
function parseEnabledTypes(csv: string): Set<string> {
  const trimmed = (csv ?? '').trim();
  if (!trimmed) return new Set(DEFAULT_ENABLED_TYPES);
  const parts = trimmed.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.length ? new Set(parts) : new Set(DEFAULT_ENABLED_TYPES);
}

/** Toggle grid for the five known contract types. */
function ContractTypesCard({ csv, onChange }: { csv: string; onChange: (csv: string) => void }) {
  const enabled = parseEnabledTypes(csv);
  const toggle = (value: string) => {
    const next = new Set(enabled);
    if (next.has(value)) {
      if (next.size === 1) return; // keep at least one type available
      next.delete(value);
    } else {
      next.add(value);
    }
    // Serialize in catalog order so the stored string stays canonical.
    const serialized = CONTRACT_TYPE_CATALOG
      .filter((t) => next.has(t.value))
      .map((t) => t.value)
      .join(',');
    onChange(serialized);
  };
  return (
    <div className="df-card">
      <div className="df-card__header">
        <h2 className="df-card__title">Types de contrats disponibles</h2>
      </div>
      <div className="df-card__body">
        <p className="mb-4 text-xs text-[color:var(--df-text-muted)]">
          Choisissez les types proposés aux agents dans le wizard de création. Les types décochés n'apparaîtront ni sur le web ni sur le mobile. Au moins un type doit rester actif.
        </p>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {CONTRACT_TYPE_CATALOG.map((t) => {
            const on = enabled.has(t.value);
            return (
              <label
                key={t.value}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-3 transition-colors ${
                  on ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 accent-indigo-600"
                  checked={on}
                  onChange={() => toggle(t.value)}
                />
                <div>
                  <div className="text-sm font-black text-slate-900">{t.label}</div>
                  <div className="text-[11px] text-slate-500">{t.sub}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SectionCard({ title, fields, values, onChange }: {
  title: string;
  fields: FieldDef[];
  values: Record<string, string>;
  onChange: (key: string, val: string) => void;
}) {
  return (
    <div className="df-card">
      <div className="df-card__header">
        <h2 className="df-card__title">{title}</h2>
      </div>
      <div className="df-card__body">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="df-label">{f.label}</label>
              <div className="flex items-center gap-2">
                <input
                  type={f.type}
                  className="df-input"
                  placeholder={f.placeholder}
                  value={values[f.key] ?? ''}
                  onChange={(e) => onChange(f.key, e.target.value)}
                />
                {f.suffix && (
                  <span className="text-xs font-bold text-[color:var(--df-text-muted)] whitespace-nowrap">{f.suffix}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const ContractSettingsPage: React.FC = () => {
  const qc = useQueryClient();
  const [contractValues, setContractValues] = useState<Record<string, string>>({});
  const [reservationValues, setReservationValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const contractsQ = useQuery({
    queryKey: ['settings', 'contracts'],
    queryFn: () => getSettings('contracts'),
    enabled: !!getApiBase(),
  });

  const reservationsQ = useQuery({
    queryKey: ['settings', 'reservations'],
    queryFn: () => getSettings('reservations'),
    enabled: !!getApiBase(),
  });

  useEffect(() => {
    if (contractsQ.data?.data?.settings) setContractValues(contractsQ.data.data.settings);
  }, [contractsQ.data]);

  useEffect(() => {
    if (reservationsQ.data?.data?.settings) setReservationValues(reservationsQ.data.data.settings);
  }, [reservationsQ.data]);

  const saveMut = useMutation({
    mutationFn: async () => {
      await Promise.all([
        updateSettings('contracts', contractValues),
        updateSettings('reservations', reservationValues),
      ]);
    },
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const contractSections = groupBySection(FIELDS);
  const reservationSections = groupBySection(RESERVATION_FIELDS);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black">Paramètres Contrats & Réservations</h1>
        <p className="text-[color:var(--df-text-muted)]">Valeurs par défaut, limites de durée et conditions financières.</p>
      </header>

      <div className="space-y-5">
        <ContractTypesCard
          csv={contractValues['enabled_contract_types'] ?? ''}
          onChange={(csv) =>
            setContractValues((prev) => ({ ...prev, enabled_contract_types: csv }))
          }
        />

        {contractSections.map(([section, fields]) => (
          <SectionCard
            key={section}
            title={section}
            fields={fields}
            values={contractValues}
            onChange={(k, v) => setContractValues((prev) => ({ ...prev, [k]: v }))}
          />
        ))}

        {reservationSections.map(([section, fields]) => (
          <SectionCard
            key={section}
            title={section}
            fields={fields}
            values={reservationValues}
            onChange={(k, v) => setReservationValues((prev) => ({ ...prev, [k]: v }))}
          />
        ))}
      </div>

      <div className="flex items-center gap-4">
        <button
          type="button"
          className="df-btn df-btn--primary"
          disabled={saveMut.isPending}
          onClick={() => saveMut.mutate()}
        >
          {saveMut.isPending ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {saved && <span className="text-sm font-bold text-emerald-600">Paramètres enregistrés avec succès.</span>}
        {saveMut.isError && <span className="text-sm font-bold text-red-600">Erreur lors de la sauvegarde.</span>}
      </div>
    </div>
  );
};
