import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/config/app_config.dart';
import 'document_dto.dart';

class DocumentsRepo {
  DocumentsRepo(this._api);
  final ApiClient _api;

  /// Repository central (/v1/documents) avec les mêmes filtres que le web.
  Future<List<DocumentDto>> list(DocumentFilters f) async {
    final q = <String, dynamic>{'per_page': 200};
    if (f.entityType.isNotEmpty) q['entity_type'] = f.entityType;
    if (f.category.isNotEmpty) q['category'] = f.category;
    if (f.expiryStatus.isNotEmpty) q['expiry_status'] = f.expiryStatus;
    if (f.uploadedBy.isNotEmpty) q['uploaded_by'] = f.uploadedBy;
    if (f.dateFrom.isNotEmpty) q['date_from'] = f.dateFrom;
    if (f.dateTo.isNotEmpty) q['date_to'] = f.dateTo;
    final res = await _api.raw.get('/documents', queryParameters: q);
    final data = (res.data is Map && (res.data as Map).containsKey('data'))
        ? (res.data as Map)['data']
        : res.data;
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((m) => m.map((k, v) => MapEntry(k.toString(), v)))
        .map(DocumentDto.fromJson)
        .toList();
  }

  /// Cockpit expiration (/v1/documents/expiring) — renvoie
  /// `{withinDays, items}` sous l'enveloppe `{data: ...}`.
  Future<List<DocumentDto>> expiring({int withinDays = 30}) async {
    final data = await _api.getData('/documents/expiring',
        query: {'within_days': withinDays});
    if (data is! Map) return const [];
    final items = data['items'];
    if (items is! List) return const [];
    return items
        .whereType<Map>()
        .map((m) => m.map((k, v) => MapEntry(k.toString(), v)))
        .map(DocumentDto.fromJson)
        .toList();
  }

  /// URL complète du téléchargement — l'endpoint est protégé par Sanctum,
  /// donc on injecte le jeton en query string pour que `launchUrl` fonctionne
  /// même quand le navigateur ne porte pas le header `Authorization`.
  String downloadUrl(String id) {
    return '${AppConfig.apiBaseUrl}/documents/$id/download';
  }
}

/// Filtres partagés par la liste.
class DocumentFilters {
  const DocumentFilters({
    this.entityType = '',
    this.category = '',
    this.expiryStatus = '',
    this.uploadedBy = '',
    this.dateFrom = '',
    this.dateTo = '',
  });

  final String entityType;
  final String category;
  final String expiryStatus;
  final String uploadedBy;
  final String dateFrom;
  final String dateTo;

  DocumentFilters copyWith({
    String? entityType,
    String? category,
    String? expiryStatus,
    String? uploadedBy,
    String? dateFrom,
    String? dateTo,
  }) {
    return DocumentFilters(
      entityType: entityType ?? this.entityType,
      category: category ?? this.category,
      expiryStatus: expiryStatus ?? this.expiryStatus,
      uploadedBy: uploadedBy ?? this.uploadedBy,
      dateFrom: dateFrom ?? this.dateFrom,
      dateTo: dateTo ?? this.dateTo,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is DocumentFilters &&
      other.entityType == entityType &&
      other.category == category &&
      other.expiryStatus == expiryStatus &&
      other.uploadedBy == uploadedBy &&
      other.dateFrom == dateFrom &&
      other.dateTo == dateTo;

  @override
  int get hashCode =>
      entityType.hashCode ^
      category.hashCode ^
      expiryStatus.hashCode ^
      uploadedBy.hashCode ^
      dateFrom.hashCode ^
      dateTo.hashCode;
}

final documentsRepoProvider = Provider<DocumentsRepo>(
    (ref) => DocumentsRepo(ref.watch(apiClientProvider)));

final documentFiltersProvider =
    StateProvider<DocumentFilters>((ref) => const DocumentFilters());

final documentsListProvider = FutureProvider<List<DocumentDto>>((ref) {
  final f = ref.watch(documentFiltersProvider);
  return ref.watch(documentsRepoProvider).list(f);
});

final documentsExpiringProvider = FutureProvider<List<DocumentDto>>(
    (ref) => ref.watch(documentsRepoProvider).expiring());
