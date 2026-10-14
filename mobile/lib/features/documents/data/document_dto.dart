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

/// Catégories posées sur `entity_attachments.category` + les slots du
/// scanner véhicule et du wizard contrat. Doit couvrir ce que le mobile
/// envoie (voir `_annexCategoryFor` dans
/// `new_contract_from_reservation_screen.dart` et `_ocrType` dans
/// `new_vehicle_screen.dart`) et ce que l'API renvoie dans
/// `DocumentCenterItem.category`.
const Map<String, String> kDocumentCategoryFr = {
  // Clients
  'cin': "Pièce d'identité (CIN)",
  'passport': 'Passeport',
  'driving_license': 'Permis de conduire',
  'address_proof': 'Justificatif de domicile',
  'income_proof': 'Justificatif de revenus / CNSS',
  'cnss_cert': 'Attestation CNSS',
  'rib': 'RIB',
  // Entreprises
  'rc_cert': 'Registre de commerce (RC)',
  'ice_cert': 'Attestation ICE',
  'if_cert': 'Attestation IF',
  'statuts': 'Statuts de la société',
  'power_of_attorney': 'Pouvoir du signataire',
  'financial_statements': 'Bilans financiers',
  // Contrats / paiements
  'cheque': 'Chèque',
  'contract_pdf': 'Contrat PDF',
  'invoice_pdf': 'Facture PDF',
  // Véhicule / état des lieux
  'handover_photo': 'Photo véhicule (livraison)',
  'return_photo': 'Photo véhicule (retour)',
  'vehicle_registration': 'Carte grise',
  'insurance': 'Assurance',
  'autorisation_circulation': 'Autorisation de circulation',
  'payment_attestation': 'Attestation de paiement / Taxe',
  'tech_control': 'Visite technique',
  'vignette': 'Vignette',
  // Divers
  'other': 'Autre',
  'misc': 'Autre',
};

/// Libellé français d'une catégorie document. Repli : on « humanise »
/// le slug (`driving_license` → `Driving license`) pour qu'un code
/// inconnu reste lisible plutôt que brut.
String docCategoryLabel(String? raw) {
  if (raw == null || raw.trim().isEmpty) return '—';
  final key = raw.toLowerCase().trim();
  final mapped = kDocumentCategoryFr[key];
  if (mapped != null) return mapped;
  final words = key.replaceAll('_', ' ').trim();
  if (words.isEmpty) return '—';
  return words[0].toUpperCase() + words.substring(1);
}
