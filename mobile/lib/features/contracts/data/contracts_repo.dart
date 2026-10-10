import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../customers/data/customer_dto.dart';
import '../../customers/data/customers_repo.dart';
import '../../vehicles/data/vehicle_dto.dart';
import '../../vehicles/data/vehicles_repo.dart';
import 'contract_detail_dto.dart';
import 'contract_dto.dart';

class ContractsRepo {
  ContractsRepo(this._api);
  final ApiClient _api;

  Future<List<ContractDto>> list({
    int perPage = 100,
    String? type,
    String? status,
  }) async {
    final query = <String, dynamic>{'per_page': perPage};
    if (type != null && type.isNotEmpty) query['type'] = type;
    if (status != null && status.isNotEmpty) query['status'] = status;
    final data = await _api.getData('/contracts', query: query);
    if (data is! List) return const [];
    return data
        .whereType<Map<String, dynamic>>()
        .map(ContractDto.fromJson)
        .toList();
  }

  Future<ContractDetailDto> fetchDetail(String id) async {
    // Le serveur renvoie {contract: {...}, history: [...], linked_reservation_id: ...}
    // — on prend la fiche sous `contract` ET on garde l'`history` métier
    // (changements de statut, actions clés) pour l'onglet Historique, comme
    // sur le web qui lit cette même liste depuis la même enveloppe.
    final data = await _api.getData('/contracts/$id');
    final envelope = data is Map
        ? data.map((k, v) => MapEntry(k.toString(), v))
        : <String, dynamic>{};
    final rawContract = envelope['contract'] ?? envelope;
    final contractMap = rawContract is Map
        ? rawContract.map((k, v) => MapEntry(k.toString(), v))
        : <String, dynamic>{};
    final rawHistory = envelope['history'];
    final history = rawHistory is List
        ? rawHistory
            .whereType<Map>()
            .map((m) => m.map((k, v) => MapEntry(k.toString(), v)))
            .map(ContractHistoryEntryDto.fromJson)
            .toList()
        : <ContractHistoryEntryDto>[];
    return ContractDetailDto.fromJson(contractMap).withHistory(history);
  }

