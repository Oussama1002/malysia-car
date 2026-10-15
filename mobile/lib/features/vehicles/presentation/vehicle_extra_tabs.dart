import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/api/api_client.dart';
import '../../../core/widgets/module_scaffold.dart';

/// Lecture-only shim que les onglets Réparations / Accidents / Historique /
/// Coûts / Assurance (polices) / Visite technique (contrôles) / Audit du
/// mobile utilisent pour atteindre la parité d'affichage avec le web
/// (`FleetVehicleDetailPage.tsx`). On ne crée pas de DTOs typés par ressource
/// — ce sont des listes d'enregistrements que l'écran rend à plat.
class _VehicleExtrasRepo {
  _VehicleExtrasRepo(this._api);
  final ApiClient _api;

  Future<List<Map<String, dynamic>>> list(String path) async {
    final data = await _api.getData(path);
    if (data is List) {
      return [
        for (final it in data)
          if (it is Map) it.map((k, v) => MapEntry(k.toString(), v)),
      ];
    }
    return const [];
  }

  Future<Map<String, dynamic>?> show(String path) async {
    final data = await _api.getData(path);
    if (data is Map) {
      return data.map((k, v) => MapEntry(k.toString(), v));
    }
    return null;
  }

  /// `/entities/{type}/{id}/audit` est paginé (data: [...], meta: {...}).
  /// Dio renvoie l'enveloppe `{"data": [...], "meta": ...}` sans la déballer
  /// via `_api.raw` : on fait l'appel directement pour récupérer le tableau.
  Future<List<Map<String, dynamic>>> audit(String entityType, String entityId,
      {int perPage = 100}) async {
    final resp = await _api.raw.get(
      '/entities/$entityType/$entityId/audit',
      queryParameters: {'per_page': perPage},
    );
    final body = resp.data;
    final list = body is Map ? body['data'] : body;
    if (list is List) {
      return [
        for (final it in list)
          if (it is Map) it.map((k, v) => MapEntry(k.toString(), v)),
      ];
    }
    return const [];
  }
}

final _extrasRepoProvider = Provider<_VehicleExtrasRepo>(
    (ref) => _VehicleExtrasRepo(ref.watch(apiClientProvider)));

final vehicleRepairsProvider =
    FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String>(
        (ref, id) => ref.watch(_extrasRepoProvider).list('/vehicles/$id/repairs'));

final vehicleAccidentsProvider =
    FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String>(
        (ref, id) =>
            ref.watch(_extrasRepoProvider).list('/vehicles/$id/accidents'));

final vehicleHistoryProvider =
    FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String>(
        (ref, id) =>
            ref.watch(_extrasRepoProvider).list('/vehicles/$id/history'));

final vehicleCostsProvider =
    FutureProvider.autoDispose.family<Map<String, dynamic>?, String>(
        (ref, id) => ref.watch(_extrasRepoProvider).show('/vehicles/$id/costs'));

final vehicleInsurancePoliciesProvider =
    FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String>(
        (ref, id) => ref
            .watch(_extrasRepoProvider)
            .list('/vehicles/$id/insurance-policies'));

final vehicleTechnicalInspectionsProvider =
    FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String>(
        (ref, id) => ref
            .watch(_extrasRepoProvider)
            .list('/vehicles/$id/technical-inspections'));

final vehicleAuditProvider =
    FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String>(
        (ref, id) => ref.watch(_extrasRepoProvider).audit('vehicle', id));

/// `/v1/maintenance/alerts` renvoie `{data: {alerts: [...]}}` (toutes
/// voitures confondues). On ne garde que celles du véhicule courant,
/// comme le web (`maintenanceVehicleAlerts`).
final vehicleMaintenanceAlertsProvider =
    FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String>(
        (ref, id) async {
  final api = ref.watch(apiClientProvider);
  final resp = await api.raw.get('/maintenance/alerts');
  final body = resp.data;
  final data = body is Map ? body['data'] : null;
  final alerts = data is Map ? data['alerts'] : null;
  if (alerts is! List) return const [];
  final out = <Map<String, dynamic>>[];
  for (final a in alerts) {
    if (a is! Map) continue;
    final m = a.map((k, v) => MapEntry(k.toString(), v));
    final veh = m['vehicle'];
    final vehId = veh is Map ? veh['id']?.toString() : null;
    if (vehId == id) out.add(m);
  }
  return out;
});

// ---------------------------------------------------------------------------
// Formatters & helpers
// ---------------------------------------------------------------------------

final _dateFmt = DateFormat('dd/MM/yyyy', 'fr');
final _dateTimeFmt = DateFormat('dd/MM/yyyy HH:mm', 'fr');
final _money = NumberFormat.decimalPattern('fr');

