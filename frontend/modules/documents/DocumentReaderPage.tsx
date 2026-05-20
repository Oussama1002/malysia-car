import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  documentReaderApi,
  type ReaderDocument,
  type ReaderDocumentType,
} from '@/services/documentReaderApi';

const TYPE_LABELS: Record<ReaderDocumentType, string> = {
  cin: 'CIN marocaine',
  passport: 'Passeport',
  driving_license: 'Permis de conduire',
  vehicle_registration: 'Carte grise',
  rental_contract: 'Contrat de location',
  other: 'Autre / document libre',
};

const FIELDS_BY_TYPE: Record<ReaderDocumentType, string[]> = {
  cin: [
    'first_name',
    'last_name',
    'full_name',
    'document_number',
    'document_type',
    'date_of_birth',
    'nationality',
    'address',
    'issue_date',
    'expiry_date',
  ],
  passport: [
    'first_name',
    'last_name',
    'full_name',
    'document_number',
    'document_type',
    'date_of_birth',
    'nationality',
    'address',
    'issue_date',
    'expiry_date',
  ],
  driving_license: ['license_number', 'full_name', 'date_of_birth', 'categories', 'issue_date', 'expiry_date'],
  vehicle_registration: [
    'registration_number',
    'vin_number',
    'brand',
    'model',
    'fuel_type',
    'first_registration_date',
    'owner_name',
  ],
  rental_contract: ['full_name', 'document_number', 'issue_date', 'expiry_date'],
  other: [],
};

const ENTITY_LINK_OPTIONS = [
  { value: '', label: '— Aucun rattachement —' },
  { value: 'customer', label: 'Client' },
  { value: 'driver', label: 'Conducteur' },
  { value: 'vehicle', label: 'Véhicule' },
  { value: 'reservation', label: 'Réservation' },
  { value: 'contract', label: 'Contrat de location' },
];

