import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { companySettingsApi, type CompanySettingsPayload } from '@/services/companySettingsApi';

type Section = keyof CompanySettingsPayload;

const SECTION_META: Record<Section, { title: string; icon: string; hint: string }> = {
  reservations:  { title: 'Réservations',  icon: '📅', hint: 'Auto-annulation, rappels, type par défaut, exigence de caution.' },
  contracts:     { title: 'Contrats',      icon: '📄', hint: 'Km inclus, caution, jour de prélèvement, seuil d\'approbation, numérotation.' },
  invoicing:     { title: 'Facturation',   icon: '🧾', hint: 'Préfixes, TVA, jours nets, source d\'échéance, mentions légales.' },
  payments:      { title: 'Paiements',     icon: '💰', hint: 'Devise, paiements partiels, délai de grâce chèque.' },
  notifications: { title: 'Notifications', icon: '🔔', hint: 'Fenêtres d\'alerte pour assurance, visite technique, vignette, maintenance et fin de contrat.' },
  branding:      { title: 'Entreprise',    icon: '🏢', hint: 'Identité légale, ICE, RC, IF, CNSS, langue, fuseau horaire.' },
  gps:           { title: 'GPS',            icon: '📡', hint: 'Fournisseur GPS, endpoint API, clés, intervalle de rafraîchissement, alertes.' },
};

const isSection = (v: string | null): v is Section =>
  v === 'reservations' || v === 'contracts' || v === 'invoicing'
  || v === 'payments' || v === 'notifications' || v === 'branding' || v === 'gps';