String _mad(num? v) => v == null ? '—' : '${_money.format(v)} MAD';

DateTime? _parseDate(dynamic v) {
  if (v == null) return null;
  return DateTime.tryParse(v.toString());
}

String _fmtDate(dynamic v) {
  final d = _parseDate(v);
  return d == null ? '—' : _dateFmt.format(d);
}

String _fmtDateTime(dynamic v) {
  final d = _parseDate(v);
  return d == null ? '—' : _dateTimeFmt.format(d);
}

num? _asNum(dynamic v) {
  if (v == null) return null;
  if (v is num) return v;
  return num.tryParse(v.toString());
}

const _repairLabels = {
  'MECANIQUE': 'Mécanique',
  'ELECTRIQUE': 'Électrique',
  'CARROSSERIE': 'Carrosserie',
  'PNEU': 'Pneu',
  'VITRE': 'Vitrage',
  'OTHER': 'Autre',
};

const _repairStatusLabels = {
  'reported': 'Déclarée',
  'in_progress': 'En cours',
  'completed': 'Terminée',
  'cancelled': 'Annulée',
};

const _accidentSeverityLabels = {
  'minor': 'Mineur',
  'major': 'Majeur',
  'total_loss': 'Perte totale',
};

const _accidentStatusLabels = {
  'declared': 'Déclaré',
  'under_review': 'En revue',
  'repaired': 'Réparé',
  'closed': 'Clôturé',
};

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

class RepairsTab extends ConsumerWidget {
  const RepairsTab({super.key, required this.vehicleId});
  final String vehicleId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(vehicleRepairsProvider(vehicleId));
    return _ListTab(
      icon: Icons.handyman_outlined,
      emptyMessage: 'Aucune réparation enregistrée.',
      async: async,
      itemBuilder: (r) {
        final type = (r['repairType'] ?? r['repair_type'])?.toString() ?? 'OTHER';
        final status = r['status']?.toString() ?? 'reported';
        return ModuleCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _repairLabels[type] ?? type,
                      style: const TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w900),
                    ),
                  ),
                  _StatusChip(
                    label: _repairStatusLabels[status] ?? status,
                    tone: _repairTone(status),
                  ),
                ],
              ),
              if ((r['description'] ?? '').toString().trim().isNotEmpty) ...[
                const SizedBox(height: 6),
                Text(r['description'].toString(),
                    style: const TextStyle(fontSize: 12.5)),
              ],
              const SizedBox(height: 8),
              ModuleKV(
                label: 'Déclarée le',
                value: _fmtDate(r['reportedAt'] ?? r['reported_at']),
              ),
              if (r['startedAt'] != null || r['started_at'] != null)
                ModuleKV(
                  label: 'Démarrée le',
                  value: _fmtDate(r['startedAt'] ?? r['started_at']),
                ),
              if (r['completedAt'] != null || r['completed_at'] != null)
                ModuleKV(
                  label: 'Terminée le',
                  value: _fmtDate(r['completedAt'] ?? r['completed_at']),
                ),
              if (r['downtimeDays'] != null || r['downtime_days'] != null)
                ModuleKV(
                  label: 'Jours immobilisé',
                  value:
                      '${r['downtimeDays'] ?? r['downtime_days']} j',
                ),
              if (r['vendorName'] != null || r['vendor_name'] != null)
                ModuleKV(
                  label: 'Prestataire',
                  value: (r['vendorName'] ?? r['vendor_name']).toString(),
                ),
              ModuleKV(
                label: 'Coût',
                value: _mad(_asNum(r['costAmount'] ?? r['cost_amount'])),
              ),
            ],
          ),
        );
      },
    );
  }

  ModuleStatusTone _repairTone(String s) => switch (s) {
        'completed' => ModuleStatusTone.ok,
        'in_progress' => ModuleStatusTone.warning,
        'cancelled' => ModuleStatusTone.neutral,
        _ => ModuleStatusTone.danger,
      };
}

