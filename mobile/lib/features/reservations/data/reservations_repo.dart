import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../contracts/data/contract_dto.dart';
import '../../contracts/data/contracts_repo.dart';
import '../../customers/data/customer_dto.dart';
import '../../customers/data/customers_repo.dart';
import '../../vehicles/data/vehicle_dto.dart';
import '../../vehicles/data/vehicles_repo.dart';
import 'reservation_detail_dto.dart';
import 'reservation_dto.dart';

class ReservationsRepo {
  ReservationsRepo(this._api);
  final ApiClient _api;

  Future<Map<String, dynamic>> checkAvailability({
    required String vehicleId,
    required String startAt,
    required String endAt,
    String? ignoreReservationId,
  }) async {
    final query = <String, dynamic>{
      'vehicle_id': vehicleId,
      'start_at': startAt,
      'end_at': endAt,
      if (ignoreReservationId != null)
        'ignore_reservation_id': ignoreReservationId,
    };
    final data = await _api.getData('/rentals/availability', query: query);
    if (data is Map<String, dynamic>) return data;
    if (data is Map) return data.map((k, v) => MapEntry(k.toString(), v));
    return const {};
  }

  Future<Map<String, dynamic>> createReservation(Map<String, dynamic> body) async {
    final data = await _api.postData('/reservations', body: body);
    if (data is Map<String, dynamic>) return data;
    if (data is Map) return data.map((k, v) => MapEntry(k.toString(), v));
    return const {};
  }

  Future<ReservationDetailDto> fetchDetail(String id) async {
    final data = await _api.getData('/reservations/$id');
    final map = data is Map<String, dynamic>
        ? data
        : (data as Map).map((k, v) => MapEntry(k.toString(), v));
    return ReservationDetailDto.fromJson(map);
  }

  Future<List<ReservationDto>> list({int perPage = 50}) async {
    final data = await _api.getData('/reservations', query: {'per_page': perPage});
    if (data is! List) return const [];
    return data
        .whereType<Map<String, dynamic>>()
        .map(ReservationDto.fromJson)
        .toList();
  }

  // ---------------------------------------------------------------------------
  // Actions (POST) — toutes identiques à `opsApi` côté web.
  // ---------------------------------------------------------------------------

  Future<void> validateReservation(String id, {String? vehicleId}) async {
    await _api.raw.post('/reservations/$id/validate',
        data: vehicleId != null ? {'vehicle_id': vehicleId} : null);
  }

  Future<void> confirmReservation(String id) async {
    await _api.raw.post('/reservations/$id/confirm');
  }

  Future<void> cancelReservation(String id) async {
    await _api.raw.post('/reservations/$id/cancel');
  }

  Future<void> deleteReservation(String id) async {
    await _api.raw.delete('/reservations/$id');
  }

  Future<void> handoverPickup(String id, Map<String, dynamic> body) async {
    await _api.raw.post('/reservations/$id/handover-pickup', data: body);
  }

  Future<void> handoverReturn(String id, Map<String, dynamic> body) async {
    await _api.raw.post('/reservations/$id/handover-return', data: body);
  }

  Future<void> requestExtension(String id, Map<String, dynamic> body) async {
    await _api.raw.post('/reservations/$id/request-extension', data: body);
  }

  Future<void> damageReport(String id, Map<String, dynamic> body) async {
    await _api.raw.post('/reservations/$id/damage-report', data: body);
  }

  Future<Map<String, dynamic>> closeBilling(
      String id, Map<String, dynamic> body) async {
    final res = await _api.raw.post('/reservations/$id/close-billing', data: body);
    final body0 = res.data is Map ? (res.data as Map) : const {};
    return body0.map((k, v) => MapEntry(k.toString(), v));
  }
}

final reservationsRepoProvider = Provider<ReservationsRepo>((ref) {
  return ReservationsRepo(ref.watch(apiClientProvider));
});

final reservationsListProvider = FutureProvider<List<ReservationDto>>((ref) {
  return ref.watch(reservationsRepoProvider).list();
});

final reservationDetailProvider =
    FutureProvider.family<ReservationDetailDto, String>((ref, id) {
  return ref.watch(reservationsRepoProvider).fetchDetail(id);
});

final enrichedReservationsProvider =
    FutureProvider<List<ReservationDto>>((ref) async {
  final results = await Future.wait([
    ref.watch(reservationsListProvider.future),
    ref.watch(customersListProvider.future),
    ref.watch(vehiclesListProvider.future),
    ref.watch(contractsListProvider.future),
  ]);
  final reservations = results[0] as List<ReservationDto>;
  final customers = results[1] as List<CustomerDto>;
  final vehicles = results[2] as List<VehicleDto>;
  final contracts = results[3] as List<ContractDto>;
  final customersById = {for (final c in customers) c.id: c};
  final vehiclesById = {for (final v in vehicles) v.id: v};
  // Index client-side des contrats actifs par (customer_id, vehicle_id),
  // identique a la sous-requete `has_contract` du backend. Garantit que
  // le mobile detecte l'existence d'un contrat meme si le flag n'est pas
  // renvoye correctement par l'API.
  final contractKeys = <String>{};
  for (final c in contracts) {
    final s = c.status.toLowerCase();
    if (s == 'cancelled' || s == 'terminated') continue;
    if (c.customerId == null || c.vehicleId == null) continue;
    contractKeys.add('${c.customerId}|${c.vehicleId}');
  }
  return reservations.map((r) {
    final c = customersById[r.customerId];
    final v = vehiclesById[r.vehicleId];
    final hasLinked = (r.customerId != null && r.vehicleId != null)
        ? contractKeys.contains('${r.customerId}|${r.vehicleId}')
        : false;
    return r.withJoined(
      customerName: c?.displayName,
      vehicleLabel: v != null ? '${v.label} · ${v.registration}' : null,
      hasContract: r.hasContract || hasLinked,
    );
  }).toList();
});