export const DocumentReaderPage: React.FC = () => {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hintedType, setHintedType] = useState<ReaderDocumentType>('cin');

  const listQ = useQuery({
    queryKey: ['document-reader', 'list'],
    queryFn: () => documentReaderApi.list({ per_page: 50 }),
  });

  const detailQ = useQuery({
    queryKey: ['document-reader', 'one', selectedId],
    queryFn: () => documentReaderApi.get(selectedId as string),
    enabled: !!selectedId,
  });

  const uploadMut = useMutation({
    mutationFn: (vars: { file: File; type: ReaderDocumentType }) =>
      documentReaderApi.upload(vars.file, vars.type),
    onSuccess: async (res) => {
      qc.invalidateQueries({ queryKey: ['document-reader', 'list'] });
      setSelectedId(res.data.id);
      // Auto-trigger OCR right after upload.
      extractMut.mutate({ id: res.data.id, type: hintedType });
    },
  });

  const extractMut = useMutation({
    mutationFn: (vars: { id: string; type?: ReaderDocumentType }) =>
      documentReaderApi.extract(vars.id, vars.type),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['document-reader', 'list'] });
      qc.invalidateQueries({ queryKey: ['document-reader', 'one', res.data.id] });
    },
  });

  const validateMut = useMutation({
    mutationFn: (vars: {
      id: string;
      data: Record<string, unknown>;
      link?: { entity_type: string; entity_id: string };
    }) => documentReaderApi.validate(vars.id, vars.data, vars.link),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['document-reader', 'list'] });
      qc.invalidateQueries({ queryKey: ['document-reader', 'one', res.data.id] });
    },
  });

  const removeMut = useMutation({
    mutationFn: (id: string) => documentReaderApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['document-reader', 'list'] });
      setSelectedId(null);
    },
  });

  const handleFile = useCallback(
    (file: File) => {
      uploadMut.mutate({ file, type: hintedType });
    },
    [uploadMut, hintedType],
  );

  const selected = detailQ.data?.data ?? null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black text-slate-900">Softnovation Document Reader</h1>
        <p className="text-sm text-slate-500">
          Numérisation, OCR (Tesseract) et extraction automatique des champs pour les CIN, passeports, permis,
          cartes grises et contrats. L'admin valide avant tout enregistrement.
        </p>
      </header>

      <UploadCard
        hintedType={hintedType}
        onTypeChange={setHintedType}
        onFile={handleFile}
        loading={uploadMut.isPending || extractMut.isPending}
        error={(uploadMut.error as Error | null)?.message ?? null}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <DocumentList
          docs={listQ.data?.data ?? []}
          loading={listQ.isLoading}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />

        <div className="lg:col-span-2">
          {selected ? (
            <DocumentDetail
              doc={selected}
              onReExtract={(type) => extractMut.mutate({ id: selected.id, type })}
              onValidate={(data, link) => validateMut.mutate({ id: selected.id, data, link })}
              onDelete={() => removeMut.mutate(selected.id)}
              extracting={extractMut.isPending}
              saving={validateMut.isPending}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
              Téléversez un document ou sélectionnez-en un dans la liste pour démarrer l'extraction.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Upload card
// ---------------------------------------------------------------------------

const UploadCard: React.FC<{
  hintedType: ReaderDocumentType;
  onTypeChange: (t: ReaderDocumentType) => void;
  onFile: (f: File) => void;
  loading: boolean;
  error: string | null;
}> = ({ hintedType, onTypeChange, onFile, loading, error }) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-black uppercase tracking-wider text-slate-500">Nouveau document</div>
        <label className="text-xs font-semibold text-slate-600">
          Type attendu
          <select
            value={hintedType}
            onChange={(e) => onTypeChange(e.target.value as ReaderDocumentType)}
            className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
          >
            {(Object.keys(TYPE_LABELS) as ReaderDocumentType[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`mt-3 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center text-sm transition ${
          dragOver ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 bg-slate-50'
        }`}
      >
        <div className="text-slate-700">Glissez-déposez un fichier ici</div>
        <div className="text-xs text-slate-500">Formats acceptés: PDF, JPG, JPEG, PNG · 15 Mo max</div>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
          >
            Choisir un fichier
          </button>
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100"
          >
            Prendre une photo
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
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
              if (f) onFile(f);
              e.target.value = '';
            }}
          />
        </div>
        {loading ? (
          <div className="mt-2 text-xs font-semibold text-indigo-600">OCR en cours…</div>
        ) : null}
        {error ? <div className="mt-2 text-xs font-semibold text-rose-600">{error}</div> : null}
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Document list
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700',
  processing: 'bg-amber-100 text-amber-800',
  extracted: 'bg-blue-100 text-blue-800',
  validated: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-rose-100 text-rose-800',
};

const DocumentList: React.FC<{
  docs: ReaderDocument[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}> = ({ docs, loading, selectedId, onSelect }) => {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 text-xs font-black uppercase tracking-wider text-slate-500">
        Documents récents
      </div>
      {loading ? (
        <div className="text-sm text-slate-500">Chargement…</div>
      ) : docs.length === 0 ? (
        <div className="text-sm text-slate-500">Aucun document pour le moment.</div>
      ) : (
        <ul className="space-y-2">
          {docs.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onSelect(d.id)}
                className={`flex w-full items-start justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs transition ${
                  selectedId === d.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="min-w-0">
                  <div className="truncate font-bold text-slate-800">{d.file_name}</div>
                  <div className="mt-1 truncate text-slate-500">
                    {TYPE_LABELS[d.document_type] ?? d.document_type}
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[d.status] ?? 'bg-slate-100 text-slate-700'}`}>
                  {d.status}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

// ---------------------------------------------------------------------------
// Document detail (preview + raw + editable fields + actions)
// ---------------------------------------------------------------------------

const DocumentDetail: React.FC<{
  doc: ReaderDocument;
  extracting: boolean;
  saving: boolean;
  onReExtract: (type?: ReaderDocumentType) => void;
  onValidate: (data: Record<string, unknown>, link?: { entity_type: string; entity_id: string }) => void;
  onDelete: () => void;
}> = ({ doc, extracting, saving, onReExtract, onValidate, onDelete }) => {
  const fields = useMemo(() => FIELDS_BY_TYPE[doc.document_type] ?? [], [doc.document_type]);
  const sourceData = (doc.extraction?.validated_data ?? doc.extraction?.extracted_data ?? {}) as Record<
    string,
    unknown
  >;
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f, stringify(sourceData[f])])),
  );
  const [linkType, setLinkType] = useState(doc.linked_entity_type ?? '');
  const [linkId, setLinkId] = useState(doc.linked_entity_id ?? '');
  const [docId] = useState(doc.id);

  // Reset draft when switching document or when extraction changes.
  React.useEffect(() => {
    setDraft(Object.fromEntries(fields.map((f) => [f, stringify(sourceData[f])])));
  }, [doc.id, doc.extraction?.id, fields.join(','), JSON.stringify(sourceData)]);

  const previewUrl = documentReaderApi.previewUrl(docId);

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-slate-800">{doc.file_name}</div>
          <div className="text-xs text-slate-500">
            {TYPE_LABELS[doc.document_type] ?? doc.document_type} · {doc.status}
            {doc.extraction?.confidence_score != null ? ` · confiance ${doc.extraction.confidence_score}` : ''}
          </div>
          {doc.error_message ? (
            <div className="mt-1 text-xs font-semibold text-rose-600">{doc.error_message}</div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onReExtract(doc.document_type)}
            disabled={extracting}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {extracting ? 'Extraction…' : "Réessayer l'extraction"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50"
          >
            Supprimer
          </button>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">Aperçu</div>
          {doc.mime_type === 'application/pdf' ? (
            <iframe title="preview" src={previewUrl} className="h-[420px] w-full rounded-lg border border-slate-200" />
          ) : (
            <img src={previewUrl} alt={doc.file_name} className="max-h-[420px] w-full rounded-lg border border-slate-200 object-contain" />
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-xs font-black uppercase tracking-wider text-slate-500">Texte OCR brut</div>
          <textarea
            readOnly
            value={doc.extraction?.raw_text ?? ''}
            className="h-[420px] w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-xs"
            placeholder={doc.status === 'failed' ? 'Échec OCR — réessayez.' : 'Aucun texte extrait pour le moment.'}
          />
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-black uppercase tracking-wider text-slate-500">Champs extraits</div>
          <div className="text-[11px] text-slate-500">
            Modifiez librement avant validation. Les données ne sont jamais enregistrées automatiquement.
          </div>
        </div>
        {fields.length === 0 ? (
          <div className="text-xs text-slate-500">
            Pas de schéma de champs prédéfini pour ce type. Vous pouvez tout de même consulter le texte brut.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {fields.map((f) => (
              <label key={f} className="block text-xs">
                <span className="font-semibold text-slate-700">{labelize(f)}</span>
                <input
                  type="text"
                  value={draft[f] ?? ''}
                  onChange={(e) => setDraft((s) => ({ ...s, [f]: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
                />
              </label>
            ))}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="block text-xs">
            <span className="font-semibold text-slate-700">Rattacher à</span>
            <select
              value={linkType}
              onChange={(e) => setLinkType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs"
            >
              {ENTITY_LINK_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs md:col-span-2">
            <span className="font-semibold text-slate-700">Identifiant (UUID)</span>
            <input
              type="text"
              value={linkId}
              onChange={(e) => setLinkId(e.target.value)}
              disabled={!linkType}
              placeholder="ex: 9b0d2c…"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs disabled:bg-slate-100"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={saving || doc.status === 'failed' || !doc.extraction}
            onClick={() =>
              onValidate(
                draft,
                linkType && linkId ? { entity_type: linkType, entity_id: linkId } : undefined,
              )
            }
            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? 'Enregistrement…' : 'Valider et enregistrer'}
          </button>
        </div>
      </section>
    </div>
  );
};

function stringify(v: unknown): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function labelize(field: string): string {
  const map: Record<string, string> = {
    first_name: 'Prénom',
    last_name: 'Nom',
    full_name: 'Nom complet',
    document_number: 'N° de document',
    document_type: 'Type de document',
    date_of_birth: 'Date de naissance',
    nationality: 'Nationalité',
    address: 'Adresse',
    issue_date: 'Date de délivrance',
    expiry_date: "Date d'expiration",
    license_number: 'N° de permis',
    categories: 'Catégories',
    registration_number: "N° d'immatriculation",
    vin_number: 'VIN / châssis',
    brand: 'Marque',
    model: 'Modèle',
    fuel_type: 'Carburant',
    first_registration_date: 'Première mise en circulation',
    owner_name: 'Propriétaire',
  };
  return map[field] ?? field;
}

export default DocumentReaderPage;
