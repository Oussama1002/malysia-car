import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import 'website_lead_dto.dart';

class WebsiteLeadsRepo {
  WebsiteLeadsRepo(this._api);
  final ApiClient _api;

  /// Récupère la liste et le compteur de demandes nouvelles. On passe par Dio
  /// directement pour relire la méta (`new_count`) qui est enveloppée dans la
  /// réponse à côté de `data`.
  Future<WebsiteLeadsPage> list({
    String? status,
    String? search,
    int perPage = 100,
  }) async {
    final response = await _api.raw.get(
      '/website-leads',
      queryParameters: {
        'per_page': perPage,
        if (status != null && status.isNotEmpty) 'status': status,
        if (search != null && search.isNotEmpty) 'search': search,
      },
    );
    final payload = response.data;
    final data = payload is Map ? payload['data'] : payload;
    final meta = payload is Map ? payload['meta'] : null;
    final leads = data is List
        ? data
            .whereType<Map<String, dynamic>>()
            .map(WebsiteLeadDto.fromJson)
            .toList()
        : <WebsiteLeadDto>[];
    final newCount = meta is Map
        ? int.tryParse(meta['new_count']?.toString() ?? '0') ?? 0
        : 0;
    final total = meta is Map
        ? int.tryParse(meta['total']?.toString() ?? '0') ?? leads.length
        : leads.length;
    return WebsiteLeadsPage(leads: leads, total: total, newCount: newCount);
  }

  Future<void> updateStatus(String id, String status) async {
    await _api.raw.patch('/website-leads/$id', data: {'status': status});
  }

  Future<VehiclePricingPage> vehiclePricing() async {
    final response = await _api.raw.get('/website-leads/missing-prices');
    final payload = response.data;
    final data = payload is Map ? payload['data'] : payload;
    final meta = payload is Map ? payload['meta'] : null;

    final vehicles = data is List
        ? data
            .whereType<Map>()
            .map((m) => MissingPriceVehicle.fromJson(
                m.map((k, v) => MapEntry(k.toString(), v))))
            .toList()
        : <MissingPriceVehicle>[];

    final missingCount = meta is Map
        ? int.tryParse(meta['missing_count']?.toString() ?? '0') ?? 0
        : 0;

    final tierSchema = meta is Map && meta['tier_schema'] is List
        ? (meta['tier_schema'] as List)
            .whereType<Map>()
            .map((m) => TierSchemaItem.fromJson(
                m.map((k, v) => MapEntry(k.toString(), v))))
            .toList()
        : <TierSchemaItem>[];

    return VehiclePricingPage(
      vehicles: vehicles,
      missingCount: missingCount,
      tierSchema: tierSchema,
    );
  }

  Future<void> setPrice(
      String vehicleId, Map<String, double> tiers) async {
    await _api.raw.patch(
      '/website-leads/vehicles/$vehicleId/price',
      data: {'tiers': tiers},
    );
  }
}

class MissingPriceVehicle {
  const MissingPriceVehicle({
    required this.id,
    this.brand,
    this.model,
    this.year,
    this.registration,
    this.fuel,
    this.transmission,
    this.categorie,
    this.photoPath,
    this.dailyRentalPrice,
    this.rentalPriceTiers,
  });

  final String id;
  final String? brand;
  final String? model;
  final int? year;
  final String? registration;
  final String? fuel;
  final String? transmission;
  final String? categorie;
  final String? photoPath;
  final double? dailyRentalPrice;
  final Map<String, double>? rentalPriceTiers;

  bool get hasTiers =>
      rentalPriceTiers != null && rentalPriceTiers!.isNotEmpty;

  bool get hasDailyPrice =>
      dailyRentalPrice != null && dailyRentalPrice! > 0;

  bool get hasPricing => hasTiers || hasDailyPrice;

  String get label {
    final parts = [brand, model].where((e) => e != null && e!.isNotEmpty).toList();
    return parts.isEmpty ? 'Véhicule' : parts.join(' ');
  }

