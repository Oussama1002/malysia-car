import 'customer_detail_dto.dart';
import 'customer_dto.dart';

/// Le dossier complet d'un client : ce que le serveur rend à `/customers/{id}/dossier`.
/// Rassemble en une seule requête l'identité, les adresses, les contacts,
/// les comptes bancaires, le KYC, la blacklist, les notes, les contrats
/// liés, les paiements et le profil de risque.
class CustomerDossierDto {
  const CustomerDossierDto({
    required this.customer,
    this.addresses = const [],
    this.contacts = const [],
    this.bankAccounts = const [],
    this.kycCases = const [],
    this.blacklist = const [],
    this.notes = const [],
    this.contracts = const [],
    this.payments = const [],
    this.risk,
  });

  final CustomerDto customer;
  final List<AddressDto> addresses;
  final List<ContactDto> contacts;
  final List<BankAccountDto> bankAccounts;
  final List<KycCaseDto> kycCases;
  final List<BlacklistEntryDto> blacklist;
  final List<CustomerNoteDto> notes;
  final List<CustomerContractRefDto> contracts;
  final List<CustomerPaymentRefDto> payments;
  final RiskProfileDto? risk;

  int get documentsCount =>
      kycCases.fold<int>(0, (acc, k) => acc + k.documents.length);

  factory CustomerDossierDto.fromJson(Map<String, dynamic> json) {
    final customer =
        CustomerDto.fromJson(_asMap(json['customer']) ?? const {});
    final kycRaw = _asMap(json['kyc']);
    final blRaw = _asMap(json['blacklist']);
    return CustomerDossierDto(
      customer: customer,
      addresses: _list(json['addresses'], AddressDto.fromJson),
      contacts: _list(json['contacts'], ContactDto.fromJson),
      bankAccounts: _list(json['bank_accounts'], BankAccountDto.fromJson),
      kycCases: kycRaw != null
          ? _list(kycRaw['cases'], KycCaseDto.fromJson)
          : const [],
      blacklist: blRaw != null
          ? _list(blRaw['active'], BlacklistEntryDto.fromJson)
          : const [],
      notes: _list(json['notes'], CustomerNoteDto.fromJson),
      contracts: _list(json['contracts'], CustomerContractRefDto.fromJson),
      payments: _list(json['payments'], CustomerPaymentRefDto.fromJson),
      risk: _asMap(json['risk']) != null
          ? RiskProfileDto.fromJson(_asMap(json['risk'])!)
          : null,
    );
  }
}

Map<String, dynamic>? _asMap(dynamic v) {
  if (v is Map<String, dynamic>) return v;
  if (v is Map) return v.map((k, v) => MapEntry(k.toString(), v));
  return null;
}

List<T> _list<T>(dynamic raw, T Function(Map<String, dynamic>) parse) {
  if (raw is! List) return const [];
  return raw.map(_asMap).whereType<Map<String, dynamic>>().map(parse).toList();
}

class BankAccountDto {
  const BankAccountDto({
    required this.id,
    this.bankName,
    this.rib,
    this.iban,
    this.isDefault = false,
  });

  final String id;
  final String? bankName;
  final String? rib;
  final String? iban;
  final bool isDefault;

  factory BankAccountDto.fromJson(Map<String, dynamic> json) {
    return BankAccountDto(
      id: json['id']?.toString() ?? '',
      bankName: json['bank_name']?.toString(),
      rib: json['rib']?.toString(),
      iban: json['iban']?.toString(),
      isDefault: json['is_default'] == true,
    );
  }
}

class KycCaseDto {
  const KycCaseDto({
    required this.id,
    required this.status,
    this.verificationLevel,
    this.riskScore,
    this.reviewedAt,
    this.rejectionReason,
    this.documents = const [],
  });

  final String id;
  final String status;
  final String? verificationLevel;
  final double? riskScore;
  final DateTime? reviewedAt;
  final String? rejectionReason;
  final List<KycDocumentDto> documents;

  factory KycCaseDto.fromJson(Map<String, dynamic> json) {
    final docs = json['documents'];
    return KycCaseDto(
      id: json['id']?.toString() ?? '',
      status: json['kyc_status']?.toString() ?? 'pending',
      verificationLevel: json['verification_level']?.toString(),
      riskScore: _d(json['risk_score']),
      reviewedAt: _date(json['reviewed_at']),
      rejectionReason: json['rejection_reason']?.toString(),
      documents: _list(docs, KycDocumentDto.fromJson),
    );
  }
}