class AccidentsTab extends ConsumerWidget {
  const AccidentsTab({super.key, required this.vehicleId});
  final String vehicleId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(vehicleAccidentsProvider(vehicleId));
    return _ListTab(
      icon: Icons.car_crash_outlined,
      emptyMessage: 'Aucun accident déclaré.',
      async: async,
      itemBuilder: (a) {
        final severity = a['severity']?.toString() ?? 'minor';
        final status = a['status']?.toString() ?? 'declared';
        return ModuleCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _fmtDate(a['accidentDate'] ?? a['accident_date']),
                      style: const TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w900),
                    ),
                  ),
                  _StatusChip(
                    label: _accidentSeverityLabels[severity] ?? severity,
                    tone: severity == 'total_loss'
                        ? ModuleStatusTone.danger
                        : severity == 'major'
                            ? ModuleStatusTone.warning
                            : ModuleStatusTone.neutral,
                  ),
                  const SizedBox(width: 6),
                  _StatusChip(
                    label: _accidentStatusLabels[status] ?? status,
                    tone: status == 'closed'
                        ? ModuleStatusTone.ok
                        : ModuleStatusTone.warning,
                  ),
                ],
              ),
              if ((a['location'] ?? '').toString().trim().isNotEmpty) ...[
                const SizedBox(height: 6),
                ModuleKV(
                    label: 'Lieu', value: a['location'].toString()),
              ],
              if ((a['description'] ?? '').toString().trim().isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(a['description'].toString(),
                    style: const TextStyle(fontSize: 12.5)),
              ],
              const SizedBox(height: 6),
              if (a['driverName'] != null || a['driver_name'] != null)
                ModuleKV(
                    label: 'Conducteur',
                    value: (a['driverName'] ?? a['driver_name']).toString()),
              if (a['responsibleParty'] != null ||
                  a['responsible_party'] != null)
                ModuleKV(
                    label: 'Responsable',
                    value:
                        (a['responsibleParty'] ?? a['responsible_party']).toString()),
              if (a['policeReportNumber'] != null ||
                  a['police_report_number'] != null)
                ModuleKV(
                    label: 'PV police',
                    value: (a['policeReportNumber'] ??
                            a['police_report_number'])
                        .toString()),
              if (a['insuranceClaimNumber'] != null ||
                  a['insurance_claim_number'] != null)
                ModuleKV(
                    label: 'N° sinistre',
                    value: (a['insuranceClaimNumber'] ??
                            a['insurance_claim_number'])
                        .toString()),
              ModuleKV(
                  label: 'Coût estimé',
                  value: _mad(_asNum(
                      a['estimatedDamageCost'] ?? a['estimated_damage_cost']))),
              ModuleKV(
                  label: 'Coût final',
                  value: _mad(_asNum(a['finalCost'] ?? a['final_cost']))),
            ],
          ),
        );
      },
    );
  }
}

class InsurancePoliciesTab extends ConsumerWidget {
  const InsurancePoliciesTab({super.key, required this.vehicleId});
  final String vehicleId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(vehicleInsurancePoliciesProvider(vehicleId));
    return _ListTab(
      icon: Icons.verified_user_outlined,
      emptyMessage:
          'Aucune police enregistrée. Les sinistres déclarés depuis un accident sont liés au numéro de dossier assurance.',
      async: async,
      itemBuilder: (p) {
        final status = p['status']?.toString() ?? '';
        return ModuleCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      (p['insurer_name'] ?? '—').toString(),
                      style: const TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w900),
                    ),
                  ),
                  _StatusChip(
                    label: status.isEmpty ? '—' : status,
                    tone: status == 'active'
                        ? ModuleStatusTone.ok
                        : status == 'expired'
                            ? ModuleStatusTone.danger
                            : ModuleStatusTone.neutral,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              ModuleKV(
                  label: 'N° police',
                  value: (p['policy_number'] ?? '—').toString()),
              if (p['coverage_type'] != null)
                ModuleKV(
                    label: 'Couverture',
                    value: p['coverage_type'].toString()),
              ModuleKV(
                  label: 'Validité',
                  value:
                      '${_fmtDate(p['start_date'])} → ${_fmtDate(p['end_date'])}'),
              ModuleKV(
                  label: 'Prime',
                  value: _mad(_asNum(p['premium_amount']))),
            ],
          ),
        );
      },
    );
  }
}

class TechnicalInspectionsTab extends ConsumerWidget {
  const TechnicalInspectionsTab({super.key, required this.vehicleId});
  final String vehicleId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(vehicleTechnicalInspectionsProvider(vehicleId));
    return _ListTab(
      icon: Icons.rule_outlined,
      emptyMessage: 'Aucun contrôle technique enregistré.',
      async: async,
      itemBuilder: (row) {
        final result = row['result']?.toString() ?? '';
        final defects = row['defects'];
        return ModuleCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      (row['center_name'] ?? 'Centre non renseigné').toString(),
                      style: const TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w900),
                    ),
                  ),
                  _StatusChip(
                    label: result.isEmpty ? '—' : result,
                    tone: result.toLowerCase().contains('favor')
                        ? ModuleStatusTone.ok
                        : ModuleStatusTone.warning,
                  ),
                ],
              ),
              const SizedBox(height: 8),
              ModuleKV(
                  label: 'Date du contrôle',
                  value: _fmtDate(row['inspection_date'])),
              ModuleKV(
                  label: 'Expiration', value: _fmtDate(row['expiry_date'])),
              if (row['next_due_date'] != null)
                ModuleKV(
                    label: 'Prochain contrôle',
                    value: _fmtDate(row['next_due_date'])),
              if (defects is List && defects.isNotEmpty) ...[
                const SizedBox(height: 6),
                const Text('Défauts constatés',
                    style:
                        TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
                const SizedBox(height: 4),
                for (final d in defects)
                  Padding(
                    padding: const EdgeInsets.only(left: 6, bottom: 2),
                    child: Text('• ${d.toString()}',
                        style: const TextStyle(
                            fontSize: 12, color: Color(0xFFB45309))),
                  ),
              ],
            ],
          ),
        );
      },
    );
  }
}

