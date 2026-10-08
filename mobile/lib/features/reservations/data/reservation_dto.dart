/// Une réservation telle que le serveur la rend — liste.
///
/// On recouvre tous les champs utilisés par la version web : `created_at`,
/// `has_contract`, `candidate_vehicle_ids` (intention multi-véhicules).
class ReservationDto {
  const ReservationDto({
    required this.id,
    required this.number,
    required this.status,
    this.customerId,
    this.vehicleId,
    this.customerName,
    this.vehicleLabel,
    this.startAt,
    this.endAt,
    this.estimatedPrice,
    this.createdAt,
    this.hasContract = false,
    this.candidateVehicleIds = const [],
    this.reservationType,
    this.pickupAddress,
    this.deliveryAddress,
    this.dailyRate,
    this.allowedKmPerDay,
    this.depositAmount,
  });

  final String id;
  final String number;
  final String status;
  final String? customerId;
  final String? vehicleId;
  final String? customerName;
  final String? vehicleLabel;
  final DateTime? startAt;
  final DateTime? endAt;
  final double? estimatedPrice;
  final DateTime? createdAt;
  final bool hasContract;
  final List<String> candidateVehicleIds;
  final String? reservationType;
  final String? pickupAddress;
  final String? deliveryAddress;
  final double? dailyRate;
  final int? allowedKmPerDay;
  final double? depositAmount;

  bool get isDraft => status.toLowerCase() == 'draft';
  bool get isCancelled => status.toLowerCase() == 'cancelled';
  bool get isClosed => status.toLowerCase() == 'closed';

  ReservationDto withJoined({
    String? customerName,
    String? vehicleLabel,
    bool? hasContract,
  }) {
    return ReservationDto(
      id: id,
      number: number,
      status: status,
      customerId: customerId,
      vehicleId: vehicleId,
      customerName: customerName ?? this.customerName,
      vehicleLabel: vehicleLabel ?? this.vehicleLabel,
      startAt: startAt,
      endAt: endAt,
      estimatedPrice: estimatedPrice,
      createdAt: createdAt,
      hasContract: hasContract ?? this.hasContract,
      candidateVehicleIds: candidateVehicleIds,
      reservationType: reservationType,
      pickupAddress: pickupAddress,
      deliveryAddress: deliveryAddress,
      dailyRate: dailyRate,
      allowedKmPerDay: allowedKmPerDay,
      depositAmount: depositAmount,
    );
  }

  factory ReservationDto.fromJson(Map<String, dynamic> json) {
    final cv = json['candidate_vehicle_ids'];
    return ReservationDto(
      id: json['id']?.toString() ?? '',
      number: json['reservation_number']?.toString() ?? '—',
      status: json['status']?.toString() ?? '',
      customerId: json['customer_id']?.toString(),
      vehicleId: json['vehicle_id']?.toString(),
      customerName: _customerName(json),
      vehicleLabel: _vehicleLabel(json),
      startAt: _date(json['desired_start_at']),
      endAt: _date(json['desired_end_at']),
      estimatedPrice: _toDouble(json['estimated_price']),
      createdAt: _date(json['created_at']),
      // Le backend renvoie `has_contract` sous forme de bool (via `(bool) $r->has_contract`),
      // mais la sous-requête SQL donne parfois `1` ou `"1"` si la coercition
      // echoue — on accepte les trois formes.
      hasContract: json['has_contract'] == true ||
          json['has_contract'] == 1 ||
          json['has_contract']?.toString() == '1',
      candidateVehicleIds: cv is List
          ? cv.map((e) => e.toString()).toList()
          : const [],
      reservationType: json['reservation_type']?.toString(),
      pickupAddress: json['pickup_address']?.toString(),
      deliveryAddress: json['delivery_address']?.toString(),
      dailyRate: _toDouble(json['daily_rate']),
      allowedKmPerDay:
          int.tryParse(json['allowed_km_per_day']?.toString() ?? ''),
      depositAmount: _toDouble(json['deposit_amount']),
    );
  }

  static String? _customerName(Map<String, dynamic> json) {
    final direct = json['customer_name'];
    if (direct is String && direct.isNotEmpty) return direct;
    final c = json['customer'];
    if (c is Map) {
      final display = c['display_name'];
      if (display is String && display.isNotEmpty) return display;
      final ind = c['individual_profile'];
      if (ind is Map) {
        final f = ind['first_name']?.toString() ?? '';
        final l = ind['last_name']?.toString() ?? '';
        final full = ('$f $l').trim();
        if (full.isNotEmpty) return full;
      }
      final comp = c['company_profile'];
      if (comp is Map) {
        final name = comp['trade_name'] ?? comp['legal_name'];
        if (name is String && name.isNotEmpty) return name;
      }
    }
    return null;
  }

  static String? _vehicleLabel(Map<String, dynamic> json) {
    final direct = json['vehicle_name'];
    if (direct is String && direct.isNotEmpty) return direct;
    final v = json['vehicle'];
    if (v is Map) {
      final brand = v['brand'] is Map ? v['brand']['name'] : v['brand_name'];
      final model = v['model'] is Map
          ? (v['model']['model_name'] ?? v['model']['name'])
          : v['model_name'];
      final reg = v['registration_number'] ?? v['registration'];
      final parts = [
        [brand, model].where((e) => e != null && '$e'.isNotEmpty).join(' '),
        reg,
      ].where((e) => e != null && '$e'.toString().isNotEmpty).toList();
      if (parts.isNotEmpty) return parts.join(' · ');
    }
    return null;
  }

  static DateTime? _date(dynamic value) {
    if (value == null) return null;
    return DateTime.tryParse(value.toString());
  }

  static double? _toDouble(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    return double.tryParse(value.toString());
  }
}

const Map<String, String> kReservationStatusFr = {
  'draft': 'Brouillon',
  'reserved': 'Réservé',
  'confirmed': 'Confirmé',
  'pickup_scheduled': 'Remise planifiée',
  'handed_over': 'Remis',
  'active': 'En cours',
  'extension_requested': 'Prolongation demandée',
  'return_scheduled': 'Retour planifié',
  'returned': 'Retourné',
  'inspection_pending': 'Inspection en attente',
  'damage_pending': 'Dommages en attente',
  'billing_pending': 'Facturation en attente',
  'closed': 'Clôturé',
  'cancelled': 'Annulé',
  'completed': 'Terminé',
};

String frenchStatus(String raw) =>
    kReservationStatusFr[raw.toLowerCase()] ?? raw;

const Map<String, String> kReservationTypeFr = {
  'SHORT_RENTAL': 'Location courte durée',
  'short_rental': 'Location courte durée',
  'LONG_RENTAL': 'Location longue durée',
  'long_rental': 'Location longue durée',
  'LLD': 'LLD',
  'LOA': 'LOA',
  'CREDIT_AUTO': 'Crédit automobile',
  'VENTE_VO': 'Vente VO',
};

String reservationTypeFr(String raw) => kReservationTypeFr[raw] ?? raw;
