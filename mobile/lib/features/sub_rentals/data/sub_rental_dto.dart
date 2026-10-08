/// Carte résumé d'un contrat de sous-location (vue liste).
class SubRentalDto {
  const SubRentalDto({
    required this.id,
    required this.number,
    required this.status,
    required this.paymentStatus,
    this.supplierName,
    this.vehicleLabel,
    this.startDate,
    this.endDate,
    this.dailyCost,
    this.totalCost,
  });

  final String id;
  final String number;
  final String status;
  final String paymentStatus;
  final String? supplierName;
  final String? vehicleLabel;
  final DateTime? startDate;
  final DateTime? endDate;
  final double? dailyCost;
  final double? totalCost;

  /// Vrai si le contrat est actif et sa date de fin est passée.
  bool get isOverdue =>
      status == 'active' &&
      endDate != null &&
      endDate!.isBefore(DateTime.now());

  /// Vrai si le contrat est actif et se termine dans les 3 prochains jours.
  bool get isDueSoon {
    if (status != 'active' || endDate == null) return false;
    if (isOverdue) return false;
    return endDate!.isBefore(DateTime.now().add(const Duration(days: 3)));
  }

  factory SubRentalDto.fromJson(Map<String, dynamic> json) {
    String? supplier;
    final s = json['supplier_agency'];
    if (s is Map) supplier = s['name']?.toString();
    supplier ??= json['supplier_name']?.toString();

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
      ].where((e) => e != null && '$e'.toString().isNotEmpty).join(' · ');
    }
    final ext = json['external_vehicle_identity'];
    if ((vehicle == null || vehicle.isEmpty) && ext is Map) {
      final brand = ext['brand_name'];
      final model = ext['model_name'];
      final reg = ext['registration_number'];
      vehicle = [
        [brand, model].where((e) => e != null && '$e'.isNotEmpty).join(' '),
        reg,
      ].where((e) => e != null && '$e'.toString().isNotEmpty).join(' · ');
    }

    return SubRentalDto(
      id: json['id']?.toString() ?? '',
      number: json['contract_number']?.toString() ?? '—',
      status: json['status']?.toString() ?? '',
      paymentStatus: json['payment_status']?.toString() ?? 'unpaid',
      supplierName: supplier,
      vehicleLabel: vehicle,
      startDate: parseDate(json['start_date']),
      endDate: parseDate(json['end_date']),
      dailyCost: parseDouble(json['daily_cost']),
      totalCost: parseDouble(json['total_cost']),
    );
  }
}

/// Fiche complète d'un contrat SL (vue détail).
class SubRentalDetailDto {
  const SubRentalDetailDto({
    required this.id,
    required this.number,
    required this.status,
    required this.paymentStatus,
    this.startDate,
    this.endDate,
    this.dailyCost,
    this.totalCost,
    this.depositAmount,
    this.paymentMethod,
    this.notes,
    this.supplier,
    this.vehicle,
    this.externalVehicle,
    this.returnReport,
    this.activatedAt,
    this.returnedAt,
    this.closedAt,
  });

  final String id;
  final String number;
  final String status;
  final String paymentStatus;
  final DateTime? startDate;
  final DateTime? endDate;
  final double? dailyCost;
  final double? totalCost;
  final double? depositAmount;
  final String? paymentMethod;
  final String? notes;
  final SupplierAgencyDto? supplier;
  final SubRentalVehicleDto? vehicle;
  final ExternalVehicleIdentityDto? externalVehicle;
  final ReturnReportDto? returnReport;
  final DateTime? activatedAt;
  final DateTime? returnedAt;
  final DateTime? closedAt;

  bool get isDraft => status == 'draft';
  bool get isActive => status == 'active';
  bool get isReturned => status == 'returned';
  bool get isClosed => status == 'closed';
  bool get isOverdue =>
      isActive && endDate != null && endDate!.isBefore(DateTime.now());

  int get daysCount {
    if (startDate == null || endDate == null) return 0;
    final diff = endDate!.difference(startDate!).inDays;
    return diff < 1 ? 1 : diff;
  }

  factory SubRentalDetailDto.fromJson(Map<String, dynamic> json) {
    final v = json['vehicle'];
    final s = json['supplier_agency'];
    final ext = json['external_vehicle_identity'];
    final ret = json['return_report'];
    return SubRentalDetailDto(
      id: json['id']?.toString() ?? '',
      number: json['contract_number']?.toString() ?? '—',
      status: json['status']?.toString() ?? '',
      paymentStatus: json['payment_status']?.toString() ?? 'unpaid',
      startDate: parseDate(json['start_date']),
      endDate: parseDate(json['end_date']),
      dailyCost: parseDouble(json['daily_cost']),
      totalCost: parseDouble(json['total_cost']),
      depositAmount: parseDouble(json['deposit_amount']),
      paymentMethod: json['payment_method']?.toString(),
      notes: json['notes']?.toString(),
      supplier: s is Map ? SupplierAgencyDto.fromJson(_toMap(s)) : null,
      vehicle: v is Map ? SubRentalVehicleDto.fromJson(_toMap(v)) : null,
      externalVehicle:
          ext is Map ? ExternalVehicleIdentityDto.fromJson(_toMap(ext)) : null,
      returnReport: ret is Map ? ReturnReportDto.fromJson(_toMap(ret)) : null,
      activatedAt: parseDate(json['activated_at']),
      returnedAt: parseDate(json['returned_at']),
      closedAt: parseDate(json['closed_at']),
    );
  }
}

