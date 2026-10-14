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
    this.insuranceStart,
    this.techControlExpiry,
    this.vignetteExpiry,
    this.registrationCardNumber,
    this.availabilityStatus,
    this.hasActiveReservation = false,
    this.hasActiveContract = false,
    this.vin,
    this.chassisNumber,
    this.physicalStatus,
    this.fiscalPower,
    this.color,
    this.purchaseCostMad,
    this.currentValueMad,
    this.acquisitionType,
    this.acquisitionDate,
    this.currentLocation,
    this.unavailabilityReason,
    this.numeroPolice,
    this.nombreCylindres,
    this.nombrePlaces,
    this.nombrePortes,
    this.miseEnCirculation,
    this.dateImmatriculation,
    this.immatOnline,
    this.carteGriseStatus,
    this.immatProvisoireExpiry,
    this.insuranceDeductible,
    this.vehicleType,
    this.gamme,
    this.categorie,
    this.equipments = const [],
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

  // ── Fiche détaillée (expose les mêmes champs que le web
  // `FleetVehicleDetailPage`, onglets Vue générale & Identité). Tous
  // facultatifs : la liste parc n'en a pas besoin.
  final DateTime? insuranceStart;
  final String? vin;
  final String? chassisNumber;
  final String? physicalStatus;
  final int? fiscalPower;
  final String? color;
  final double? purchaseCostMad;
  final double? currentValueMad;
  final String? acquisitionType;
  final DateTime? acquisitionDate;
  final String? currentLocation;
  final String? unavailabilityReason;
  final String? numeroPolice;
  final int? nombreCylindres;
  final int? nombrePlaces;
  final int? nombrePortes;
  final DateTime? miseEnCirculation;
  final DateTime? dateImmatriculation;
  final String? immatOnline;
  final String? carteGriseStatus;
  final DateTime? immatProvisoireExpiry;
  final double? insuranceDeductible;
  final String? vehicleType;
  final String? gamme;
  final String? categorie;
  final List<String> equipments;

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
      insuranceStart: _date(json['insuranceStart'] ?? json['insurance_start']),
      vin: json['vin']?.toString(),
      chassisNumber:
          (json['chassisNumber'] ?? json['chassis_number'])?.toString(),
      physicalStatus:
          (json['physicalStatus'] ?? json['physical_status'])?.toString(),
      fiscalPower: _int(json['cv'] ?? json['fiscalPower'] ?? json['fiscal_power']),
      color: json['color']?.toString(),
      purchaseCostMad:
          _d(json['purchaseCostMad'] ?? json['purchase_price']),
      currentValueMad: _d(json['currentValueMad'] ?? json['book_value']),
      acquisitionType:
          (json['acquisitionType'] ?? json['acquisition_type'])?.toString(),
      acquisitionDate:
          _date(json['acquisitionDate'] ?? json['acquisition_date']),
      currentLocation:
          (json['currentLocation'] ?? json['current_location'])?.toString(),
      unavailabilityReason:
          (json['unavailabilityReason'] ?? json['unavailability_reason'])
              ?.toString(),
      numeroPolice:
          (json['numeroPolice'] ?? json['numero_police'])?.toString(),
      nombreCylindres:
          _int(json['nombreCylindres'] ?? json['nombre_cylindres']),
      nombrePlaces: _int(json['nombrePlaces'] ?? json['nombre_places']),
      nombrePortes: _int(json['nombrePortes'] ?? json['nombre_portes']),
      miseEnCirculation:
          _date(json['miseEnCirculation'] ?? json['mise_en_circulation']),
      dateImmatriculation: _date(
          json['dateImmatriculation'] ?? json['date_immatriculation']),
      immatOnline: (json['immatOnline'] ?? json['immat_online'])?.toString(),
      carteGriseStatus:
          (json['carteGriseStatus'] ?? json['carte_grise_status'])?.toString(),
      immatProvisoireExpiry: _date(
          json['immatProvisoireExpiry'] ?? json['immat_provisoire_expiry']),
      insuranceDeductible:
          _d(json['insuranceDeductible'] ?? json['insurance_deductible']),
      vehicleType: (json['vehicleType'] ?? json['vehicle_type'])?.toString(),
      gamme: json['gamme']?.toString(),
      categorie: json['categorie']?.toString(),
      equipments: json['equipments'] is List
          ? [for (final e in json['equipments']) e.toString()]
          : const [],
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

const Map<String, String> kPhysicalStatusFr = {
  'good': 'Bon état',
  'needs_maintenance': "Besoin d'entretien",
  'needs_repair': 'Besoin de réparation',
  'damaged': 'Endommagé',
  'immobilized': 'Immobilisé',
};

const Map<String, String> kAvailabilityFr = {
  'available': 'Disponible',
  'reserved': 'Réservé',
  'rented': 'Loué',
  'in_use': 'Loué',
  'maintenance': 'En maintenance',
  'repair': 'En réparation',
  'in_repair': 'En réparation',
  'blocked': 'Bloqué',
  'unavailable': 'Indisponible',
  'immobilized': 'Immobilisé',
  'accident': 'Accidenté',
  'sold': 'Vendu',
  'scrapped': 'Rebuté',
  'pending': 'En attente',
};

const Map<String, String> kOwnershipFr = {
  'owned': 'Propriété agence',
  'leased': 'Loué (crédit-bail)',
  'sub_rented': 'Sous-location',
  'sub_rental': 'Sous-location',
  'consignment': 'Dépôt-vente',
};

const Map<String, String> kReservationStatusFr = {
  'draft': 'Brouillon',
  'reserved': 'Réservée',
  'confirmed': 'Confirmée',
  'pickup_scheduled': 'Remise planifiée',
  'handed_over': 'Remise',
  'active': 'En cours',
  'extension_requested': 'Prolongation demandée',
  'returned': 'Retournée',
  'cancelled': 'Annulée',
  'closed': 'Clôturée',
  'completed': 'Terminée',
};
