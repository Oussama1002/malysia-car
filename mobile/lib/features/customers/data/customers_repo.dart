import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import 'customer_detail_dto.dart';
import 'customer_dossier_dto.dart';
import 'customer_dto.dart';

class CustomersRepo {
  CustomersRepo(this._api);
  final ApiClient _api;

  Future<List<CustomerDto>> list({
    int perPage = 100,
    String? type,
    String? kycStatus,
    String? riskLevel,
    bool? isBlacklisted,
    String? branchId,
  }) async {
    final query = <String, dynamic>{'per_page': perPage};
    if (type != null && type.isNotEmpty) query['type'] = type;
    if (kycStatus != null && kycStatus.isNotEmpty) {
      query['kyc_status'] = kycStatus;
    }
    if (riskLevel != null && riskLevel.isNotEmpty) {
      query['risk_level'] = riskLevel;
    }
    if (isBlacklisted != null) {
      query['is_blacklisted'] = isBlacklisted ? 'true' : 'false';
    }
    if (branchId != null && branchId.isNotEmpty) query['branch_id'] = branchId;
    final data = await _api.getData('/customers', query: query);
    if (data is! List) return const [];
    return data
        .whereType<Map<String, dynamic>>()
        .map(CustomerDto.fromJson)
        .toList();
  }

  /// Dossier complet d'un client : adresses, contacts, KYC, blacklist, notes,
  /// contrats, paiements, risque — tout en un appel.
  Future<CustomerDossierDto> fetchDossier(String id) async {
    final data = await _api.getData('/customers/$id/dossier');
    final map = data is Map<String, dynamic>
        ? data
        : (data as Map).map((k, v) => MapEntry(k.toString(), v));
    return CustomerDossierDto.fromJson(map);
  }

  Future<void> addNote(String customerId, String body) async {
    await _api.raw.post('/customers/$customerId/notes', data: {
      'body': body,
    });
  }

  Future<CustomerDetailDto> fetchDetail(String id) async {
    final data = await _api.getData('/customers/$id');
    final map = data is Map<String, dynamic>
        ? data
        : (data as Map).map((k, v) => MapEntry(k.toString(), v));
    final detail = CustomerDetailDto.fromJson(map);
    // Le solde arrive sur un endpoint séparé pour ne pas alourdir la fiche —
    // on le charge en parallèle, et on tolère son échec (403 par exemple).
    try {
      final b = await _api.getData('/customers/$id/balance');
      if (b is Map) {
        final bm = b is Map<String, dynamic>
            ? b
            : b.map((k, v) => MapEntry(k.toString(), v));
        return detail.copyWith(balance: CustomerBalanceDto.fromJson(bm));
      }
    } catch (_) {
      // Pas de solde affiché, pas de blocage.
    }
    return detail;
  }

  /// Cherche un client déjà en base à partir d'un numéro de pièce. Évite les
  /// doublons quand on scanne la CIN d'un client qui est déjà client.
  Future<CustomerDto?> lookup({String? cin, String? license}) async {
    final params = <String, dynamic>{};
    if (cin != null && cin.isNotEmpty) params['national_id_number'] = cin;
    if (license != null && license.isNotEmpty) {
      params['driving_license_number'] = license;
    }
    if (params.isEmpty) return null;
    try {
      final data = await _api.getData('/customers/lookup', query: params);
      if (data is Map) {
        final m = data is Map<String, dynamic>
            ? data
            : data.map((k, v) => MapEntry(k.toString(), v));
        if (m['id'] != null) return CustomerDto.fromJson(m);
      }
    } catch (_) {}
    return null;
  }

  Future<CustomerDto> create({
    required Map<String, dynamic> body,
  }) async {
    final data = await _api.postData('/customers', body: body);
    final m = data is Map<String, dynamic>
        ? data
        : (data as Map).map((k, v) => MapEntry(k.toString(), v));
    return CustomerDto.fromJson(m);
  }

