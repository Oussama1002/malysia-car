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
  //
  // Historique : une variante compacte (une seule page) vivait ici. Elle a
  // été supprimée pour que la mission réutilise le MÊME wizard que le reste
  // du système (`NewContractFromReservationScreen` côté mobile,
  // `ContractWizardPage` côté web) : 6 étapes Client → Véhicule → Type →
  // Conditions → Annexes → Validation, signature électronique, annexes,
  // puis le flux backend d'AGENTS.md §5.3. La navigation se fait désormais
  // depuis `MissionDetailScreen` en ouvrant le wizard avec le
  // `reservationId` de la mission.
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
