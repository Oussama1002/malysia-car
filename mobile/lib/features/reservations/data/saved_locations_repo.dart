import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../../core/api/api_client.dart';

/// Lieu Google Maps enregistré — pendant mobile de `savedLocationsApi.ts`.
/// Bibliothèque partagée au niveau société, réutilisée sur chaque
/// formulaire mission. API : /saved-locations (view/manage).
class SavedLocation {
  const SavedLocation({
    required this.id,
    required this.title,
    required this.mapsUrl,
    this.address,
    this.latitude,
    this.longitude,
  });

  final String id;
  final String title;
  final String mapsUrl;
  final String? address;
  final double? latitude;
  final double? longitude;

  factory SavedLocation.fromJson(Map<String, dynamic> j) {
    double? toD(dynamic v) =>
        v == null ? null : (v is num ? v.toDouble() : double.tryParse(v.toString()));
    return SavedLocation(
      id: j['id'].toString(),
      title: (j['title'] ?? '').toString(),
      mapsUrl: (j['maps_url'] ?? '').toString(),
      address: j['address']?.toString(),
      latitude: toD(j['latitude']),
      longitude: toD(j['longitude']),
    );
  }

  /// Coordonnées pour l'aperçu carte : stockées, sinon extraites du lien.
  LatLng? get coords {
    if (latitude != null && longitude != null) {
      return LatLng(latitude!, longitude!);
    }
    return coordsFromMapsUrl(mapsUrl);
  }
}

/// Extrait lat/lng d'un lien Google Maps (miroir du parseur backend/web).
/// Les liens courts (maps.app.goo.gl) ne portent pas de coordonnées → null.
LatLng? coordsFromMapsUrl(String url) {
  final patterns = <RegExp>[
    RegExp(r'@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)'),
    RegExp(r'!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)'),
    RegExp(r'[?&](?:q|query|ll)=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)'),
  ];
  for (final re in patterns) {
    final m = re.firstMatch(url);
    if (m != null) {
      final lat = double.tryParse(m.group(1)!);
      final lng = double.tryParse(m.group(2)!);
      if (lat != null && lng != null && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return LatLng(lat, lng);
      }
    }
  }
  return null;
}

class SavedLocationsRepo {
  SavedLocationsRepo(this._api);
  final ApiClient _api;

  Future<List<SavedLocation>> list() async {
    final data = await _api.getData('/saved-locations');
    if (data is! List) return const [];
    return [
      for (final e in data)
        if (e is Map) SavedLocation.fromJson(e.map((k, v) => MapEntry(k.toString(), v))),
    ];
  }

  Future<SavedLocation> create({
    required String title,
    required String mapsUrl,
    String? address,
  }) async {
    final data = await _api.postData('/saved-locations', body: {
      'title': title,
      'maps_url': mapsUrl,
      if (address != null && address.isNotEmpty) 'address': address,
    });
    final map = data is Map<String, dynamic>
        ? data
        : (data as Map).map((k, v) => MapEntry(k.toString(), v));
    return SavedLocation.fromJson(map);
  }
}

final savedLocationsRepoProvider = Provider<SavedLocationsRepo>((ref) {
  return SavedLocationsRepo(ref.watch(apiClientProvider));
});

final savedLocationsProvider =
    FutureProvider.autoDispose<List<SavedLocation>>((ref) async {
  return ref.watch(savedLocationsRepoProvider).list();
});
