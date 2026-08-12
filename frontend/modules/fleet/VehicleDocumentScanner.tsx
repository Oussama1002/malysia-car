import React, { useCallback, useEffect, useRef, useState } from 'react';
import { documentReaderApi } from '@/services/documentReaderApi';

export interface ScannedVehicleData {
  // Assurance
  insuranceCompany?: string;
  numeroPolice?: string;
  insuranceExpiry?: string;
  insuranceStart?: string;
  // Facture d'achat
  marque?: string;
  modele?: string;
  chassis?: string;
  acquisitionDate?: string;
  vendeur?: string;
  montant?: string;
  // Attestation de paiement
  registration?: string;
  fuelType?: string;
  miseEnCirculation?: string;
  fiscalPower?: string;
  // Immatriculation provisoire / WW
  immatProvisoire?: string;
  immatProvisoireExpiry?: string;
  // Visite technique
  techControlExpiry?: string;
  // Vignette
  vignetteExpiry?: string;
  // Carte Grise
  cgMarque?: string;
  cgModele?: string;
  cgChassis?: string;
  cgFuelType?: string;
  cgFiscalPower?: string;
  cgExpiry?: string;
}

export const VehicleDocumentScanner: React.FC<{
  onPrefill: (data: ScannedVehicleData) => void;
  carteGriseRecue?: boolean;
  carteGriseRef?: React.RefObject<HTMLDivElement | null>;
}> = ({ onPrefill, carteGriseRecue, carteGriseRef }) => (
  <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4 space-y-3">
    <div className="text-xs font-black uppercase tracking-wider text-indigo-700">
      Scanner les documents véhicule (OCR)
    </div>
    <p className="text-xs text-slate-600">
      Déposez chaque document pour extraire automatiquement les informations. Relisez avant d'enregistrer.
    </p>
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <ScanSlot
        title="Assurance"
        description="N° police, période de garantie, immatriculation"
        onPrefill={onPrefill}
        mapFields={mapAssurance}
      />
      <ScanSlot
        title="Facture d'achat"
        description="Marque, modèle, VIN, date, vendeur, montant"
        onPrefill={onPrefill}
        mapFields={mapFacture}
      />
      <ScanSlot
        title="Immat. provisoire / WW"
        description="N° provisoire, date validité"
        onPrefill={onPrefill}
        mapFields={mapImmatProvisoire}
      />
      <ScanSlot
        title="Attestation de paiement"
        description="Immat., carburant, mise en circulation, puissance fiscale"
        onPrefill={onPrefill}
        mapFields={mapPaymentAttestation}
      />
      <ScanSlot
        title="Visite technique"
        description="Date expiration, N° visite, centre contrôle"
        onPrefill={onPrefill}
        mapFields={mapVisiteTech}
      />
      <ScanSlot
        title="Vignette"
        description="Année / date expiration"
        onPrefill={onPrefill}
        mapFields={mapVignette}
      />
      {carteGriseRecue && (
        <div ref={carteGriseRef}>
          <ScanSlot
            title="Carte Grise"
            description="Marque, modèle, châssis, carburant, puissance, fin validité"
            onPrefill={onPrefill}
            mapFields={mapCarteGrise}
          />
        </div>
      )}
    </div>
  </div>
);

// ---------------------------------------------------------------------------

type Mapper = (extracted: Record<string, unknown>) => ScannedVehicleData;

