import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/config/app_config.dart';
import '../../../core/widgets/module_scaffold.dart';
import '../../placeholders/placeholder_screen.dart';
import '../data/vehicle_dto.dart';
import '../data/vehicles_repo.dart';
import 'vehicle_detail_screen.dart';

/// Liste de la flotte — même structure que `FleetListPage.tsx` du web :
/// filtres de conformité, bouton Nouveau véhicule, et deux raccourcis vers
/// Conformité véhicules et Maintenance.
class VehiclesScreen extends ConsumerStatefulWidget {
  const VehiclesScreen({super.key});

  @override
  ConsumerState<VehiclesScreen> createState() => _VehiclesScreenState();
}

enum _ComplianceFilter { all, insuranceExpired, techExpired, ok }

class _VehiclesScreenState extends ConsumerState<VehiclesScreen> {
  final _search = TextEditingController();
  String _query = '';
  _ComplianceFilter _filter = _ComplianceFilter.all;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<VehicleDto> _apply(List<VehicleDto> items) {
    final q = _query.trim().toLowerCase();
    final now = DateTime.now();
    return items.where((v) {
      // recherche
      final matchQ = q.isEmpty ||
          v.label.toLowerCase().contains(q) ||
          v.registration.toLowerCase().contains(q);
      if (!matchQ) return false;
      // conformité
      final insExp = v.insuranceExpiry != null && v.insuranceExpiry!.isBefore(now);
      final techExp =
          v.techControlExpiry != null && v.techControlExpiry!.isBefore(now);
      final vigExp = v.vignetteExpiry != null && v.vignetteExpiry!.isBefore(now);
      final anyExpired = insExp || techExp || vigExp;
      return switch (_filter) {
        _ComplianceFilter.all => true,
        _ComplianceFilter.insuranceExpired => insExp,
        _ComplianceFilter.techExpired => techExp,
        _ComplianceFilter.ok => !anyExpired &&
            (v.insuranceExpiry != null || v.techControlExpiry != null),
      };
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(vehiclesListProvider);
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => const PlaceholderScreen(
              title: 'Nouveau véhicule',
              icon: Icons.directions_car,
            ),
          ));
        },
        icon: const Icon(Icons.add),
        label: const Text('Nouveau véhicule'),
        backgroundColor: const Color(0xFF6366F1),
        foregroundColor: Colors.white,
      ),
      body: ModuleBackground(
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: () async => ref.invalidate(vehiclesListProvider),
            child: async.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ModuleErrorView(message: '$e'),
              data: (items) {
                final list = _apply(items);
                return ListView(
                  padding: const EdgeInsets.only(bottom: 100),
                  children: [
                    ModuleHeader(
                      title: 'Flotte',
                      subtitle:
                          'Parc complet — conformité, maintenance, documents et pièces.',
                      onBack: () => Navigator.of(context).maybePop(),
                    ),
                    const SizedBox(height: 18),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: ModuleSearchField(
                        controller: _search,
                        hint: 'Filtrer véhicules…',
                        onChanged: (v) => setState(() => _query = v),
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      height: 36,
                      child: ListView(
                        scrollDirection: Axis.horizontal,
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        children: [
                          _FilterChip(
                              label: 'Tous',
                              selected: _filter == _ComplianceFilter.all,
                              onTap: () => setState(
                                  () => _filter = _ComplianceFilter.all)),
                          _FilterChip(
                              label: 'Assurance expirée',
                              selected: _filter ==
                                  _ComplianceFilter.insuranceExpired,
                              onTap: () => setState(() => _filter =
                                  _ComplianceFilter.insuranceExpired)),
                          _FilterChip(
                              label: 'Visite tech. expirée',
                              selected:
                                  _filter == _ComplianceFilter.techExpired,
                              onTap: () => setState(() =>
                                  _filter = _ComplianceFilter.techExpired)),
                          _FilterChip(
                              label: 'Conformité OK',
                              selected: _filter == _ComplianceFilter.ok,
                              onTap: () => setState(
                                  () => _filter = _ComplianceFilter.ok)),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: Row(
                        children: [
                          Expanded(
                            child: _SecondaryBtn(
                              label: 'Conformité véhicules',
                              icon: Icons.shield_outlined,
                              onTap: () => Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => const PlaceholderScreen(
                                    title: 'Conformité véhicules',
                                    icon: Icons.shield_outlined,
                                  ),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: _SecondaryBtn(
                              label: 'Maintenance',
                              icon: Icons.build_outlined,
                              onTap: () => Navigator.of(context).push(
                                MaterialPageRoute(
                                  builder: (_) => const PlaceholderScreen(
                                    title: 'Maintenance',
                                    icon: Icons.build_outlined,
                                  ),
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    if (list.isEmpty)
                      const ModuleEmptyView(
                        icon: Icons.directions_car,
                        message: 'Aucun véhicule pour ce filtre.',
                      )
                    else
                      ...list.map((v) => Padding(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                            child: _VehicleCard(v: v),
                          )),
                  ],
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: Material(
        color: selected ? const Color(0xFF6366F1) : Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(999),
          side: BorderSide(
              color: selected ? Colors.transparent : Theme.of(context).dividerColor),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            child: Text(
              label,
              style: TextStyle(
                color: selected ? Colors.white : Colors.black87,
                fontWeight: FontWeight.w700,
                fontSize: 12,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _SecondaryBtn extends StatelessWidget {
  const _SecondaryBtn({
    required this.label,
    required this.icon,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: const Color(0xFFEEF0FB),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.indigo.shade100),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 16, color: Colors.indigo.shade700),
              const SizedBox(width: 6),
              Flexible(
                child: Text(
                  label,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    color: Colors.indigo.shade700,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _VehicleCard extends StatelessWidget {
  const _VehicleCard({required this.v});
  final VehicleDto v;

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(locale: 'fr', symbol: 'MAD');
    final compliance = _compliance(v);
    return ModuleCard(
      onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => VehicleDetailScreen(id: v.id))),
      child: Row(
        children: [
          _Thumb(v: v),
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
                        fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(v.label,
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 15)),
                const SizedBox(height: 2),
                Text(
                  [
                    if (v.year != null) '${v.year}',
                    if (v.fuel != null)
                      (kFuelFr[v.fuel!.toLowerCase()] ?? v.fuel!),
                    if (v.transmission != null)
                      (kTransmissionFr[v.transmission!.toLowerCase()] ??
                          v.transmission!),
                  ].join(' · '),
                  style: const TextStyle(color: Colors.black54, fontSize: 12),
                ),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    ModuleStatusChip(
                      label: vehicleStatusFr(v.status),
                      tone: _statusTone(v.status),
                    ),
                    if (v.isSubRented)
                      const ModuleStatusChip(
                        label: 'SL',
                        tone: ModuleStatusTone.neutral,
                      ),
                    ModuleStatusChip(
                      label: compliance.label,
                      tone: compliance.tone,
                    ),
                  ],
                ),
                if (v.pricePerDay != null && v.pricePerDay! > 0) ...[
                  const SizedBox(height: 6),
                  Text('${money.format(v.pricePerDay)}/j',
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 13)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  ({String label, ModuleStatusTone tone}) _compliance(VehicleDto v) {
    final now = DateTime.now();
    final insExp =
        v.insuranceExpiry != null && v.insuranceExpiry!.isBefore(now);
    final techExp =
        v.techControlExpiry != null && v.techControlExpiry!.isBefore(now);
    final vigExp = v.vignetteExpiry != null && v.vignetteExpiry!.isBefore(now);
    if (insExp || techExp || vigExp) {
      return (label: 'Conformité critique', tone: ModuleStatusTone.danger);
    }
    final soon = [v.insuranceExpiry, v.techControlExpiry, v.vignetteExpiry]
        .where((d) =>
            d != null &&
            d.difference(now).inDays >= 0 &&
            d.difference(now).inDays <= 30);
    if (soon.isNotEmpty) {
      return (label: 'À surveiller', tone: ModuleStatusTone.warning);
    }
    if (v.insuranceExpiry != null || v.techControlExpiry != null) {
      return (label: 'Conformité OK', tone: ModuleStatusTone.ok);
    }
    return (label: 'Documents inconnus', tone: ModuleStatusTone.neutral);
  }

  ModuleStatusTone _statusTone(String s) {
    return switch (s.toUpperCase()) {
      'AVAILABLE' => ModuleStatusTone.ok,
      'RENTED' || 'RESERVED' => ModuleStatusTone.warning,
      'MAINTENANCE' || 'IN_REPAIR' => ModuleStatusTone.danger,
      _ => ModuleStatusTone.neutral,
    };
  }
}

class _Thumb extends StatelessWidget {
  const _Thumb({required this.v});
  final VehicleDto v;

  @override
  Widget build(BuildContext context) {
    final base = AppConfig.apiBaseUrl.replaceAll('/api/v1', '');
    final url = v.photoUrl != null && v.photoUrl!.startsWith('/')
        ? '$base${v.photoUrl}'
        : v.photoUrl;
    return Container(
      width: 72,
      height: 72,
      decoration: BoxDecoration(
        color: const Color(0xFFEEF0FB),
        borderRadius: BorderRadius.circular(14),
      ),
      clipBehavior: Clip.antiAlias,
      child: url != null
          ? Image.network(url, fit: BoxFit.cover, errorBuilder: (_, __, ___) {
              return const Center(
                  child: Icon(Icons.directions_car, color: Colors.black38));
            })
          : const Center(
              child: Icon(Icons.directions_car, color: Colors.black38)),
    );
  }
}

