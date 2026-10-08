import 'reservation_dto.dart';

/// La fiche d'une réservation côté API, telle que renvoyée par
/// `GET /reservations/{id}`. On modélise maintenant toutes les sections
/// dont les 10 onglets du web ont besoin (conducteurs, remises/retours,
/// prolongations, dommages, paiements, factures, historique).
class ReservationDetailDto {
  const ReservationDetailDto({
    required this.reservation,
    this.customerName,
    this.vehicleName,
    this.vehicleRegistration,
    this.hasContract = false,
    this.candidateVehicles = const [],
    this.contract,
    this.deposits = const [],
    this.payments = const [],
    this.extensions = const [],
    this.drivers = const [],
    this.handoverReports = const [],
    this.damageReports = const [],
    this.invoices = const [],
    this.history = const [],
    this.totals,
  });

  final ReservationDto reservation;
  final String? customerName;
  final String? vehicleName;
  final String? vehicleRegistration;
  final bool hasContract;
  final List<CandidateVehicleDto> candidateVehicles;
  final ContractSummary? contract;
  final List<DepositDto> deposits;
  final List<PaymentDto> payments;
  final List<ExtensionDto> extensions;
  final List<DriverDto> drivers;
  final List<HandoverReportDto> handoverReports;
  final List<DamageReportDto> damageReports;
  final List<InvoiceDto> invoices;
  final List<HistoryEntryDto> history;
  final ReservationTotals? totals;

  factory ReservationDetailDto.fromJson(Map<String, dynamic> json) {
    final rRaw = json['reservation'];
    final rMap = _asMap(rRaw) ?? json;
    final merged = <String, dynamic>{
      ...rMap,
      if (json['customer_name'] != null) 'customer_name': json['customer_name'],
      if (json['vehicle_name'] != null) 'vehicle_name': json['vehicle_name'],
      if (json['vehicle_registration'] != null)
        'vehicle_registration': json['vehicle_registration'],
    };
    return ReservationDetailDto(
      reservation: ReservationDto.fromJson(merged),
      customerName: json['customer_name']?.toString(),
      vehicleName: json['vehicle_name']?.toString(),
      vehicleRegistration: json['vehicle_registration']?.toString(),
      hasContract: json['has_contract'] == true,
      candidateVehicles: _list(json['candidate_vehicles'], CandidateVehicleDto.fromJson),
      contract: _asMap(json['contract']) != null
          ? ContractSummary.fromJson(_asMap(json['contract'])!)
          : null,
      deposits: _list(json['deposits'], DepositDto.fromJson),
      payments: _list(json['payments'], PaymentDto.fromJson),
      extensions: _list(json['extensions'], ExtensionDto.fromJson),
      drivers: _list(json['drivers'], DriverDto.fromJson),
      handoverReports:
          _list(json['handover_reports'], HandoverReportDto.fromJson),
      damageReports: _list(json['damage_reports'], DamageReportDto.fromJson),
      invoices: _list(json['invoices'], InvoiceDto.fromJson),
      history: _list(json['history'], HistoryEntryDto.fromJson),
      totals: _asMap(json['totals']) != null
          ? ReservationTotals.fromJson(_asMap(json['totals'])!)
          : null,
    );
  }

  static Map<String, dynamic>? _asMap(dynamic value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) return value.map((k, v) => MapEntry(k.toString(), v));
    return null;
  }

  static List<T> _list<T>(dynamic raw, T Function(Map<String, dynamic>) parse) {
    if (raw is! List) return const [];
    return raw
        .map(_asMap)
        .whereType<Map<String, dynamic>>()
        .map(parse)
        .toList();
  }
}

class CandidateVehicleDto {
  const CandidateVehicleDto({required this.id, required this.name, this.registration});
  final String id;
  final String name;
  final String? registration;
  factory CandidateVehicleDto.fromJson(Map<String, dynamic> j) =>
      CandidateVehicleDto(
        id: j['id']?.toString() ?? '',
        name: j['name']?.toString() ?? '—',
        registration: j['registration']?.toString(),
      );
}

class ContractSummary {
  const ContractSummary({
    required this.id,
    required this.number,
    required this.status,
    this.depositAmount,
  });
  final String id;
  final String number;
  final String status;
  final double? depositAmount;
  factory ContractSummary.fromJson(Map<String, dynamic> json) => ContractSummary(
        id: json['id']?.toString() ?? '',
        number: json['contract_number']?.toString() ?? '—',
        status: json['status']?.toString() ?? '',
        depositAmount: _d(json['deposit_amount']),
      );
}