const ElapsedTimer: React.FC<{ running: boolean }> = ({ running }) => {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!running) { setSecs(0); return; }
    setSecs(0);
    const t = setInterval(() => setSecs((s) => s + 1), 1_000);
    return () => clearInterval(t);
  }, [running]);
  if (!running) return null;
  return (
    <div className="mt-1 flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600">
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
  description: string;
  onPrefill: (data: ScannedVehicleData) => void;
  mapFields: Mapper;
}> = ({ title, description, onPrefill, mapFields }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ScannedVehicleData | null>(null);
  const [filePreview, setFilePreview] = useState<{ url: string; name: string; type: string } | null>(null);

  const handle = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setPreview(null);
    if (file.type.startsWith('image/')) {
      setFilePreview({ url: URL.createObjectURL(file), name: file.name, type: 'image' });
    } else {
      setFilePreview({ url: '', name: file.name, type: 'pdf' });
    }
    try {
      const docType = mapFields === mapAssurance ? 'insurance'
        : mapFields === mapPaymentAttestation ? 'payment_attestation'
        : mapFields === mapCarteGrise ? 'vehicle_registration'
        : 'other';
      const uploaded = await documentReaderApi.upload(file, docType);
      await documentReaderApi.extract(uploaded.data.id, docType);
      const done = await documentReaderApi.pollUntilDone(uploaded.data.id);

      if (done.data.status === 'failed') {
        setError(done.data.error_message ?? 'Échec OCR — vérifiez la netteté du document.');
        return;
      }

      const fields = (done.data.extraction?.extracted_data ?? {}) as Record<string, unknown>;
      const mapped = mapFields(fields);
      const cleaned = Object.fromEntries(
        Object.entries(mapped).filter(([, v]) => v !== undefined && v !== '' && v !== null),
      ) as ScannedVehicleData;

      if (Object.keys(cleaned).length === 0) {
        setError("Aucun champ exploitable détecté. Vérifiez la netteté du document.");
        return;
      }

      setPreview(mapped);
      onPrefill(cleaned);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec OCR');
    } finally {
      setLoading(false);
    }
  }, [mapFields, onPrefill]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
      <div className="text-xs font-bold text-slate-700">{title}</div>
      <div className="text-[10px] text-slate-400">{description}</div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void handle(f); }}
        className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-4 text-center text-[11px] transition ${
          dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 bg-slate-50'
        } ${loading ? 'pointer-events-none opacity-70' : ''}`}
      >
        <div className="text-slate-700">Glisser-déposer ou</div>
        <div className="flex items-center gap-2">
          <button type="button" disabled={loading} onClick={() => inputRef.current?.click()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
            Choisir
          </button>
          <button type="button" disabled={loading} onClick={() => cameraRef.current?.click()}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
            Photo
          </button>
        </div>
        <input ref={inputRef} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handle(f); e.target.value = ''; }} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handle(f); e.target.value = ''; }} />
        <div className="mt-1 text-[10px] text-slate-500">PDF, JPG, PNG · 15 Mo max</div>
        <ElapsedTimer running={loading} />
        {error && <div className="mt-1 text-[11px] font-semibold text-rose-600">{error}</div>}
      </div>

      {filePreview && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
          {filePreview.type === 'image' ? (
            <img src={filePreview.url} alt={filePreview.name}
              className="w-full max-h-40 object-contain rounded cursor-pointer"
              onClick={() => window.open(filePreview.url, '_blank')} />
          ) : (
            <div className="flex items-center gap-2 text-[11px] text-slate-600">
              <svg className="h-5 w-5 text-rose-500 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"/>
              </svg>
              <span className="truncate font-medium">{filePreview.name}</span>
            </div>
          )}
        </div>
      )}

      {preview && (() => {
        const detected = Object.entries(preview).filter(([, v]) => v !== undefined && v !== '' && v !== null);
        const missing = Object.entries(preview).filter(([, v]) => v === undefined || v === '' || v === null);
        return (
          <div className="space-y-2">
            {detected.length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 space-y-1">
                <div className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">Champs détectés</div>
                {detected.map(([k, v]) => (
                  <div key={k} className="flex justify-between text-[10px]">
                    <span className="text-slate-500">{FIELD_LABELS[k] ?? k}</span>
                    <span className="font-semibold text-slate-800 max-w-[55%] truncate">{String(v)}</span>
                  </div>
                ))}
              </div>
            )}
            {missing.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 space-y-1">
                <div className="text-[10px] font-black text-amber-700 uppercase tracking-wider">Non détectés</div>
                {missing.map(([k]) => (
                  <div key={k} className="flex justify-between text-[10px]">
                    <span className="text-slate-500">{FIELD_LABELS[k] ?? k}</span>
                    <span className="font-medium text-amber-600 italic">non détecté</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Field mapping helpers
// ---------------------------------------------------------------------------

function str(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'number') return String(v);
  if (typeof v !== 'string' || !v.trim()) return undefined;
  return v.trim();
}

function mapAssurance(d: Record<string, unknown>): ScannedVehicleData {
  return {
    insuranceCompany: str(d.insurance_company ?? d.company_name ?? d.compagnie ?? d.insurer),
    numeroPolice:     str(d.policy_number ?? d.numero_police ?? d.policy_no ?? d.contract_number),
    insuranceStart:   str(d.guarantee_start ?? d.date_effet ?? d.start_date ?? d.date_debut),
    insuranceExpiry:  str(d.guarantee_end ?? d.expiry_date ?? d.date_expiration ?? d.validity_date ?? d.date_fin),
    immatProvisoire:  str(d.registration_number ?? d.immatriculation ?? d.plate_number),
  };
}

function mapPaymentAttestation(d: Record<string, unknown>): ScannedVehicleData {
  return {
    registration:      str(d.registration_number ?? d.immatriculation ?? d.plate_number),
    fuelType:          str(d.fuel_type ?? d.carburant ?? d.energie),
    miseEnCirculation: str(d.first_registration_date ?? d.mise_en_circulation ?? d.date_circulation),
    fiscalPower:       str(d.fiscal_power ?? d.puissance_fiscale ?? d.cv_fiscaux),
  };
}

function mapFacture(d: Record<string, unknown>): ScannedVehicleData {
  return {
    marque:          str(d.brand ?? d.marque ?? d.make ?? d.manufacturer),
    modele:          str(d.model ?? d.modele ?? d.model_name),
    chassis:         str(d.vin ?? d.chassis ?? d.chassis_number ?? d.serial_number ?? d.vehicle_identification_number),
    acquisitionDate: str(d.purchase_date ?? d.date_achat ?? d.invoice_date ?? d.date_facture ?? d.sale_date),
    vendeur:         str(d.seller ?? d.vendeur ?? d.dealer ?? d.vendor ?? d.sold_by),
    montant:         str(d.amount ?? d.montant ?? d.total ?? d.price ?? d.prix ?? d.total_amount),
  };
}

function mapImmatProvisoire(d: Record<string, unknown>): ScannedVehicleData {
  return {
    immatProvisoire:       str(d.provisional_number ?? d.numero_provisoire ?? d.registration_number ?? d.plate_number ?? d.ww_number),
    immatProvisoireExpiry: str(d.validity_date ?? d.date_validite ?? d.expiry_date ?? d.date_expiration ?? d.valid_until),
  };
}

function mapVisiteTech(d: Record<string, unknown>): ScannedVehicleData {
  return {
    techControlExpiry: str(d.expiry_date ?? d.date_expiration ?? d.validity_date ?? d.date_validite ?? d.valid_until ?? d.next_inspection),
  };
}

function mapCarteGrise(d: Record<string, unknown>): ScannedVehicleData {
  return {
    cgMarque:            str(d.brand ?? d.marque ?? d.make),
    cgModele:            str(d.model ?? d.modele),
    cgChassis:           str(d.vin_number ?? d.vin ?? d.chassis ?? d.chassis_number),
    cgFuelType:          str(d.fuel_type ?? d.carburant ?? d.energie),
    cgFiscalPower:       str(d.fiscal_power ?? d.puissance_fiscale),
    cgExpiry:            str(d.expiry_date ?? d.fin_validite ?? d.validity_date),
  };
}

function mapVignette(d: Record<string, unknown>): ScannedVehicleData {
  return {
    vignetteExpiry: str(d.expiry_date ?? d.date_expiration ?? d.validity_date ?? d.date_validite ?? d.year ?? d.annee ?? d.valid_until),
  };
}

const FIELD_LABELS: Record<string, string> = {
  insuranceCompany:      'Compagnie',
  numeroPolice:          'N° police',
  insuranceStart:        'Garantie du',
  insuranceExpiry:       'Garantie au',
  marque:                'Marque',
  modele:                'Modèle',
  chassis:               'VIN / Châssis',
  acquisitionDate:       'Date achat',
  vendeur:               'Vendeur',
  montant:               'Montant',
  registration:          'Immatriculation',
  fuelType:              'Carburant',
  miseEnCirculation:     'Mise en circulation',
  fiscalPower:           'Puissance fiscale',
  immatProvisoire:       'N° provisoire',
  immatProvisoireExpiry: 'Validité',
  techControlExpiry:     'Exp. visite tech.',
  vignetteExpiry:        'Exp. vignette',
  cgMarque:              'Marque',
  cgModele:              'Modèle',
  cgChassis:             'N° châssis (VIN)',
  cgFuelType:            'Carburant',
  cgFiscalPower:         'Puissance fiscale',
  cgExpiry:              'Fin de validité',
};
