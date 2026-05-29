import React, { useCallback, useEffect, useRef, useState } from 'react';
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

/** A single uploaded-and-extracted reader document that the parent should
 *  link to the newly-created customer / vehicle / contract on save. */
export interface ScannedDocument {
  documentId: string;
  documentType: ReaderDocumentType;
}

/**
 * Two-slot dropzone (ID document + driving licence) that streams the file to
 * the Document Reader backend, runs OCR + parsing, then surfaces the extracted
 * fields back to the parent via `onPrefill`. The admin still reviews / edits
 * everything in the form before saving the customer.
 *
 * `onScanComplete` is invoked once per successful upload+extract with the
 * underlying `reader_documents.id` so the parent can later attach it to the
 * created entity (POST /document-reader/documents/{id}/link).
 */
export const CustomerIdentityScanner: React.FC<{
  onPrefill: (data: ScannedIdentity) => void;
  onScanComplete?: (scan: ScannedDocument) => void;
}> = ({ onPrefill, onScanComplete }) => {
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
          onScanComplete={onScanComplete}
          mapFields={mapIdCardFields}
        />
        <ScanSlot
          title="Permis de conduire"
          allowedTypes={['driving_license']}
          defaultType="driving_license"
          onPrefill={onPrefill}
          onScanComplete={onScanComplete}
          mapFields={mapLicenseFields}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

type Mapper = (extracted: Record<string, unknown>) => ScannedIdentity;

/**
 * Shows an elapsed-seconds counter while OCR is running so the admin knows
 * it's still working and not frozen.
 */
const ElapsedTimer: React.FC<{ running: boolean }> = ({ running }) => {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) {
      setSecs(0);
      return;
    }
    setSecs(0);
    const t = setInterval(() => setSecs((s) => s + 1), 1_000);
    return () => clearInterval(t);
  }, [running]);
  if (!running) return null;
  return (
    <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600">
      {/* Spinning circle */}
      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      OCR en cours… {secs}s
    </div>
  );
};

const ScanSlot: React.FC<{
  title: string;
  allowedTypes: ReaderDocumentType[];
  defaultType: ReaderDocumentType;
  onPrefill: (data: ScannedIdentity) => void;
  onScanComplete?: (scan: ScannedDocument) => void;
  mapFields: Mapper;
}> = ({ title, allowedTypes, defaultType, onPrefill, onScanComplete, mapFields }) => {
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
        // 1. Upload the file — fast, just stores it.
        const uploaded = await documentReaderApi.upload(file, docType);
        const docId = uploaded.data.id;

        // Register the document ID immediately so the parent can attach it
        // to the customer even if OCR partially fails.
        onScanComplete?.({ documentId: docId, documentType: docType });

        // 2. Trigger OCR — returns 202 instantly, OCR runs in a background worker.
        await documentReaderApi.extract(docId, docType);

        // 3. Poll until the worker finishes (extracted | failed).
        //    Each tick is 3 s; timeout after 5 min.
        const done = await documentReaderApi.pollUntilDone(docId);

        if (done.data.status === 'failed') {
          setError(done.data.error_message ?? 'Échec OCR — vérifiez la netteté du document.');
          return;
        }

        const fields = (done.data.extraction?.extracted_data ?? {}) as Record<string, unknown>;
        const mapped = mapFields(fields);
        // Drop empty values so we never blank out existing form data.
        const cleaned = Object.fromEntries(
          Object.entries(mapped).filter(([, v]) => v !== undefined && v !== '' && v !== null),
        );
        if (Object.keys(cleaned).length === 0) {
          setError("Aucun champ exploitable n'a pu être détecté. Vérifiez la netteté du document.");
        } else {
          onPrefill(cleaned as ScannedIdentity);
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
    [docType, mapFields, onPrefill, onScanComplete],
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
        } ${loading ? 'pointer-events-none opacity-70' : ''}`}
      >
        <div className="text-slate-700">Glisser-déposer ou</div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => inputRef.current?.click()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Choisir
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => cameraRef.current?.click()}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
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
        <ElapsedTimer running={loading} />
        {error ? <div className="mt-1 text-[11px] font-semibold text-rose-600">{error}</div> : null}
        {success ? <div className="mt-1 text-[11px] font-semibold text-emerald-600">{success}</div> : null}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Field mapping helpers
// ---------------------------------------------------------------------------

/**
 * Map noisy OCR nationality strings (Arabic gloss, ISO-3 codes, French
 * adjectives, etc.) to the French country name we want displayed in the form.
 * Falls back to the raw string capitalised if no known prefix matches.
 */
function normalizeNationality(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim().toUpperCase();
  if (!v) return undefined;

  const table: Array<{ matches: (s: string) => boolean; label: string }> = [
    { matches: (s) => s.startsWith('MAR') || s.includes('MAROC') || s === 'MA', label: 'Maroc' },
    { matches: (s) => s.startsWith('FRA') || s.includes('FRANC') || s === 'FR', label: 'France' },
    { matches: (s) => s.startsWith('ESP') || s.includes('SPAIN') || s.includes('ESPAG') || s === 'ES', label: 'Espagne' },
    { matches: (s) => s.startsWith('USA') || s.includes('UNITED STATES') || s === 'US', label: 'États-Unis' },
    { matches: (s) => s.startsWith('GBR') || s.includes('BRITISH') || s === 'GB', label: 'Royaume-Uni' },
    { matches: (s) => s.startsWith('DZA') || s.includes('ALGER') || s === 'DZ', label: 'Algérie' },
    { matches: (s) => s.startsWith('TUN') || s.includes('TUNIS') || s === 'TN', label: 'Tunisie' },
    { matches: (s) => s.startsWith('DEU') || s.includes('ALLEMAGN') || s === 'DE', label: 'Allemagne' },
    { matches: (s) => s.startsWith('ITA') || s.includes('ITAL') || s === 'IT', label: 'Italie' },
    { matches: (s) => s.startsWith('NLD') || s.includes('PAYS-BAS') || s.includes('NETHERL') || s === 'NL', label: 'Pays-Bas' },
    { matches: (s) => s.startsWith('BEL') || s.includes('BELG') || s === 'BE', label: 'Belgique' },
    { matches: (s) => s.startsWith('PRT') || s.includes('PORTUG') || s === 'PT', label: 'Portugal' },
  ];

  for (const { matches, label } of table) {
    if (matches(v)) return label;
  }
  return raw.trim().replace(/^./, (c) => c.toUpperCase());
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
  // CIN / Passeport scan owns these three fields only — name/permis come from
  // the Permis scan to avoid one document overwriting the other's values.
  return {
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
  // The Permis carries the birth date on the front (and the parser repairs the
  // common OCR misreads — 06/40/2001 → 06/10/2001, 06/10/2007 → 06/10/2001
  // against the issue date). It's also the most reliable source we have when
  // only the Permis is scanned, so forward it through. Empty values are dropped
  // by the caller, so a missed-by-OCR date won't blank an existing one.
  return {
    first_name: first,
    last_name: last,
    date_of_birth: asString(extracted.date_of_birth),
    driving_license_number: asString(extracted.license_number),
    driving_license_expiry: asString(extracted.expiry_date),
  };
}