class DepositDto {
  const DepositDto({
    required this.id,
    required this.amount,
    required this.status,
    this.method,
    this.checkNumber,
    this.collectedAt,
  });
  final String id;
  final double amount;
  final String status;
  final String? method;
  final String? checkNumber;
  final DateTime? collectedAt;
  factory DepositDto.fromJson(Map<String, dynamic> json) => DepositDto(
        id: json['id']?.toString() ?? '',
        amount: _d(json['amount']) ?? 0,
        status: json['status']?.toString() ?? 'held',
        method: json['method']?.toString(),
        checkNumber: json['check_number']?.toString(),
        collectedAt: _date(json['collected_at']),
      );
}

class PaymentDto {
  const PaymentDto({
    required this.id,
    required this.amount,
    required this.method,
    required this.status,
    this.type,
    this.paymentDate,
    this.chequeStatus,
    this.reference,
  });
  final String id;
  final double amount;
  final String method;
  final String status;
  final String? type;
  final DateTime? paymentDate;
  final String? chequeStatus;
  final String? reference;
  factory PaymentDto.fromJson(Map<String, dynamic> json) => PaymentDto(
        id: json['id']?.toString() ?? '',
        amount: _d(json['amount']) ?? 0,
        method: json['payment_method']?.toString() ?? '',
        status: json['status']?.toString() ?? '',
        type: json['payment_type']?.toString(),
        paymentDate: _date(json['payment_date']),
        chequeStatus: json['cheque_status']?.toString(),
        reference: json['reference']?.toString(),
      );
  bool get isReversed => status == 'reversed' || chequeStatus == 'bounced';
}

class ExtensionDto {
  const ExtensionDto({
    required this.id,
    required this.status,
    this.newEndAt,
    this.additionalAmount,
    this.notes,
    this.requestedAt,
  });
  final String id;
  final String status;
  final DateTime? newEndAt;
  final double? additionalAmount;
  final String? notes;
  final DateTime? requestedAt;
  factory ExtensionDto.fromJson(Map<String, dynamic> json) => ExtensionDto(
        id: json['id']?.toString() ?? '',
        status: json['status']?.toString() ?? '',
        newEndAt: _date(json['new_end_at']),
        additionalAmount: _d(json['additional_amount']),
        notes: json['notes']?.toString(),
        requestedAt: _date(json['requested_at']) ?? _date(json['created_at']),
      );
}

class DriverDto {
  const DriverDto({
    required this.id,
    required this.name,
    this.phone,
    this.licenseNumber,
    this.email,
  });
  final String id;
  final String name;
  final String? phone;
  final String? licenseNumber;
  final String? email;
  factory DriverDto.fromJson(Map<String, dynamic> j) => DriverDto(
        id: j['id']?.toString() ?? '',
        name: (j['name'] ?? j['full_name'] ?? '—').toString(),
        phone: j['phone']?.toString(),
        licenseNumber: j['license_number']?.toString(),
        email: j['email']?.toString(),
      );
}

class HandoverReportDto {
  const HandoverReportDto({
    required this.id,
    required this.kind, // pickup / return
    this.odometer,
    this.fuelLevel,
    this.conditionNotes,
    this.signature,
    this.at,
  });
  final String id;
  final String kind;
  final int? odometer;
  final double? fuelLevel;
  final String? conditionNotes;
  final String? signature;
  final DateTime? at;
  factory HandoverReportDto.fromJson(Map<String, dynamic> j) =>
      HandoverReportDto(
        id: j['id']?.toString() ?? '',
        kind: (j['kind'] ?? j['type'] ?? 'pickup').toString(),
        odometer: int.tryParse(j['odometer']?.toString() ?? ''),
        fuelLevel: _d(j['fuel_level']),
        conditionNotes: j['condition_notes']?.toString(),
        signature: j['signature']?.toString(),
        at: _date(j['at']) ?? _date(j['created_at']),
      );
}

class DamageReportDto {
  const DamageReportDto({
    required this.id,
    this.damageType,
    this.description,
    this.estimatedCost,
    this.responsibleParty,
    this.at,
  });
  final String id;
  final String? damageType;
  final String? description;
  final double? estimatedCost;
  final String? responsibleParty;
  final DateTime? at;
  factory DamageReportDto.fromJson(Map<String, dynamic> j) => DamageReportDto(
        id: j['id']?.toString() ?? '',
        damageType: j['damage_type']?.toString(),
        description: j['description']?.toString(),
        estimatedCost: _d(j['estimated_cost']),
        responsibleParty: j['responsible_party']?.toString(),
        at: _date(j['created_at']) ?? _date(j['reported_at']),
      );
}

