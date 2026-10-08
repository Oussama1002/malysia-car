/// Un client — particulier ou entreprise. Même structure que `Customer` côté
/// web : on garde tout ce qui tient dans une ligne de liste (nom, code, type,
/// KYC, risque, statut, blacklist, agence).
class CustomerDto {
  const CustomerDto({
    required this.id,
    required this.code,
    required this.type,
    this.displayName,
    this.nationalId,
    this.ice,
    this.kycStatus,
    this.riskLevel,
    this.status,
    this.isBlacklisted = false,
    this.branchId,
    this.branchName,
    this.phone,
    this.email,
  });

  final String id;
  final String code;
  final String type; // PARTICULIER / ENTREPRISE
  final String? displayName;
  final String? nationalId;
  final String? ice;
  final String? kycStatus;
  final String? riskLevel;
  final String? status;
  final bool isBlacklisted;
  final String? branchId;
  final String? branchName;
  final String? phone;
  final String? email;

  bool get isCompany => type.toUpperCase() == 'ENTREPRISE';

  factory CustomerDto.fromJson(Map<String, dynamic> json) {
    final ind = json['individual_profile'];
    final comp = json['company_profile'];
    String? name;
    if (json['display_name'] is String &&
        (json['display_name'] as String).isNotEmpty) {
      name = json['display_name'] as String;
    } else if (ind is Map) {
      final f = ind['first_name']?.toString() ?? '';
      final l = ind['last_name']?.toString() ?? '';
      final full = ('$f $l').trim();
      if (full.isNotEmpty) name = full;
    } else if (comp is Map) {
      name = (comp['trade_name'] ?? comp['legal_name'])?.toString();
    }
    final kyc = json['latest_kyc_case'];
    final branch = json['branch'];
    return CustomerDto(
      id: json['id']?.toString() ?? '',
      code: json['customer_code']?.toString() ?? '—',
      type: json['customer_type']?.toString() ?? 'PARTICULIER',
      displayName: name,
      nationalId: ind is Map ? ind['national_id_number']?.toString() : null,
      ice: comp is Map ? comp['ice']?.toString() : null,
      kycStatus: json['kyc_status']?.toString() ??
          (kyc is Map ? kyc['kyc_status']?.toString() : null),
      riskLevel: json['risk_level']?.toString(),
      status: json['status']?.toString(),
      isBlacklisted: json['is_blacklisted'] == true,
      branchId: json['branch_id']?.toString(),
      branchName: branch is Map ? branch['name']?.toString() : null,
      phone: json['primary_phone']?.toString(),
      email: json['primary_email']?.toString(),
    );
  }
}

const Map<String, String> kKycStatusFr = {
  'pending': 'En attente',
  'in_review': 'En revue',
  'approved': 'Approuvé',
  'rejected': 'Rejeté',
  'expired': 'Expiré',
};

const Map<String, String> kRiskLevelFr = {
  'low': 'Faible',
  'normal': 'Normal',
  'elevated': 'Élevé',
  'high': 'Élevé+',
};

const Map<String, String> kCustomerStatusFr = {
  'active': 'Actif',
  'suspended': 'Suspendu',
  'inactive': 'Inactif',
};
