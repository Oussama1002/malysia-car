import 'customer_dto.dart';

/// Fiche client complète : la fiche elle-même, ses adresses, ses contacts
/// (téléphones, emails), les pièces KYC et le solde résumé.
class CustomerDetailDto {
  const CustomerDetailDto({
    required this.customer,
    this.addresses = const [],
    this.contacts = const [],
    this.kycDocuments = const [],
    this.balance,
  });

  final CustomerDto customer;
  final List<AddressDto> addresses;
  final List<ContactDto> contacts;
  final List<KycDocumentDto> kycDocuments;
  final CustomerBalanceDto? balance;

  factory CustomerDetailDto.fromJson(Map<String, dynamic> json) {
    final c = CustomerDto.fromJson(json);
    return CustomerDetailDto(
      customer: c,
      addresses: _list(json['addresses'], AddressDto.fromJson),
      contacts: _list(json['contacts'], ContactDto.fromJson),
      kycDocuments: _kycDocs(json),
    );
  }

  CustomerDetailDto copyWith({CustomerBalanceDto? balance}) {
    return CustomerDetailDto(
      customer: customer,
      addresses: addresses,
      contacts: contacts,
      kycDocuments: kycDocuments,
      balance: balance ?? this.balance,
    );
  }

  static Map<String, dynamic>? _asMap(dynamic v) {
    if (v is Map<String, dynamic>) return v;
    if (v is Map) return v.map((k, v) => MapEntry(k.toString(), v));
    return null;
  }

  static List<T> _list<T>(dynamic raw, T Function(Map<String, dynamic>) parse) {
    if (raw is! List) return const [];
    return raw.map(_asMap).whereType<Map<String, dynamic>>().map(parse).toList();
  }

  static List<KycDocumentDto> _kycDocs(Map<String, dynamic> json) {
    // Les documents vivent sur le dernier dossier KYC du client ; l'API les
    // expose soit à plat sur la fiche, soit dans `latest_kyc_case.documents`.
    final direct = _list(json['kyc_documents'], KycDocumentDto.fromJson);
    if (direct.isNotEmpty) return direct;
    final latest = _asMap(json['latest_kyc_case']);
    if (latest != null) {
      return _list(latest['documents'], KycDocumentDto.fromJson);
    }
    return const [];
  }
}

class AddressDto {
  const AddressDto({
    required this.id,
    this.type,
    this.line1,
    this.line2,
    this.city,
    this.country,
    this.isDefault = false,
  });

  final String id;
  final String? type;
  final String? line1;
  final String? line2;
  final String? city;
  final String? country;
  final bool isDefault;

  String get formatted => [line1, line2, city, country]
      .where((e) => e != null && e.isNotEmpty)
      .join(', ');

  factory AddressDto.fromJson(Map<String, dynamic> json) {
    return AddressDto(
      id: json['id']?.toString() ?? '',
      type: json['address_type']?.toString(),
      line1: json['address_line_1']?.toString() ?? json['line_1']?.toString(),
      line2: json['address_line_2']?.toString(),
      city: json['city']?.toString(),
      country: json['country']?.toString(),
      isDefault: json['is_default'] == true,
    );
  }
}

class ContactDto {
  const ContactDto({
    required this.id,
    required this.type,
    required this.value,
    this.label,
  });

  final String id;
  final String type; // 'phone' | 'email' | 'other'
  final String value;
  final String? label;

  factory ContactDto.fromJson(Map<String, dynamic> json) {
    return ContactDto(
      id: json['id']?.toString() ?? '',
      type: json['contact_type']?.toString() ?? 'phone',
      value: json['value']?.toString() ?? '',
      label: json['label']?.toString(),
    );
  }
}

class KycDocumentDto {
  const KycDocumentDto({
    required this.id,
    required this.type,
    required this.status,
    this.fileName,
    this.uploadedAt,
  });

  final String id;
  final String type;
  final String status;
  final String? fileName;
  final DateTime? uploadedAt;

  factory KycDocumentDto.fromJson(Map<String, dynamic> json) {
    return KycDocumentDto(
      id: json['id']?.toString() ?? '',
      type: json['document_type']?.toString() ?? '',
      status: json['verification_status']?.toString() ?? 'pending',
      fileName: json['file_name']?.toString(),
      uploadedAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'].toString())
          : null,
    );
  }
}

class CustomerBalanceDto {
  const CustomerBalanceDto({
    required this.invoicedTotal,
    required this.paidTotal,
    required this.balance,
    this.unallocatedPayments = 0,
  });

  final double invoicedTotal;
  final double paidTotal;
  final double balance;
  final double unallocatedPayments;

  factory CustomerBalanceDto.fromJson(Map<String, dynamic> json) {
    double d(dynamic v) {
      if (v == null) return 0;
      if (v is num) return v.toDouble();
      return double.tryParse(v.toString()) ?? 0;
    }

    return CustomerBalanceDto(
      invoicedTotal: d(json['invoiced_total']),
      paidTotal: d(json['paid_total']),
      balance: d(json['balance']),
      unallocatedPayments: d(json['unallocated_payments']),
    );
  }
}

const Map<String, String> kDocumentTypeFr = {
  'cin': 'CIN',
  'passport': 'Passeport',
  'driving_license': 'Permis de conduire',
  'proof_of_address': 'Justificatif de domicile',
  'rib': 'RIB',
  'payslip': 'Fiche de paie',
  'cnss': 'Attestation CNSS',
  'ice': 'Attestation ICE',
  'rc': 'Registre de commerce',
  'tax_identifier': 'Attestation fiscale',
  'statuts': 'Statuts',
};

String documentTypeFr(String raw) =>
    kDocumentTypeFr[raw.toLowerCase()] ?? raw;

const Map<String, String> kDocStatusFr = {
  'pending': 'En attente',
  'verified': 'Vérifié',
  'rejected': 'Rejeté',
};
