import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/config/app_config.dart';
import '../../../core/widgets/module_scaffold.dart';
import '../../documents/data/entity_documents_repo.dart';
import '../../documents/presentation/document_viewer_screen.dart';
import '../data/vehicle_detail_dto.dart';
import '../data/vehicle_dto.dart';
import '../data/vehicles_repo.dart';
import 'new_maintenance_screen.dart';
import 'new_movement_screen.dart';

/// Fiche véhicule — même structure que la page web (`FleetVehicleDetailPage`) :
/// 12 onglets dans l'ordre Vue générale, Identité, Mouvements, Entretien,
/// Réparations, Accidents, Assurance, Visite technique, Historique, Coûts,
/// Documents, Audit.
class VehicleDetailScreen extends ConsumerStatefulWidget {
  const VehicleDetailScreen({super.key, required this.id});
  final String id;

  @override
  ConsumerState<VehicleDetailScreen> createState() =>
      _VehicleDetailScreenState();
}

class _VehicleDetailScreenState extends ConsumerState<VehicleDetailScreen>
    with TickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 12, vsync: this);

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(vehicleDetailProvider(widget.id));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Véhicule'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(vehicleDetailProvider(widget.id)),
          ),
        ],
      ),
      body: ModuleBackground(
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ModuleErrorView(message: '$e'),
          data: (detail) {
            return Column(
              children: [
                _HeaderCard(detail: detail),
                TabBar(
                  controller: _tabs,
                  isScrollable: true,
                  tabAlignment: TabAlignment.start,
                  labelColor: const Color(0xFF4F46E5),
                  unselectedLabelColor: Colors.black54,
                  indicatorColor: const Color(0xFF4F46E5),
                  labelStyle: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 13),
                  tabs: [
                    const Tab(text: 'Vue générale'),
                    const Tab(text: 'Identité'),
                    Tab(text: 'Mouvements (${detail.movements.length})'),
                    Tab(text: 'Entretien (${detail.maintenanceEvents.length})'),
                    const Tab(text: 'Réparations'),
                    const Tab(text: 'Accidents'),
                    const Tab(text: 'Assurance'),
                    const Tab(text: 'Visite technique'),
                    const Tab(text: 'Historique'),
                    const Tab(text: 'Coûts & Rentabilité'),
                    const Tab(text: 'Documents'),
                    const Tab(text: 'Audit'),
                  ],
                ),
                Expanded(
                  child: TabBarView(
                    controller: _tabs,
                    children: [
                      _OverviewTab(detail: detail),
                      _IdentityTab(v: detail.vehicle),
                      _MovementsTab(
                        detail: detail,
                        onAdd: () => Navigator.of(context)
                            .push(MaterialPageRoute(
                              builder: (_) => NewMovementScreen(
                                vehicleId: detail.vehicle.id,
                                lastOdometer: _lastOdometer(detail),
                              ),
                            ))
                            .then((added) {
                          if (added == true) {
                            ref.invalidate(vehicleDetailProvider(widget.id));
                          }
                        }),
                      ),
                      _MaintenanceTab(
                        events: detail.maintenanceEvents,
                        onAdd: () => Navigator.of(context)
                            .push(MaterialPageRoute(
                              builder: (_) => NewMaintenanceScreen(
                                vehicleId: detail.vehicle.id,
                              ),
                            ))
                            .then((added) {
                          if (added == true) {
                            ref.invalidate(vehicleDetailProvider(widget.id));
                          }
                        }),
                      ),
                      const _StubTab(
                          icon: Icons.handyman_outlined,
                          text:
                              'Historique des réparations — bientôt disponible.'),
                      const _StubTab(
                          icon: Icons.car_crash_outlined,
                          text: 'Accidents déclarés — bientôt disponible.'),
                      _InsuranceTab(v: detail.vehicle),
                      _TechControlTab(v: detail.vehicle),
                      const _StubTab(
                          icon: Icons.history,
                          text: 'Historique complet — bientôt disponible.'),
                      _CostsTab(v: detail.vehicle),
                      _VehicleDocumentsTab(vehicleId: widget.id),
                      const _StubTab(
                          icon: Icons.policy_outlined,
                          text:
                              'Journal d\'audit — bientôt disponible depuis l\'onglet Audit.'),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  int? _lastOdometer(VehicleDetailDto d) {
    for (final m in d.movements) {
      if (m.odometerKm != null) return m.odometerKm;
    }
    if (d.odometerReadings.isNotEmpty) return d.odometerReadings.first.readingKm;
    return d.vehicle.mileageKm;
  }
}

/// En-tête commun à tous les onglets.
class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.detail});
  final VehicleDetailDto detail;

  @override
  Widget build(BuildContext context) {
    final v = detail.vehicle;
    final base = AppConfig.apiBaseUrl.replaceAll('/api/v1', '');
    final photo = v.photoUrl != null && v.photoUrl!.startsWith('/')
        ? '$base${v.photoUrl}'
        : v.photoUrl;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
      child: ModuleCard(
        child: Row(
          children: [
            Container(
              width: 72,
              height: 72,
              decoration: BoxDecoration(
                color: const Color(0xFFEEF0FB),
                borderRadius: BorderRadius.circular(14),
              ),
              clipBehavior: Clip.antiAlias,
              child: photo != null
                  ? Image.network(photo,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => const Center(
                          child: Icon(Icons.directions_car,
                              color: Colors.black38)))
                  : const Center(
                      child: Icon(Icons.directions_car,
                          color: Colors.black38)),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(v.registration,
                      style: const TextStyle(
                          fontFamily: 'monospace',
                          color: Colors.black45,
                          fontSize: 12,
                          fontWeight: FontWeight.w800)),
                  Text(v.label,
                      style: const TextStyle(
                          fontSize: 18, fontWeight: FontWeight.w900)),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      ModuleStatusChip(
                        label: vehicleStatusFr(v.status),
                        tone: _tone(v.status),
                      ),
                      if (v.isSubRented) ...[
                        const SizedBox(width: 6),
                        const ModuleStatusChip(
                            label: 'SL', tone: ModuleStatusTone.neutral),
                      ],
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  ModuleStatusTone _tone(String s) {
    return switch (s.toUpperCase()) {
      'AVAILABLE' => ModuleStatusTone.ok,
      'RENTED' || 'RESERVED' => ModuleStatusTone.warning,
      'MAINTENANCE' || 'IN_REPAIR' => ModuleStatusTone.danger,
      _ => ModuleStatusTone.neutral,
    };
  }
}

class _OverviewTab extends StatelessWidget {
  const _OverviewTab({required this.detail});
  final VehicleDetailDto detail;

  @override
  Widget build(BuildContext context) {
    final v = detail.vehicle;
    final money = NumberFormat.currency(locale: 'fr', symbol: 'MAD');
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (detail.currentCustomerName != null ||
            detail.currentContractNumber != null) ...[
          ModuleCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Utilisation actuelle',
                    style: TextStyle(
                        fontSize: 13, fontWeight: FontWeight.w700)),
                const SizedBox(height: 10),
                if (detail.currentCustomerName != null)
                  ModuleKV(label: 'Client', value: detail.currentCustomerName!),
                if (detail.currentContractNumber != null)
                  ModuleKV(label: 'Contrat', value: detail.currentContractNumber!),
              ],
            ),
          ),
          const SizedBox(height: 12),
        ],
        ModuleCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Identification',
                  style:
                      TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              ModuleKV(label: 'Immatriculation', value: v.registration),
              if (v.year != null) ModuleKV(label: 'Année', value: '${v.year}'),
              if (v.fuel != null)
                ModuleKV(
                  label: 'Carburant',
                  value: kFuelFr[v.fuel!.toLowerCase()] ?? v.fuel!,
                ),
              if (v.transmission != null)
                ModuleKV(
                  label: 'Boîte',
                  value: kTransmissionFr[v.transmission!.toLowerCase()] ??
                      v.transmission!,
                ),
              if (v.mileageKm != null)
                ModuleKV(
                    label: 'Kilométrage',
                    value:
                        '${NumberFormat.decimalPattern('fr').format(v.mileageKm)} km'),
            ],
          ),
        ),
        if (v.insuranceExpiry != null ||
            v.techControlExpiry != null ||
            v.vignetteExpiry != null) ...[
          const SizedBox(height: 12),
          ModuleCard(
            child: _ComplianceSummary(v: v),
          ),
        ],
        const SizedBox(height: 12),
        ModuleCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Acquisition',
                  style:
                      TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              if (v.pricePerDay != null && v.pricePerDay! > 0)
                ModuleKV(
                    label: 'Prix / jour', value: money.format(v.pricePerDay)),
              if (v.pricePerDay == null)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text('Données d\'acquisition non disponibles.',
                      style:
                          TextStyle(fontSize: 12, color: Colors.black54)),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _ComplianceSummary extends StatelessWidget {
  const _ComplianceSummary({required this.v});
  final VehicleDto v;

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Documents réglementaires',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
        const SizedBox(height: 10),
        _ComplianceRow(
            label: 'Assurance', date: v.insuranceExpiry, fmt: dateFmt),
        _ComplianceRow(
            label: 'Visite technique',
            date: v.techControlExpiry,
            fmt: dateFmt),
        _ComplianceRow(
            label: 'Vignette', date: v.vignetteExpiry, fmt: dateFmt),
      ],
    );
  }
}