class HistoryTab extends ConsumerWidget {
  const HistoryTab({super.key, required this.vehicleId});
  final String vehicleId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(vehicleHistoryProvider(vehicleId));
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ModuleErrorView(message: '$e'),
      data: (items) {
        if (items.isEmpty) {
          return const ModuleEmptyView(
              icon: Icons.history,
              message: 'Aucun événement enregistré.');
        }
        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: items.length,
          itemBuilder: (_, i) {
            final e = items[i];
            final tone = _historyTone(e['tone']?.toString());
            return IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Column(
                    children: [
                      Container(
                        width: 10,
                        height: 10,
                        margin: const EdgeInsets.only(top: 6),
                        decoration:
                            BoxDecoration(color: tone, shape: BoxShape.circle),
                      ),
                      Expanded(
                        child: Container(
                            width: 2, color: const Color(0xFFE2E8F0)),
                      ),
                    ],
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: ModuleCard(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Expanded(
                                  child: Text(
                                    (e['title'] ?? '—').toString(),
                                    style: const TextStyle(
                                        fontSize: 13.5,
                                        fontWeight: FontWeight.w800),
                                  ),
                                ),
                                if (e['cost'] != null)
                                  Text(_mad(_asNum(e['cost'])),
                                      style: const TextStyle(
                                          fontSize: 13,
                                          fontWeight: FontWeight.w900)),
                              ],
                            ),
                            if (e['meta'] != null)
                              Padding(
                                padding: const EdgeInsets.only(top: 2),
                                child: Text(e['meta'].toString(),
                                    style: const TextStyle(
                                        fontSize: 11.5,
                                        color: Colors.black54)),
                              ),
                            Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: Text(
                                _fmtDateTime(e['at']),
                                style: const TextStyle(
                                    fontSize: 10.5, color: Colors.black45),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Color _historyTone(String? tone) => switch (tone) {
        'success' => const Color(0xFF059669),
        'warning' => const Color(0xFFD97706),
        'danger' => const Color(0xFFDC2626),
        'info' => const Color(0xFF2563EB),
        _ => const Color(0xFF94A3B8),
      };
}

class CostsTab extends ConsumerWidget {
  const CostsTab({super.key, required this.vehicleId});
  final String vehicleId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(vehicleCostsProvider(vehicleId));
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ModuleErrorView(message: '$e'),
      data: (data) {
        if (data == null) {
          return const ModuleEmptyView(
              icon: Icons.analytics_outlined,
              message: 'Aucune donnée de rentabilité disponible.');
        }
        final costs = data['costs'] is Map
            ? (data['costs'] as Map).map((k, v) => MapEntry(k.toString(), v))
            : <String, dynamic>{};
        final total = _asNum(costs['total']) ?? 0;
        final revenue = _asNum(data['revenue']) ?? 0;
        final margin = _asNum(data['grossMargin']) ?? 0;
        final marginPct = _asNum(data['marginPct']);
        final downtimeDays = _asNum(data['downtimeDays']) ?? 0;
        final rows = <(String, num)>[
          ('Entretien', _asNum(costs['maintenance']) ?? 0),
          ('Réparations', _asNum(costs['repairs']) ?? 0),
          ('Accidents', _asNum(costs['accidents']) ?? 0),
          ('Assurance', _asNum(costs['insurance']) ?? 0),
          ('Taxes / vignette', _asNum(costs['tax']) ?? 0),
          ('GPS', _asNum(costs['gps']) ?? 0),
        ];
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // KPIs
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
              childAspectRatio: 1.6,
              children: [
                _Kpi(
                    label: 'Revenus générés',
                    value: _mad(revenue),
                    color: const Color(0xFF059669)),
                _Kpi(
                    label: 'Coût total',
                    value: _mad(total),
                    color: const Color(0xFFDC2626)),
                _Kpi(
                    label: 'Marge brute',
                    value: _mad(margin),
                    sub: marginPct != null ? '${marginPct}% de marge' : null,
                    color: margin >= 0
                        ? const Color(0xFF059669)
                        : const Color(0xFFDC2626)),
                _Kpi(
                    label: 'Jours immobilisé',
                    value: '$downtimeDays j',
                    color: const Color(0xFFD97706)),
              ],
            ),
            const SizedBox(height: 12),
            ModuleCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Détail des coûts',
                      style: TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 10),
                  for (final r in rows) ...[
                    Row(
                      children: [
                        Expanded(
                          child: Text(r.$1,
                              style: const TextStyle(
                                  fontSize: 12.5, color: Colors.black54)),
                        ),
                        Text(_mad(r.$2),
                            style: const TextStyle(
                                fontSize: 12.5,
                                fontWeight: FontWeight.w800)),
                      ],
                    ),
                    const SizedBox(height: 4),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(4),
                      child: LinearProgressIndicator(
                        value: total > 0 ? (r.$2 / total).toDouble() : 0,
                        minHeight: 6,
                        backgroundColor: const Color(0xFFEEF0FB),
                        valueColor: const AlwaysStoppedAnimation<Color>(
                            Color(0xFFB8933F)),
                      ),
                    ),
                    const SizedBox(height: 10),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 12),
            ModuleCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Valeur comptable',
                      style: TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 10),
                  ModuleKV(
                      label: "Coût d'acquisition",
                      value: _mad(_asNum(data['purchaseCost']))),
                  ModuleKV(
                      label: 'Valeur livre',
                      value: _mad(_asNum(data['bookValue']))),
                  ModuleKV(
                      label: 'Contrats liés',
                      value: '${_asNum(data['contractsCount']) ?? 0} contrat(s)'),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Audit — parité avec `EntityAuditTimeline.tsx` du web ERP
// ---------------------------------------------------------------------------

const _auditHiddenFields = {
  'id',
  'company_id',
  'branch_id',
  'created_at',
  'updated_at',
  'deleted_at',
  'sha256',
  'storage_path',
  'disk',
  'password',
  'remember_token',
  'two_factor_secret',
};

const _auditFieldLabels = {
  'status': 'Statut',
  'customer_id': 'Client',
  'vehicle_id': 'Véhicule',
  'contract_id': 'Contrat',
  'reservation_id': 'Réservation',
  'document_id': 'Document',
  'invoice_id': 'Facture',
  'user_id': 'Utilisateur',
  'assigned_user_id': 'Assigné à',
  'start_date': 'Date de début',
  'end_date': 'Date de fin',
  'desired_start_at': 'Début souhaité',
  'desired_end_at': 'Fin souhaitée',
  'activation_date': "Date d'activation",
  'closure_date': 'Date de clôture',
  'signed_at': 'Signé le',
  'terminated_reason': 'Motif résiliation',
  'monthly_payment': 'Mensualité',
  'base_amount': 'Montant de base',
  'down_payment_amount': 'Apport',
  'deposit_amount': 'Caution',
  'duration_months': 'Durée (mois)',
  'allowed_km': 'Km autorisés',
  'excess_km_rate': 'Tarif km excédent',
  'payment_method': 'Mode de paiement',
  'payment_terms': 'Conditions paiement',
  'bank_reference': 'Réf. virement',
  'cheque_number': 'N° chèque',
  'notes': 'Notes',
  'legal_status': 'Statut légal',
  'signature_status': 'Statut signature',
  'estimated_price': 'Prix estimé',
  'reservation_type': 'Type réservation',
  'handover_type': 'Type remise',
  'fuel_level': 'Niveau carburant',
  'odometer': 'Kilométrage',
  'condition_notes': 'État / observations',
  'daily_rental_price': 'Prix location / jour',
  'brand': 'Marque',
  'model': 'Modèle',
  'plate_number': 'Immatriculation',
  'year': 'Année',
  'color': 'Couleur',
  'fuel_type': 'Carburant',
  'transmission': 'Transmission',
  'mileage': 'Kilométrage',
  'seats': 'Nombre de places',
  'category': 'Catégorie',
  'availability_status': 'Disponibilité',
  'ownership': 'Propriété',
  'first_registration_date': "Date de 1re mise en circulation",
};

const _auditValueTranslations = {
  'draft': 'Brouillon',
  'pending': 'En attente',
  'approved': 'Approuvé',
  'active': 'Actif',
  'inactive': 'Inactif',
  'completed': 'Terminé',
  'cancelled': 'Annulé',
  'rejected': 'Rejeté',
  'expired': 'Expiré',
  'terminated': 'Résilié',
  'closed': 'Clôturé',
  'suspended': 'Suspendu',
  'blocked': 'Bloqué',
  'reserved': 'Réservé',
  'confirmed': 'Confirmé',
  'available': 'Disponible',
  'in_use': 'Loué',
  'rented': 'Loué',
  'maintenance': 'Maintenance',
  'repair': 'Réparation',
  'immobilized': 'Immobilisé',
  'sold': 'Vendu',
  'scrapped': 'Rebut',
  'true': 'Oui',
  'false': 'Non',
  '1': 'Oui',
  '0': 'Non',
  'owned': 'Propriété',
  'leased': 'Loué',
  'sub_rented': 'Sous-location',
  'virement': 'Virement',
  'cheque': 'Chèque',
  'espece': 'Espèce',
  'cash': 'Espèce',
  'carte': 'Carte bancaire',
  'bank_transfer': 'Virement bancaire',
};

final _auditUuidRe = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    caseSensitive: false);
final _auditIsoDateRe = RegExp(r'^\d{4}-\d{2}-\d{2}(T[\d:.Z+\-]+)?$');
final _auditHexRe = RegExp(r'^[0-9a-f]{32,}$', caseSensitive: false);

