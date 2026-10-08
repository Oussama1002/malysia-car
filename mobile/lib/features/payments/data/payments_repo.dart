import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../contracts/data/contract_dto.dart';
import '../../contracts/data/contracts_repo.dart';
import '../../reservations/data/reservation_dto.dart';
import '../../reservations/data/reservations_repo.dart';
import '../../vehicles/data/vehicle_dto.dart';
import '../../vehicles/data/vehicles_repo.dart';
import 'payment_dto.dart';

class PaymentsRepo {
  PaymentsRepo(this._api);
  final ApiClient _api;

  Future<List<PaymentDto>> list(PaymentFilters f) async {
    final q = <String, dynamic>{'per_page': 100};
    if (f.search.isNotEmpty) q['search'] = f.search;
    if (f.status.isNotEmpty) q['status'] = f.status;
    if (f.method.isNotEmpty) q['payment_method'] = f.method;
    if (f.from != null) q['from'] = f.from!.toIso8601String().split('T').first;
    if (f.to != null) q['to'] = f.to!.toIso8601String().split('T').first;
    final data = await _api.getData('/payments', query: q);
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((m) =>
            PaymentDto.fromJson(m.map((k, v) => MapEntry(k.toString(), v))))
        .toList();
  }

  Future<PaymentDto> fetch(String id) async {
    final data = await _api.getData('/payments/$id');
    final m = data is Map
        ? data.map((k, v) => MapEntry(k.toString(), v))
        : <String, dynamic>{};
    return PaymentDto.fromJson(m);
  }

  Future<void> allocate(String id, List<Map<String, dynamic>> allocations) async {
    await _api.raw.post('/payments/$id/allocate', data: {
      'allocations': allocations,
    });
  }

  /// Liste les paiements d'un contrat précis (via `?contract_id=...`).
  Future<List<PaymentDto>> listForContract(String contractId) async {
    final data = await _api.getData('/payments',
        query: {'per_page': 100, 'contract_id': contractId});
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((m) =>
            PaymentDto.fromJson(m.map((k, v) => MapEntry(k.toString(), v))))
        .toList();
  }

  Future<PaymentDto> create(Map<String, dynamic> payload) async {
    final res = await _api.raw.post('/payments', data: payload);
    final body = res.data is Map && (res.data as Map).containsKey('data')
        ? (res.data as Map)['data']
        : res.data;
    final map = body is Map
        ? body.map((k, v) => MapEntry(k.toString(), v))
        : <String, dynamic>{};
    return PaymentDto.fromJson(map);
  }
}

class PaymentFilters {
  const PaymentFilters({
    this.search = '',
    this.status = '',
    this.method = '',
    this.from,
    this.to,
  });
  final String search;
  final String status;
  final String method;
  final DateTime? from;
  final DateTime? to;

  PaymentFilters copyWith({
    String? search,
    String? status,
    String? method,
    DateTime? from,
    DateTime? to,
    bool clearFrom = false,
    bool clearTo = false,
  }) =>
      PaymentFilters(
        search: search ?? this.search,
        status: status ?? this.status,
        method: method ?? this.method,
        from: clearFrom ? null : (from ?? this.from),
        to: clearTo ? null : (to ?? this.to),
      );

  @override
  bool operator ==(Object other) =>
      other is PaymentFilters &&
      other.search == search &&
      other.status == status &&
      other.method == method &&
      other.from == from &&
      other.to == to;

  @override
  int get hashCode =>
      search.hashCode ^ status.hashCode ^ method.hashCode ^ from.hashCode ^ to.hashCode;
}

final paymentsRepoProvider =
    Provider<PaymentsRepo>((ref) => PaymentsRepo(ref.watch(apiClientProvider)));

final paymentFiltersProvider =
    StateProvider<PaymentFilters>((ref) => const PaymentFilters());

final paymentsListProvider = FutureProvider<List<PaymentDto>>((ref) async {
  final f = ref.watch(paymentFiltersProvider);
  // On enrichit chaque paiement avec le libelle du vehicule : on
  // retrouve le vehicle_id via le contrat ou la reservation liee, puis
  // on resout le vehicule dans la liste flotte deja en cache. Comme ca
  // la carte paiement affiche la voiture concernee, pas juste le client.
  final results = await Future.wait([
    ref.watch(paymentsRepoProvider).list(f),
    ref.watch(contractsListProvider.future),
    ref.watch(reservationsListProvider.future),
    ref.watch(vehiclesListProvider.future),
  ]);
  final payments = results[0] as List<PaymentDto>;
  final contracts = results[1] as List<ContractDto>;
  final reservations = results[2] as List<ReservationDto>;
  final vehicles = results[3] as List<VehicleDto>;
  final vehiclesById = {for (final v in vehicles) v.id: v};
  final contractVehicleById = <String, String?>{
    for (final c in contracts) c.id: c.vehicleId,
  };
  final reservationVehicleById = <String, String?>{
    for (final r in reservations) r.id: r.vehicleId,
  };
  String? labelFromVehicle(String? vehicleId) {
    if (vehicleId == null) return null;
    final v = vehiclesById[vehicleId];
    return v == null ? null : '${v.label} · ${v.registration}';
  }

  return payments.map((p) {
    String? vid;
    if (p.contractId != null) vid = contractVehicleById[p.contractId!];
    vid ??= p.reservationId != null
        ? reservationVehicleById[p.reservationId!]
        : null;
    return p.withVehicle(labelFromVehicle(vid));
  }).toList();
});

final paymentDetailProvider = FutureProvider.family<PaymentDto, String>(
    (ref, id) => ref.watch(paymentsRepoProvider).fetch(id));

final contractPaymentsProvider =
    FutureProvider.family<List<PaymentDto>, String>(
        (ref, contractId) =>
            ref.watch(paymentsRepoProvider).listForContract(contractId));
