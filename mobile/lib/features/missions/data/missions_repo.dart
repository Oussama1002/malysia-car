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
        .map((e) => MissionDto.fromJson(e.map((k, v) => MapEntry(k.toString(), v))))
        .toList();
  }

  Future<void> accept(String id) async {
    await _api.raw.post('/mobile-ops/missions/$id/accept');
  }

  Future<void> start(String id) async {
    await _api.raw.post('/mobile-ops/missions/$id/start');
  }

  Future<void> arrive(String id) async {
    await _api.raw.post('/mobile-ops/missions/$id/arrive');
  }

  Future<void> complete(String id, {String status = 'completed', String? notes}) async {
    await _api.raw.post('/mobile-ops/missions/$id/complete', data: {
      'status': status,
      if (notes != null && notes.isNotEmpty) 'notes': notes,
    });
  }
}

final missionsRepoProvider = Provider<MissionsRepo>((ref) {
  return MissionsRepo(ref.watch(apiClientProvider));
});

/// Filtre de statut courant pour l'écran missions ('' = tous).
final missionsStatusFilterProvider = StateProvider<String>((_) => '');

final myMissionsProvider = FutureProvider<List<MissionDto>>((ref) {
  final status = ref.watch(missionsStatusFilterProvider);
  return ref.watch(missionsRepoProvider).myMissions(status: status);
});
