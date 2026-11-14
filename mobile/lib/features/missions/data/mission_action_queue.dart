import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'missions_repo.dart';

/// File d'attente hors-ligne pour les transitions de cycle de vie d'une mission
/// (accepter / démarrer / arrivé / terminer). En terrain, la connexion saute :
/// si l'action échoue pour une raison réseau, on la garde localement et on la
/// rejoue au prochain chargement réussi (ou via le bouton « Synchroniser »).
///
/// On reste volontairement sans dépendance `connectivity_plus` : on détecte le
/// hors-ligne à partir du type d'erreur Dio (pas de réponse serveur). Une
/// erreur métier (422/409/403 : transition impossible, déjà faite…) n'est PAS
/// rejouable — on la retire de la file pour ne pas boucler.
class QueuedMissionAction {
  QueuedMissionAction({
    required this.missionId,
    required this.action,
    this.status,
    this.notes,
    required this.queuedAt,
  });

  final String missionId;

  /// accept | start | arrive | complete
  final String action;
  final String? status; // pour complete : completed | failed
  final String? notes;
  final DateTime queuedAt;

  Map<String, dynamic> toJson() => {
        'mission_id': missionId,
        'action': action,
        if (status != null) 'status': status,
        if (notes != null) 'notes': notes,
        'queued_at': queuedAt.toIso8601String(),
      };

  factory QueuedMissionAction.fromJson(Map<String, dynamic> j) =>
      QueuedMissionAction(
        missionId: j['mission_id']?.toString() ?? '',
        action: j['action']?.toString() ?? '',
        status: j['status']?.toString(),
        notes: j['notes']?.toString(),
        queuedAt: DateTime.tryParse(j['queued_at']?.toString() ?? '') ??
            DateTime.now(),
      );

  String labelFr() {
    switch (action) {
      case 'accept':
        return 'Acceptation';
      case 'start':
        return 'Démarrage';
      case 'arrive':
        return 'Arrivée sur site';
      case 'complete':
        return status == 'failed' ? 'Mise en échec' : 'Clôture';
      default:
        return action;
    }
  }
}

/// Vrai quand l'erreur Dio vient d'une absence de connexion (et non d'une
/// réponse métier du serveur) : dans ce cas l'action mérite d'être réessayée.
bool isOfflineDioError(Object e) {
  if (e is! DioException) return false;
  if (e.response != null) return false; // le serveur a répondu → erreur métier
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

class MissionActionQueue extends StateNotifier<List<QueuedMissionAction>> {
  MissionActionQueue(this._repo) : super(const []) {
    _load();
  }

  final MissionsRepo _repo;
  static const _key = 'df_mission_action_queue_v1';
  bool _flushing = false;

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key);
      if (raw == null || raw.isEmpty) return;
      final list = (jsonDecode(raw) as List)
          .whereType<Map>()
          .map((e) => QueuedMissionAction.fromJson(
              e.map((k, v) => MapEntry(k.toString(), v))))
          .toList();
      state = list;
    } catch (_) {
      // file corrompue : on repart propre.
      state = const [];
    }
  }

  Future<void> _persist() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
          _key, jsonEncode(state.map((e) => e.toJson()).toList()));
    } catch (_) {/* best-effort */}
  }

  Future<void> enqueue(QueuedMissionAction action) async {
    state = [...state, action];
    await _persist();
  }

  /// Rejoue les actions en attente, dans l'ordre. S'arrête à la première erreur
  /// réseau (on garde la file). Retire les actions acceptées par le serveur ET
  /// celles rejetées pour une raison métier (non rejouables). Retourne le
  /// nombre d'actions effectivement passées.
  Future<int> flush() async {
    if (_flushing || state.isEmpty) return 0;
    _flushing = true;
    var applied = 0;
    try {
      final remaining = <QueuedMissionAction>[];
      var stop = false;
      for (final a in state) {
        if (stop) {
          remaining.add(a);
          continue;
        }
        try {
          await _dispatch(a);
          applied++;
        } catch (e) {
          if (isOfflineDioError(e)) {
            // Toujours hors-ligne : on garde celle-ci et toutes les suivantes.
            remaining.add(a);
            stop = true;
          }
          // Sinon (erreur métier) : on l'abandonne silencieusement.
        }
      }
      state = remaining;
      await _persist();
    } finally {
      _flushing = false;
    }
    return applied;
  }

  Future<void> _dispatch(QueuedMissionAction a) async {
    switch (a.action) {
      case 'accept':
        return _repo.accept(a.missionId);
      case 'start':
        return _repo.start(a.missionId);
      case 'arrive':
        return _repo.arrive(a.missionId);
      case 'complete':
        return _repo.complete(a.missionId,
            status: a.status ?? 'completed', notes: a.notes);
    }
  }

  Future<void> clear() async {
    state = const [];
    await _persist();
  }
}

final missionActionQueueProvider =
    StateNotifierProvider<MissionActionQueue, List<QueuedMissionAction>>(
        (ref) => MissionActionQueue(ref.watch(missionsRepoProvider)));
