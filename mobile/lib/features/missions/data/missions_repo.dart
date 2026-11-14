import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import 'mission_dto.dart';

/// Accès aux missions de l'agent terrain. On passe par le canal mobile dédié
/// `/v1/mobile-ops/*` : `my-missions` ne renvoie QUE les missions assignées à
/// l'utilisateur connecté (filtre côté backend par `assigned_user_id`).
class MissionsRepo {
  MissionsRepo(this._api);
  final ApiClient _api;

  Future<List<MissionDto>> myMissions({String? status}) async {
    final data = await _api.getData('/mobile-ops/my-missions', query: {
      'per_page': 100,
      if (status != null && status.isNotEmpty) 'status': status,
    });
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((e) =>
            MissionDto.fromJson(e.map((k, v) => MapEntry(k.toString(), v))))
        .toList();
  }

  /// Fiche détail complète d'une mission (relations + justificatifs).
  Future<MissionDetailDto> detail(String id) async {
    final data = await _api.getData('/mobile-ops/missions/$id');
    final map = data is Map
        ? data.map((k, v) => MapEntry(k.toString(), v))
        : <String, dynamic>{};
    return MissionDetailDto.fromJson(map);
  }

  // ── Transitions de cycle de vie ──────────────────────────────────────────

  Future<void> accept(String id) async {
    await _api.raw.post('/mobile-ops/missions/$id/accept');
  }

  Future<void> start(String id) async {
    await _api.raw.post('/mobile-ops/missions/$id/start');
  }

  Future<void> arrive(String id) async {
    await _api.raw.post('/mobile-ops/missions/$id/arrive');
  }

  Future<void> complete(String id,
      {String status = 'completed', String? notes}) async {
    await _api.raw.post('/mobile-ops/missions/$id/complete', data: {
      'status': status,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
    });
  }

  // ── Justificatifs terrain ────────────────────────────────────────────────

  /// Téléverse une ou plusieurs photos (multipart) pour une phase donnée.
  Future<void> uploadPhotos(
    String id, {
    required List<MultipartFile> files,
    String? phase,
    String? label,
  }) async {
    final form = FormData();
    if (phase != null && phase.isNotEmpty) form.fields.add(MapEntry('phase', phase));
    if (label != null && label.isNotEmpty) form.fields.add(MapEntry('label', label));
    for (final f in files) {
      form.files.add(MapEntry('files[]', f));
    }
    await _api.raw.post('/mobile-ops/missions/$id/photos', data: form);
  }

  /// Soumet un état des lieux (entrée/sortie) avec compteur, carburant, état.
  Future<void> submitInspection(
    String id, {
    required String inspectionType, // check_in | check_out
    int? odometerKm,
    int? fuelLevel,
    String? exteriorCondition,
    String? interiorCondition,
    String? damageNotes,
  }) async {
    await _api.raw.post('/mobile-ops/missions/$id/inspection', data: {
      'inspection_type': inspectionType,
      if (odometerKm != null) 'odometer_km': odometerKm,
      if (fuelLevel != null) 'fuel_level': fuelLevel,
      if (exteriorCondition != null) 'exterior_condition': exteriorCondition,
      if (interiorCondition != null) 'interior_condition': interiorCondition,
      if (damageNotes != null && damageNotes.isNotEmpty)
        'damage_notes': damageNotes,
    });
  }

  /// Signale un incident sur la mission.
  Future<void> reportIssue(
    String id, {
    required String issueType,
    required String severity,
    required String description,
  }) async {
    await _api.raw.post('/mobile-ops/missions/$id/issues', data: {
      'issue_type': issueType,
      'severity': severity,
      'description': description,
    });
  }

  /// Capture la signature du client (PNG base64 depuis le pad).
  Future<void> captureSignature(
    String id, {
    required String signerName,
    required Uint8List pngBytes,
  }) async {
    final dataUrl = 'data:image/png;base64,${base64Encode(pngBytes)}';
    await _api.raw.post('/mobile-ops/missions/$id/signature', data: {
      'signer_name': signerName,
      'data_url': dataUrl,
    });
  }

  // ── Génération de contrat depuis la mission ──────────────────────────────