class SupplierAgencyDto {
  const SupplierAgencyDto({
    required this.id,
    required this.name,
    this.contactPerson,
    this.phone,
    this.email,
    this.city,
    this.ice,
    this.rc,
    this.status,
  });
  final String id;
  final String name;
  final String? contactPerson;
  final String? phone;
  final String? email;
  final String? city;
  final String? ice;
  final String? rc;
  final String? status;

  factory SupplierAgencyDto.fromJson(Map<String, dynamic> j) => SupplierAgencyDto(
        id: j['id']?.toString() ?? '',
        name: j['name']?.toString() ?? '—',
        contactPerson: j['contact_person']?.toString(),
        phone: j['phone']?.toString(),
        email: j['email']?.toString(),
        city: j['city']?.toString(),
        ice: j['ice']?.toString(),
        rc: j['rc']?.toString(),
        status: j['status']?.toString(),
      );
}

class SubRentalVehicleDto {
  const SubRentalVehicleDto({
    required this.id,
    this.registration,
    this.brandName,
    this.modelName,
    this.year,
    this.color,
    this.mileage,
    this.ownershipStatus,
  });
  final String id;
  final String? registration;
  final String? brandName;
  final String? modelName;
  final int? year;
  final String? color;
  final int? mileage;
  final String? ownershipStatus;

  factory SubRentalVehicleDto.fromJson(Map<String, dynamic> j) {
    final b = j['brand'];
    final m = j['model'];
    return SubRentalVehicleDto(
      id: j['id']?.toString() ?? '',
      registration: j['registration_number']?.toString(),
      brandName:
          b is Map ? b['name']?.toString() : j['brand_name']?.toString(),
      modelName: m is Map
          ? (m['model_name']?.toString() ?? m['name']?.toString())
          : j['model_name']?.toString(),
      year: parseInt(j['year']),
      color: j['color']?.toString(),
      mileage: parseInt(j['mileage_current']),
      ownershipStatus: j['ownership_status']?.toString(),
    );
  }
}

class ExternalVehicleIdentityDto {
  const ExternalVehicleIdentityDto({
    this.registration,
    this.brandName,
    this.modelName,
    this.year,
    this.color,
    this.mileage,
  });
  final String? registration;
  final String? brandName;
  final String? modelName;
  final int? year;
  final String? color;
  final int? mileage;

  factory ExternalVehicleIdentityDto.fromJson(Map<String, dynamic> j) =>
      ExternalVehicleIdentityDto(
        registration: j['registration_number']?.toString(),
        brandName: j['brand_name']?.toString(),
        modelName: j['model_name']?.toString(),
        year: parseInt(j['year']),
        color: j['color']?.toString(),
        mileage: parseInt(j['mileage']),
      );
}

class ReturnReportDto {
  const ReturnReportDto({
    this.returnedAt,
    this.odometerKm,
    this.fuelLevel,
    this.conditionNotes,
    this.damageNotes,
    this.extraCharges,
    this.signedBySupplier,
  });
  final DateTime? returnedAt;
  final int? odometerKm;
  final String? fuelLevel;
  final String? conditionNotes;
  final String? damageNotes;
  final double? extraCharges;
  final String? signedBySupplier;

  factory ReturnReportDto.fromJson(Map<String, dynamic> j) => ReturnReportDto(
        returnedAt: parseDate(j['returned_at']),
        odometerKm: parseInt(j['odometer_km']),
        fuelLevel: j['fuel_level']?.toString(),
        conditionNotes: j['condition_notes']?.toString(),
        damageNotes: j['damage_notes']?.toString(),
        extraCharges: parseDouble(j['extra_charges']),
        signedBySupplier: j['signed_by_supplier']?.toString(),
      );
}

/// Dashboard KPIs renvoyés par /sub-rentals/dashboard.
class SubRentalDashboardDto {
  const SubRentalDashboardDto({
    required this.activeSubRentals,
    required this.dueSoon,
    required this.overdue,
    required this.monthlySupplierCost,
    required this.totalMargin,
  });
  final int activeSubRentals;
  final int dueSoon;
  final int overdue;
  final double monthlySupplierCost;
  final double totalMargin;

