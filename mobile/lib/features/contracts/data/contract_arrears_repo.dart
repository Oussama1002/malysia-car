import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';

/// Dossier de contentieux lié à un contrat (`/arrears/cases?contract_id=...`).
class ArrearsCaseDto {
  const ArrearsCaseDto({
    required this.id,
    required this.status,
    this.caseNumber,
    this.contractId,
    this.customerName,
    this.totalOverdue,
    this.daysOverdue,
    this.phase,
    this.assignedTo,
    this.openedAt,
    this.closedAt,
    this.notes,
  });

  final String id;
  final String? caseNumber;
  final String? contractId;
  final String status;
  final String? customerName;
  final double? totalOverdue;
  final int? daysOverdue;
  final String? phase;
  final String? assignedTo;
  final DateTime? openedAt;
  final DateTime? closedAt;
  final String? notes;

  factory ArrearsCaseDto.fromJson(Map<String, dynamic> j) {
    final cust = j['customer'];
    String? name;
    if (cust is Map) {
      name = (cust['full_name'] ?? cust['display_name'])?.toString();
    }
    return ArrearsCaseDto(
      id: j['id']?.toString() ?? '',
      caseNumber: (j['case_number'] ?? j['reference'])?.toString(),
      contractId: j['contract_id']?.toString(),
      status: j['status']?.toString() ?? 'open',
      customerName: name ?? j['customer_name']?.toString(),
      totalOverdue: _d(j['total_overdue']) ?? _d(j['overdue_amount']),
      daysOverdue: int.tryParse(j['days_overdue']?.toString() ?? ''),
      phase: j['phase']?.toString(),
      assignedTo: j['assigned_to_name']?.toString() ?? j['assigned_to']?.toString(),
      openedAt: _date(j['opened_at']) ?? _date(j['created_at']),
      closedAt: _date(j['closed_at']),
      notes: j['notes']?.toString(),
    );
  }
}

double? _d(dynamic v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString());
}

DateTime? _date(dynamic v) {
  if (v == null) return null;
  return DateTime.tryParse(v.toString());
}

class ContractArrearsRepo {
  ContractArrearsRepo(this._api);
  final ApiClient _api;

  Future<List<ArrearsCaseDto>> list(String contractId) async {
    try {
      final data = await _api.getData('/arrears/cases',
          query: {'contract_id': contractId, 'per_page': 50});
      if (data is! List) return const [];
      return data
          .whereType<Map>()
          .map((m) => ArrearsCaseDto.fromJson(
              m.map((k, v) => MapEntry(k.toString(), v))))
          .toList();
    } catch (_) {
      return const [];
    }
  }
}

final contractArrearsRepoProvider = Provider<ContractArrearsRepo>(
    (ref) => ContractArrearsRepo(ref.watch(apiClientProvider)));

final contractArrearsProvider =
    FutureProvider.family<List<ArrearsCaseDto>, String>(
        (ref, id) => ref.watch(contractArrearsRepoProvider).list(id));

const Map<String, String> kArrearsStatusFr = {
  'open': 'Ouvert',
  'in_progress': 'En traitement',
  'escalated': 'Escaladé',
  'resolved': 'Résolu',
  'closed': 'Clos',
  'legal': 'Judiciaire',
};

const Map<String, String> kArrearsPhaseFr = {
  'amicable': 'Amiable',
  'formal_notice': 'Mise en demeure',
  'legal': 'Judiciaire',
  'enforcement': 'Exécution',
};

String arrearsStatusFr(String s) =>
    kArrearsStatusFr[s.toLowerCase()] ?? s;
String arrearsPhaseFr(String? s) =>
    s == null ? '—' : (kArrearsPhaseFr[s.toLowerCase()] ?? s);