  /// Réutilise EXACTEMENT le flux du wizard web (ordre §5.3 d'AGENTS.md) :
  ///   1. POST /contracts (depuis la réservation de la mission)
  ///   2. POST /payments (loyer → `maybePromoteContract` : draft → approved)
  ///   3. POST /payments (franchise d'assurance, `payment_type: caution`) si
  ///      encaissée maintenant
  ///   4. POST /contracts/{id}/activate (best-effort — si refus, le contrat est
  ///      déjà Approuvé avec de vrais paiements : on ne bloque pas)
  /// Le PDF est ensuite généré par `ContractPdfPreviewScreen`.
  Future<ContractGenResult> generateContractForMission({
    required MissionDto mission,
    required ContractGenInput input,
  }) async {
    final customerId = mission.clientId;
    if (customerId == null || customerId.isEmpty) {
      throw Exception('Client introuvable sur la mission.');
    }

    // 1. Création du contrat.
    final created = await _api.postData('/contracts', body: {
      'contract_type': input.contractType,
      'customer_id': customerId,
      'vehicle_id': mission.vehicleId,
      'reservation_id': mission.reservationId,
      'currency_code': 'MAD',
      'start_date': input.startDate,
      'end_date': input.endDate,
      'base_amount': input.loyer,
      'monthly_payment': input.loyer,
      'deposit_amount': input.franchiseAmount,
      if (input.franchiseMethod != null) 'deposit_method': input.franchiseMethod,
      'payment_method': input.rentMethod,
      if (input.notes != null && input.notes!.isNotEmpty) 'notes': input.notes,
    });
    final contractMap = _asMap(created);
    final contractId = contractMap['id']?.toString();
    final contractNumber = contractMap['contract_number']?.toString();
    if (contractId == null || contractId.isEmpty) {
      throw Exception('Contrat créé sans identifiant — réponse inattendue.');
    }

    final today = DateTime.now().toIso8601String().substring(0, 10);

    // 2. Encaissement du loyer (fait passer le contrat draft → approved).
    if (input.loyer > 0) {
      await _api.raw.post('/payments', data: {
        'customer_id': customerId,
        'contract_id': contractId,
        'reservation_id': mission.reservationId,
        'payment_method': input.rentMethod,
        'payment_type': 'paiement_location',
        'amount': input.loyer,
        'payment_date': today,
      });
    }

    // 3. Encaissement de la franchise d'assurance (Payment `caution`).
    if (input.collectFranchiseNow && input.franchiseAmount > 0) {
      await _api.raw.post('/payments', data: {
        'customer_id': customerId,
        'contract_id': contractId,
        'reservation_id': mission.reservationId,
        'payment_method': input.franchisePaymentMethod,
        'payment_type': 'caution',
        'amount': input.franchiseAmount,
        'payment_date': today,
      });
    }

    // 4. Activation (best-effort — ne jamais bloquer / annuler).
    try {
      await _api.raw.post('/contracts/$contractId/activate');
    } catch (_) {/* le contrat reste Approuvé avec de vrais paiements */}

    return ContractGenResult(
        contractId: contractId, contractNumber: contractNumber);
  }

  static Map<String, dynamic> _asMap(dynamic v) {
    if (v is Map) return v.map((k, val) => MapEntry(k.toString(), val));
    return <String, dynamic>{};
  }
}

/// Saisie de l'agent pour générer le contrat (champs requis §5.7 d'AGENTS.md).
class ContractGenInput {
  const ContractGenInput({
    required this.contractType,
    required this.startDate,
    required this.endDate,
    required this.loyer,
    required this.franchiseAmount,
    this.franchiseMethod,
    this.collectFranchiseNow = false,
    this.rentMethod = 'cash',
    this.franchisePaymentMethod = 'cash',
    this.notes,
  });

  final String contractType; // LLD | LOCATION_COURTE
  final String startDate; // ISO yyyy-MM-dd
  final String endDate; // ISO yyyy-MM-dd
  final double loyer;
  final double franchiseAmount;
  final String? franchiseMethod; // deposit_method: cash|cheque|bank_transfer|card|other
  final bool collectFranchiseNow;
  final String rentMethod; // payment_method: cash|bank_transfer|check|card
  final String franchisePaymentMethod;
  final String? notes;
}

class ContractGenResult {
  const ContractGenResult({required this.contractId, this.contractNumber});
  final String contractId;
  final String? contractNumber;
}

/// Extrait un message lisible d'une erreur Dio (sans fuiter « DioException… »).
String friendlyError(Object e) {
  if (isNetworkError(e)) {
    return 'Pas de connexion. Action enregistrée, elle sera renvoyée automatiquement.';
  }
  if (e is DioException) {
    final data = e.response?.data;
    if (data is Map) {
      final meta = data['meta'];
      if (meta is Map && meta['message'] != null) {
        return meta['message'].toString();
      }
      if (data['message'] != null && data['message'].toString().isNotEmpty) {
        return data['message'].toString();
      }
      final errors = data['errors'];
      if (errors is Map && errors.isNotEmpty) {
        final first = errors.values.first;
        if (first is List && first.isNotEmpty) return first.first.toString();
        return first.toString();
      }
    }
    final code = e.response?.statusCode;
    if (code == 403) return "Vous n'avez pas la permission pour cette action.";
    if (code == 409) {
      return 'Un contrat existe déjà pour cette réservation.';
    }
    if (code == 422) return 'Action impossible dans l\'état actuel.';
    if (code != null) return 'Erreur serveur ($code). Réessayez.';
  }
  return 'Une erreur est survenue. Réessayez.';
}

bool isNetworkError(Object e) {
  if (e is! DioException) return false;
  if (e.response != null) return false;
  switch (e.type) {
    case DioExceptionType.connectionError:
    case DioExceptionType.connectionTimeout:
    case DioExceptionType.sendTimeout:
    case DioExceptionType.receiveTimeout:
    case DioExceptionType.unknown:
      return true;
    default:
      return false;
  }
}

final missionsRepoProvider = Provider<MissionsRepo>((ref) {
  return MissionsRepo(ref.watch(apiClientProvider));
});

/// Filtre de statut courant pour l'écran missions ('' = tous).
final missionsStatusFilterProvider = StateProvider<String>((_) => '');

/// Recherche libre (numéro de mission, véhicule, client, adresse).
final missionsSearchProvider = StateProvider<String>((_) => '');

final myMissionsProvider = FutureProvider<List<MissionDto>>((ref) {
  final status = ref.watch(missionsStatusFilterProvider);
  return ref.watch(missionsRepoProvider).myMissions(status: status);
});

/// Détail d'une mission (rechargé à la demande).
final missionDetailProvider =
    FutureProvider.family<MissionDetailDto, String>((ref, id) {
  return ref.watch(missionsRepoProvider).detail(id);
});