  factory SubRentalDashboardDto.fromJson(Map<String, dynamic> j) =>
      SubRentalDashboardDto(
        activeSubRentals: parseInt(j['active_sub_rentals']) ?? 0,
        dueSoon: parseInt(j['due_soon']) ?? 0,
        overdue: parseInt(j['overdue']) ?? 0,
        monthlySupplierCost: parseDouble(j['monthly_supplier_cost']) ?? 0,
        totalMargin: parseDouble(j['total_margin']) ?? 0,
      );
}

/// Rentabilité (ongle Rentabilité du détail).
class SubRentalProfitabilityDto {
  const SubRentalProfitabilityDto({
    required this.supplierCost,
    required this.customerRevenue,
    required this.margin,
    required this.marginPercentage,
    required this.totalPaid,
    required this.remainingBalance,
    required this.daysCount,
    required this.dailyCost,
  });
  final double supplierCost;
  final double customerRevenue;
  final double margin;
  final double marginPercentage;
  final double totalPaid;
  final double remainingBalance;
  final int daysCount;
  final double dailyCost;

  factory SubRentalProfitabilityDto.fromJson(Map<String, dynamic> j) =>
      SubRentalProfitabilityDto(
        supplierCost: parseDouble(j['supplier_cost']) ?? 0,
        customerRevenue: parseDouble(j['customer_revenue']) ?? 0,
        margin: parseDouble(j['margin']) ?? 0,
        marginPercentage: parseDouble(j['margin_percentage']) ?? 0,
        totalPaid: parseDouble(j['total_paid']) ?? 0,
        remainingBalance: parseDouble(j['remaining_balance']) ?? 0,
        daysCount: parseInt(j['days_count']) ?? 0,
        dailyCost: parseDouble(j['daily_cost']) ?? 0,
      );
}

/// Un paiement fournisseur (onglet Paiements).
class SubRentalPaymentDto {
  const SubRentalPaymentDto({
    required this.id,
    required this.amount,
    required this.paymentMethod,
    this.paymentDate,
    this.reference,
    this.notes,
  });
  final String id;
  final double amount;
  final String paymentMethod;
  final DateTime? paymentDate;
  final String? reference;
  final String? notes;

  factory SubRentalPaymentDto.fromJson(Map<String, dynamic> j) =>
      SubRentalPaymentDto(
        id: j['id']?.toString() ?? '',
        amount: parseDouble(j['amount']) ?? 0,
        paymentMethod: j['payment_method']?.toString() ?? '',
        paymentDate: parseDate(j['payment_date']),
        reference: j['reference']?.toString(),
        notes: j['notes']?.toString(),
      );
}

class SubRentalPaymentsPage {
  const SubRentalPaymentsPage({
    required this.payments,
    required this.totalPaid,
    required this.remainingBalance,
    required this.paymentStatus,
  });
  final List<SubRentalPaymentDto> payments;
  final double totalPaid;
  final double remainingBalance;
  final String paymentStatus;
}

Map<String, dynamic> _toMap(Map m) => m is Map<String, dynamic>
    ? m
    : m.map((k, v) => MapEntry(k.toString(), v));

double? parseDouble(dynamic v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString());
}

int? parseInt(dynamic v) {
  if (v == null) return null;
  if (v is int) return v;
  if (v is num) return v.toInt();
  return int.tryParse(v.toString());
}

DateTime? parseDate(dynamic v) {
  if (v == null) return null;
  return DateTime.tryParse(v.toString());
}

const Map<String, String> kSubRentalStatusFr = {
  'draft': 'Brouillon',
  'active': 'Actif',
  'returned': 'Retourné',
  'closed': 'Clôturé',
  'cancelled': 'Annulé',
};

const Map<String, String> kSubRentalPaymentStatusFr = {
  'paid': 'Payé',
  'partial': 'Partiel',
  'unpaid': 'Impayé',
};

const Map<String, String> kSubRentalPaymentMethodFr = {
  'cash': 'Espèces',
  'bank_transfer': 'Virement',
  'cheque': 'Chèque',
  'card': 'Carte',
  'other': 'Autre',
};

const Map<String, String> kFuelLevelFr = {
  'empty': 'Vide',
  'quarter': '1/4',
  'half': '1/2',
  'three_quarters': '3/4',
  'full': 'Plein',
};

String subRentalStatusFr(String raw) =>
    kSubRentalStatusFr[raw.toLowerCase()] ?? raw;
String subRentalPaymentStatusFr(String raw) =>
    kSubRentalPaymentStatusFr[raw.toLowerCase()] ?? raw;
String subRentalPaymentMethodFr(String raw) =>
    kSubRentalPaymentMethodFr[raw.toLowerCase()] ?? raw;
String fuelLevelFr(String? raw) =>
    raw == null ? '—' : (kFuelLevelFr[raw.toLowerCase()] ?? raw);