class _ComplianceRow extends StatelessWidget {
  const _ComplianceRow({
    required this.label,
    required this.date,
    required this.fmt,
  });

  final String label;
  final DateTime? date;
  final DateFormat fmt;

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final expired = date != null && date!.isBefore(now);
    final soon = date != null &&
        !expired &&
        date!.difference(now).inDays >= 0 &&
        date!.difference(now).inDays <= 30;
    final color = expired
        ? Colors.red
        : soon
            ? Colors.amber
            : Colors.green;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
            child: Text(label,
                style:
                    const TextStyle(fontSize: 13, color: Colors.black54)),
          ),
          Text(date != null ? fmt.format(date!) : '—',
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                  color: color.shade700)),
          if (expired || soon) ...[
            const SizedBox(width: 6),
            Icon(
              Icons.warning_amber,
              size: 14,
              color: color.shade700,
            ),
          ],
        ],
      ),
    );
  }
}

class _IdentityTab extends StatelessWidget {
  const _IdentityTab({required this.v});
  final VehicleDto v;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        ModuleCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Identité véhicule',
                  style:
                      TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              ModuleKV(label: 'Immatriculation', value: v.registration),
              if (v.year != null) ModuleKV(label: 'Année', value: '${v.year}'),
              if (v.fuel != null)
                ModuleKV(
                    label: 'Carburant',
                    value: kFuelFr[v.fuel!.toLowerCase()] ?? v.fuel!),
              if (v.transmission != null)
                ModuleKV(
                    label: 'Transmission',
                    value: kTransmissionFr[v.transmission!.toLowerCase()] ??
                        v.transmission!),
            ],
          ),
        ),
      ],
    );
  }
}

