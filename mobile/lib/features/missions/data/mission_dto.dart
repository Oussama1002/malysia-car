import '../../../core/widgets/module_scaffold.dart';

/// Mission terrain telle que renvoyée par `/v1/mobile-ops/my-missions` (liste)
/// et `/v1/mobile-ops/missions/{id}` (détail). Les relations (`vehicle`,
/// `client`, `reservation`, `contract`) sont chargées côté backend avec un
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
    this.actualStartAt,
    this.arrivedAt,
    this.actualEndAt,
    this.originAddress,
    this.destinationAddress,
    this.pickupAddress,
    this.dropoffAddress,
    this.notes,
    this.clientInstructions,
    this.vehicleId,
    this.vehicleRegistration,
    this.vehicleBrand,
    this.vehicleModel,
    this.clientId,
    this.clientCode,
    this.clientType,
    this.clientName,
    this.reservationId,
    this.reservationNumber,
    this.contractId,
    this.contractNumber,
    this.photosCount = 0,
    this.inspectionsCount = 0,
    this.issuesCount = 0,
  });

  final String id;
  final String missionNumber;
  final String missionType;
  final String status;
  final String? priority;
  final DateTime? scheduledStartAt;
  final DateTime? scheduledEndAt;
  final DateTime? actualStartAt;
  final DateTime? arrivedAt;
  final DateTime? actualEndAt;
  final String? originAddress;
  final String? destinationAddress;
  final String? pickupAddress;
  final String? dropoffAddress;
  final String? notes;
  final String? clientInstructions;
  final String? vehicleId;
  final String? vehicleRegistration;
  final String? vehicleBrand;
  final String? vehicleModel;
  final String? clientId;
  final String? clientCode;
  final String? clientType;
  final String? clientName;
  final String? reservationId;
  final String? reservationNumber;
  final String? contractId;
  final String? contractNumber;
  final int photosCount;
  final int inspectionsCount;
  final int issuesCount;

  /// True quand un contrat est déjà rattaché à la mission.
  bool get hasContract => (contractId ?? '').isNotEmpty;

  /// True quand on peut générer un contrat : une réservation source existe
  /// et aucun contrat n'y est encore rattaché.
  bool get canGenerateContract =>
      !hasContract && (reservationId ?? '').isNotEmpty;

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

  /// Ligne client « Nom · code » quand on a les deux.
  String? get clientLabel {
    final parts = [clientName, clientCode]
        .whereType<String>()
        .where((s) => s.trim().isNotEmpty)
        .toList();
    return parts.isEmpty ? null : parts.join(' · ');
  }

  static String? _str(dynamic v) {
    final s = v?.toString();
    return (s == null || s.isEmpty) ? null : s;
  }

  static int _int(dynamic v) => v is int ? v : int.tryParse('${v ?? ''}') ?? 0;

  static DateTime? _date(dynamic v) {
    if (v == null) return null;
    return DateTime.tryParse(v.toString())?.toLocal();
  }

  static String? _clientName(Map client) {
    final indiv = client['individual_profile'] ?? client['individualProfile'];
    if (indiv is Map) {
      final parts = [indiv['first_name'], indiv['last_name']]
          .map((e) => e?.toString().trim() ?? '')
          .where((s) => s.isNotEmpty)
          .toList();
      if (parts.isNotEmpty) return parts.join(' ');
    }
    final comp = client['company_profile'] ?? client['companyProfile'];
    if (comp is Map) {
      final name = (comp['trade_name'] ?? comp['legal_name'])?.toString();
      if (name != null && name.trim().isNotEmpty) return name;
    }
    return null;
  }

  factory MissionDto.fromJson(Map<String, dynamic> j) {
    final vehicle = j['vehicle'];
    final client = j['client'];
    final reservation = j['reservation'];
    final contract = j['contract'];
    return MissionDto(
      id: j['id']?.toString() ?? '',
      missionNumber: j['mission_number']?.toString() ?? '',
      missionType: j['mission_type']?.toString() ?? '',
      status: j['status']?.toString() ?? '',
      priority: _str(j['priority']),
      scheduledStartAt: _date(j['scheduled_start_at']),
      scheduledEndAt: _date(j['scheduled_end_at']),
      actualStartAt: _date(j['actual_start_at']),
      arrivedAt: _date(j['arrived_at']),
      actualEndAt: _date(j['actual_end_at']),
      originAddress: _str(j['origin_address']),
      destinationAddress: _str(j['destination_address']),
      pickupAddress: _str(j['pickup_address']),
      dropoffAddress: _str(j['dropoff_address']),
      notes: _str(j['notes']),
      clientInstructions: _str(j['client_instructions']),
      vehicleId: _str(j['vehicle_id']),
      vehicleRegistration:
          vehicle is Map ? _str(vehicle['registration_number']) : null,
      vehicleBrand: vehicle is Map ? _str(vehicle['brand_name']) : null,
      vehicleModel: vehicle is Map ? _str(vehicle['model_name']) : null,
      clientId: _str(j['client_id']),
      clientCode: client is Map ? _str(client['customer_code']) : null,
      clientType: client is Map ? _str(client['customer_type']) : null,
      clientName: client is Map ? _clientName(client) : null,
      reservationId:
          reservation is Map ? _str(reservation['id']) : _str(j['reservation_id']),
      reservationNumber:
          reservation is Map ? _str(reservation['reservation_number']) : null,
      contractId:
          contract is Map ? _str(contract['id']) : _str(j['contract_id']),
      contractNumber:
          contract is Map ? _str(contract['contract_number']) : null,
      photosCount: _int(j['photos_count']),
      inspectionsCount: _int(j['inspections_count']),
      issuesCount: _int(j['issues_count']),
    );
  }
}