String _auditFieldLabel(String key) {
  return _auditFieldLabels[key] ??
      key
          .replaceAll('_', ' ')
          .split(' ')
          .where((s) => s.isNotEmpty)
          .map((s) => s[0].toUpperCase() + s.substring(1))
          .join(' ');
}

String _auditUuidPrefix(String key) {
  final k = key.toLowerCase();
  if (k.contains('customer')) return 'CLT';
  if (k.contains('vehicle')) return 'VHL';
  if (k.contains('contract')) return 'CTR';
  if (k.contains('reservation')) return 'RSV';
  if (k.contains('invoice')) return 'INV';
  if (k.contains('document')) return 'DOC';
  if (k.contains('user')) return 'USR';
  if (k.contains('company')) return 'CMP';
  if (k.contains('branch')) return 'BRN';
  return key.replaceAll(RegExp(r'_id$'), '').toUpperCase().substring(
      0, key.replaceAll(RegExp(r'_id$'), '').length.clamp(0, 3));
}

String _auditFormatValue(String key, dynamic raw) {
  if (raw == null || raw == '') return '—';
  final s = raw is Map || raw is List ? raw.toString() : raw.toString();
  final trimmed = s.trim();
  if (_auditUuidRe.hasMatch(trimmed)) {
    return '${_auditUuidPrefix(key)}-${trimmed.replaceAll('-', '').substring(0, 8).toUpperCase()}';
  }
  if (_auditIsoDateRe.hasMatch(trimmed)) {
    final d = DateTime.tryParse(trimmed);
    if (d != null) {
      return trimmed.contains('T') &&
              !trimmed.endsWith('T00:00:00.000000Z') &&
              !trimmed.endsWith('T00:00:00Z')
          ? _dateTimeFmt.format(d)
          : _dateFmt.format(d);
    }
  }
  if (_auditHexRe.hasMatch(trimmed) && trimmed.length > 20) {
    return '${trimmed.substring(0, 12)}…';
  }
  final lower = trimmed.toLowerCase();
  return _auditValueTranslations[trimmed] ??
      _auditValueTranslations[lower] ??
      trimmed;
}

