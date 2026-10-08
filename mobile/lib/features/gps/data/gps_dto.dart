import 'package:latlong2/latlong.dart';

/// Véhicule listé par `/v1/fleet` — utilise dans le tableau de bord GPS pour
/// placer les marqueurs et les cartes véhicule.
class FleetVehicleDto {
  const FleetVehicleDto({
    required this.id,
    required this.registration,
    required this.brand,
    required this.model,
    required this.status,
    this.version,
    this.image,
    this.mileageKm,
    this.assignedClientId,
    this.assignedClientName,
  });

  final String id;
  final String registration;
  final String brand;
  final String model;
  final String? version;
  final String status;
  final String? image;
  final int? mileageKm;
  final String? assignedClientId;
  final String? assignedClientName;

  factory FleetVehicleDto.fromJson(Map<String, dynamic> json) {
    // `VehicleResource` renvoie `brand` et `model` déjà aplatis en chaînes,
    // ainsi que `mileageKm` et `photoUrl` en camelCase. On lit d'abord ces
    // champs puis on retombe sur les variantes imbriquées / snake_case pour
    // rester compatible avec d'autres sources.
    String brand = '—';
    final b = json['brand'];
    if (b is String && b.isNotEmpty) {
      brand = b;
    } else if (b is Map && b['name'] != null) {
      brand = b['name'].toString();
    } else if (json['brand_name'] != null) {
      brand = json['brand_name'].toString();
    }
    String model = '—';
    final m = json['model'];
    if (m is String && m.isNotEmpty) {
      model = m;
    } else if (m is Map) {
      model = (m['model_name'] ?? m['name'] ?? '—').toString();
    } else if (json['model_name'] != null) {
      model = json['model_name'].toString();
    }
    return FleetVehicleDto(
      id: json['id']?.toString() ?? '',
      registration:
          (json['registration'] ?? json['registration_number'] ?? '—')
              .toString(),
      brand: brand,
      model: model,
      version: json['version']?.toString(),
      status: (json['status'] ?? 'AVAILABLE').toString(),
      image: (json['photoUrl'] ??
              json['photo_url'] ??
              json['image'] ??
              json['photo'])
          ?.toString(),
      mileageKm: _int(json['mileageKm']) ??
          _int(json['mileage_km']) ??
          _int(json['mileage_current']) ??
          _int(json['mileage']),
      assignedClientId:
          (json['currentCustomerId'] ?? json['assigned_client_id'])?.toString(),
      assignedClientName: json['assigned_client_name']?.toString(),
    );
  }
}

/// Alerte GPS brute : `type`, `message`, `at`, `severity`.
class GpsAlertDto {
  const GpsAlertDto({
    required this.id,
    required this.type,
    required this.severity,
    required this.message,
    this.at,
  });

  final String id;
  final String type;
  final String severity; // CRITICAL / WARN / INFO
  final String message;
  final DateTime? at;

  factory GpsAlertDto.fromJson(Map<String, dynamic> j) => GpsAlertDto(
        id: j['id']?.toString() ?? '',
        type: (j['alert_type'] ?? j['type'] ?? '').toString(),
        severity: (j['severity'] ?? 'INFO').toString().toUpperCase(),
        message: (j['description'] ?? j['title'] ?? j['message'] ?? '')
            .toString(),
        at: _date(j['triggered_at']) ?? _date(j['created_at']) ?? _date(j['at']),
      );
}

class GeofenceDto {
  const GeofenceDto({required this.id, required this.name});
  final String id;
  final String name;

  factory GeofenceDto.fromJson(Map<String, dynamic> j) => GeofenceDto(
        id: j['id']?.toString() ?? '',
        name: j['name']?.toString() ?? '—',
      );
}

/// Méta par statut véhicule, calqué sur `STATUS_META` du web.
class VehicleStatusMeta {
  const VehicleStatusMeta(this.label, this.color);
  final String label;
  final int color;
}

