import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import 'sub_rental_dto.dart';

/// Repo pour les contrats de sous-location — recouvre les endpoints utilisés
/// par le web : liste filtrée, dashboard, détail, paiements, rentabilité,
/// actions (activer / retour / clôture) et ajout d'un paiement fournisseur.
class SubRentalsRepo {
  SubRentalsRepo(this._api);
  final ApiClient _api;

  Future<List<SubRentalDto>> list({
    int perPage = 100,
    String? status,
    bool dueSoon = false,
    bool overdue = false,
  }) async {
    final q = <String, dynamic>{'per_page': perPage};
    if (dueSoon) q['due_soon'] = 1;
    if (overdue) q['overdue'] = 1;
    if (status != null && status.isNotEmpty) q['status'] = status;
    final data = await _api.getData('/sub-rentals', query: q);
    if (data is! List) return const [];
    return data
        .whereType<Map<String, dynamic>>()
        .map(SubRentalDto.fromJson)
        .toList();
  }

  Future<SubRentalDashboardDto> dashboard() async {
    final data = await _api.getData('/sub-rentals/dashboard');
    final m = data is Map
        ? data.map((k, v) => MapEntry(k.toString(), v))
        : <String, dynamic>{};
    return SubRentalDashboardDto.fromJson(m);
  }

  Future<SubRentalDetailDto> fetchDetail(String id) async {
    final data = await _api.getData('/sub-rentals/$id');
    final m = data is Map
        ? data.map((k, v) => MapEntry(k.toString(), v))
        : <String, dynamic>{};
    return SubRentalDetailDto.fromJson(m);
  }

  Future<SubRentalProfitabilityDto> profitability(String id) async {
    final data = await _api.getData('/sub-rentals/$id/profitability');
    final m = data is Map
        ? data.map((k, v) => MapEntry(k.toString(), v))
        : <String, dynamic>{};
    return SubRentalProfitabilityDto.fromJson(m);
  }

  /// Les paiements renvoient `{payments, total_paid, remaining_balance,
  /// payment_status}` à plat (pas sous `data`), donc on tape l'endpoint via
  /// Dio directement.
  Future<SubRentalPaymentsPage> payments(String id) async {
    final res = await _api.raw.get('/sub-rentals/$id/payments');
    final body = res.data;
    final map = body is Map
        ? body.map((k, v) => MapEntry(k.toString(), v))
        : <String, dynamic>{};
    final list = map['payments'];
    final payments = list is List
        ? list
            .whereType<Map>()
            .map((m) => m.map((k, v) => MapEntry(k.toString(), v)))
            .map(SubRentalPaymentDto.fromJson)
            .toList()
        : <SubRentalPaymentDto>[];
    return SubRentalPaymentsPage(
      payments: payments,
      totalPaid: parseDouble(map['total_paid']) ?? 0,
      remainingBalance: parseDouble(map['remaining_balance']) ?? 0,
      paymentStatus: map['payment_status']?.toString() ?? 'unpaid',
    );
  }

  Future<void> activate(String id) async {
    await _api.raw.post('/sub-rentals/$id/activate');
  }

  Future<void> returnToSupplier(String id, Map<String, dynamic> payload) async {
    await _api.raw.post('/sub-rentals/$id/return', data: payload);
  }

  Future<void> close(String id, {bool force = false}) async {
    await _api.raw
        .post('/sub-rentals/$id/close', data: {'force_close': force});
  }

  Future<void> addPayment(String id, Map<String, dynamic> payload) async {
    await _api.raw.post('/sub-rentals/$id/payments', data: payload);
  }
}

final subRentalsRepoProvider = Provider<SubRentalsRepo>(
    (ref) => SubRentalsRepo(ref.watch(apiClientProvider)));

/// Filtres de la liste (identiques à ceux du web).
enum SubRentalFilter {
  all,
  active,
  dueSoon,
  overdue,
  draft,
  returned,
  closed,
}

final subRentalFilterProvider =
    StateProvider<SubRentalFilter>((ref) => SubRentalFilter.all);

final subRentalsListProvider = FutureProvider<List<SubRentalDto>>((ref) {
  final f = ref.watch(subRentalFilterProvider);
  final repo = ref.watch(subRentalsRepoProvider);
  switch (f) {
    case SubRentalFilter.all:
      return repo.list();
    case SubRentalFilter.active:
      return repo.list(status: 'active');
    case SubRentalFilter.dueSoon:
      return repo.list(dueSoon: true);
    case SubRentalFilter.overdue:
      return repo.list(overdue: true);
    case SubRentalFilter.draft:
      return repo.list(status: 'draft');
    case SubRentalFilter.returned:
      return repo.list(status: 'returned');
    case SubRentalFilter.closed:
      return repo.list(status: 'closed');
  }
});

final subRentalsDashboardProvider = FutureProvider<SubRentalDashboardDto>(
    (ref) => ref.watch(subRentalsRepoProvider).dashboard());

final subRentalDetailProvider =
    FutureProvider.family<SubRentalDetailDto, String>(
        (ref, id) => ref.watch(subRentalsRepoProvider).fetchDetail(id));

final subRentalPaymentsProvider =
    FutureProvider.family<SubRentalPaymentsPage, String>(
        (ref, id) => ref.watch(subRentalsRepoProvider).payments(id));

final subRentalProfitabilityProvider =
    FutureProvider.family<SubRentalProfitabilityDto, String>(
        (ref, id) => ref.watch(subRentalsRepoProvider).profitability(id));
