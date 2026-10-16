import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import 'document_dto.dart';

/// Repo spécialisé qui liste les documents (attachés + générés) rattachés
/// à une entité (client, véhicule, contrat…). Les retours réutilisent le
/// `DocumentDto` du centre documentaire ; chaque document a un `id` que
/// l'on peut passer à `DocumentViewerScreen` pour le télécharger.
class EntityDocumentsRepo {
  EntityDocumentsRepo(this._api);
  final ApiClient _api;

  Future<List<DocumentDto>> list(String entityType, String entityId) async {
    final data =
        await _api.getData('/entities/$entityType/$entityId/documents');
    if (data is! Map) return const [];
    final attachments = data['attachments'];
    final generated = data['generated'];
    final out = <DocumentDto>[];
    void parse(dynamic list) {
      if (list is! List) return;
      for (final m in list.whereType<Map>()) {
        try {
          out.add(DocumentDto.fromJson(
              m.map((k, v) => MapEntry(k.toString(), v))));
        } catch (_) {}
      }
    }

    parse(attachments);
    parse(generated);
    return out;
  }

  /// Upload d'un fichier (photo prise par l'agent ou document sélectionné)
  /// attaché à l'entité. Côté backend : POST multipart sur
  /// `/entities/{entityType}/{entityId}/documents`.
  Future<void> upload({
    required String entityType,
    required String entityId,
    required String filePath,
    required String fileName,
    String category = 'general',
    String? documentNumber,
    String? issueDate,
    String? expiryDate,
    String? notes,
  }) async {
    final form = FormData.fromMap({
      'file': await MultipartFile.fromFile(filePath, filename: fileName),
      'category': category,
      if (documentNumber != null && documentNumber.isNotEmpty)
        'document_number': documentNumber,
      if (issueDate != null && issueDate.isNotEmpty) 'issue_date': issueDate,
      if (expiryDate != null && expiryDate.isNotEmpty) 'expiry_date': expiryDate,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
    });
    await _api.raw.post(
      '/entities/$entityType/$entityId/documents',
      data: form,
    );
  }
}

final entityDocumentsRepoProvider = Provider<EntityDocumentsRepo>(
    (ref) => EntityDocumentsRepo(ref.watch(apiClientProvider)));

final entityDocumentsProvider =
    FutureProvider.family<List<DocumentDto>, (String, String)>(
        (ref, args) =>
            ref.watch(entityDocumentsRepoProvider).list(args.$1, args.$2));
