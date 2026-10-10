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
    this.paymentMethod,
    this.expectedPaymentDay,
    this.paymentTerms,
    this.bankReference,
    this.chequeNumber,
    this.history = const [],
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
  // Nouveau — carte « Paiement » de la version web.
  final String? paymentMethod;
  final int? expectedPaymentDay;
  final String? paymentTerms;
  final String? bankReference;
  final String? chequeNumber;
  // Historique métier renvoyé par `/contracts/{id}` sous la clé `history`.
  final List<ContractHistoryEntryDto> history;

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
          (json['paymentStatus'] ?? json['payment_status'])?.toString(),
      clientPhone: json['client_phone']?.toString(),
      clientEmail: json['client_email']?.toString(),
      notes: json['notes']?.toString(),
      paymentMethod:
          (json['paymentMethod'] ?? json['payment_method'])?.toString(),
      expectedPaymentDay: _int(
          json['expectedPaymentDay'] ?? json['expected_payment_day']),
      paymentTerms:
          (json['paymentTerms'] ?? json['payment_terms'])?.toString(),
      bankReference:
          (json['bankReference'] ?? json['bank_reference'])?.toString(),
      chequeNumber:
          (json['chequeNumber'] ?? json['cheque_number'])?.toString(),
    );
  }

  /// Copie en remplaçant la liste d'évènements métier (ils arrivent avec
  /// l'enveloppe `{contract, history}` du show et sont injectés par le repo).
  ContractDetailDto withHistory(List<ContractHistoryEntryDto> items) {
    return ContractDetailDto(
      contract: contract,
      monthlyAmount: monthlyAmount,
      deposit: deposit,
      firstRent: firstRent,
      residualValue: residualValue,
      rate: rate,
      durationMonths: durationMonths,
      kmPerYear: kmPerYear,
      signatureStatus: signatureStatus,
      paymentStatus: paymentStatus,
      clientPhone: clientPhone,
      clientEmail: clientEmail,
      notes: notes,
      paymentMethod: paymentMethod,
      expectedPaymentDay: expectedPaymentDay,
      paymentTerms: paymentTerms,
      bankReference: bankReference,
      chequeNumber: chequeNumber,
      history: items,
    );
  }
}

/// Évènement de l'historique métier d'un contrat (statut, actions clés) —
/// renvoyé sous la clé `history` du GET `/contracts/{id}`.
class ContractHistoryEntryDto {
  const ContractHistoryEntryDto({
    required this.id,
    required this.action,
    this.fromStatus,
    this.toStatus,
    this.at,
  });

  final String id;
  final String action;
  final String? fromStatus;
  final String? toStatus;
  final DateTime? at;

  factory ContractHistoryEntryDto.fromJson(Map<String, dynamic> json) {
    return ContractHistoryEntryDto(
      id: (json['id'] ?? json['at'])?.toString() ?? '',
      action: json['action']?.toString() ?? 'event',
      fromStatus:
          (json['from_status'] ?? json['fromStatus'])?.toString(),
      toStatus: (json['to_status'] ?? json['toStatus'])?.toString(),
      at: _date(json['at']) ?? _date(json['created_at']),
    );
  }
}

/// Entrée d'audit log — alignée sur l'`AuditLogResource` du backend. Alimente
/// la section « Audit & traçabilité » de l'onglet Historique, comme sur la
/// version web (composant `EntityAuditTimeline`).
class EntityAuditEntryDto {
  const EntityAuditEntryDto({
    required this.id,
    required this.action,
    this.actionLabel,
    this.actorEmail,
    this.occurredAt,
    this.ipAddress,
    this.legalSignificance = false,
    this.beforeData,
    this.afterData,
  });

  final String id;
  final String action;
  final String? actionLabel;
  final String? actorEmail;
  final DateTime? occurredAt;
  final String? ipAddress;
  final bool legalSignificance;
  final Map<String, dynamic>? beforeData;
  final Map<String, dynamic>? afterData;

  factory EntityAuditEntryDto.fromJson(Map<String, dynamic> json) {
    Map<String, dynamic>? asMap(dynamic v) =>
        v is Map ? v.map((k, vv) => MapEntry(k.toString(), vv)) : null;
    return EntityAuditEntryDto(
      id: json['id']?.toString() ?? '',
      action: json['action']?.toString() ?? 'event',
      actionLabel: json['action_label']?.toString(),
      actorEmail: json['actor_email']?.toString(),
      occurredAt: _date(json['occurred_at']) ?? _date(json['created_at']),
      ipAddress: json['ip_address']?.toString(),
      legalSignificance: json['legal_significance'] == true,
      beforeData: asMap(json['before_data']),
      afterData: asMap(json['after_data']),
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
