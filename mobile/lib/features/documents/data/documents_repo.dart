import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/config/app_config.dart';
import 'document_dto.dart';

class DocumentsRepo {
  DocumentsRepo(this._api);
  final ApiClient _api;

  /// Repository central (/v1/documents) avec les mêmes filtres que le web.
  /// NB : le backend plafonne `per_page` à 100, inutile d'en demander plus.
  Future<List<DocumentDto>> list(DocumentFilters f) async {
    final q = <String, dynamic>{'per_page': 100};
    if (f.entityType.isNotEmpty) q['entity_type'] = f.entityType;
    if (f.category.isNotEmpty) q['category'] = f.category;
    if (f.expiryStatus.isNotEmpty) q['expiry_status'] = f.expiryStatus;
    if (f.uploadedBy.isNotEmpty) q['uploaded_by'] = f.uploadedBy;
    if (f.dateFrom.isNotEmpty) q['date_from'] = f.dateFrom;
    if (f.dateTo.isNotEmpty) q['date_to'] = f.dateTo;
    // On passe par `getData` (comme `expiring()`) pour bénéficier du
    // déballage automatique de l'enveloppe `{data: ...}`.
    try {
      final data = await _api.getData('/documents', query: q);
      if (data is! List) {
        if (kDebugMode) {
          debugPrint('[documents.list] réponse inattendue: ${data.runtimeType}');
        }
        return const [];
      }
      return data
          .whereType<Map>()
          .map((m) => m.map((k, v) => MapEntry(k.toString(), v)))
          .map(DocumentDto.fromJson)
          .toList();
    } on DioException catch (e) {
      // On rejette l'erreur avec un message lisible — l'écran l'affiche tel
      // quel au lieu d'une pile Dio illisible.
      final status = e.response?.statusCode;
      if (status == 403) {
        throw DocumentsForbidden();
      }
      if (status == 401) {
        throw Exception('Session expirée — reconnectez-vous.');
      }
      final body = e.response?.data;
      final msg = body is Map && body['message'] is String
          ? body['message'] as String
          : (e.message ?? 'Erreur réseau');
      throw Exception('Chargement impossible (HTTP ${status ?? '—'}) : $msg');
    }
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

/// Marqueur d'erreur « permission refusée » — l'écran peut alors afficher un
/// message spécifique au lieu de la trace brute.
class DocumentsForbidden implements Exception {
  @override
  String toString() =>
      'Accès refusé — votre compte n\'a pas la permission `documents.view`.';
}