String _auditComparable(dynamic v) {
  if (v == null) return '';
  if (v is Map || v is List) return v.toString();
  return v.toString();
}

class _AuditDiff {
  _AuditDiff(this.label, this.before, this.after);
  final String label;
  final String before;
  final String after;
}

List<_AuditDiff> _auditSummarize(dynamic before, dynamic after) {
  final b = before is Map ? before.cast<String, dynamic>() : <String, dynamic>{};
  final a = after is Map ? after.cast<String, dynamic>() : <String, dynamic>{};
  final keys = <String>{...b.keys, ...a.keys};
  final out = <_AuditDiff>[];
  for (final k in keys) {
    if (_auditHiddenFields.contains(k)) continue;
    final rb = _auditComparable(b[k]);
    final ra = _auditComparable(a[k]);
    if (rb == ra) continue;
    out.add(_AuditDiff(
      _auditFieldLabel(k),
      _auditFormatValue(k, b[k]),
      _auditFormatValue(k, a[k]),
    ));
    if (out.length >= 10) break;
  }
  return out;
}

class AuditTab extends ConsumerWidget {
  const AuditTab({super.key, required this.vehicleId});
  final String vehicleId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(vehicleAuditProvider(vehicleId));
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ModuleErrorView(message: '$e'),
      data: (logs) {
        if (logs.isEmpty) {
          return const ModuleEmptyView(
              icon: Icons.policy_outlined,
              message: "Aucune entrée d'audit pour ce véhicule.");
        }
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: logs.length,
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (_, i) => _AuditCard(log: logs[i]),
        );
      },
    );
  }
}

