import 'vehicle_dto.dart';

/// La fiche véhicule telle que l'API la rend : la voiture elle-même, son
/// contexte actuel (location en cours, client), et les listes qu'un agent
/// consulte sur le terrain — entretiens, mouvements, documents.
class VehicleDetailDto {
  const VehicleDetailDto({
    required this.vehicle,
    this.maintenanceEvents = const [],
    this.movements = const [],
    this.odometerReadings = const [],
    this.currentCustomerName,
    this.currentCustomerCode,
    this.currentContractNumber,
    this.currentContractId,
    this.currentReservationNumber,
    this.currentReservationId,
    this.currentReservationStatus,
    this.complianceAlerts = const [],
  });

  final VehicleDto vehicle;
  final List<MaintenanceEventDto> maintenanceEvents;
  final List<VehicleMovementDto> movements;
  final List<OdometerReadingDto> odometerReadings;
  /// Alertes conformité (assurance/visite/vignette…) retournées par
  /// `/v1/vehicles/{id}` dans la clé `complianceAlerts`. Chaque entrée a
  /// `title`, `description`, `severity`, `triggered_at`. On garde la map
  /// brute pour éviter un DTO en plus — la bannière lit par clés.
  final List<Map<String, dynamic>> complianceAlerts;
  final String? currentCustomerName;
  final String? currentCustomerCode;
  final String? currentContractNumber;
  final String? currentContractId;
  final String? currentReservationNumber;
  final String? currentReservationId;
  final String? currentReservationStatus;

  factory VehicleDetailDto.fromJson(Map<String, dynamic> json) {
    final vJson = _asMap(json['vehicle']) ?? json;
    final current = _asMap(json['current']);
    String? customerName;
    String? customerCode;
    String? contractNumber;
    String? contractId;
    String? reservationNumber;
    String? reservationId;
    String? reservationStatus;
    if (current != null) {
      final cust = _asMap(current['customer']);
      if (cust != null) {
        customerName = cust['display_name']?.toString() ??
            cust['legal_name']?.toString() ??
            cust['name']?.toString();
        if (customerName == null || customerName.isEmpty) {
          final ind = _asMap(cust['individual_profile']);
          if (ind != null) {
            final f = ind['first_name']?.toString() ?? '';
            final l = ind['last_name']?.toString() ?? '';
            customerName = ('$f $l').trim();
          }
          final comp = _asMap(cust['company_profile']);
          if ((customerName == null || customerName.isEmpty) && comp != null) {
            customerName = (comp['trade_name'] ?? comp['legal_name'])?.toString();
          }
        }
        customerCode = cust['customer_code']?.toString();
      }
      final contract = _asMap(current['contract']);
      if (contract != null) {
        contractNumber = (contract['contract_number'] ?? contract['reference'])
            ?.toString();
        contractId = contract['id']?.toString();
      }
      final reservation = _asMap(current['reservation']);
      if (reservation != null) {
        reservationNumber =
            reservation['reservation_number']?.toString();
        reservationId = reservation['id']?.toString();
        reservationStatus = reservation['status']?.toString();
      }
    }
    return VehicleDetailDto(
      vehicle: VehicleDto.fromJson(vJson),
      maintenanceEvents: _list(json['maintenanceEvents'], MaintenanceEventDto.fromJson),
      movements: _list(json['movements'], VehicleMovementDto.fromJson),
      odometerReadings:
          _list(json['odometerReadings'], OdometerReadingDto.fromJson),
      currentCustomerName: customerName,
      currentCustomerCode: customerCode,
      currentContractNumber: contractNumber,
      currentContractId: contractId,
      currentReservationNumber: reservationNumber,
      currentReservationId: reservationId,
      currentReservationStatus: reservationStatus,
      complianceAlerts: json['complianceAlerts'] is List
          ? [
              for (final a in json['complianceAlerts'])
                if (a is Map)
                  a.map((k, v) => MapEntry(k.toString(), v)),
            ]
          : const [],
    );
  }

