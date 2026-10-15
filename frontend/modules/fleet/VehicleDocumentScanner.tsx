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
  registration?: string;
  fuelType?: string;
  miseEnCirculation?: string;
  fiscalPower?: string;
  // Immatriculation provisoire / WW
  immatProvisoire?: string;
  immatProvisoireExpiry?: string;
  // Autorisation de circulation
  autorisationExpiry?: string;
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
  nombrePortes?: string;
  nombrePlaces?: string;
  nombreCylindres?: string;
}

export type VehicleDocSlotKey =
  | 'insurance'
  | 'circulation_authorization'
  | 'payment_attestation'
  | 'technical_inspection'
  | 'registration_card';

export const VehicleDocumentScanner: React.FC<{
  onPrefill: (data: ScannedVehicleData) => void;
  /** Fires as soon as a slot's document has been ingested by the reader,
   *  so consumers can later link it to their own entity (SL contract, …). */
  onDocumentUploaded?: (slot: VehicleDocSlotKey, readerDocumentId: string) => void;
  carteGriseRecue?: boolean;
  carteGriseRef?: React.RefObject<HTMLDivElement | null>;
}> = ({ onPrefill, onDocumentUploaded, carteGriseRecue, carteGriseRef }) => (
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
        onDocumentUploaded={(id) => onDocumentUploaded?.('insurance', id)}
      />
      <ScanSlot
        title="Autorisation de circulation / Vignette"
        description="Attestation de paiement TSAV — immat., WW, marque, carburant, mise en circulation, validité vignette"
        onPrefill={onPrefill}
        mapFields={mapAutorisation}
        onDocumentUploaded={(id) => onDocumentUploaded?.('circulation_authorization', id)}
      />
      <ScanSlot
        title="Visite technique"
        description="Date d'expiration de la visite technique"
        onPrefill={onPrefill}
        mapFields={mapVisiteTech}
        onDocumentUploaded={(id) => onDocumentUploaded?.('technical_inspection', id)}
      />
      {/* La carte grise occupe deux colonnes du grid parent pour laisser à ses
          sous-slots recto / verso une largeur respirable — sans ça les deux
          dropzones et la rangée Choisir/Photo se chevauchent (bug UI constaté
          en prod). */}
      <div ref={carteGriseRef} className="md:col-span-2">
        <CarteGriseScanSlot
          onPrefill={onPrefill}
          onDocumentUploaded={(id) => onDocumentUploaded?.('registration_card', id)}
        />
      </div>
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
  onDocumentUploaded?: (readerDocumentId: string) => void;
  /** Externally-provided refs let a parent click the input (used to auto-chain
   *  the Carte Grise verso after the recto). */
  cameraInputRef?: React.MutableRefObject<HTMLInputElement | null>;
  fileInputRef?: React.MutableRefObject<HTMLInputElement | null>;
  /** Grey out and ignore clicks — used while the previous side is still OCRing. */
  disabled?: boolean;
  /** Called with 'camera' or 'file' the moment the user opens one of the pickers,
   *  so the carte-grise wrapper can replay the same choice on the second side. */
  onSourceChosen?: (source: 'camera' | 'file') => void;
}> = ({ title, description, onPrefill, mapFields, onDocumentUploaded, cameraInputRef, fileInputRef, disabled, onSourceChosen }) => {
  const localFileRef = useRef<HTMLInputElement | null>(null);
  const localCameraRef = useRef<HTMLInputElement | null>(null);
  const inputRef = fileInputRef ?? localFileRef;
  const cameraRef = cameraInputRef ?? localCameraRef;
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ScannedVehicleData | null>(null);
  const [docPreview, setDocPreview] = useState<{ url: string; isImage: boolean } | null>(null);

  const handle = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setPreview(null);
    const localUrl = URL.createObjectURL(file);
    setDocPreview({ url: localUrl, isImage: file.type.startsWith('image/') });
    try {
      const docType = mapFields === mapAssurance ? 'insurance'
        : (mapFields === mapCarteGrise || mapFields === mapCarteGriseRecto || mapFields === mapCarteGriseVerso)
            ? 'vehicle_registration'
        : mapFields === mapAutorisation ? 'autorisation_circulation'
        : 'other';
      const uploaded = await documentReaderApi.upload(file, docType);
      onDocumentUploaded?.(uploaded.data.id);
      await documentReaderApi.extract(uploaded.data.id, docType);
      const done = await documentReaderApi.pollUntilDone(uploaded.data.id);

      if (done.data.status === 'failed') {
        setError(done.data.error_message ?? 'Échec OCR — vérifiez la netteté du document.');
        return;
      }

      const fields = (done.data.extraction?.extracted_data ?? {}) as Record<string, unknown>;

      if (typeof fields._type_mismatch === 'string') {
        setError(fields._type_mismatch);
        return;
      }

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
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-3 gap-2">
      <div className="text-xs font-bold text-slate-700">{title}</div>
      {/* Fixed-height description block so drop zones align across cards */}
      <div className="min-h-[42px] text-[10px] leading-snug text-slate-400">{description}</div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void handle(f); }}
        className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-4 text-center text-[11px] transition ${
          dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 bg-slate-50'
        } ${loading || disabled ? 'pointer-events-none opacity-70' : ''}`}
      >
        <div className="text-slate-700">Glisser-déposer ou</div>
        <div className="flex items-center gap-2">
          <button type="button" disabled={loading || disabled}
            onClick={() => { onSourceChosen?.('file'); inputRef.current?.click(); }}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
            Choisir
          </button>
          <button type="button" disabled={loading || disabled}
            onClick={() => { onSourceChosen?.('camera'); cameraRef.current?.click(); }}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50">
            Photo
          </button>
        </div>
        <input ref={inputRef} type="file" accept="image/*,application/pdf,.pdf,.heic,.heif,.webp,.tiff,.bmp" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handle(f); e.target.value = ''; }} />
        {/* Camera capture: accept="image/*" without `capture` so the OS shows the
            native "Take Photo" option (the `capture` attribute forces an inline
            camera that renders black in many mobile / in-app browsers). */}
        <input ref={cameraRef} type="file" accept="image/*" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void handle(f); e.target.value = ''; }} />
        <div className="mt-1 text-[10px] text-slate-500">Image ou PDF · 15 Mo max</div>
        <ElapsedTimer running={loading} />
        {error && <div className="mt-1 text-[11px] font-semibold text-rose-600">{error}</div>}
      </div>

      {docPreview && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-1 overflow-hidden">
          {docPreview.isImage ? (
            <img src={docPreview.url} alt="Document"
              className="w-full max-h-60 object-contain rounded cursor-pointer"
              onClick={() => window.open(docPreview.url, '_blank')} />
          ) : (
            <iframe src={`${docPreview.url}#toolbar=0&navpanes=0`} title="Document"
              className="w-full rounded border-0" style={{ height: '300px' }} />
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
// Carte Grise = un seul card avec deux emplacements (recto + verso) côte à
// côte. Dès que la première photo est posée, l'input de la seconde est
// cliqué automatiquement pour enchaîner la prise sans retourner dans un
// menu. Les deux faces partent à l'OCR indépendamment et les champs
// extraits sont fusionnés via `onPrefill`.
// ---------------------------------------------------------------------------
const CarteGriseScanSlot: React.FC<{
  onPrefill: (data: ScannedVehicleData) => void;
  onDocumentUploaded?: (readerDocumentId: string) => void;
}> = ({ onPrefill, onDocumentUploaded }) => {
  const [rectoDone, setRectoDone] = useState(false);
  const [versoDone, setVersoDone] = useState(false);
  const versoCameraRef = useRef<HTMLInputElement | null>(null);
  const versoFileRef = useRef<HTMLInputElement | null>(null);
  // On garde en mémoire si le recto a été pris via l'appareil photo ou via
  // le sélecteur de fichier, pour enchaîner le verso dans le même mode.
  const [rectoSource, setRectoSource] = useState<'camera' | 'file'>('camera');

  const handleRectoDone = useCallback(() => {
    setRectoDone(true);
    if (!versoDone) {
      // Déclencher le second input après un micro-tick pour laisser React
      // flusher le state ; sinon l'input peut encore être désactivé.
      setTimeout(() => {
        const target = rectoSource === 'camera' ? versoCameraRef.current : versoFileRef.current;
        target?.click();
      }, 50);
    }
  }, [rectoSource, versoDone]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="text-xs font-black text-slate-800">Carte Grise (recto + verso)</div>
      </div>
      <div className="text-[11px] text-slate-500">
        Scannez le recto puis le verso — l'appareil photo s'ouvre
        automatiquement pour le verso après la première prise.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <ScanSlot
          title="Recto"
          description="WW antérieur, 1ère mise en circulation, fin de validité"
          onPrefill={(d) => { onPrefill(d); handleRectoDone(); }}
          mapFields={mapCarteGriseRecto}
          onDocumentUploaded={(id) => onDocumentUploaded?.(id)}
          onSourceChosen={setRectoSource}
        />
        <ScanSlot
          title="Verso"
          description="Marque, modèle, châssis (VIN), carburant, puissance fiscale"
          onPrefill={(d) => { onPrefill(d); setVersoDone(true); }}
          mapFields={mapCarteGriseVerso}
          onDocumentUploaded={(id) => onDocumentUploaded?.(id)}
          cameraInputRef={versoCameraRef}
          fileInputRef={versoFileRef}
          disabled={!rectoDone}
        />
      </div>
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

// A "N° provisoire / WW" must be a WW plate: WW + 4-7 digits. Accepts the WW
// possibly garbled by OCR (WM/WN/WA + optional stray letter) and normalises to
// "WW<digits>". Returns undefined for anything else, so the field shows
// "non détecté" instead of a bogus value like "dena".
function wwStr(v: unknown): string | undefined {
  const s = str(v);
  if (!s) return undefined;
  const up = s.toUpperCase();
  const m = up.match(/W[WMNAHVY][A-Z]?\s*[-.]?\s*(\d{4,7})/) || up.match(/(\d{4,7})\s*W[WMNAHVY]/);
  return m ? 'WW' + m[1] : undefined;
}

function mapAssurance(d: Record<string, unknown>): ScannedVehicleData {
  return {
    insuranceCompany: str(d.insurance_company ?? d.company_name ?? d.compagnie ?? d.insurer),
    numeroPolice:     str(d.policy_number ?? d.numero_police ?? d.policy_no ?? d.contract_number),
    insuranceStart:   str(d.guarantee_start ?? d.date_effet ?? d.start_date ?? d.date_debut),
    insuranceExpiry:  str(d.guarantee_end ?? d.expiry_date ?? d.date_expiration ?? d.validity_date ?? d.date_fin),
    immatProvisoire:  wwStr(d.registration_number ?? d.immatriculation ?? d.plate_number ?? d.ww_number),
  };
}

// L'autorisation de circulation est le MÊME papier que l'attestation de
// paiement TSAV (« la vignette »), donc on en tire aussi vignetteExpiry.
function mapAutorisation(d: Record<string, unknown>): ScannedVehicleData {
  return {
    registration:       str(d.registration_number ?? d.immatriculation ?? d.plate_number),
    immatProvisoire:    wwStr(d.ww_number ?? d.provisional_number ?? d.numero_provisoire ?? d.registration_number),
    cgMarque:           str(d.brand ?? d.marque ?? d.make),
    fuelType:           str(d.fuel_type ?? d.carburant ?? d.energie),
    miseEnCirculation:  str(d.first_registration_date ?? d.mise_en_circulation ?? d.date_circulation),
    autorisationExpiry: str(d.authorization_expiry ?? d.valid_until ?? d.expiry_date ?? d.date_validite),
    vignetteExpiry:     str(d.expiry_date ?? d.date_expiration ?? d.validity_date ?? d.date_validite ?? d.year ?? d.annee ?? d.valid_until),
  };
}

/**
 * La visite technique EST l'attestation de paiement : un seul papier, qui porte
 * l'immatriculation, le WW, le carburant, la mise en circulation et la
 * puissance fiscale en plus de sa date de validité.
 */
function mapVisiteTech(d: Record<string, unknown>): ScannedVehicleData {
  return {
    techControlExpiry: str(d.expiry_date ?? d.date_expiration ?? d.validity_date ?? d.date_validite ?? d.valid_until ?? d.next_inspection),
    registration:      str(d.registration_number ?? d.immatriculation ?? d.plate_number),
    immatProvisoire:   wwStr(d.ww_number ?? d.provisional_number ?? d.numero_provisoire),
    fuelType:          str(d.fuel_type ?? d.carburant ?? d.energie),
    miseEnCirculation: str(d.first_registration_date ?? d.mise_en_circulation ?? d.date_circulation),
    fiscalPower:       str(d.fiscal_power ?? d.puissance_fiscale ?? d.cv_fiscaux),
  };
}

/** Rejet défensif des plaques du type "27314---72" (sans aucun marqueur
 *  central) : si le parser côté serveur en laisse passer une, on la convertit
 *  en undefined. On tolère par contre "27314-?-72" (lettre arabe illisible)
 *  parce que l'UI remplit le numéro + la région et laisse l'agent choisir
 *  la lettre dans le dropdown. */
function cleanPlate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return /\d+[-\s][A-Z?][-\s]\d+/i.test(raw.toUpperCase()) ? raw : undefined;
}

// Recto de la carte grise : plaque définitive, WW antérieur, 1ère mise en
// circulation, fin de validité. On NE touche PAS aux champs verso (marque,
// modèle, châssis, carburant, puissance) pour que la liste "Non détectés"
// ne mentionne pas des champs qui ne sont physiquement pas sur cette face.
function mapCarteGriseRecto(d: Record<string, unknown>): ScannedVehicleData {
  // L'immatriculation est volontairement ignorée côté recto : la lettre
  // centrale y est en arabe et l'OCR se trompe souvent de caractère. On
  // laisse le verso (MRZ ICAO) poser la plaque sans ambiguïté.
  return {
    immatProvisoire:   wwStr(d.ww_number ?? d.provisional_number ?? d.numero_provisoire ?? d.immatriculation_anterieure),
    miseEnCirculation: str(d.first_registration_date ?? d.mise_en_circulation ?? d.date_circulation ?? d.premiere_mise_en_circulation),
    cgExpiry:          str(d.expiry_date ?? d.fin_validite ?? d.validity_date),
  };
}

// Verso de la carte grise : marque, modèle, châssis (VIN), carburant,
// puissance fiscale. On remonte AUSSI l'immatriculation si le parser l'a
// trouvée dans la MRZ ICAO en bas de la face arrière (c'est la source la
// plus fiable de la plaque — la lettre centrale y est forcément Latine).
function mapCarteGriseVerso(d: Record<string, unknown>): ScannedVehicleData {
  return {
    cgMarque:      str(d.brand ?? d.marque ?? d.make),
    cgModele:      str(d.model ?? d.modele),
    cgChassis:     str(d.vin_number ?? d.vin ?? d.chassis ?? d.chassis_number),
    cgFuelType:    str(d.fuel_type ?? d.carburant ?? d.energie),
    cgFiscalPower: str(d.fiscal_power ?? d.puissance_fiscale),
    nombrePortes:  str(d.nombre_portes ?? d.number_of_doors ?? d.doors),
    nombrePlaces:  str(d.nombre_places ?? d.number_of_seats ?? d.seats),
    nombreCylindres: str(d.nombre_cylindres ?? d.number_of_cylinders ?? d.cylinders),
    registration:  cleanPlate(str(d.registration_number ?? d.immatriculation ?? d.plate_number)),
  };
}

// Gardé pour les anciens points d'entrée (sub-rental, etc.) qui n'ont qu'un
// seul uploader « carte grise » tout-en-un.
function mapCarteGrise(d: Record<string, unknown>): ScannedVehicleData {
  return { ...mapCarteGriseRecto(d), ...mapCarteGriseVerso(d) };
}

const FIELD_LABELS: Record<string, string> = {
  insuranceCompany:      'Compagnie',
  numeroPolice:          'N° police',
  insuranceStart:        'Assurance du',
  insuranceExpiry:       'Assurance au',
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
  immatProvisoire:       'N° provisoire / WW',
  immatProvisoireExpiry: 'Validité',
  autorisationExpiry:    'Autorisation valable jusqu\'au',
  techControlExpiry:     'Exp. visite tech.',
  vignetteExpiry:        'Exp. vignette',
  cgMarque:              'Marque',
  cgModele:              'Modèle',
  cgChassis:             'N° châssis (VIN)',
  cgFuelType:            'Carburant',
  cgFiscalPower:         'Puissance fiscale',
  cgExpiry:              'Fin de validité',
  nombrePortes:          'Nombre de portes',
  nombrePlaces:          'Nombre de places',
  nombreCylindres:       'Nombre de cylindres',
};