class _AuditCard extends StatelessWidget {
  const _AuditCard({required this.log});
  final Map<String, dynamic> log;

  @override
  Widget build(BuildContext context) {
    final actionLabel =
        (log['action_label'] ?? log['action'] ?? '—').toString();
    final actorName =
        (log['actor_name'] ?? log['actor_email'] ?? 'Système').toString();
    final ip = log['ip_address']?.toString();
    final legal = log['legal_significance'] == true;
    final occurredAt = log['occurred_at'] ?? log['created_at'];
    final diffs = _auditSummarize(log['before_data'], log['after_data']);

    return ModuleCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  actionLabel,
                  style: const TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w800),
                ),
              ),
              Text(
                _fmtDateTime(occurredAt),
                style: const TextStyle(
                    fontSize: 10,
                    letterSpacing: 0.4,
                    color: Colors.black45,
                    fontWeight: FontWeight.w700),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            spacing: 6,
            children: [
              Text(
                ip != null && ip.isNotEmpty ? '$actorName · $ip' : actorName,
                style: const TextStyle(fontSize: 11, color: Colors.black54),
              ),
              if (legal)
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF3C7),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Text(
                    'LÉGAL',
                    style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0.4,
                        color: Color(0xFF92400E)),
                  ),
                ),
            ],
          ),
          if (diffs.isNotEmpty) ...[
            const SizedBox(height: 8),
            Theme(
              data: Theme.of(context)
                  .copyWith(dividerColor: Colors.transparent),
              child: ExpansionTile(
                tilePadding: EdgeInsets.zero,
                childrenPadding: EdgeInsets.zero,
                dense: true,
                visualDensity: VisualDensity.compact,
                title: Text(
                  'Voir les changements (${diffs.length})',
                  style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF4F46E5)),
                ),
                children: [_AuditDiffTable(diffs: diffs)],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _AuditDiffTable extends StatelessWidget {
  const _AuditDiffTable({required this.diffs});
  final List<_AuditDiff> diffs;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(vertical: 4),
          decoration: const BoxDecoration(
            border: Border(
                bottom: BorderSide(color: Color(0xFFF1F5F9), width: 1)),
          ),
          child: Row(
            children: const [
              Expanded(
                child: Text('Champ',
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: Colors.black38)),
              ),
              Expanded(
                child: Text('Avant',
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: Colors.black38)),
              ),
              Expanded(
                child: Text('Après',
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        color: Colors.black38)),
              ),
            ],
          ),
        ),
        for (final d in diffs)
          Container(
            padding: const EdgeInsets.symmetric(vertical: 4),
            decoration: const BoxDecoration(
              border: Border(
                  bottom: BorderSide(color: Color(0xFFF8FAFC), width: 1)),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Text(d.label,
                      style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF475569))),
                ),
                Expanded(
                  child: Text(d.before,
                      style: const TextStyle(
                          fontSize: 11,
                          fontFamily: 'monospace',
                          color: Color(0xFF94A3B8))),
                ),
                Expanded(
                  child: Text(d.after,
                      style: const TextStyle(
                          fontSize: 11,
                          fontFamily: 'monospace',
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF1E293B))),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

class _ListTab extends StatelessWidget {
  const _ListTab({
    required this.icon,
    required this.emptyMessage,
    required this.async,
    required this.itemBuilder,
  });

  final IconData icon;
  final String emptyMessage;
  final AsyncValue<List<Map<String, dynamic>>> async;
  final Widget Function(Map<String, dynamic> row) itemBuilder;

  @override
  Widget build(BuildContext context) {
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ModuleErrorView(message: '$e'),
      data: (rows) {
        if (rows.isEmpty) {
          return ModuleEmptyView(icon: icon, message: emptyMessage);
        }
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: rows.length,
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (_, i) => itemBuilder(rows[i]),
        );
      },
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label, required this.tone});
  final String label;
  final ModuleStatusTone tone;

  @override
  Widget build(BuildContext context) {
    return ModuleStatusChip(label: label, tone: tone);
  }
}

