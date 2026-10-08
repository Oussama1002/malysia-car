import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/widgets/module_scaffold.dart';
import '../../vehicles/data/vehicle_dto.dart';
import '../../vehicles/data/vehicles_repo.dart';
import '../data/reservations_repo.dart';
import 'new_reservation_screen.dart';

/// Vérification de disponibilité — même formulaire que le modal web : un
/// véhicule, une plage de dates, et l'appel direct à `/rentals/availability`
/// qui dit si le créneau est libre ou chevauche quelque chose.
class AvailabilityCheckScreen extends ConsumerStatefulWidget {
  const AvailabilityCheckScreen({super.key});

  @override
  ConsumerState<AvailabilityCheckScreen> createState() =>
      _AvailabilityCheckScreenState();
}

class _AvailabilityCheckScreenState
    extends ConsumerState<AvailabilityCheckScreen> {
  VehicleDto? _vehicle;
  DateTime? _start;
  DateTime? _end;
  bool _checking = false;
  Map<String, dynamic>? _result;
  String? _error;

  Future<void> _pickVehicle() async {
    final v = await showModalBottomSheet<VehicleDto>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _AvailVehicleSheet(),
    );
    if (v != null) {
      setState(() => _vehicle = v);
      _check();
    }
  }

  Future<void> _pickDate(bool isStart) async {
    final now = DateTime.now();
    final initial = isStart ? (_start ?? now) : (_end ?? _start ?? now);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: now.subtract(const Duration(days: 1)),
      lastDate: now.add(const Duration(days: 365 * 3)),
      locale: const Locale('fr'),
    );
    if (picked == null) return;
    final time = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: isStart ? 9 : 18, minute: 0),
    );
    if (time == null) return;
    setState(() {
      final dt = DateTime(picked.year, picked.month, picked.day, time.hour, time.minute);
      if (isStart) {
        _start = dt;
        if (_end != null && _end!.isBefore(dt)) _end = null;
      } else {
        _end = dt;
      }
    });
    _check();
  }

  Future<void> _check() async {
    if (_vehicle == null || _start == null || _end == null) {
      setState(() => _result = null);
      return;
    }
    setState(() {
      _checking = true;
      _result = null;
      _error = null;
    });
    try {
      final r = await ref.read(reservationsRepoProvider).checkAvailability(
            vehicleId: _vehicle!.id,
            startAt: _start!.toIso8601String(),
            endAt: _end!.toIso8601String(),
          );
      if (mounted) setState(() => _result = r);
    } catch (e) {
      if (mounted) setState(() => _error = 'Vérification impossible.');
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  void _createReservation() {
    Navigator.of(context).pushReplacement(MaterialPageRoute(
      builder: (_) => NewReservationScreen(
        initialVehicleId: _vehicle!.id,
        initialStartAt: _start!.toIso8601String(),
        initialEndAt: _end!.toIso8601String(),
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final available = _result?['available'] == true;
    final blocked = _result?['available'] == false;
    return Scaffold(
      appBar: AppBar(title: const Text('Vérifier disponibilité')),
      body: ModuleBackground(
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text(
                'Sélectionnez un véhicule et une plage de dates pour vérifier la disponibilité en temps réel.',
                style: TextStyle(color: Colors.black54, fontSize: 13),
              ),
              const SizedBox(height: 14),
              ModuleCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Véhicule',
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            color: Colors.black54)),
                    const SizedBox(height: 6),
                    InkWell(
                      onTap: _pickVehicle,
                      borderRadius: BorderRadius.circular(14),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 14),
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.surface,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: Theme.of(context).dividerColor),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.directions_car,
                                size: 18, color: Colors.black45),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                _vehicle?.label ?? 'Véhicule…',
                                style: TextStyle(
                                  color: _vehicle == null
                                      ? Colors.black45
                                      : Colors.black87,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 14,
                                ),
                              ),
                            ),
                            const Icon(Icons.arrow_drop_down,
                                color: Colors.black45),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          child: _DateCell(
                            label: 'Début',
                            value: _start,
                            onTap: () => _pickDate(true),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: _DateCell(
                            label: 'Fin',
                            value: _end,
                            onTap: () => _pickDate(false),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),

              if (_checking)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text(
                    'Vérification en cours…',
                    style: TextStyle(
                        fontSize: 12,
                        color: Colors.black54,
                        fontWeight: FontWeight.w600),
                  ),
                ),
              if (available) ...[
                _NoticeCard(
                  color: Colors.green,
                  icon: Icons.check_circle,
                  title: 'Véhicule disponible',
                  body: 'Ce véhicule est libre sur la période sélectionnée.',
                ),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: _createReservation,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF6366F1),
                    minimumSize: const Size.fromHeight(52),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14)),
                  ),
                  child: const Text(
                    'Créer une réservation sur ce créneau →',
                    style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
                  ),
                ),
              ],
              if (blocked)
                _NoticeCard(
                  color: Colors.red,
                  icon: Icons.cancel,
                  title: 'Véhicule indisponible',
                  body: _formatConflict(_result!),
                ),
              if (_error != null)
                _NoticeCard(
                  color: Colors.amber,
                  icon: Icons.warning_amber,
                  title: 'Vérification impossible',
                  body: _error!,
                ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatConflict(Map<String, dynamic> data) {
    final reasons = data['reasons'];
    if (reasons is List && reasons.isNotEmpty) {
      return reasons.map((r) => _reasonLabel(r.toString())).join(' · ');
    }
    final conflicts = data['conflicts'];
    if (conflicts is List && conflicts.isNotEmpty) {
      return 'Chevauchement avec ${conflicts.length} réservation${conflicts.length > 1 ? 's' : ''} existante${conflicts.length > 1 ? 's' : ''}.';
    }
    return 'Ce véhicule est pris sur cette période.';
  }

  String _reasonLabel(String code) {
    const map = {
      'reservation_overlap': 'Chevauchement avec une réservation',
      'contract_overlap': 'Chevauchement avec un contrat',
      'maintenance_overlap': 'Véhicule en maintenance',
      'vehicle_availability_flag': 'Véhicule marqué indisponible',
    };
    return map[code] ?? code;
  }
}

