import React, { useCallback, useRef, useState } from 'react';
import { documentReaderApi, type ReaderDocumentType } from '@/services/documentReaderApi';

/**
 * Fields that can be pre-filled on the customer "Identité particulier" section
 * from an OCR scan. Keys match `IndividualProfile`.
 */
export interface ScannedIdentity {
  first_name?: string;
  last_name?: string;
  national_id_number?: string;
  date_of_birth?: string;
  nationality?: string;
  driving_license_number?: string;
  driving_license_expiry?: string;
}

/**
 * Two-slot dropzone (ID document + driving licence) that streams the file to
 * the Document Reader backend, runs OCR + parsing, then surfaces the extracted
 * fields back to the parent via `onPrefill`. The admin still reviews / edits
 * everything in the form before saving the customer.
 */
export const CustomerIdentityScanner: React.FC<{
  onPrefill: (data: ScannedIdentity) => void;
}> = ({ onPrefill }) => {
  return (
    <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
      <div className="mb-1 text-xs font-black uppercase tracking-wider text-indigo-700">
        Scanner les pièces d'identité (OCR)
      </div>
      <p className="mb-3 text-xs text-slate-600">
        Déposez la CIN ou le passeport, puis le permis de conduire. Les champs détectés
        (nom, CIN, date de naissance, nationalité…) seront préremplis ci-dessous. Vous pouvez tout corriger
        avant d'enregistrer.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ScanSlot
          title="CIN / Passeport"
          allowedTypes={['cin', 'passport']}
          defaultType="cin"
          onPrefill={onPrefill}
          mapFields={mapIdCardFields}
        />
        <ScanSlot
          title="Permis de conduire"
          allowedTypes={['driving_license']}
          defaultType="driving_license"
          onPrefill={onPrefill}
          mapFields={mapLicenseFields}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

type Mapper = (extracted: Record<string, unknown>) => ScannedIdentity;

const ScanSlot: React.FC<{
  title: string;
  allowedTypes: ReaderDocumentType[];
  defaultType: ReaderDocumentType;
  onPrefill: (data: ScannedIdentity) => void;
  mapFields: Mapper;
}> = ({ title, allowedTypes, defaultType, onPrefill, mapFields }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [docType, setDocType] = useState<ReaderDocumentType>(defaultType);

  const handle = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);
      setSuccess(null);
      try {
        const uploaded = await documentReaderApi.upload(file, docType);
        const extracted = await documentReaderApi.extract(uploaded.data.id, docType);
        const fields = (extracted.data.extraction?.extracted_data ?? {}) as Record<string, unknown>;
        const mapped = mapFields(fields);
        // Drop empty values so we never blank out existing form data.
        const cleaned = Object.fromEntries(
          Object.entries(mapped).filter(([, v]) => v !== undefined && v !== '' && v !== null),
        );
        if (Object.keys(cleaned).length === 0) {
          setError("Aucun champ exploitable n'a pu être détecté. Vérifiez la netteté du document.");
        } else {
          onPrefill(cleaned);
          const labels = Object.keys(cleaned).map(frenchFieldLabel);
          setSuccess(`Champs détectés : ${labels.join(', ')}`);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Échec OCR';
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [docType, mapFields, onPrefill],
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-bold text-slate-700">{title}</div>
        {allowedTypes.length > 1 ? (
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as ReaderDocumentType)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px]"
          >
            {allowedTypes.map((t) => (
              <option key={t} value={t}>
                {t === 'cin' ? 'CIN' : t === 'passport' ? 'Passeport' : t}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void handle(f);
        }}
        className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-4 text-center text-[11px] transition ${
          dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 bg-slate-50'
        }`}
      >
        <div className="text-slate-700">Glisser-déposer ou</div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700"
          >
            Choisir
          </button>
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
          >
            Photo
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handle(f);
            e.target.value = '';
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handle(f);
            e.target.value = '';
          }}
        />
        <div className="mt-1 text-[10px] text-slate-500">PDF, JPG, PNG · 15 Mo max</div>
        {loading ? <div className="mt-1 text-[11px] font-semibold text-indigo-600">OCR en cours…</div> : null}
        {error ? <div className="mt-1 text-[11px] font-semibold text-rose-600">{error}</div> : null}
        {success ? <div className="mt-1 text-[11px] font-semibold text-emerald-600">{success}</div> : null}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Field mapping helpers
// ---------------------------------------------------------------------------

/** Best-effort 2-letter ISO conversion of the noisy nationality string. */
function normalizeNationality(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim().toUpperCase();
  if (!v) return undefined;
  if (v.length === 2) return v;
  if (v.startsWith('MAR') || v.includes('MAROC')) return 'MA';
  if (v.startsWith('FRA') || v.includes('FRANC')) return 'FR';
  if (v.startsWith('ESP') || v.includes('SPAIN') || v.includes('ESPAG')) return 'ES';
  if (v.startsWith('USA') || v.includes('UNITED STATES')) return 'US';
  if (v.startsWith('GBR') || v.includes('BRITISH')) return 'GB';
  if (v.startsWith('DZA') || v.includes('ALGER')) return 'DZ';
  if (v.startsWith('TUN') || v.includes('TUNIS')) return 'TN';
  // Fallback: keep first 3 letters so the admin sees something and can correct.
  return v.slice(0, 3);
}

function titleCase(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value
    .trim()
    .toLowerCase()
    .replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

function asString(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.trim();
}

/** French display labels for the fields prefilled by the scanner. */
function frenchFieldLabel(key: string): string {
  const map: Record<string, string> = {
    first_name: 'Prénom',
    last_name: 'Nom',
    national_id_number: 'CIN',
    date_of_birth: 'Date de naissance',
    nationality: 'Nationalité',
    driving_license_number: 'N° de permis',
    driving_license_expiry: 'Expiration permis',
  };
  return map[key] ?? key;
}

function mapIdCardFields(extracted: Record<string, unknown>): ScannedIdentity {
  const firstName = titleCase(extracted.first_name);
  const lastName = titleCase(extracted.last_name);
  const fullName = asString(extracted.full_name);
  // If the parser only delivered a full_name, split it heuristically.
  let derivedFirst = firstName;
  let derivedLast = lastName;
  if ((!derivedFirst || !derivedLast) && fullName) {
    const parts = fullName.split(/\s+/);
    if (parts.length >= 2) {
      derivedFirst = derivedFirst ?? titleCase(parts[0]);
      derivedLast = derivedLast ?? titleCase(parts.slice(1).join(' '));
    }
  }
  return {
    first_name: derivedFirst,
    last_name: derivedLast,
    national_id_number: asString(extracted.document_number),
    date_of_birth: asString(extracted.date_of_birth),
    nationality: normalizeNationality(extracted.nationality),
  };
}

function mapLicenseFields(extracted: Record<string, unknown>): ScannedIdentity {
  // Prefer the parser's first_name/last_name (set directly by parseDrivingLicense
  // when a "Nom"/"Prénom" label is present). Fall back to splitting full_name.
  const directFirst = titleCase(extracted.first_name);
  const directLast = titleCase(extracted.last_name);
  const fullName = asString(extracted.full_name);
  let first = directFirst;
  let last = directLast;
  if ((!first || !last) && fullName) {
    const parts = fullName.split(/\s+/);
    if (parts.length >= 2) {
      first = first ?? titleCase(parts[0]);
      last = last ?? titleCase(parts.slice(1).join(' '));
    }
  }
  return {
    first_name: first,
    last_name: last,
    // Moroccan permis prints the CIN under "N°C.N.I.E." — surface it so a
    // single Permis scan can fully populate the customer form.
    national_id_number: asString(extracted.national_id_number),
    date_of_birth: asString(extracted.date_of_birth),
    driving_license_number: asString(extracted.license_number),
    driving_license_expiry: asString(extracted.expiry_date),
  };
}