  /// Lance l'OCR sur un fichier et attend le résultat.
  /// Sur mobile on peut passer `filePath` (dart:io dispo) ; sur le web il
  /// faut passer `fileBytes` + `fileName` (dart:io absent — MultipartFile.
  /// fromFile throw sinon).
  Future<Map<String, dynamic>> scanDocument({
    String? filePath,
    List<int>? fileBytes,
    String? fileName,
    required String type,
  }) async {
    final MultipartFile multipart;
    if (fileBytes != null) {
      multipart = MultipartFile.fromBytes(
        fileBytes,
        filename: fileName ?? 'upload.jpg',
      );
    } else if (filePath != null) {
      multipart = await MultipartFile.fromFile(filePath);
    } else {
      throw ArgumentError('scanDocument: filePath or fileBytes is required');
    }
    final upload = await _api.raw.post(
      '/document-reader/uploads',
      data: FormData.fromMap({
        'file': multipart,
        'document_type': type,
      }),
    );
    final uploadData = upload.data['data'] ?? upload.data;
    final docId = (uploadData is Map ? uploadData['id'] : null)?.toString();
    if (docId == null) {
      throw Exception('Réponse upload sans identifiant.');
    }

    // Déclenche l'OCR puis on interroge jusqu'à ce que le serveur ait fini.
    await _api.raw.post('/document-reader/documents/$docId/extract',
        data: {'document_type': type});

    const maxTries = 60;
    for (var i = 0; i < maxTries; i++) {
      await Future<void>.delayed(
          Duration(seconds: i < 10 ? 1 : 3));
      final poll = await _api.getData('/document-reader/documents/$docId');
      if (poll is Map) {
        final p = poll is Map<String, dynamic>
            ? poll
            : poll.map((k, v) => MapEntry(k.toString(), v));
        final status = p['status']?.toString();
        if (status == 'extracted' || status == 'validated') {
          final extraction = p['extraction'];
          final data = extraction is Map ? extraction['extracted_data'] : null;
          return {
            'document_id': docId,
            'fields': data is Map ? Map<String, dynamic>.from(data) : {},
          };
        }
        if (status == 'failed') {
          throw Exception(p['error_message']?.toString() ?? 'OCR en échec.');
        }
      }
    }
    throw Exception('OCR trop long — réessayez.');
  }

  Future<void> linkDocument({
    required String documentId,
    required String customerId,
  }) async {
    await _api.raw.post(
      '/document-reader/documents/$documentId/link',
      data: {
        'entity_type': 'customer',
        'entity_id': customerId,
      },
    );
  }
}

final customersRepoProvider =
    Provider<CustomersRepo>((ref) => CustomersRepo(ref.watch(apiClientProvider)));

final customersListProvider = FutureProvider<List<CustomerDto>>((ref) {
  final f = ref.watch(customerListFiltersProvider);
  return ref.watch(customersRepoProvider).list(
        type: f.type,
        kycStatus: f.kycStatus,
        riskLevel: f.riskLevel,
        isBlacklisted: f.isBlacklisted,
      );
});

final customerDetailProvider =
    FutureProvider.family<CustomerDetailDto, String>((ref, id) {
  return ref.watch(customersRepoProvider).fetchDetail(id);
});

/// Filtres de la liste des clients, partagés par l'écran et le provider.
class CustomerListFilters {
  const CustomerListFilters({
    this.type = '',
    this.kycStatus = '',
    this.riskLevel = '',
    this.isBlacklisted,
  });

  final String type;
  final String kycStatus;
  final String riskLevel;
  final bool? isBlacklisted;

  CustomerListFilters copyWith({
    String? type,
    String? kycStatus,
    String? riskLevel,
    Object? isBlacklisted = _unset,
  }) {
    return CustomerListFilters(
      type: type ?? this.type,
      kycStatus: kycStatus ?? this.kycStatus,
      riskLevel: riskLevel ?? this.riskLevel,
      isBlacklisted: isBlacklisted == _unset
          ? this.isBlacklisted
          : isBlacklisted as bool?,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is CustomerListFilters &&
      other.type == type &&
      other.kycStatus == kycStatus &&
      other.riskLevel == riskLevel &&
      other.isBlacklisted == isBlacklisted;

  @override
  int get hashCode =>
      Object.hash(type, kycStatus, riskLevel, isBlacklisted);
}

const _unset = Object();

final customerListFiltersProvider =
    StateProvider<CustomerListFilters>((ref) => const CustomerListFilters());

final customerDossierProvider =
    FutureProvider.family<CustomerDossierDto, String>(
        (ref, id) => ref.watch(customersRepoProvider).fetchDossier(id));
