import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/config/app_config.dart';
import 'document_reader_dto.dart';

class DocumentReaderRepo {
  DocumentReaderRepo(this._api);
  final ApiClient _api;

  /// Base `/document-reader/documents` (identique au web).
  static const _base = '/document-reader/documents';

  Future<List<ReaderDocumentDto>> list({int perPage = 50}) async {
    final data = await _api.getData(_base, query: {'per_page': perPage});
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((m) => ReaderDocumentDto.fromJson(
            m.map((k, v) => MapEntry(k.toString(), v))))
        .toList();
  }

  Future<ReaderDocumentDto> fetch(String id) async {
    final data = await _api.getData('$_base/$id');
    final m = data is Map
        ? data.map((k, v) => MapEntry(k.toString(), v))
        : <String, dynamic>{};
    return ReaderDocumentDto.fromJson(m);
  }

  /// Upload d'un fichier avec un type attendu. L'endpoint est
  /// `/document-reader/uploads` (singulier côté dépôt web / endpoints.ts).
  Future<ReaderDocumentDto> upload({
    required File file,
    required String documentType,
  }) async {
    final form = FormData.fromMap({
      'file': await MultipartFile.fromFile(file.path),
      'document_type': documentType,
    });
    final res = await _api.raw.post('/document-reader/uploads', data: form);
    return _parseEnvelope(res.data);
  }

  /// Lance l'OCR (le backend renvoie 202, puis on pollera la fiche).
  Future<ReaderDocumentDto> extract({
    required String id,
    String? documentType,
  }) async {
    final res = await _api.raw.post('$_base/$id/extract', data: {
      if (documentType != null) 'document_type': documentType,
    });
    return _parseEnvelope(res.data);
  }

  /// Valide (et éventuellement rattache à une entité) les champs édités.
  Future<ReaderDocumentDto> validate({
    required String id,
    required Map<String, dynamic> validatedData,
    String? entityType,
    String? entityId,
  }) async {
    final payload = <String, dynamic>{'validated_data': validatedData};
    if (entityType != null && entityType.isNotEmpty) {
      payload['linked_entity_type'] = entityType;
    }
    if (entityId != null && entityId.isNotEmpty) {
      payload['linked_entity_id'] = entityId;
    }
    final res = await _api.raw.post('$_base/$id/validate', data: payload);
    return _parseEnvelope(res.data);
  }

  Future<void> remove(String id) async {
    await _api.raw.delete('$_base/$id');
  }

  /// URL complète pour l'aperçu — l'endpoint `/preview` sert l'image/PDF.
  String previewUrl(String id) {
    return '${AppConfig.apiBaseUrl}$_base/$id/preview';
  }

  /// Poll la fiche toutes les `intervalMs` ms jusqu'à `extracted`,
  /// `validated` ou `failed`, ou jusqu'au `timeout`.
  Future<ReaderDocumentDto> pollUntilDone(
    String id, {
    Duration interval = const Duration(seconds: 3),
    Duration timeout = const Duration(minutes: 5),
  }) async {
    final deadline = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(deadline)) {
      final doc = await fetch(id);
      if (doc.isTerminal) return doc;
      await Future.delayed(interval);
    }
    throw Exception(
        'OCR trop long — réessayez plus tard ou utilisez une image plus nette.');
  }

  ReaderDocumentDto _parseEnvelope(dynamic payload) {
    final body = payload is Map && (payload).containsKey('data')
        ? (payload)['data']
        : payload;
    final map = body is Map
        ? body.map((k, v) => MapEntry(k.toString(), v))
        : <String, dynamic>{};
    return ReaderDocumentDto.fromJson(map);
  }
}

final documentReaderRepoProvider = Provider<DocumentReaderRepo>(
    (ref) => DocumentReaderRepo(ref.watch(apiClientProvider)));

final documentReaderListProvider = FutureProvider<List<ReaderDocumentDto>>(
    (ref) => ref.watch(documentReaderRepoProvider).list());

final documentReaderDetailProvider =
    FutureProvider.family<ReaderDocumentDto, String>(
        (ref, id) => ref.watch(documentReaderRepoProvider).fetch(id));