  Future<List<ContractInstallmentDto>> fetchInstallments(String id) async {
    try {
      final data = await _api.getData('/contracts/$id/installments');
      if (data is! List) return const [];
      return data
          .whereType<Map<String, dynamic>>()
          .map(ContractInstallmentDto.fromJson)
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// Audit log complet d'une entité (contrat ici) — même source que la
  /// `EntityAuditTimeline` du web, qui tape `/entities/{type}/{id}/audit`.
  /// L'ancien `fetchAudit` tapait `/contracts/{id}/audit`, route qui n'existe
  /// pas côté backend — d'où l'historique vide en permanence sur mobile.
  Future<List<EntityAuditEntryDto>> fetchEntityAudit(String id) async {
    try {
      final data =
          await _api.getData('/entities/contract/$id/audit', query: {
        'per_page': 100,
      });
      if (data is! List) return const [];
      return data
          .whereType<Map<String, dynamic>>()
          .map(EntityAuditEntryDto.fromJson)
          .toList();
    } catch (_) {
      return const [];
    }
  }

  /// Les transitions se font via trois endpoints dédiés :
  /// `approve` (draft → signed), `activate` (signed → active),
  /// `terminate` (active → terminated).
  Future<void> changeStatus(String id, String status) async {
    final action = switch (status) {
      'signed' || 'approved' => 'approve',
      'active' || 'activate' => 'activate',
      'terminated' || 'closed' => 'terminate',
      _ => throw ArgumentError('Transition non supportée: $status'),
    };
    await _api.raw.post('/contracts/$id/$action');
  }
}

final contractsRepoProvider = Provider<ContractsRepo>(
    (ref) => ContractsRepo(ref.watch(apiClientProvider)));

/// Filtres partagés par la liste et le dropdown d'actualisation.
class ContractListFilters {
  const ContractListFilters({this.type = '', this.status = ''});
  final String type;
  final String status;

  ContractListFilters copyWith({String? type, String? status}) {
    return ContractListFilters(
      type: type ?? this.type,
      status: status ?? this.status,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is ContractListFilters && other.type == type && other.status == status;

  @override
  int get hashCode => type.hashCode ^ status.hashCode;
}

final contractListFiltersProvider = StateProvider<ContractListFilters>(
    (ref) => const ContractListFilters());

final contractsListProvider = FutureProvider<List<ContractDto>>((ref) async {
  final f = ref.watch(contractListFiltersProvider);
  // On enrichit chaque contrat avec le nom du client et le libellé du
  // véhicule à partir des listes déjà en cache. Comme ça, même quand
  // `ContractResource` renvoie `clientName: null` (relation customer non
  // chargée), on affiche quand même les bonnes infos.
  final results = await Future.wait([
    ref
        .watch(contractsRepoProvider)
        .list(type: f.type, status: f.status),
    ref.watch(customersListProvider.future),
    ref.watch(vehiclesListProvider.future),
  ]);
  final contracts = results[0] as List<ContractDto>;
  final customers = results[1] as List<CustomerDto>;
  final vehicles = results[2] as List<VehicleDto>;
  final customersById = {for (final c in customers) c.id: c};
  final vehiclesById = {for (final v in vehicles) v.id: v};
  return contracts.map((c) {
    final cust = customersById[c.customerId];
    final veh = vehiclesById[c.vehicleId];
    return c.withJoined(
      customerName: (c.customerName == null || c.customerName!.isEmpty)
          ? cust?.displayName
          : c.customerName,
      vehicleLabel: (c.vehicleLabel == null || c.vehicleLabel!.isEmpty) &&
              veh != null
          ? '${veh.label} · ${veh.registration}'
          : c.vehicleLabel,
    );
  }).toList();
});

final contractDetailProvider =
    FutureProvider.family<ContractDetailDto, String>((ref, id) async {
  final results = await Future.wait([
    ref.watch(contractsRepoProvider).fetchDetail(id),
    ref.watch(customersListProvider.future),
    ref.watch(vehiclesListProvider.future),
  ]);
  final detail = results[0] as ContractDetailDto;
  final customers = results[1] as List<CustomerDto>;
  final vehicles = results[2] as List<VehicleDto>;
  final cust = detail.contract.customerId != null
      ? customers.where((c) => c.id == detail.contract.customerId).firstOrNull
      : null;
  final veh = detail.contract.vehicleId != null
      ? vehicles.where((v) => v.id == detail.contract.vehicleId).firstOrNull
      : null;
  final enrichedContract = detail.contract.withJoined(
    customerName:
        (detail.contract.customerName == null ||
                detail.contract.customerName!.isEmpty)
            ? cust?.displayName
            : detail.contract.customerName,
    vehicleLabel:
        (detail.contract.vehicleLabel == null ||
                    detail.contract.vehicleLabel!.isEmpty) &&
                veh != null
            ? '${veh.label} · ${veh.registration}'
            : detail.contract.vehicleLabel,
  );
  return ContractDetailDto(
    contract: enrichedContract,
    monthlyAmount: detail.monthlyAmount,
    deposit: detail.deposit,
    firstRent: detail.firstRent,
    residualValue: detail.residualValue,
    rate: detail.rate,
    durationMonths: detail.durationMonths,
    kmPerYear: detail.kmPerYear,
    signatureStatus: detail.signatureStatus,
    paymentStatus: detail.paymentStatus,
    clientPhone: detail.clientPhone,
    clientEmail: detail.clientEmail,
    notes: detail.notes,
    paymentMethod: detail.paymentMethod,
    expectedPaymentDay: detail.expectedPaymentDay,
    paymentTerms: detail.paymentTerms,
    bankReference: detail.bankReference,
    chequeNumber: detail.chequeNumber,
    history: detail.history,
  );
});

final contractInstallmentsProvider =
    FutureProvider.family<List<ContractInstallmentDto>, String>(
        (ref, id) => ref.watch(contractsRepoProvider).fetchInstallments(id));

/// Audit log (actions utilisateur) — alimente la section « Audit & traçabilité »
/// de l'onglet Historique.
final contractEntityAuditProvider =
    FutureProvider.family<List<EntityAuditEntryDto>, String>(
        (ref, id) => ref.watch(contractsRepoProvider).fetchEntityAudit(id));