class BlacklistEntryDto {
  const BlacklistEntryDto({
    required this.id,
    this.reason,
    this.severity,
    this.addedAt,
    this.liftedAt,
  });

  final String id;
  final String? reason;
  final String? severity;
  final DateTime? addedAt;
  final DateTime? liftedAt;

  factory BlacklistEntryDto.fromJson(Map<String, dynamic> json) {
    return BlacklistEntryDto(
      id: json['id']?.toString() ?? '',
      reason: json['reason']?.toString(),
      severity: json['severity']?.toString(),
      addedAt: _date(json['added_at']),
      liftedAt: _date(json['lifted_at']),
    );
  }
}

class CustomerNoteDto {
  const CustomerNoteDto({
    required this.id,
    required this.body,
    this.authorName,
    this.createdAt,
    this.category,
  });

  final String id;
  final String body;
  final String? authorName;
  final DateTime? createdAt;
  final String? category;

  factory CustomerNoteDto.fromJson(Map<String, dynamic> json) {
    return CustomerNoteDto(
      id: json['id']?.toString() ?? '',
      body: json['body']?.toString() ?? '',
      authorName: json['author']?.toString() ??
          json['author_name']?.toString() ??
          json['user_name']?.toString(),
      createdAt: _date(json['created_at']),
      category: json['category']?.toString(),
    );
  }
}

class CustomerContractRefDto {
  const CustomerContractRefDto({
    required this.id,
    required this.number,
    required this.status,
    this.type,
    this.vehicleLabel,
    this.startDate,
    this.endDate,
    this.amount,
  });

  final String id;
  final String number;
  final String status;
  final String? type;
  final String? vehicleLabel;
  final DateTime? startDate;
  final DateTime? endDate;
  final double? amount;

  factory CustomerContractRefDto.fromJson(Map<String, dynamic> json) {
    String? vehicle;
    final v = json['vehicle'];
    if (v is Map) {
      final brand = v['brand'] is Map ? v['brand']['name'] : v['brand_name'];
      final model = v['model'] is Map
          ? (v['model']['model_name'] ?? v['model']['name'])
          : v['model_name'];
      final reg = v['registration_number'] ?? v['registration'];
      vehicle = [
        [brand, model].where((e) => e != null && '$e'.isNotEmpty).join(' '),
        reg,
      ].where((e) => e != null && '$e'.isNotEmpty).join(' · ');
    }
    return CustomerContractRefDto(
      id: json['id']?.toString() ?? '',
      number: json['contract_number']?.toString() ?? '—',
      status: json['status']?.toString() ?? '',
      type: json['contract_type']?.toString(),
      vehicleLabel: vehicle,
      startDate: _date(json['start_date']),
      endDate: _date(json['end_date']),
      amount: _d(json['base_amount']) ?? _d(json['amount']),
    );
  }
}

class CustomerPaymentRefDto {
  const CustomerPaymentRefDto({
    required this.id,
    required this.amount,
    required this.method,
    required this.status,
    required this.number,
    this.paymentDate,
    this.type,
    this.chequeStatus,
  });

  final String id;
  final String number;
  final double amount;
  final String method;
  final String status;
  final DateTime? paymentDate;
  final String? type;
  final String? chequeStatus;

  bool get isReversed => status == 'reversed' || chequeStatus == 'bounced';

  factory CustomerPaymentRefDto.fromJson(Map<String, dynamic> json) {
    return CustomerPaymentRefDto(
      id: json['id']?.toString() ?? '',
      number: json['payment_number']?.toString() ?? '—',
      amount: _d(json['amount']) ?? 0,
      method: json['payment_method']?.toString() ?? '',
      status: json['status']?.toString() ?? '',
      paymentDate: _date(json['payment_date']),
      type: json['payment_type']?.toString(),
      chequeStatus: json['cheque_status']?.toString(),
    );
  }
}

class RiskProfileDto {
  const RiskProfileDto({
    required this.level,
    required this.isBlacklisted,
    this.score,
  });

  final String level;
  final bool isBlacklisted;
  final double? score;

  factory RiskProfileDto.fromJson(Map<String, dynamic> json) {
    return RiskProfileDto(
      level: json['level']?.toString() ?? 'normal',
      isBlacklisted: json['is_blacklisted'] == true,
      score: _d(json['score']),
    );
  }
}

double? _d(dynamic v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString());
}

DateTime? _date(dynamic v) {
  if (v == null) return null;
  return DateTime.tryParse(v.toString());
}

const Map<String, String> kBlacklistSeverityFr = {
  'low': 'Faible',
  'medium': 'Modérée',
  'high': 'Élevée',
};