/// Fiche détail : la mission + ses justificatifs (photos, inspections,
/// incidents, signatures), tels que renvoyés par `GET /mobile-ops/missions/{id}`.
class MissionDetailDto {
  const MissionDetailDto({
    required this.mission,
    this.photos = const [],
    this.inspections = const [],
    this.issues = const [],
    this.signatures = const [],
  });

  final MissionDto mission;
  final List<MissionPhotoDto> photos;
  final List<MissionInspectionDto> inspections;
  final List<MissionIssueDto> issues;
  final List<MissionSignatureDto> signatures;

  factory MissionDetailDto.fromJson(Map<String, dynamic> j) {
    List<T> parse<T>(dynamic raw, T Function(Map<String, dynamic>) f) {
      if (raw is! List) return const [];
      return raw
          .whereType<Map>()
          .map((e) => f(e.map((k, v) => MapEntry(k.toString(), v))))
          .toList();
    }

    return MissionDetailDto(
      mission: MissionDto.fromJson(j),
      photos: parse(j['photos'], MissionPhotoDto.fromJson),
      inspections: parse(j['inspections'], MissionInspectionDto.fromJson),
      issues: parse(j['issues'], MissionIssueDto.fromJson),
      signatures: parse(j['signatures'], MissionSignatureDto.fromJson),
    );
  }
}

class MissionPhotoDto {
  const MissionPhotoDto({required this.id, this.phase, this.label, this.createdAt});
  final String id;
  final String? phase;
  final String? label;
  final DateTime? createdAt;

  factory MissionPhotoDto.fromJson(Map<String, dynamic> j) => MissionPhotoDto(
        id: j['id']?.toString() ?? '',
        phase: MissionDto._str(j['phase']),
        label: MissionDto._str(j['label']),
        createdAt: MissionDto._date(j['created_at']),
      );
}

class MissionInspectionDto {
  const MissionInspectionDto({
    required this.id,
    this.inspectionType,
    this.odometerKm,
    this.fuelLevel,
    this.exteriorCondition,
    this.interiorCondition,
    this.createdAt,
  });
  final String id;
  final String? inspectionType;
  final int? odometerKm;
  final int? fuelLevel;
  final String? exteriorCondition;
  final String? interiorCondition;
  final DateTime? createdAt;

  factory MissionInspectionDto.fromJson(Map<String, dynamic> j) =>
      MissionInspectionDto(
        id: j['id']?.toString() ?? '',
        inspectionType: MissionDto._str(j['inspection_type']),
        odometerKm: j['odometer_km'] == null
            ? null
            : int.tryParse('${j['odometer_km']}'),
        fuelLevel:
            j['fuel_level'] == null ? null : int.tryParse('${j['fuel_level']}'),
        exteriorCondition: MissionDto._str(j['exterior_condition']),
        interiorCondition: MissionDto._str(j['interior_condition']),
        createdAt: MissionDto._date(j['created_at']),
      );
}

class MissionIssueDto {
  const MissionIssueDto({
    required this.id,
    this.issueType,
    this.severity,
    this.description,
    this.resolvedAt,
    this.createdAt,
  });
  final String id;
  final String? issueType;
  final String? severity;
  final String? description;
  final DateTime? resolvedAt;
  final DateTime? createdAt;

  bool get isResolved => resolvedAt != null;

  factory MissionIssueDto.fromJson(Map<String, dynamic> j) => MissionIssueDto(
        id: j['id']?.toString() ?? '',
        issueType: MissionDto._str(j['issue_type']),
        severity: MissionDto._str(j['severity']),
        description: MissionDto._str(j['description']),
        resolvedAt: MissionDto._date(j['resolved_at']),
        createdAt: MissionDto._date(j['created_at']),
      );
}

class MissionSignatureDto {
  const MissionSignatureDto({required this.id, this.signerName, this.signedAt});
  final String id;
  final String? signerName;
  final DateTime? signedAt;

  factory MissionSignatureDto.fromJson(Map<String, dynamic> j) =>
      MissionSignatureDto(
        id: j['id']?.toString() ?? '',
        signerName: MissionDto._str(j['signer_name']),
        signedAt: MissionDto._date(j['signed_at']),
      );
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
    case 'transfer':
      return 'Transfert';
    case 'convoy':
      return 'Convoyage';
    case 'check_in':
      return 'État des lieux (entrée)';
    case 'check_out':
      return 'État des lieux (sortie)';
    case 'cleaning':
      return 'Nettoyage';
    case 'workshop':
      return 'Atelier';
    case 'fuel':
      return 'Carburant';
    case 'assistance':
      return 'Assistance';
    case 'inspection':
      return 'Inspection';
    case 'maintenance':
      return 'Maintenance';
    case 'other':
      return 'Autre';
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

/// Teinte de la puce de statut (réutilise `ModuleStatusChip`).
ModuleStatusTone missionStatusTone(String code) {
  switch (code) {
    case 'completed':
      return ModuleStatusTone.ok;
    case 'failed':
    case 'cancelled':
      return ModuleStatusTone.danger;
    case 'in_progress':
    case 'arrived':
    case 'accepted':
      return ModuleStatusTone.warning;
    default:
      return ModuleStatusTone.neutral;
  }
}

/// Libellé FR de la priorité (champ désormais affiché).
String? missionPriorityFr(String? code) {
  switch (code) {
    case 'low':
      return 'Basse';
    case 'normal':
      return 'Normale';
    case 'high':
      return 'Haute';
    case 'urgent':
      return 'Urgente';
    default:
      return code;
  }
}
