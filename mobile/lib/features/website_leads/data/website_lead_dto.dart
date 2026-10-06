class WebsiteLeadDto {
  const WebsiteLeadDto({
    required this.id,
    required this.fullName,
    required this.phone,
    required this.status,
    this.email,
    this.city,
    this.vehicleLabel,
    this.pickupAt,
    this.returnAt,
    this.message,
    this.handlingNotes,
    this.handledAt,
    this.handler,
    this.createdAt,
  });

  final String id;
  final String fullName;
  final String phone;
  final String status;
  final String? email;
  final String? city;
  final String? vehicleLabel;
  final DateTime? pickupAt;
  final DateTime? returnAt;
  final String? message;
  final String? handlingNotes;
  final DateTime? handledAt;
  final WebsiteLeadHandlerDto? handler;
  final DateTime? createdAt;

  factory WebsiteLeadDto.fromJson(Map<String, dynamic> json) {
    final h = json['handler'];
    return WebsiteLeadDto(
      id: json['id']?.toString() ?? '',
      fullName: json['full_name']?.toString() ?? '—',
      phone: json['phone']?.toString() ?? '',
      status: json['status']?.toString() ?? 'new',
      email: json['email']?.toString(),
      city: json['city']?.toString(),
      vehicleLabel: json['vehicle_label']?.toString(),
      pickupAt: _date(json['pickup_at']),
      returnAt: _date(json['return_at']),
      message: json['message']?.toString(),
      handlingNotes: json['handling_notes']?.toString(),
      handledAt: _date(json['handled_at']),
      handler: h is Map
          ? WebsiteLeadHandlerDto.fromJson(
              h is Map<String, dynamic>
                  ? h
                  : h.map((k, v) => MapEntry(k.toString(), v)),
            )
          : null,
      createdAt: _date(json['created_at']),
    );
  }
}

class WebsiteLeadHandlerDto {
  const WebsiteLeadHandlerDto({
    required this.id,
    this.name,
    this.firstName,
    this.lastName,
    this.email,
  });

  final String id;
  final String? name;
  final String? firstName;
  final String? lastName;
  final String? email;

  String get displayName {
    if (name != null && name!.trim().isNotEmpty) return name!.trim();
    final full = '${firstName ?? ''} ${lastName ?? ''}'.trim();
    if (full.isNotEmpty) return full;
    return email ?? '—';
  }

  String get initials {
    final parts = displayName.split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    final letters = parts.take(2).map((p) => p[0].toUpperCase()).join();
    return letters.isEmpty ? '?' : letters;
  }

  factory WebsiteLeadHandlerDto.fromJson(Map<String, dynamic> json) {
    return WebsiteLeadHandlerDto(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString(),
      firstName: json['first_name']?.toString(),
      lastName: json['last_name']?.toString(),
      email: json['email']?.toString(),
    );
  }
}

DateTime? _date(dynamic v) {
  if (v == null) return null;
  return DateTime.tryParse(v.toString());
}

const Map<String, String> kLeadStatusFr = {
  'new': 'Nouvelle',
  'contacted': 'Client contacté',
  'converted': 'Transformée en réservation',
  'rejected': 'Sans suite',
};

String leadStatusFr(String raw) => kLeadStatusFr[raw.toLowerCase()] ?? raw;
