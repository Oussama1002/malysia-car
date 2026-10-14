/// Un véhicule tel que l'API l'expose. On garde les champs utilisés pour la
/// liste et les premiers éléments de fiche.
class VehicleDto {
  const VehicleDto({
    required this.id,
    required this.registration,
    required this.status,
    this.brand,
    this.model,
    this.year,
    this.fuel,
    this.transmission,
    this.ownership,
    this.pricePerDay,
    this.photoUrl,
    this.mileageKm,
    this.insuranceExpiry,
    this.techControlExpiry,
    this.vignetteExpiry,
    this.registrationCardNumber,
    this.availabilityStatus,
    this.hasActiveReservation = false,
    this.hasActiveContract = false,
  });

  final String id;
  final String registration;
  final String status;
  final String? brand;
  final String? model;
  final int? year;
  final String? fuel;
  final String? transmission;
  final String? ownership;
  final double? pricePerDay;
  final String? photoUrl;
  final int? mileageKm;
  final DateTime? insuranceExpiry;
  final DateTime? techControlExpiry;
  final DateTime? vignetteExpiry;
  final String? registrationCardNumber;
  /// 'available' | 'rented' | 'reserved' | 'maintenance' | 'blocked' | …
  /// Dérivé par le backend : il tient compte des réservations/contrats actifs
  /// en plus du statut flotte brut, donc à préférer à `status`.
  final String? availabilityStatus;
  /// Flags recalculés par la liste pour éviter la dérive des colonnes
  /// current_* sur la table vehicles.
  final bool hasActiveReservation;
  final bool hasActiveContract;

  /// Statut consolidé prêt à afficher dans un picker de réservation.
  /// Priorise contrat actif → réservation active → availability_status → status.
  String get effectiveStatus {
    if (hasActiveContract) return 'rented';
    if (hasActiveReservation) return 'reserved';
    final av = (availabilityStatus ?? '').toLowerCase();
    if (av.isNotEmpty) return av;
    return status.toLowerCase();
  }

  bool get isAvailable {
    final e = effectiveStatus;
    return e == 'available' || e.isEmpty;
  }

  String get statusLabel {
    switch (effectiveStatus) {
      case 'available':
        return 'Disponible';
      case 'rented':
      case 'in_use':
        return 'Loué';
      case 'reserved':
        return 'Réservé';
      case 'maintenance':
        return 'Maintenance';
      case 'in_repair':
      case 'repair':
        return 'Réparation';
      case 'blocked':
      case 'unavailable':
      case 'immobilized':
      case 'immobilised':
      case 'accident':
        return 'Indisponible';
      case 'sold':
        return 'Vendu';
      case 'scrapped':
        return 'Rebut';
      case 'pending':
        return 'En attente';
      default:
        // Fallback: title-case the raw enum (replace _ with spaces) rather
        // than letting an untranslated 'in_use' or 'in_repair' slip into
        // the UI chip.
        final cleaned = effectiveStatus.replaceAll('_', ' ');
        if (cleaned.isEmpty) return 'Inconnu';
        return '${cleaned[0].toUpperCase()}${cleaned.substring(1)}';
    }
  }

  String get label {
    final parts = [brand, model].where((e) => e != null && (e as String).isNotEmpty).toList();
    return parts.isEmpty ? registration : parts.join(' ');
  }

  bool get isSubRented =>
      (ownership ?? '').toLowerCase() == 'sub_rented' ||
      (ownership ?? '').toLowerCase() == 'sub_rental';

  factory VehicleDto.fromJson(Map<String, dynamic> json) {
    return VehicleDto(
      id: json['id']?.toString() ?? '',
      registration: (json['registration'] ?? json['registration_number'])
              ?.toString() ??
          '—',
      status: json['status']?.toString() ?? 'AVAILABLE',
      brand: json['brand'] is Map ? json['brand']['name']?.toString() : json['brand']?.toString(),
      model: json['model'] is Map
          ? (json['model']['model_name'] ?? json['model']['name'])?.toString()
          : json['model']?.toString(),
      year: _int(json['year']),
      fuel: json['fuel']?.toString() ?? json['fuel_type']?.toString(),
      transmission: json['transmission']?.toString(),
      ownership: json['ownershipStatus']?.toString() ?? json['ownership_status']?.toString(),
      pricePerDay: _d(json['pricePerDay']) ?? _d(json['daily_rental_price']),
      photoUrl: json['photoUrl']?.toString() ?? json['photo_url']?.toString(),
      mileageKm: _int(json['mileageKm']) ?? _int(json['mileage_current']),
      insuranceExpiry: _date(json['insuranceExpiry'] ?? json['insurance_expiry']),
      techControlExpiry: _date(json['techControlExpiry'] ?? json['tech_control_expiry']),
      vignetteExpiry: _date(json['vignetteExpiry'] ?? json['vignette_expiry']),
      registrationCardNumber: (json['registration_card_number'] ??
              json['registrationCardNumber'] ??
              json['registrationCard'])
          ?.toString(),
      availabilityStatus: (json['availabilityStatus'] ??
              json['availability_status'])
          ?.toString(),
      hasActiveReservation: json['hasActiveReservation'] == true ||
          json['has_active_reservation'] == true ||
          json['current_reservation_id'] != null,
      hasActiveContract: json['hasActiveContract'] == true ||
          json['has_active_contract'] == true ||
          json['current_contract_id'] != null,
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

/// Statuts bruts du serveur, en français.
const Map<String, String> kVehicleStatusFr = {
  'AVAILABLE': 'Disponible',
  'RENTED': 'En location',
  'RESERVED': 'Réservé',
  'MAINTENANCE': 'Maintenance',
  'IN_REPAIR': 'Réparation',
  'BLOCKED': 'Bloqué',
  'UNAVAILABLE': 'Indisponible',
  'SOLD': 'Vendu',
  'SCRAPPED': 'Rebut',
};

String vehicleStatusFr(String raw) =>
    kVehicleStatusFr[raw.toUpperCase()] ?? raw;

const Map<String, String> kFuelFr = {
  'diesel': 'Diesel',
  'gasoline': 'Essence',
  'petrol': 'Essence',
  'essence': 'Essence',
  'hybrid': 'Hybride',
  'electric': 'Électrique',
  'lpg': 'GPL',
};

const Map<String, String> kTransmissionFr = {
  'manual': 'Manuelle',
  'automatic': 'Automatique',
  'semi_automatic': 'Semi-automatique',
  'cvt': 'Automatique',
};