class _DateCell extends StatelessWidget {
  const _DateCell({required this.label, required this.value, required this.onTap});
  final String label;
  final DateTime? value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('dd/MM/yy HH:mm', 'fr');
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
        decoration: BoxDecoration(
          color: const Color(0xFFF5F6FB),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Theme.of(context).dividerColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: const TextStyle(
                    color: Colors.black54,
                    fontSize: 11,
                    fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(
              value != null ? fmt.format(value!) : 'Choisir',
              style: TextStyle(
                color: value != null ? Colors.black87 : Colors.black45,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NoticeCard extends StatelessWidget {
  const _NoticeCard({
    required this.color,
    required this.icon,
    required this.title,
    required this.body,
  });

  final MaterialColor color;
  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: color.shade50,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color.shade700, size: 20),
              const SizedBox(width: 8),
              Text(title,
                  style: TextStyle(
                      color: color.shade800,
                      fontWeight: FontWeight.w800,
                      fontSize: 14)),
            ],
          ),
          const SizedBox(height: 6),
          Text(body,
              style: TextStyle(color: color.shade700, fontSize: 13)),
        ],
      ),
    );
  }
}

class _AvailVehicleSheet extends ConsumerStatefulWidget {
  const _AvailVehicleSheet();

  @override
  ConsumerState<_AvailVehicleSheet> createState() => _AvailVehicleSheetState();
}

class _AvailVehicleSheetState extends ConsumerState<_AvailVehicleSheet> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(vehiclesListProvider);
    return DraggableScrollableSheet(
      initialChildSize: 0.9,
      expand: false,
      builder: (_, ctrl) => Container(
        decoration: const BoxDecoration(
          color: Color(0xFFF8F9FD),
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          children: [
            const SizedBox(height: 10),
            Container(
                width: 42,
                height: 4,
                decoration: BoxDecoration(
                    color: Colors.black26,
                    borderRadius: BorderRadius.circular(2))),
            Padding(
              padding: const EdgeInsets.all(16),
              child: TextField(
                autofocus: true,
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.search),
                  hintText: 'Rechercher un véhicule…',
                  filled: true,
                  fillColor: Colors.white,
                ),
                onChanged: (v) => setState(() => _q = v.toLowerCase()),
              ),
            ),
            Expanded(
              child: async.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('$e')),
                data: (items) {
                  final list = items.where((v) {
                    return _q.isEmpty ||
                        v.label.toLowerCase().contains(_q) ||
                        v.registration.toLowerCase().contains(_q);
                  }).toList();
                  return ListView.builder(
                    controller: ctrl,
                    itemCount: list.length,
                    itemBuilder: (_, i) {
                      final v = list[i];
                      return ListTile(
                        leading: const Icon(Icons.directions_car),
                        title: Text(v.label,
                            style: const TextStyle(
                                fontWeight: FontWeight.w700)),
                        subtitle: Text(v.registration),
                        onTap: () => Navigator.of(context).pop(v),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}