/// Bannière « Alertes automatiques » affichée au-dessus des tabs du détail
/// véhicule, identique à celle du web : agrège les alertes compliance
/// (expédiées par le /vehicles/{id} dans `complianceAlerts`) et les alertes
/// de maintenance (filtrées depuis `/maintenance/alerts`) en une seule liste
/// avec chip de sévérité et horodatage.
class VehicleAlertsBanner extends ConsumerWidget {
  const VehicleAlertsBanner({
    super.key,
    required this.vehicleId,
    required this.complianceAlerts,
  });
  final String vehicleId;
  final List<Map<String, dynamic>> complianceAlerts;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final maintAsync =
        ref.watch(vehicleMaintenanceAlertsProvider(vehicleId));
    final maint = maintAsync.valueOrNull ?? const <Map<String, dynamic>>[];
    final alerts = <_Alert>[
      for (final a in maint)
        _Alert(
          id: a['id']?.toString() ?? '',
          source: 'maintenance',
          title: a['title']?.toString() ?? 'Alerte maintenance',
          description: a['description']?.toString(),
          severity: a['severity']?.toString(),
          triggeredAt: _parseDate(a['triggeredAt'] ?? a['triggered_at']),
        ),
      for (final a in complianceAlerts)
        _Alert(
          id: a['id']?.toString() ?? '',
          source: 'compliance',
          title: a['title']?.toString() ?? 'Alerte conformité',
          description:
              (a['description'] ?? a['message'])?.toString(),
          severity: a['severity']?.toString(),
          triggeredAt: _parseDate(
              a['triggered_at'] ?? a['triggeredAt'] ?? a['created_at']),
        ),
    ];
    if (alerts.isEmpty) return const SizedBox.shrink();
    final shown = alerts.take(6).toList();
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFEF2F2),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFFCA5A5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.notifications_active_outlined,
                  size: 16, color: Color(0xFF991B1B)),
              const SizedBox(width: 6),
              const Expanded(
                child: Text('Alertes automatiques',
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w900,
                        color: Color(0xFF991B1B))),
              ),
              Text(
                '${alerts.length} alerte${alerts.length > 1 ? 's' : ''}',
                style: const TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFFB91C1C)),
              ),
            ],
          ),
          const SizedBox(height: 8),
          for (final a in shown) ...[
            _AlertTile(alert: a),
            if (a != shown.last) const SizedBox(height: 6),
          ],
        ],
      ),
    );
  }
}

class _Alert {
  _Alert({
    required this.id,
    required this.source,
    required this.title,
    this.description,
    this.severity,
    this.triggeredAt,
  });
  final String id;
  final String source;
  final String title;
  final String? description;
  final String? severity;
  final DateTime? triggeredAt;
}

class _AlertTile extends StatelessWidget {
  const _AlertTile({required this.alert});
  final _Alert alert;

  @override
  Widget build(BuildContext context) {
    final sev = (alert.severity ?? '').toLowerCase();
    final (sevBg, sevFg, sevLabel) = switch (sev) {
      'critical' => (const Color(0xFFDC2626), Colors.white, 'CRITIQUE'),
      'high' => (const Color(0xFFFEE2E2), const Color(0xFF991B1B), 'ÉLEVÉE'),
      'normal' =>
        (const Color(0xFFFEF3C7), const Color(0xFF92400E), 'NORMALE'),
      'low' => (const Color(0xFFF1F5F9), const Color(0xFF475569), 'FAIBLE'),
      _ => (const Color(0xFFF1F5F9), const Color(0xFF475569), '—'),
    };
    final when = alert.triggeredAt == null
        ? null
        : _dateTimeFmt.format(alert.triggeredAt!);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFFCA5A5)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(alert.title,
                    style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                        color: Color(0xFF7F1D1D))),
              ),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: sevBg,
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(sevLabel,
                    style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 0.6,
                        color: sevFg)),
              ),
            ],
          ),
          if (alert.description != null &&
              alert.description!.trim().isNotEmpty) ...[
            const SizedBox(height: 3),
            Text(alert.description!,
                style:
                    const TextStyle(fontSize: 11, color: Colors.black87)),
          ],
          const SizedBox(height: 4),
          Row(
            children: [
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 1.5),
                decoration: BoxDecoration(
                  color: alert.source == 'maintenance'
                      ? const Color(0xFFE0E7FF)
                      : const Color(0xFFFFEDD5),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  alert.source == 'maintenance'
                      ? 'Maintenance'
                      : 'Conformité',
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    color: alert.source == 'maintenance'
                        ? const Color(0xFF3730A3)
                        : const Color(0xFF9A3412),
                  ),
                ),
              ),
              if (when != null) ...[
                const SizedBox(width: 8),
                Text(when,
                    style: const TextStyle(
                        fontSize: 10, color: Colors.black45)),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

class _Kpi extends StatelessWidget {
  const _Kpi({
    required this.label,
    required this.value,
    required this.color,
    this.sub,
  });

  final String label;
  final String value;
  final String? sub;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(label.toUpperCase(),
              style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                  color: Colors.black45,
                  letterSpacing: 0.8)),
          const SizedBox(height: 4),
          Text(value,
              style: TextStyle(
                  fontSize: 16, fontWeight: FontWeight.w900, color: color)),
          if (sub != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(sub!,
                  style: const TextStyle(fontSize: 10, color: Colors.black54)),
            ),
        ],
      ),
    );
  }
}