  static Map<String, dynamic>? _asMap(dynamic value) {
    if (value is Map<String, dynamic>) return value;
    if (value is Map) return value.map((k, v) => MapEntry(k.toString(), v));
    return null;
  }

  static List<T> _list<T>(dynamic raw, T Function(Map<String, dynamic>) parse) {
    if (raw is! List) return const [];
    return raw.map(_asMap).whereType<Map<String, dynamic>>().map(parse).toList();
  }
}

/// Un entretien : titre, prestataire, coût, kilométrage, date.
class MaintenanceEventDto {
  const MaintenanceEventDto({
    required this.id,
    required this.type,
    required this.title,
    this.description,
    this.performedAt,
    this.odometerKm,
    this.vendor,
    this.costMad,
    this.lifecycleStatus,
  });

  final String id;
  final String type;
  final String title;
  final String? description;
  final DateTime? performedAt;
  final int? odometerKm;
  final String? vendor;
  final double? costMad;
  final String? lifecycleStatus;

  factory MaintenanceEventDto.fromJson(Map<String, dynamic> json) {
    return MaintenanceEventDto(
      id: json['id']?.toString() ?? '',
      type: json['type']?.toString() ?? 'OTHER',
      title: json['title']?.toString() ?? '—',
      description: json['description']?.toString(),
      performedAt: _date(json['performed_at']),
      odometerKm: _int(json['odometer_km']),
      vendor: json['vendor']?.toString(),
      costMad: _d(json['cost_mad']),
      lifecycleStatus: json['lifecycle_status']?.toString(),
    );
  }
}

class VehicleMovementDto {
  const VehicleMovementDto({
    required this.id,
    required this.type,
    this.performedAt,
    this.odometerKm,
    this.fuelLevel,
    this.notes,
  });

  final String id;
  final String type;
  final DateTime? performedAt;
  final int? odometerKm;
  final double? fuelLevel;
  final String? notes;

  factory VehicleMovementDto.fromJson(Map<String, dynamic> json) {
    return VehicleMovementDto(
      id: json['id']?.toString() ?? '',
      type: json['movement_type']?.toString() ?? '',
      performedAt: _date(json['performed_at']),
      odometerKm: _int(json['odometer_km']),
      fuelLevel: _d(json['fuel_level']),
      notes: json['condition_notes']?.toString(),
    );
  }
}

class OdometerReadingDto {
  const OdometerReadingDto({
    required this.id,
    required this.readingKm,
    this.readAt,
  });

  final String id;
  final int readingKm;
  final DateTime? readAt;

  factory OdometerReadingDto.fromJson(Map<String, dynamic> json) {
    return OdometerReadingDto(
      id: json['id']?.toString() ?? '',
      readingKm: _int(json['reading_km']) ?? 0,
      readAt: _date(json['read_at']),
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

const Map<String, String> kMaintenanceTypeFr = {
  'OIL_CHANGE': 'Vidange',
  'TIRES': 'Pneus',
  'INSPECTION': 'Inspection',
  'BRAKES': 'Freins',
  'FILTER': 'Filtre',
  'BATTERY': 'Batterie',
  'TIMING_BELT': 'Courroie de distribution',
  'TECH_CONTROL': 'Contrôle technique',
  'OTHER': 'Autre',
};

const Map<String, String> kMovementTypeFr = {
  'entry': 'Entrée',
  'exit': 'Sortie',
  'return': 'Retour',
  'transfer': 'Transfert',
  'immobilization': 'Immobilisation',
  'release': 'Remise en service',
  'checkout': 'Départ',
  'checkin': 'Retour',
};

String maintenanceTypeFr(String raw) =>
    kMaintenanceTypeFr[raw.toUpperCase()] ?? raw;

String movementTypeFr(String raw) =>
    kMovementTypeFr[raw.toLowerCase()] ?? raw;
