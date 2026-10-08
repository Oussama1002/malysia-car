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

  /// Véhicules exposés sur la landing sans tarif journalier — même source
  /// que la notification « tarif à définir ».
  Future<List<MissingPriceVehicle>> missingPrices() async {
    final data = await _api.getData('/website-leads/missing-prices');
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((m) => MissingPriceVehicle.fromJson(
            m.map((k, v) => MapEntry(k.toString(), v))))
        .toList();
  }

  /// Enregistre le tarif journalier et déclenche le rafraîchissement du
  /// cache côté serveur (fait automatiquement par l'API).
  Future<void> setPrice(String vehicleId, double price) async {
    await _api.raw.patch(
      '/website-leads/vehicles/$vehicleId/price',
      data: {'daily_rental_price': price},
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
  });

  final String id;
  final String? brand;
  final String? model;
  final int? year;
  final String? registration;
  final String? fuel;
  final String? transmission;
  final String? categorie;
  /// Chemin relatif renvoyé par l'API (ex. `/api/v1/files/<uuid>`), à
  /// combiner avec l'URL de base pour obtenir l'URL complète.
  final String? photoPath;

  String get label {
    final parts = [brand, model].where((e) => e != null && e!.isNotEmpty).toList();
    return parts.isEmpty ? 'Véhicule' : parts.join(' ');
  }

  /// URL absolue de la photo prête à passer à `Image.network`, ou `null`.
  String? photoUrl(String apiBaseUrl) {
    final p = photoPath;
    if (p == null || p.isEmpty) return null;
    if (p.startsWith('http://') || p.startsWith('https://')) return p;
    final base = apiBaseUrl.replaceAll(RegExp(r'/+$'), '');
    // `photo_url` arrive en `/api/v1/files/...` alors que `AppConfig.apiBaseUrl`
    // est déjà `.../api/v1` : on retire le préfixe pour éviter `/api/v1/api/v1`.
    final normalized = p
        .replaceFirst(RegExp(r'^/api/v1/'), '/')
        .replaceFirst(RegExp(r'^/api/'), '/');
    return '$base$normalized';
  }

  factory MissingPriceVehicle.fromJson(Map<String, dynamic> j) =>
      MissingPriceVehicle(
        id: j['id']?.toString() ?? '',
        brand: j['brand']?.toString(),
        model: j['model']?.toString(),
        year: int.tryParse(j['year']?.toString() ?? ''),
        registration: j['registration']?.toString(),
        fuel: j['fuel']?.toString(),
        transmission: j['transmission']?.toString(),
        categorie: j['categorie']?.toString(),
        photoPath: (j['photo_url'] ?? j['photoUrl'])?.toString(),
      );
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

final missingPriceVehiclesProvider = FutureProvider<List<MissingPriceVehicle>>(
    (ref) => ref.watch(websiteLeadsRepoProvider).missingPrices());
