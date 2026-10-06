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