class InvoiceDto {
  const InvoiceDto({
    required this.id,
    required this.number,
    required this.status,
    this.amount,
    this.issueDate,
    this.dueDate,
  });
  final String id;
  final String number;
  final String status;
  final double? amount;
  final DateTime? issueDate;
  final DateTime? dueDate;
  factory InvoiceDto.fromJson(Map<String, dynamic> j) => InvoiceDto(
        id: j['id']?.toString() ?? '',
        number: (j['invoice_number'] ?? j['number'] ?? '—').toString(),
        status: j['status']?.toString() ?? '',
        amount: _d(j['total_amount']) ?? _d(j['amount']),
        issueDate: _date(j['issue_date']),
        dueDate: _date(j['due_date']),
      );
}

class HistoryEntryDto {
  const HistoryEntryDto({
    required this.id,
    required this.action,
    this.actor,
    this.at,
    this.details,
  });
  final String id;
  final String action;
  final String? actor;
  final DateTime? at;
  final String? details;
  factory HistoryEntryDto.fromJson(Map<String, dynamic> j) => HistoryEntryDto(
        id: j['id']?.toString() ?? '',
        action: (j['action'] ?? j['event'] ?? '').toString(),
        actor: (j['actor'] ?? j['user'] ?? j['user_name'])?.toString(),
        at: _date(j['at']) ?? _date(j['created_at']),
        details: j['details']?.toString() ?? j['description']?.toString(),
      );
}

class ReservationTotals {
  const ReservationTotals({
    required this.estimatedPrice,
    required this.paid,
    required this.extensionsTotal,
    required this.damagesTotal,
    this.depositAmount = 0,
    this.allowedKm = 0,
    this.dailyRate = 0,
  });
  final double estimatedPrice;
  final double paid;
  final double extensionsTotal;
  final double damagesTotal;
  final double depositAmount;
  final double allowedKm;
  final double dailyRate;

  double get expected => estimatedPrice + extensionsTotal + damagesTotal;
  double get remaining => expected - paid;

  factory ReservationTotals.fromJson(Map<String, dynamic> json) =>
      ReservationTotals(
        estimatedPrice: _d(json['estimated_price']) ?? 0,
        paid: _d(json['paid']) ?? 0,
        extensionsTotal: _d(json['extensions_total']) ?? 0,
        damagesTotal: _d(json['damages_total']) ?? 0,
        depositAmount: _d(json['deposit_amount']) ?? 0,
        allowedKm: _d(json['allowed_km']) ?? 0,
        dailyRate: _d(json['daily_rate']) ?? 0,
      );
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

const Map<String, String> kPaymentMethodFr = {
  'cash': 'Espèces',
  'check': 'Chèque',
  'cheque': 'Chèque',
  'bank_transfer': 'Virement',
  'card': 'Carte',
  'wallet': 'Portefeuille',
  'compensation': 'Compensation',
};

const Map<String, String> kPaymentTypeFr = {
  'avance': 'Avance',
  'paiement_location': 'Paiement location',
  'solde': 'Solde',
  'caution': 'Caution',
  'penalite': 'Pénalité',
  "utilisation_avoir": "Utilisation d'avoir",
};

const Map<String, String> kDepositStatusFr = {
  'held': 'Détenue',
  'returned': 'Rendue',
  'retained': 'Retenue',
};

const Map<String, String> kExtensionStatusFr = {
  'requested': 'Demandée',
  'applied': 'Appliquée',
  'rejected': 'Rejetée',
  'cancelled': 'Annulée',
};

const Map<String, String> kDamageTypeFr = {
  'body': 'Carrosserie',
  'interior': 'Intérieur',
  'tires': 'Pneus',
  'glass': 'Vitres',
  'mechanical': 'Mécanique',
  'other': 'Autre',
};

const Map<String, String> kResponsiblePartyFr = {
  'customer': 'Client',
  'company': 'Société',
  'third_party': 'Tiers',
  'unknown': 'Non déterminé',
};

const Map<String, String> kInvoiceStatusFr = {
  'draft': 'Brouillon',
  'issued': 'Émise',
  'partially_paid': 'Partiellement payée',
  'paid': 'Payée',
  'overdue': 'En retard',
  'cancelled': 'Annulée',
};