export const ParametersPage: React.FC = () => {
  const q = useQuery({
    queryKey: ['company-settings'],
    queryFn: async () => (await companySettingsApi.get()).data,
  });
  const [searchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const tab: Section = isSection(urlTab) ? urlTab : 'reservations';
  const [draft, setDraft] = useState<CompanySettingsPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (q.data && !draft) setDraft(structuredClone(q.data));
  }, [q.data, draft]);

  const dirty = useMemo(() => {
    if (!draft || !q.data) return false;
    return JSON.stringify(draft) !== JSON.stringify(q.data);
  }, [draft, q.data]);

  const setField = <S extends Section, K extends keyof CompanySettingsPayload[S]>(section: S, key: K, value: CompanySettingsPayload[S][K]) => {
    setDraft((s) => (s ? { ...s, [section]: { ...s[section], [key]: value } } : s));
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true); setSaveError(null); setSaveOk(false);
    try {
      const res = await companySettingsApi.update(draft);
      setDraft(structuredClone(res.data));
      q.refetch();
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Erreur lors de l\'enregistrement');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => { if (q.data) setDraft(structuredClone(q.data)); };

  if (q.isLoading || !draft) {
    return <div className="p-6 text-sm text-slate-500">Chargement des paramètres…</div>;
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/settings" className="text-[11px] font-bold text-indigo-600">← Paramètres</Link>
          <h1 className="mt-1 text-2xl font-black text-slate-900">{SECTION_META[tab].title}</h1>
          <p className="text-sm text-slate-500">{SECTION_META[tab].hint}</p>
        </div>
        <div className="flex items-center gap-2">
          {saveOk && <span className="rounded-lg bg-emerald-100 px-3 py-1.5 text-xs font-black text-emerald-700">✓ Enregistré</span>}
          {saveError && <span className="rounded-lg bg-rose-100 px-3 py-1.5 text-xs font-black text-rose-700">{saveError}</span>}
          {dirty && (
            <button type="button" onClick={reset} disabled={saving} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              Annuler
            </button>
          )}
          <button type="button" onClick={save} disabled={saving || !dirty} className="rounded-xl bg-indigo-600 px-5 py-2 text-xs font-black uppercase tracking-widest text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </header>

      {/* Panel */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {tab === 'reservations' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <NumberField label="Auto-annulation brouillon (heures)" value={draft.reservations.auto_cancel_hours} onChange={(v) => setField('reservations', 'auto_cancel_hours', v)} hint="Une réservation en brouillon non validée est auto-annulée après ce délai." />
              <NumberField label="Rappel confirmation (heures avant début)" value={draft.reservations.confirmation_lead_hours} onChange={(v) => setField('reservations', 'confirmation_lead_hours', v)} />
              <SelectField label="Type par défaut" value={draft.reservations.default_type} onChange={(v) => setField('reservations', 'default_type', v)} options={[
                { value: 'SHORT_RENTAL', label: 'LCD (Location Courte Durée)' },
                { value: 'LONG_RENTAL',  label: 'Location longue durée' },
                { value: 'LLD',          label: 'LLD' },
                { value: 'LOA',          label: 'LOA' },
              ]} />
              <BoolField label="Autoriser prise en charge le jour même" value={draft.reservations.allow_same_day_pickup} onChange={(v) => setField('reservations', 'allow_same_day_pickup', v)} />
              <BoolField label="Caution obligatoire" value={draft.reservations.require_deposit} onChange={(v) => setField('reservations', 'require_deposit', v)} />
            </div>

            <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 space-y-3">
              <div>
                <div className="text-xs font-black uppercase tracking-wider text-indigo-800">Classification LCD ↔ LLD</div>
                <p className="mt-0.5 text-[11px] text-indigo-700">
                  Règle appliquée par les wizards de réservation et de contrat : les durées sous le seuil sont classées <strong>LCD</strong> (Courte Durée), au-dessus <strong>LLD</strong> (Longue Durée). L'agent peut toujours écraser manuellement.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <NumberField
                  label="Seuil LLD (mois)"
                  value={draft.reservations.lld_threshold_months}
                  min={1}
                  max={36}
                  onChange={(v) => setField('reservations', 'lld_threshold_months', v)}
                  hint={`Une durée ≥ ${draft.reservations.lld_threshold_months} mois est considérée comme LLD.`}
                />
                <div className="rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700">
                  <div>Exemples de classification :</div>
                  <ul className="mt-1 space-y-0.5 text-slate-600">
                    <li>• 1 semaine → <span className="font-black text-amber-700">LCD</span></li>
                    <li>• {Math.max(1, draft.reservations.lld_threshold_months - 1)} mois → <span className="font-black text-amber-700">LCD</span></li>
                    <li>• {draft.reservations.lld_threshold_months} mois → <span className="font-black text-emerald-700">LLD</span></li>
                    <li>• 12 mois → <span className="font-black text-emerald-700">LLD</span></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'contracts' && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <NumberField label="Km inclus par mois (défaut)" value={draft.contracts.default_km_per_month} onChange={(v) => setField('contracts', 'default_km_per_month', v)} />
            <NumberField label="Caution par défaut (MAD)" value={draft.contracts.default_deposit_mad} onChange={(v) => setField('contracts', 'default_deposit_mad', v)} hint="Utilisé si Caution % = 0." />
            <NumberField label="Caution par défaut (%)" value={draft.contracts.default_deposit_pct} onChange={(v) => setField('contracts', 'default_deposit_pct', v)} hint="Si > 0, remplace la caution fixe." />
            <NumberField label="Jour de prélèvement attendu" value={draft.contracts.default_expected_day} min={1} max={31} onChange={(v) => setField('contracts', 'default_expected_day', v)} />
            <TextField label="Conditions de paiement (défaut)" value={draft.contracts.default_payment_terms} onChange={(v) => setField('contracts', 'default_payment_terms', v)} />
            <NumberField label="Seuil validation directeur (MAD)" value={draft.contracts.approval_threshold_mad} onChange={(v) => setField('contracts', 'approval_threshold_mad', v)} hint="Au-dessus de ce montant, l'approbation du directeur est requise." />
            <NumberField label="Pénalité par jour de retard (MAD)" value={draft.contracts.default_penalty_per_day} onChange={(v) => setField('contracts', 'default_penalty_per_day', v)} />
            <TextField label="Préfixe numérotation contrat" value={draft.contracts.contract_number_prefix} onChange={(v) => setField('contracts', 'contract_number_prefix', v)} />
            <NumberField label="Padding numérotation" value={draft.contracts.contract_number_padding} min={2} max={8} onChange={(v) => setField('contracts', 'contract_number_padding', v)} />
            <BoolField label="Générer le PDF automatiquement à l'enregistrement" value={draft.contracts.auto_generate_pdf} onChange={(v) => setField('contracts', 'auto_generate_pdf', v)} />
          </div>
        )}

        {tab === 'invoicing' && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField label="Préfixe numérotation facture" value={draft.invoicing.invoice_number_prefix} onChange={(v) => setField('invoicing', 'invoice_number_prefix', v)} />
            <NumberField label="Padding numérotation" value={draft.invoicing.invoice_number_padding} min={2} max={8} onChange={(v) => setField('invoicing', 'invoice_number_padding', v)} />
            <NumberField label="TVA par défaut (%)" value={draft.invoicing.default_tva_pct} onChange={(v) => setField('invoicing', 'default_tva_pct', v)} />
            <NumberField label="Jours nets par défaut" value={draft.invoicing.default_net_days} onChange={(v) => setField('invoicing', 'default_net_days', v)} hint="Nombre de jours ajoutés à la date d'émission." />
            <SelectField label="Source de la date d'échéance" value={draft.invoicing.due_date_source} onChange={(v) => setField('invoicing', 'due_date_source', v as any)} options={[
              { value: 'reservation_end',   label: 'Fin de la réservation' },
              { value: 'issue_date_plus_net', label: 'Date émission + jours nets' },
            ]} />
            <TextField label="Devise" value={draft.invoicing.currency_code} onChange={(v) => setField('invoicing', 'currency_code', v)} />
            <div className="md:col-span-2">
              <TextField multiline label="Mention légale bas de facture" value={draft.invoicing.legal_footer} onChange={(v) => setField('invoicing', 'legal_footer', v)} />
            </div>
          </div>
        )}

        {tab === 'payments' && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField label="Devise par défaut" value={draft.payments.default_currency} onChange={(v) => setField('payments', 'default_currency', v)} />
            <TextField label="Préfixe numérotation paiement" value={draft.payments.payment_number_prefix} onChange={(v) => setField('payments', 'payment_number_prefix', v)} />
            <NumberField label="Délai de grâce chèque (jours)" value={draft.payments.cheque_grace_days} onChange={(v) => setField('payments', 'cheque_grace_days', v)} />
            <BoolField label="Accepter les paiements partiels" value={draft.payments.accept_partial} onChange={(v) => setField('payments', 'accept_partial', v)} />
          </div>
        )}

        {tab === 'notifications' && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <NumberField label="Assurance — alerte avant (jours)" value={draft.notifications.insurance_warning_days} onChange={(v) => setField('notifications', 'insurance_warning_days', v)} />
            <NumberField label="Visite technique — alerte avant (jours)" value={draft.notifications.tech_control_warning_days} onChange={(v) => setField('notifications', 'tech_control_warning_days', v)} />
            <NumberField label="Vignette — alerte avant (jours)" value={draft.notifications.vignette_warning_days} onChange={(v) => setField('notifications', 'vignette_warning_days', v)} />
            <NumberField label="Fin contrat — alerte avant (jours)" value={draft.notifications.contract_expiry_warning_days} onChange={(v) => setField('notifications', 'contract_expiry_warning_days', v)} />
            <NumberField label="Maintenance — seuil km avant échéance" value={draft.notifications.maintenance_warning_km} onChange={(v) => setField('notifications', 'maintenance_warning_km', v)} />
            <BoolField label="Envoi confirmation WhatsApp" value={draft.notifications.send_whatsapp_confirmation} onChange={(v) => setField('notifications', 'send_whatsapp_confirmation', v)} />
            <BoolField label="Envoi rappels par email" value={draft.notifications.send_email_reminders} onChange={(v) => setField('notifications', 'send_email_reminders', v)} />
          </div>
        )}

        {tab === 'branding' && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <TextField label="Nom affiché de l'entreprise" value={draft.branding.company_display_name} onChange={(v) => setField('branding', 'company_display_name', v)} />
            <TextField label="ICE" value={draft.branding.company_ice} onChange={(v) => setField('branding', 'company_ice', v)} />
            <TextField label="RC" value={draft.branding.company_rc} onChange={(v) => setField('branding', 'company_rc', v)} />
            <TextField label="IF" value={draft.branding.company_if} onChange={(v) => setField('branding', 'company_if', v)} />
            <TextField label="CNSS" value={draft.branding.company_cnss} onChange={(v) => setField('branding', 'company_cnss', v)} />
            <SelectField label="Langue par défaut" value={draft.branding.default_language} onChange={(v) => setField('branding', 'default_language', v)} options={[
              { value: 'fr', label: 'Français' },
              { value: 'ar', label: 'Arabe' },
              { value: 'en', label: 'Anglais' },
            ]} />
            <TextField label="Fuseau horaire" value={draft.branding.timezone} onChange={(v) => setField('branding', 'timezone', v)} />
          </div>
        )}

        {tab === 'gps' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SelectField
                label="Fournisseur GPS"
                value={draft.gps.provider}
                onChange={(v) => setField('gps', 'provider', v)}
                options={[
                  { value: '',           label: '— Sélectionner —' },
                  { value: 'traccar',    label: 'Traccar' },
                  { value: 'wialon',     label: 'Wialon' },
                  { value: 'gurtam',     label: 'Gurtam' },
                  { value: 'teltonika',  label: 'Teltonika (FMBxxx)' },
                  { value: 'ruptela',    label: 'Ruptela' },
                  { value: 'gpspro',     label: 'GPSPro' },
                  { value: 'custom',     label: 'Custom REST' },
                ]}
              />
              <TextField label="URL de base de l'API" value={draft.gps.api_base_url} onChange={(v) => setField('gps', 'api_base_url', v)} hint="Ex : https://api.traccar.example.com" />
              <TextField label="Clé API" value={draft.gps.api_key} onChange={(v) => setField('gps', 'api_key', v)} hint="Token / API key du fournisseur." />
              <TextField label="Secret API (optionnel)" value={draft.gps.api_secret} onChange={(v) => setField('gps', 'api_secret', v)} />
              <TextField label="Identifiant compte / tenant (optionnel)" value={draft.gps.account_id} onChange={(v) => setField('gps', 'account_id', v)} />
              <NumberField
                label="Intervalle de rafraîchissement (secondes)"
                value={draft.gps.refresh_interval_seconds}
                min={10}
                max={3600}
                onChange={(v) => setField('gps', 'refresh_interval_seconds', v)}
                hint="Fréquence à laquelle le front interroge le serveur pour les positions."
              />
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">Fonctionnalités</div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <BoolField label="Suivi en temps réel" value={draft.gps.live_tracking_enabled} onChange={(v) => setField('gps', 'live_tracking_enabled', v)} />
                <BoolField label="Enregistrement des trajets" value={draft.gps.trip_recording_enabled} onChange={(v) => setField('gps', 'trip_recording_enabled', v)} />
                <BoolField label="Zones géofences" value={draft.gps.geofences_enabled} onChange={(v) => setField('gps', 'geofences_enabled', v)} />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">Alertes & rétention</div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <NumberField label="Immobilisation moteur — alerte (minutes)" value={draft.gps.idle_alert_minutes} min={1} max={720} onChange={(v) => setField('gps', 'idle_alert_minutes', v)} />
                <NumberField label="Excès de vitesse — seuil (km/h)" value={draft.gps.speed_alert_kmh} min={30} max={250} onChange={(v) => setField('gps', 'speed_alert_kmh', v)} />
                <NumberField label="Rétention des positions (jours)" value={draft.gps.position_retention_days} min={7} max={730} onChange={(v) => setField('gps', 'position_retention_days', v)} hint="Positions plus anciennes purgées automatiquement." />
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800">
              ⚠️ La clé API est stockée en base — n'ouvrez cette page qu'aux rôles ADMIN / DIRECTEUR.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* Small controlled inputs */

const TextField: React.FC<{ label: string; value: string; onChange: (v: string) => void; hint?: string; multiline?: boolean }> = ({ label, value, onChange, hint, multiline }) => (
  <label className="block">
    <span className="mb-1 block text-[11px] font-black uppercase tracking-wider text-slate-500">{label}</span>
    {multiline ? (
      <textarea rows={3} className="df-input w-full resize-none" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    ) : (
      <input type="text" className="df-input w-full" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
    )}
    {hint && <span className="mt-1 block text-[10px] text-slate-400">{hint}</span>}
  </label>
);

const NumberField: React.FC<{ label: string; value: number; onChange: (v: number) => void; hint?: string; min?: number; max?: number }> = ({ label, value, onChange, hint, min, max }) => (
  <label className="block">
    <span className="mb-1 block text-[11px] font-black uppercase tracking-wider text-slate-500">{label}</span>
    <input
      type="number"
      className="df-input w-full"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
    />
    {hint && <span className="mt-1 block text-[10px] text-slate-400">{hint}</span>}
  </label>
);

const SelectField: React.FC<{ label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; hint?: string }> = ({ label, value, onChange, options, hint }) => (
  <label className="block">
    <span className="mb-1 block text-[11px] font-black uppercase tracking-wider text-slate-500">{label}</span>
    <select className="df-input w-full" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    {hint && <span className="mt-1 block text-[10px] text-slate-400">{hint}</span>}
  </label>
);

const BoolField: React.FC<{ label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }> = ({ label, value, onChange, hint }) => (
  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 cursor-pointer">
    <input
      type="checkbox"
      className="mt-0.5 h-4 w-4 accent-indigo-600"
      checked={!!value}
      onChange={(e) => onChange(e.target.checked)}
    />
    <div>
      <div className="text-xs font-black text-slate-800">{label}</div>
      {hint && <div className="text-[10px] text-slate-500">{hint}</div>}
    </div>
  </label>
);

export default ParametersPage;