  String? photoUrl(String apiBaseUrl) {
    final p = photoPath;
    if (p == null || p.isEmpty) return null;
    if (p.startsWith('http://') || p.startsWith('https://')) return p;
    final base = apiBaseUrl.replaceAll(RegExp(r'/+$'), '');
    final normalized = p
        .replaceFirst(RegExp(r'^/api/v1/'), '/')
        .replaceFirst(RegExp(r'^/api/'), '/');
    return '$base$normalized';
  }

  factory MissingPriceVehicle.fromJson(Map<String, dynamic> j) {
    Map<String, double>? tiers;
    final rawTiers = j['rental_price_tiers'];
    if (rawTiers is Map && rawTiers.isNotEmpty) {
      tiers = {};
      for (final e in rawTiers.entries) {
        final v = double.tryParse(e.value?.toString() ?? '');
        if (v != null && v > 0) tiers[e.key.toString()] = v;
      }
      if (tiers.isEmpty) tiers = null;
    }
    return MissingPriceVehicle(
      id: j['id']?.toString() ?? '',
      brand: j['brand']?.toString(),
      model: j['model']?.toString(),
      year: int.tryParse(j['year']?.toString() ?? ''),
      registration: j['registration']?.toString(),
      fuel: j['fuel']?.toString(),
      transmission: j['transmission']?.toString(),
      categorie: j['categorie']?.toString(),
      photoPath: (j['photo_url'] ?? j['photoUrl'])?.toString(),
      dailyRentalPrice: double.tryParse(
          j['daily_rental_price']?.toString() ?? ''),
      rentalPriceTiers: tiers,
    );
  }
}

class TierSchemaItem {
  const TierSchemaItem({
    required this.key,
    required this.label,
    required this.minDays,
    required this.maxDays,
  });
  final String key;
  final String label;
  final int minDays;
  final int maxDays;

  factory TierSchemaItem.fromJson(Map<String, dynamic> j) => TierSchemaItem(
        key: j['key']?.toString() ?? '',
        label: j['label']?.toString() ?? '',
        minDays: int.tryParse(j['min_days']?.toString() ?? '') ?? 0,
        maxDays: int.tryParse(j['max_days']?.toString() ?? '') ?? 0,
      );
}

class VehiclePricingPage {
  const VehiclePricingPage({
    required this.vehicles,
    required this.missingCount,
    required this.tierSchema,
  });
  final List<MissingPriceVehicle> vehicles;
  final int missingCount;
  final List<TierSchemaItem> tierSchema;
}

class WebsiteLeadsPage {
  const WebsiteLeadsPage({
    required this.leads,
    required this.total,
    required this.newCount,
  });

  final List<WebsiteLeadDto> leads;
  final int total;
  final int newCount;
}

final websiteLeadsRepoProvider = Provider<WebsiteLeadsRepo>(
    (ref) => WebsiteLeadsRepo(ref.watch(apiClientProvider)));

/// Filtres partagés par l'écran et le provider.
class WebsiteLeadsFilters {
  const WebsiteLeadsFilters({this.status = '', this.search = ''});

  final String status;
  final String search;

  WebsiteLeadsFilters copyWith({String? status, String? search}) {
    return WebsiteLeadsFilters(
      status: status ?? this.status,
      search: search ?? this.search,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is WebsiteLeadsFilters &&
      other.status == status &&
      other.search == search;

  @override
  int get hashCode => status.hashCode ^ search.hashCode;
}

final websiteLeadsFiltersProvider =
    StateProvider<WebsiteLeadsFilters>((ref) => const WebsiteLeadsFilters());

final websiteLeadsListProvider = FutureProvider<WebsiteLeadsPage>((ref) {
  final f = ref.watch(websiteLeadsFiltersProvider);
  return ref
      .watch(websiteLeadsRepoProvider)
      .list(status: f.status, search: f.search);
});

final vehiclePricingProvider = FutureProvider<VehiclePricingPage>(
    (ref) => ref.watch(websiteLeadsRepoProvider).vehiclePricing());
