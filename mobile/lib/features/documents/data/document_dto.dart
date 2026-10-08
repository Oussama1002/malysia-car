/// Document du centre documentaire — mapping direct de `DocumentCenterItem`
/// retourné par `/v1/documents` (les clés sont en camelCase côté API).
class DocumentDto {
  const DocumentDto({
    required this.id,
    required this.source,
    required this.title,
    required this.status,
    this.category,
    this.entityType,
    this.entityId,
    this.mimeType,
    this.sizeBytes,
    this.checksum,
    this.expiryDate,
    this.issueDate,
    this.documentNumber,
    this.visibility,
    this.uploadedByName,
    this.uploadedById,
    this.createdAt,
    this.notes,
    this.expiryBucket,
  });

  final String id;
  final String source; // 'upload' | 'generated'
  final String title;
  final String status;
  final String? category;
  final String? entityType;
  final String? entityId;
  final String? mimeType;
  final int? sizeBytes;
  final String? checksum;
  final DateTime? expiryDate;
  final DateTime? issueDate;
  final String? documentNumber;
  final String? visibility;
  final String? uploadedByName;
  final String? uploadedById;
  final DateTime? createdAt;
  final String? notes;
  final String? expiryBucket; // 'missing' | 'expired' | 'expiring_soon' | 'ok' | 'none'

  factory DocumentDto.fromJson(Map<String, dynamic> json) {
    final up = json['uploadedBy'];
    String? uploadedByName;
    String? uploadedById;
    if (up is Map) {
      uploadedByName = up['name']?.toString();
      uploadedById = up['id']?.toString();
    }
    return DocumentDto(
      id: json['id']?.toString() ?? '',
      source: json['source']?.toString() ?? 'upload',
      title: json['title']?.toString() ?? '—',
      status: json['status']?.toString() ?? '',
      category: json['category']?.toString(),
      entityType: json['entityType']?.toString(),
      entityId: json['entityId']?.toString(),
      mimeType: json['mimeType']?.toString(),
      sizeBytes: _int(json['sizeBytes']),
      checksum: json['checksum']?.toString(),
      expiryDate: _date(json['expiryDate']),
      issueDate: _date(json['issueDate']),
      documentNumber: json['documentNumber']?.toString(),
      visibility: json['visibility']?.toString(),
      uploadedByName: uploadedByName,
      uploadedById: uploadedById,
      createdAt: _date(json['createdAt']),
      notes: json['notes']?.toString(),
      expiryBucket: json['expiryBucket']?.toString(),
    );
  }
}

int? _int(dynamic v) {
  if (v == null) return null;
  if (v is int) return v;
  if (v is num) return v.toInt();
  return int.tryParse(v.toString());
}

DateTime? _date(dynamic v) {
  if (v == null) return null;
  return DateTime.tryParse(v.toString());
}

/// Options du filtre « Type entité » — valeurs identiques au web
/// (`ENTITY_OPTIONS` dans `DocumentsCenterPage.tsx`).
const Map<String, String> kDocumentEntityTypeFr = {
  '': 'Toutes',
  'vehicle': 'Véhicule',
  'customer': 'Client',
  'contract': 'Contrat',
  'accident': 'Sinistre',
  'mission': 'Mission',
  'kyc_case': 'KYC',
  'invoice': 'Facture',
};

/// Options du filtre « Statut expiration ».
const Map<String, String> kDocumentExpiryStatusFr = {
  '': 'Tous',
  'ok': 'OK',
  'expiring_30': 'Expire dans 30 j',
  'expired': 'Expiré',
  'missing_expiry': 'Sans échéance',
};

String docEntityLabel(String? raw) {
  if (raw == null || raw.isEmpty) return '—';
  return kDocumentEntityTypeFr[raw] ?? raw;
}
