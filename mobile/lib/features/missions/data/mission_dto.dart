/// Mission terrain telle que renvoyée par `/v1/mobile-ops/my-missions`.
/// Les relations (`vehicle`, `client`) sont chargées côté backend avec un
/// sous-ensemble de colonnes.
class MissionDto {
  const MissionDto({
    required this.id,
    required this.missionNumber,
    required this.missionType,
    required this.status,
    this.priority,
    this.scheduledStartAt,
    this.scheduledEndAt,
    this.originAddress,
    this.destinationAddress,
    this.pickupAddress,
    this.dropoffAddress,
    this.notes,
    this.clientInstructions,
    this.vehicleRegistration,
    this.vehicleBrand,
    this.vehicleModel,
    this.clientCode,
    this.clientType,
  });

  final String id;
  final String missionNumber;
  final String missionType;
  final String status;
  final String? priority;
  final DateTime? scheduledStartAt;
  final DateTime? scheduledEndAt;
  final String? originAddress;
  final String? destinationAddress;
  final String? pickupAddress;
  final String? dropoffAddress;
  final String? notes;
  final String? clientInstructions;
  final String? vehicleRegistration;
  final String? vehicleBrand;
  final String? vehicleModel;
  final String? clientCode;
  final String? clientType;

  /// « Marque Modèle · Immatriculation » (champs disponibles uniquement).
  String? get vehicleLabel {
    final name = [vehicleBrand, vehicleModel]
        .whereType<String>()
        .where((s) => s.trim().isNotEmpty)
        .join(' ');
    final parts = [name, vehicleRegistration]
        .whereType<String>()
        .where((s) => s.trim().isNotEmpty)
        .toList();
    return parts.isEmpty ? null : parts.join(' · ');
  }

  static String? _str(dynamic v) => v?.toString();

  static DateTime? _date(dynamic v) {
    if (v == null) return null;
    return DateTime.tryParse(v.toString())?.toLocal();
  }

  factory MissionDto.fromJson(Map<String, dynamic> j) {
    final vehicle = j['vehicle'];
    final client = j['client'];
    return MissionDto(
      id: j['id']?.toString() ?? '',
      missionNumber: j['mission_number']?.toString() ?? '',
      missionType: j['mission_type']?.toString() ?? '',
      status: j['status']?.toString() ?? '',
      priority: _str(j['priority']),
      scheduledStartAt: _date(j['scheduled_start_at']),
      scheduledEndAt: _date(j['scheduled_end_at']),
      originAddress: _str(j['origin_address']),
      destinationAddress: _str(j['destination_address']),
      pickupAddress: _str(j['pickup_address']),
      dropoffAddress: _str(j['dropoff_address']),
      notes: _str(j['notes']),
      clientInstructions: _str(j['client_instructions']),
      vehicleRegistration:
          vehicle is Map ? _str(vehicle['registration_number']) : null,
      vehicleBrand: vehicle is Map ? _str(vehicle['brand_name']) : null,
      vehicleModel: vehicle is Map ? _str(vehicle['model_name']) : null,
      clientCode: client is Map ? _str(client['customer_code']) : null,
      clientType: client is Map ? _str(client['customer_type']) : null,
    );
  }
}

/// Libellés FR des types de mission (alignés sur le back-office web).
String missionTypeFr(String code) {
  switch (code) {
    case 'delivery':
    case 'livraison':
      return 'Livraison';
    case 'pickup':
    case 'recuperation':
    case 'recovery':
      return 'Récupération';
    case 'vehicle_swap':
    case 'swap':
      return 'Changement de véhicule';
    case 'handover':
      return 'Remise du véhicule';
    case 'return':
      return 'Restitution';
    case 'inspection':
      return 'Inspection';
    case 'maintenance':
      return 'Maintenance';
    default:
      return code.isEmpty ? 'Mission' : code;
  }
}

/// Libellés FR des statuts de mission.
String missionStatusFr(String code) {
  switch (code) {
    case 'planned':
      return 'Planifiée';
    case 'pending':
      return 'En attente';
    case 'assigned':
      return 'Assignée';
    case 'accepted':
      return 'Acceptée';
    case 'in_progress':
      return 'En cours';
    case 'arrived':
      return 'Arrivé sur site';
    case 'completed':
      return 'Terminée';
    case 'failed':
      return 'Échouée';
    case 'cancelled':
      return 'Annulée';
    default:
      return code;
  }
}
