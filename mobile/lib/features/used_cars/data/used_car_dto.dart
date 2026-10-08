class UsedCarDto {
  const UsedCarDto({
    required this.id,
    required this.status,
    this.registration,
    this.brand,
    this.model,
    this.year,
    this.askingPrice,
    this.mileageKm,
    this.photoUrl,
  });

  final String id;
  final String status;
  final String? registration;
  final String? brand;
  final String? model;
  final int? year;
  final double? askingPrice;
  final int? mileageKm;
  final String? photoUrl;

  String get label {
    final parts = [brand, model]
        .where((e) => e != null && (e as String).isNotEmpty)
        .toList();
    return parts.isEmpty ? (registration ?? '—') : parts.join(' ');
  }

  factory UsedCarDto.fromJson(Map<String, dynamic> json) {
    final v = json['vehicle'];
    String? reg, br, mo;
    int? y;
    String? photo;
    int? km;
    if (v is Map) {
      reg = (v['registration_number'] ?? v['registration'])?.toString();
      br = v['brand'] is Map
          ? v['brand']['name']?.toString()
          : v['brand_name']?.toString();
      mo = v['model'] is Map
          ? (v['model']['model_name'] ?? v['model']['name'])?.toString()
          : v['model_name']?.toString();
      y = _int(v['year']);
      photo = (v['photoUrl'] ?? v['photo_url'])?.toString();
      km = _int(v['mileageKm']) ?? _int(v['mileage_current']);
    }
    return UsedCarDto(
      id: json['id']?.toString() ?? '',
      status: json['status']?.toString() ?? 'for_sale',
      registration: reg ?? json['registration']?.toString(),
      brand: br ?? json['brand']?.toString(),
      model: mo ?? json['model']?.toString(),
      year: y ?? _int(json['year']),
      askingPrice: _d(json['asking_price']),
      mileageKm: km ?? _int(json['mileage_km']),
      photoUrl: photo ?? json['photo_url']?.toString(),
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

const Map<String, String> kUsedCarStatusFr = {
  'for_sale': 'En vente',
  'reserved': 'Réservé',
  'sold': 'Vendu',
  'withdrawn': 'Retiré',
};

String usedCarStatusFr(String raw) =>
    kUsedCarStatusFr[raw.toLowerCase()] ?? raw;
