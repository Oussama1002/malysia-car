import 'contract_dto.dart';

/// La fiche d'un contrat telle que le serveur la rend. On garde ce qui a du
/// sens à afficher sur un téléphone — les échéances, les paiements, les
/// documents et l'historique sont chargés séparément (voir repo).
class ContractDetailDto {
  const ContractDetailDto({
    required this.contract,
    this.monthlyAmount,
    this.deposit,
    this.firstRent,
    this.residualValue,
    this.rate,
    this.durationMonths,
    this.kmPerYear,
    this.signatureStatus,
    this.paymentStatus,
    this.clientPhone,
    this.clientEmail,
    this.notes,
  });

  final ContractDto contract;
  final double? monthlyAmount;
  final double? deposit;
  final double? firstRent;
  final double? residualValue;
  final double? rate;
  final int? durationMonths;
  final int? kmPerYear;
  final String? signatureStatus;
  final String? paymentStatus;
  final String? clientPhone;
  final String? clientEmail;
  final String? notes;

  factory ContractDetailDto.fromJson(Map<String, dynamic> json) {
    // Le backend `ContractResource` renvoie camelCase (`monthlyPayment`,
    // `depositAmount`, `durationMonths`, `signatureStatus`, …). On lit les
    // deux pour rester compatible avec d'anciens formats.
    return ContractDetailDto(
      contract: ContractDto.fromJson(json),
      monthlyAmount: _d(json['monthlyPayment']) ??
          _d(json['monthly_amount']) ??
          _d(json['monthly_rental']) ??
          _d(json['monthly_payment']),
      deposit: _d(json['depositAmount']) ??
          _d(json['deposit_amount']) ??
          _d(json['deposit']),
      firstRent: _d(json['downPaymentAmount']) ??
          _d(json['down_payment_amount']) ??
          _d(json['first_rent']),
      residualValue:
          _d(json['buyoutOptionAmount']) ?? _d(json['residual_value']),
      rate: _d(json['excessKmRate']) ?? _d(json['rate']),
      durationMonths:
          _int(json['durationMonths']) ?? _int(json['duration_months']),
      kmPerYear: _int(json['allowedKm']) ??
          _int(json['km_per_year']) ??
          _int(json['annual_km']),
      signatureStatus:
          (json['signatureStatus'] ?? json['signature_status'])?.toString(),
      paymentStatus:
          (json['paymentMethod'] ?? json['payment_status'])?.toString(),
      clientPhone: json['client_phone']?.toString(),
      clientEmail: json['client_email']?.toString(),
      notes: json['notes']?.toString(),
    );
  }
}

class ContractInstallmentDto {
  const ContractInstallmentDto({
    required this.id,
    required this.number,
    required this.amount,
    required this.status,
    this.dueDate,
    this.paidAt,
  });

  final String id;
  final int number;
  final double amount;
  final String status;
  final DateTime? dueDate;
  final DateTime? paidAt;

  factory ContractInstallmentDto.fromJson(Map<String, dynamic> json) {
    return ContractInstallmentDto(
      id: json['id']?.toString() ?? '',
      number: _int(json['installment_number']) ?? _int(json['number']) ?? 0,
      amount: _d(json['amount']) ?? 0,
      status: json['status']?.toString() ?? 'pending',
      dueDate: _date(json['due_date']),
      paidAt: _date(json['paid_at']),
    );
  }
}

class ContractAuditEntryDto {
  const ContractAuditEntryDto({
    required this.id,
    required this.action,
    this.actorName,
    this.detail,
    this.createdAt,
  });

  final String id;
  final String action;
  final String? actorName;
  final String? detail;
  final DateTime? createdAt;

  factory ContractAuditEntryDto.fromJson(Map<String, dynamic> json) {
    return ContractAuditEntryDto(
      id: json['id']?.toString() ?? '',
      action: json['action']?.toString() ??
          json['action_label']?.toString() ??
          json['action_type']?.toString() ??
          '—',
      actorName: json['userName']?.toString() ??
          json['actor_name']?.toString() ??
          json['user_name']?.toString(),
      detail: json['detail']?.toString(),
      createdAt:
          _date(json['createdAt']) ?? _date(json['created_at']),
    );
  }
}

double? _d(dynamic v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString());
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

const Map<String, String> kInstallmentStatusFr = {
  'pending': 'En attente',
  'paid': 'Payé',
  'overdue': 'En retard',
  'partial': 'Partiel',
  'cancelled': 'Annulé',
};

String installmentStatusFr(String raw) =>
    kInstallmentStatusFr[raw.toLowerCase()] ?? raw;