const Map<String, VehicleStatusMeta> kVehicleStatusMeta = {
  'AVAILABLE': VehicleStatusMeta('Disponible', 0xFF10B981),
  'RESERVED': VehicleStatusMeta('Réservé', 0xFF5B5BF4),
  'RENTED': VehicleStatusMeta('En location', 0xFF22D3EE),
  'UNDER_LOA': VehicleStatusMeta('LOA active', 0xFF22D3EE),
  'UNDER_CREDIT': VehicleStatusMeta('Crédit auto', 0xFF22D3EE),
  'IN_DELIVERY': VehicleStatusMeta('En livraison', 0xFFF59E0B),
  'MAINTENANCE': VehicleStatusMeta('Maintenance', 0xFFF59E0B),
  'BLOCKED': VehicleStatusMeta('Bloqué', 0xFFEF4444),
  'SOLD': VehicleStatusMeta('Vendu', 0xFF64748B),
};

VehicleStatusMeta vehicleMeta(String status) =>
    kVehicleStatusMeta[status] ??
    const VehicleStatusMeta('—', 0xFF64748B);

/// Groupes de filtres identiques à `FILTER_GROUPS` du web.
class GpsFilterGroup {
  const GpsFilterGroup(this.key, this.label, this.match);
  final String key;
  final String label;
  final List<String> match;
}

const List<GpsFilterGroup> kGpsFilterGroups = [
  GpsFilterGroup('all', 'Tous', []),
  GpsFilterGroup(
      'live', 'En circulation', ['RENTED', 'UNDER_LOA', 'UNDER_CREDIT', 'IN_DELIVERY']),
  GpsFilterGroup('idle', 'Disponibles', ['AVAILABLE', 'RESERVED']),
  GpsFilterGroup('maint', 'Maintenance', ['MAINTENANCE']),
  GpsFilterGroup('alert', 'Alertes', ['BLOCKED']),
];

// ---------------------------------------------------------------------------
// Pseudo-positions deterministes autour de Casablanca — reproduit `fakeCoords`
// et `fakeGpsData` du web pour que les marqueurs soient stables tant que le
// backend ne renvoie pas encore de positions reelles.
// ---------------------------------------------------------------------------

const LatLng kCasablancaCenter = LatLng(33.5731, -7.5898);

const List<String> _casaNeighborhoods = [
  'Maarif', 'Gauthier', 'Anfa', 'Bourgogne', 'Hay Hassani', 'Sidi Bernoussi',
  'Ain Chock', 'Ain Sebaa', "Ben M'sik", 'Derb Sultan', 'Salmia', 'Oulfa',
  'Sbata', 'Hay Mohammadi', 'Nassim', '2 Mars', 'Racine', 'Polo',
];

const List<String> _fakeClientNames = [
  'Ahmed Benali', 'Khalid Razi', 'Youssef El Idrissi', 'Omar Tazi',
  'Hassan Bouazzaoui', 'Rachid Lahlou', 'Mehdi Chraibi', 'Karim Alaoui',
  'Samir Berrada', 'Nabil Ouali',
];

int _seedFor(String id) {
  int seed = 0;
  for (final c in id.codeUnits) {
    seed = (seed * 31 + c) & 0xFFFFFFFF;
  }
  return seed.abs();
}

LatLng fakeCoordsFor(String id) {
  final seed = _seedFor(id);
  final lat = kCasablancaCenter.latitude + ((seed % 100) - 50) * 0.0012;
  final lon = kCasablancaCenter.longitude +
      (((seed >> 7) % 100) - 50) * 0.0015;
  return LatLng(lat, lon);
}

class FakeGpsData {
  const FakeGpsData({
    required this.speed,
    required this.fuel,
    required this.neighborhood,
    required this.lastUpdate,
    this.clientName,
  });
  final int speed;
  final int fuel;
  final String neighborhood;
  final DateTime lastUpdate;
  final String? clientName;
}

FakeGpsData fakeGpsFor(String id, String status) {
  final seed = _seedFor(id);
  final isMoving = const ['RENTED', 'IN_DELIVERY', 'UNDER_LOA', 'UNDER_CREDIT']
      .contains(status);
  final speed = isMoving ? (seed % 90) + 10 : 0;
  final fuel = ((seed >> 3) % 70) + 25;
  final neighborhood = _casaNeighborhoods[seed % _casaNeighborhoods.length];
  final client =
      isMoving ? _fakeClientNames[(seed >> 4) % _fakeClientNames.length] : null;
  final minOffset = seed % 18;
  return FakeGpsData(
    speed: speed,
    fuel: fuel,
    neighborhood: neighborhood,
    clientName: client,
    lastUpdate: DateTime.now().subtract(Duration(minutes: minOffset)),
  );
}

// ---------------------------------------------------------------------------

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
