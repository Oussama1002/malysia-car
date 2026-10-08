import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import 'gps_dto.dart';

class GpsRepo {
  GpsRepo(this._api);
  final ApiClient _api;

  Future<List<FleetVehicleDto>> fleetVehicles() async {
    // L'endpoint officiel de la flotte est `/vehicles` (le fleet du web
    // mappe sur /v1/vehicles). L'ancien chemin `/fleet` renvoyait 404.
    final data = await _api.getData('/vehicles', query: {'per_page': 500});
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((m) =>
            FleetVehicleDto.fromJson(m.map((k, v) => MapEntry(k.toString(), v))))
        .toList();
  }

  Future<List<GpsAlertDto>> alerts() async {
    final data = await _api.getData('/gps/alerts');
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((m) =>
            GpsAlertDto.fromJson(m.map((k, v) => MapEntry(k.toString(), v))))
        .toList();
  }

  Future<List<GeofenceDto>> geofences() async {
    final data = await _api.getData('/geofences');
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((m) =>
            GeofenceDto.fromJson(m.map((k, v) => MapEntry(k.toString(), v))))
        .toList();
  }
}

final gpsRepoProvider =
    Provider<GpsRepo>((ref) => GpsRepo(ref.watch(apiClientProvider)));

final fleetVehiclesProvider = FutureProvider<List<FleetVehicleDto>>(
    (ref) => ref.watch(gpsRepoProvider).fleetVehicles());

final gpsAlertsProvider = FutureProvider<List<GpsAlertDto>>(
    (ref) => ref.watch(gpsRepoProvider).alerts());

final gpsGeofencesProvider = FutureProvider<List<GeofenceDto>>(
    (ref) => ref.watch(gpsRepoProvider).geofences());
