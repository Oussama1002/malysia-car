import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import 'vehicle_detail_dto.dart';
import 'vehicle_dto.dart';

class VehiclesRepo {
  VehiclesRepo(this._api);
  final ApiClient _api;

  Future<List<VehicleDto>> list({int perPage = 200}) async {
    final data = await _api.getData('/vehicles', query: {'per_page': perPage});
    if (data is! List) return const [];
    return data
        .whereType<Map<String, dynamic>>()
        .map(VehicleDto.fromJson)
        .toList();
  }

  Future<VehicleDetailDto> fetchDetail(String id) async {
    final data = await _api.getData('/vehicles/$id');
    if (data is Map) {
      final map = data is Map<String, dynamic>
          ? data
          : data.map((k, v) => MapEntry(k.toString(), v));
      return VehicleDetailDto.fromJson(map);
    }
    throw Exception('Réponse inattendue pour la fiche véhicule.');
  }

  /// Enregistre un entretien. La preuve (photo) est facultative : si fournie,
  /// elle part dans la même requête multipart.
  Future<void> createMaintenance({
    required String vehicleId,
    required String type,
    required String title,
    String? description,
    DateTime? performedAt,
    int? odometerKm,
    String? vendor,
    double? costMad,
    String? proofPath,
  }) async {
    final form = <String, dynamic>{
      'type': type,
      'title': title,
      if (description != null && description.isNotEmpty) 'description': description,
      if (performedAt != null) 'performed_at': performedAt.toIso8601String().substring(0, 10),
      if (odometerKm != null) 'odometer_km': odometerKm,
      if (vendor != null && vendor.isNotEmpty) 'vendor': vendor,
      if (costMad != null) 'cost_mad': costMad,
      if (proofPath != null)
        'proof_document': await MultipartFile.fromFile(proofPath),
    };
    await _api.raw.post(
      '/vehicles/$vehicleId/maintenance-events',
      data: FormData.fromMap(form),
    );
  }

  Future<void> createMovement({
    required String vehicleId,
    required String type,
    int? odometerKm,
    double? fuelLevel,
    String? notes,
  }) async {
    final body = <String, dynamic>{
      if (odometerKm != null) 'odometer_km': odometerKm,
      if (fuelLevel != null) 'fuel_level': fuelLevel,
      if (notes != null && notes.isNotEmpty) 'condition_notes': notes,
    };
    await _api.raw.post('/vehicles/$vehicleId/movements/$type', data: body);
  }

  Future<void> changeStatus({
    required String vehicleId,
    required String status,
    String? note,
  }) async {
    await _api.raw.put('/vehicles/$vehicleId', data: {
      'status': status,
      if (note != null && note.isNotEmpty) 'status_note': note,
    });
  }
}

final vehiclesRepoProvider =
    Provider<VehiclesRepo>((ref) => VehiclesRepo(ref.watch(apiClientProvider)));

final vehiclesListProvider = FutureProvider<List<VehicleDto>>(
    (ref) => ref.watch(vehiclesRepoProvider).list());

final vehicleDetailProvider =
    FutureProvider.family<VehicleDetailDto, String>((ref, id) {
  return ref.watch(vehiclesRepoProvider).fetchDetail(id);
});
