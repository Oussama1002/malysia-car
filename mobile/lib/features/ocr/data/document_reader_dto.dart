/// Types et libellés du Softnovation Document Reader (OCR).
const Map<String, String> kReaderTypeLabels = {
  'cin': 'CIN marocaine',
  'passport': 'Passeport',
  'driving_license': 'Permis de conduire',
  'vehicle_registration': 'Carte grise',
  'rental_contract': 'Contrat de location',
  'other': 'Autre / document libre',
};

/// Champs attendus par type — reproduit `FIELDS_BY_TYPE` du web.
const Map<String, List<String>> kReaderFieldsByType = {
  'cin': [
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
  'passport': [
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
  'driving_license': [
    'license_number',
    'full_name',
    'date_of_birth',
    'categories',
    'issue_date',
    'expiry_date',
  ],
  'vehicle_registration': [
    'registration_number',
    'vin_number',
    'brand',
    'model',
    'fuel_type',
    'first_registration_date',
    'owner_name',
  ],
  'rental_contract': [
    'full_name',
    'document_number',
    'issue_date',
    'expiry_date',
  ],
  'other': [],
};

/// Libellés FR des champs individuels.
const Map<String, String> kReaderFieldLabels = {
  'first_name': 'Prénom',
  'last_name': 'Nom',
  'full_name': 'Nom complet',
  'document_number': 'N° de document',
  'document_type': 'Type de document',
  'date_of_birth': 'Date de naissance',
  'nationality': 'Nationalité',
  'address': 'Adresse',
  'issue_date': 'Date de délivrance',
  'expiry_date': "Date d'expiration",
  'license_number': 'N° de permis',
  'categories': 'Catégories',
  'registration_number': "N° d'immatriculation",
  'vin_number': 'VIN / châssis',
  'brand': 'Marque',
  'model': 'Modèle',
  'fuel_type': 'Carburant',
  'first_registration_date': 'Première mise en circulation',
  'owner_name': 'Propriétaire',
};

String readerFieldLabel(String key) => kReaderFieldLabels[key] ?? key;
String readerTypeLabel(String key) => kReaderTypeLabels[key] ?? key;

/// Entités rattachables à un document (après extraction).
const List<Map<String, String>> kReaderLinkEntities = [
  {'value': '', 'label': '— Aucun rattachement —'},
  {'value': 'customer', 'label': 'Client'},
  {'value': 'driver', 'label': 'Conducteur'},
  {'value': 'vehicle', 'label': 'Véhicule'},
  {'value': 'reservation', 'label': 'Réservation'},
  {'value': 'contract', 'label': 'Contrat de location'},
];

class ReaderExtractionDto {
  const ReaderExtractionDto({
    required this.id,
    required this.provider,
    required this.status,
    this.confidenceScore,
    this.extractedData,
    this.validatedData,
    this.rawText,
    this.validatedAt,
  });

  final String id;
  final String provider;
  final String status; // draft | reviewed | validated | rejected
  final num? confidenceScore;
  final Map<String, dynamic>? extractedData;
  final Map<String, dynamic>? validatedData;
  final String? rawText;
  final DateTime? validatedAt;

  Map<String, dynamic> get sourceData =>
      validatedData ?? extractedData ?? const {};

  factory ReaderExtractionDto.fromJson(Map<String, dynamic> j) {
    return ReaderExtractionDto(
      id: j['id']?.toString() ?? '',
      provider: j['provider']?.toString() ?? '',
      status: j['status']?.toString() ?? 'draft',
      confidenceScore: _num(j['confidence_score']),
      extractedData: _map(j['extracted_data']),
      validatedData: _map(j['validated_data']),
      rawText: j['raw_text']?.toString(),
      validatedAt: _date(j['validated_at']),
    );
  }
}

class ReaderDocumentDto {
  const ReaderDocumentDto({
    required this.id,
    required this.fileName,
    required this.fileSize,
    required this.documentType,
    required this.status,
    this.mimeType,
    this.errorMessage,
    this.linkedEntityType,
    this.linkedEntityId,
    this.createdBy,
    this.createdAt,
    this.updatedAt,
    this.extraction,
  });

  final String id;
  final String fileName;
  final int fileSize;
  final String documentType;
  final String status; // pending | processing | extracted | validated | failed
  final String? mimeType;
  final String? errorMessage;
  final String? linkedEntityType;
  final String? linkedEntityId;
  final String? createdBy;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final ReaderExtractionDto? extraction;

  bool get isTerminal =>
      status == 'extracted' || status == 'validated' || status == 'failed';

  bool get isImage {
    final m = mimeType ?? '';
    return m.startsWith('image/');
  }

  bool get isPdf => mimeType == 'application/pdf';

  factory ReaderDocumentDto.fromJson(Map<String, dynamic> j) {
    final e = j['extraction'];
    return ReaderDocumentDto(
      id: j['id']?.toString() ?? '',
      fileName: j['file_name']?.toString() ?? '—',
      fileSize: int.tryParse(j['file_size']?.toString() ?? '0') ?? 0,
      documentType: j['document_type']?.toString() ?? 'other',
      status: j['status']?.toString() ?? 'pending',
      mimeType: j['mime_type']?.toString(),
      errorMessage: j['error_message']?.toString(),
      linkedEntityType: j['linked_entity_type']?.toString(),
      linkedEntityId: j['linked_entity_id']?.toString(),
      createdBy: j['created_by']?.toString(),
      createdAt: _date(j['created_at']),
      updatedAt: _date(j['updated_at']),
      extraction: e is Map
          ? ReaderExtractionDto.fromJson(
              e is Map<String, dynamic>
                  ? e
                  : e.map((k, v) => MapEntry(k.toString(), v)),
            )
          : null,
    );
  }
}

num? _num(dynamic v) {
  if (v == null) return null;
  if (v is num) return v;
  return num.tryParse(v.toString());
}

DateTime? _date(dynamic v) {
  if (v == null) return null;
  return DateTime.tryParse(v.toString());
}

Map<String, dynamic>? _map(dynamic v) {
  if (v is Map) {
    return v.map((k, val) => MapEntry(k.toString(), val));
  }
  return null;
}

/// Rend une valeur extraite en chaîne lisible dans un champ texte.
String stringifyValue(dynamic v) {
  if (v == null) return '';
  if (v is List) return v.join(', ');
  if (v is Map) return v.toString();
  return v.toString();
}