class _MovementsTab extends StatelessWidget {
  const _MovementsTab({required this.detail, required this.onAdd});
  final VehicleDetailDto detail;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd/MM/yyyy HH:mm', 'fr');
    final items = detail.movements;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: onAdd,
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Nouveau mouvement'),
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF6366F1),
                minimumSize: const Size.fromHeight(44),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
        ),
        Expanded(
          child: items.isEmpty
              ? const ModuleEmptyView(
                  icon: Icons.swap_horiz,
                  message: 'Aucun mouvement enregistré pour ce véhicule.',
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (_, i) {
                    final m = items[i];
                    return ModuleCard(
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: _bgFor(m.type),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: Icon(_iconFor(m.type),
                                size: 16, color: _fgFor(m.type)),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(movementTypeFr(m.type),
                                    style: const TextStyle(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w700)),
                                Text(
                                  [
                                    if (m.performedAt != null)
                                      dateFmt.format(m.performedAt!),
                                    if (m.odometerKm != null)
                                      '${NumberFormat.decimalPattern('fr').format(m.odometerKm)} km',
                                    if (m.fuelLevel != null)
                                      '${m.fuelLevel!.toStringAsFixed(0)} %',
                                  ].join(' · '),
                                  style: const TextStyle(
                                      fontSize: 11, color: Colors.black54),
                                ),
                                if (m.notes != null && m.notes!.isNotEmpty)
                                  Text(m.notes!,
                                      style: const TextStyle(
                                          fontSize: 11,
                                          color: Colors.black45)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }

  IconData _iconFor(String t) => switch (t.toLowerCase()) {
        'entry' || 'return' || 'checkin' => Icons.login,
        'exit' || 'checkout' => Icons.logout,
        'transfer' => Icons.sync_alt,
        _ => Icons.circle,
      };
  Color _bgFor(String t) => switch (t.toLowerCase()) {
        'entry' || 'return' || 'checkin' => Colors.green.shade50,
        'exit' || 'checkout' => Colors.orange.shade50,
        _ => Colors.grey.shade100,
      };
  Color _fgFor(String t) => switch (t.toLowerCase()) {
        'entry' || 'return' || 'checkin' => Colors.green.shade700,
        'exit' || 'checkout' => Colors.orange.shade700,
        _ => Colors.grey.shade700,
      };
}

class _MaintenanceTab extends StatelessWidget {
  const _MaintenanceTab({required this.events, required this.onAdd});
  final List<MaintenanceEventDto> events;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(locale: 'fr', symbol: 'MAD');
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: onAdd,
              icon: const Icon(Icons.add, size: 18),
              label: const Text('Enregistrer un entretien'),
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF6366F1),
                minimumSize: const Size.fromHeight(44),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
            ),
          ),
        ),
        Expanded(
          child: events.isEmpty
              ? const ModuleEmptyView(
                  icon: Icons.build,
                  message: 'Aucun entretien enregistré.',
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: events.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (_, i) {
                    final e = events[i];
                    return ModuleCard(
                      child: Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: const Color(0xFFEEF0FB),
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: const Icon(Icons.build,
                                size: 16, color: Color(0xFF4F46E5)),
                          ),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(e.title,
                                    style: const TextStyle(
                                        fontSize: 14,
                                        fontWeight: FontWeight.w700)),
                                Text(
                                  [
                                    maintenanceTypeFr(e.type),
                                    if (e.performedAt != null)
                                      dateFmt.format(e.performedAt!),
                                    if (e.vendor != null) e.vendor!,
                                    if (e.odometerKm != null)
                                      '${NumberFormat.decimalPattern('fr').format(e.odometerKm)} km',
                                  ].join(' · '),
                                  style: const TextStyle(
                                      fontSize: 11, color: Colors.black54),
                                ),
                              ],
                            ),
                          ),
                          if (e.costMad != null && e.costMad! > 0) ...[
                            const SizedBox(width: 6),
                            Text(money.format(e.costMad),
                                style: const TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w800)),
                          ],
                        ],
                      ),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class _InsuranceTab extends StatelessWidget {
  const _InsuranceTab({required this.v});
  final VehicleDto v;

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    final now = DateTime.now();
    final expiry = v.insuranceExpiry;
    final expired = expiry != null && expiry.isBefore(now);
    final soon = expiry != null &&
        !expired &&
        expiry.difference(now).inDays >= 0 &&
        expiry.difference(now).inDays <= 30;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        ModuleCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Assurance',
                  style:
                      TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              ModuleKV(
                label: 'Date d\'expiration',
                value: expiry != null ? dateFmt.format(expiry) : '—',
              ),
              const SizedBox(height: 10),
              if (expired)
                _StatusLine(
                  color: Colors.red,
                  icon: Icons.error,
                  text: 'Assurance expirée.',
                )
              else if (soon)
                _StatusLine(
                  color: Colors.amber,
                  icon: Icons.warning_amber,
                  text:
                      'Assurance à renouveler sous ${expiry!.difference(now).inDays} jour${expiry.difference(now).inDays > 1 ? 's' : ''}.',
                )
              else if (expiry != null)
                _StatusLine(
                  color: Colors.green,
                  icon: Icons.check_circle,
                  text: 'Assurance en règle.',
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _TechControlTab extends StatelessWidget {
  const _TechControlTab({required this.v});
  final VehicleDto v;

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    final now = DateTime.now();
    final expiry = v.techControlExpiry;
    final expired = expiry != null && expiry.isBefore(now);
    final soon = expiry != null &&
        !expired &&
        expiry.difference(now).inDays >= 0 &&
        expiry.difference(now).inDays <= 30;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        ModuleCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Visite technique',
                  style:
                      TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              ModuleKV(
                label: 'Date d\'expiration',
                value: expiry != null ? dateFmt.format(expiry) : '—',
              ),
              const SizedBox(height: 10),
              if (expired)
                _StatusLine(
                  color: Colors.red,
                  icon: Icons.error,
                  text: 'Visite technique expirée.',
                )
              else if (soon)
                _StatusLine(
                  color: Colors.amber,
                  icon: Icons.warning_amber,
                  text:
                      'À repasser sous ${expiry!.difference(now).inDays} jour${expiry.difference(now).inDays > 1 ? 's' : ''}.',
                )
              else if (expiry != null)
                _StatusLine(
                  color: Colors.green,
                  icon: Icons.check_circle,
                  text: 'Visite technique à jour.',
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CostsTab extends StatelessWidget {
  const _CostsTab({required this.v});
  final VehicleDto v;

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(locale: 'fr', symbol: 'MAD');
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        ModuleCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Tarification',
                  style:
                      TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              if (v.pricePerDay != null && v.pricePerDay! > 0)
                ModuleKV(
                    label: 'Tarif / jour', value: money.format(v.pricePerDay))
              else
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text('Pas de tarif enregistré.',
                      style:
                          TextStyle(fontSize: 12, color: Colors.black54)),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        const _StubTab(
          icon: Icons.analytics_outlined,
          text:
              'Analyse coûts & rentabilité (dépenses, CA, marge) — bientôt disponible.',
        ),
      ],
    );
  }
}

class _StubTab extends StatelessWidget {
  const _StubTab({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return ModuleEmptyView(icon: icon, message: text);
  }
}

class _StatusLine extends StatelessWidget {
  const _StatusLine({
    required this.color,
    required this.icon,
    required this.text,
  });
  final MaterialColor color;
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.shade200),
      ),
      child: Row(
        children: [
          Icon(icon, color: color.shade700, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text,
                style: TextStyle(
                    color: color.shade800,
                    fontSize: 13,
                    fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );
  }
}

/// Onglet « Documents » du véhicule — reproduit la section documents du
/// web : liste des attachments + générés via `/entities/vehicle/{id}/documents`,
/// chaque document ouvre `DocumentViewerScreen` au tap.
class _VehicleDocumentsTab extends ConsumerWidget {
  const _VehicleDocumentsTab({required this.vehicleId});
  final String vehicleId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(entityDocumentsProvider(('vehicle', vehicleId)));
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ModuleErrorView(message: '$e'),
      data: (docs) {
        if (docs.isEmpty) {
          return const ModuleEmptyView(
            icon: Icons.folder_outlined,
            message: 'Aucun document attaché à ce véhicule.',
          );
        }
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: docs.length,
          separatorBuilder: (_, __) => const SizedBox(height: 8),
          itemBuilder: (_, i) {
            final d = docs[i];
            return ModuleCard(
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => DocumentViewerScreen(
                    id: d.id,
                    title: d.title,
                    mimeType: d.mimeType,
                  ),
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    (d.mimeType ?? '').startsWith('image/')
                        ? Icons.image_outlined
                        : d.mimeType == 'application/pdf'
                            ? Icons.picture_as_pdf
                            : Icons.description_outlined,
                    color: const Color(0xFF4F46E5),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(d.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontWeight: FontWeight.w800, fontSize: 14)),
                        const SizedBox(height: 2),
                        Text(
                          [
                            if (d.category != null) d.category!,
                            if (d.createdAt != null)
                              'Déposé le ${dateFmt.format(d.createdAt!)}',
                          ].join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 11, color: Colors.black54),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.open_in_new,
                      color: Color(0xFF4F46E5), size: 18),
                ],
              ),
            );
          },
        );
      },
    );
  }
}
