import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/widgets/module_scaffold.dart';
import '../../customers/data/customer_dto.dart';
import '../../customers/data/customers_repo.dart';
import '../../customers/presentation/new_customer_screen.dart';
import '../../vehicles/data/vehicle_dto.dart';
import '../../vehicles/data/vehicles_repo.dart';
import '../data/reservations_repo.dart';
import 'reservation_detail_screen.dart';

/// Nouvelle réservation — même formulaire que la popup du web. Détection
/// automatique LCD / LLD selon la durée, vérification de disponibilité en
/// direct, calcul du prix estimé, mode brouillon (plusieurs véhicules) ou
/// confirmée (un seul véhicule bloqué).
class NewReservationScreen extends ConsumerStatefulWidget {
  const NewReservationScreen({
    super.key,
    this.initialVehicleId,
    this.initialStartAt,
    this.initialEndAt,
  });

  final String? initialVehicleId;
  final String? initialStartAt;
  final String? initialEndAt;

  @override
  ConsumerState<NewReservationScreen> createState() =>
      _NewReservationScreenState();
}

class _NewReservationScreenState
    extends ConsumerState<NewReservationScreen> {
  static const int _lcdMaxDays = 30;

  CustomerDto? _customer;
  final Set<String> _vehicleIds = {};
  VehicleDto? _singleVehicle; // en mode confirmée, un seul véhicule
  DateTime? _start;
  DateTime? _end;
  final _pickupAddress = TextEditingController();
  final _deliveryAddress = TextEditingController();
  final _dailyRate = TextEditingController();
  bool _isDraft = false;
  bool _submitting = false;
  String? _error;

  // Vérification de disponibilité en direct
  bool _availChecking = false;
  Map<String, dynamic>? _availResult;

  @override
  void initState() {
    super.initState();
    if (widget.initialStartAt != null) {
      _start = DateTime.tryParse(widget.initialStartAt!);
    }
    if (widget.initialEndAt != null) {
      _end = DateTime.tryParse(widget.initialEndAt!);
    }
    if (widget.initialVehicleId != null) {
      // préremplissage asynchrone : on cherche le véhicule dans la liste
      WidgetsBinding.instance.addPostFrameCallback((_) async {
        final vs = await ref.read(vehiclesRepoProvider).list();
        final v = vs.where((x) => x.id == widget.initialVehicleId).toList();
        if (v.isNotEmpty && mounted) {
          setState(() {
            _singleVehicle = v.first;
            _vehicleIds.add(v.first.id);
            if (v.first.pricePerDay != null && v.first.pricePerDay! > 0) {
              _dailyRate.text = v.first.pricePerDay!.toStringAsFixed(0);
            }
          });
          _recheckAvailability();
        }
      });
    }
  }

  @override
  void dispose() {
    _pickupAddress.dispose();
    _deliveryAddress.dispose();
    _dailyRate.dispose();
    super.dispose();
  }

  // ── Calculs dérivés ────────────────────────────────────────────────────

  int get _days {
    if (_start == null || _end == null) return 0;
    final diff = _end!.difference(_start!).inMilliseconds;
    if (diff <= 0) return 0;
    return (diff / 86400000).ceil();
  }

  String get _reservationType =>
      _days > _lcdMaxDays ? 'LONG_RENTAL' : 'SHORT_RENTAL';

  String get _typeLabel => _reservationType == 'LONG_RENTAL'
      ? 'Location longue durée (LLD)'
      : 'Location courte durée (LCD)';

  double? get _estimatedPrice {
    final rate = double.tryParse(_dailyRate.text);
    if (rate == null || rate <= 0 || _days <= 0) return null;
    return rate * _days;
  }

  String _durationText() {
    if (_days == 0) return 'Sélectionnez les dates';
    final months = _days ~/ 30;
    final rem = _days % 30;
    if (months == 0) return '$_days jour${_days > 1 ? 's' : ''}';
    final rest = rem > 0 ? ' et $rem jour${rem > 1 ? 's' : ''}' : '';
    return '$months mois$rest';
  }

  // ── Actions ────────────────────────────────────────────────────────────

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
    _recheckAvailability();
  }

  Future<void> _pickCustomer() async {
    final c = await showModalBottomSheet<CustomerDto>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _ClientPickerSheet(),
    );
    if (c == null) return;
    if (c.id == '__new__') {
      final created = await Navigator.of(context).push<CustomerDto>(
        MaterialPageRoute(builder: (_) => const NewCustomerScreen()),
      );
      if (created != null) setState(() => _customer = created);
      return;
    }
    setState(() => _customer = c);
  }

  Future<void> _pickVehicles() async {
    final result = await showModalBottomSheet<_VehiclePickResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _VehiclePickerSheet(
        isDraft: _isDraft,
        selectedIds: _vehicleIds,
      ),
    );
    if (result == null) return;
    setState(() {
      if (_isDraft) {
        _vehicleIds
          ..clear()
          ..addAll(result.ids);
        _singleVehicle = null;
      } else {
        _singleVehicle = result.single;
        _vehicleIds
          ..clear()
          ..add(result.single!.id);
        if (result.single!.pricePerDay != null &&
            result.single!.pricePerDay! > 0 &&
            _dailyRate.text.isEmpty) {
          _dailyRate.text = result.single!.pricePerDay!.toStringAsFixed(0);
        }
      }
    });
    _recheckAvailability();
  }

  Future<void> _recheckAvailability() async {
    if (_isDraft || _singleVehicle == null || _start == null || _end == null) {
      setState(() {
        _availResult = null;
        _availChecking = false;
      });
      return;
    }
    setState(() {
      _availChecking = true;
      _availResult = null;
    });
    try {
      final r = await ref.read(reservationsRepoProvider).checkAvailability(
            vehicleId: _singleVehicle!.id,
            startAt: _start!.toIso8601String(),
            endAt: _end!.toIso8601String(),
          );
      if (mounted) setState(() => _availResult = r);
    } catch (_) {
      // Silencieusement : si la vérif foire, on laisse l'agent créer.
    } finally {
      if (mounted) setState(() => _availChecking = false);
    }
  }

  Future<void> _submit() async {
    if (_customer == null) {
      setState(() => _error = 'Client requis.');
      return;
    }
    if (_isDraft ? _vehicleIds.isEmpty : _singleVehicle == null) {
      setState(() => _error = 'Véhicule requis.');
      return;
    }
    if (_start == null || _end == null) {
      setState(() => _error = 'Dates de début et fin requises.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final body = <String, dynamic>{
        'customer_id': _customer!.id,
        'reservation_type': _reservationType,
        'desired_start_at': _start!.toIso8601String(),
        'desired_end_at': _end!.toIso8601String(),
        'is_draft': _isDraft,
        if (_pickupAddress.text.trim().isNotEmpty)
          'pickup_address': _pickupAddress.text.trim(),
        if (_deliveryAddress.text.trim().isNotEmpty)
          'delivery_address': _deliveryAddress.text.trim(),
        if (_dailyRate.text.trim().isNotEmpty)
          'daily_rate': double.tryParse(_dailyRate.text),
        if (_estimatedPrice != null) 'estimated_price': _estimatedPrice,
      };
      final draftIds = _isDraft && _vehicleIds.isNotEmpty
          ? _vehicleIds.toList()
          : null;
      body['vehicle_id'] = draftIds != null ? draftIds.first : _singleVehicle!.id;
      if (draftIds != null && draftIds.length > 1) {
        body['vehicle_ids'] = draftIds;
      }

      final created =
          await ref.read(reservationsRepoProvider).createReservation(body);
      ref.invalidate(reservationsListProvider);
      ref.invalidate(enrichedReservationsProvider);
      if (!mounted) return;
      final id = created['id']?.toString();
      if (id != null) {
        Navigator.of(context).pushReplacement(MaterialPageRoute(
          builder: (_) => ReservationDetailScreen(id: id),
        ));
      } else {
        Navigator.of(context).pop();
      }
    } catch (e) {
      setState(() => _error = _friendly(e));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String _friendly(Object e) {
    final msg = e.toString();
    final match = RegExp(r'status code of (\d+)').firstMatch(msg);
    if (match != null) {
      final code = int.parse(match[1]!);
      if (code == 422) return 'Les informations saisies ne sont pas valides.';
      if (code == 403) return 'Vous n\'avez pas la permission de créer une réservation.';
      if (code == 409) return 'Ce véhicule n\'est pas disponible sur cette période.';
    }
    return 'Création impossible pour le moment.';
  }

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.decimalPattern('fr');
    final isAvailable = _availResult?['available'] == true;
    final isBlocked = _availResult?['available'] == false;
    final conflict = isBlocked ? _formatConflict(_availResult!) : null;

    return Scaffold(
      appBar: AppBar(title: const Text('Nouvelle réservation')),
      body: ModuleBackground(
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Client + Véhicule(s)
              ModuleCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _FieldLabel(
                      label: 'Client',
                      trailing: TextButton(
                        onPressed: () async {
                          final created = await Navigator.of(context)
                              .push<CustomerDto>(MaterialPageRoute(
                            builder: (_) => const NewCustomerScreen(),
                          ));
                          if (created != null) setState(() => _customer = created);
                        },
                        child: const Text('+ Nouveau'),
                      ),
                    ),
                    _PickerBox(
                      value: _customer?.displayName,
                      hint: 'Choisir un client…',
                      icon: Icons.person,
                      onTap: _pickCustomer,
                    ),
                    const SizedBox(height: 12),
                    _FieldLabel(
                      label: _isDraft
                          ? 'Véhicule(s) — plusieurs possibles'
                          : 'Véhicule',
                    ),
                    _PickerBox(
                      value: _isDraft
                          ? (_vehicleIds.isEmpty
                              ? null
                              : '${_vehicleIds.length} véhicule${_vehicleIds.length > 1 ? 's' : ''} sélectionné${_vehicleIds.length > 1 ? 's' : ''}')
                          : _singleVehicle?.label,
                      hint: 'Choisir un véhicule…',
                      icon: Icons.directions_car,
                      onTap: _pickVehicles,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),

              // Dates
              ModuleCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const _FieldLabel(label: 'Dates'),
                    _DateButton(label: 'Début', value: _start, onTap: () => _pickDate(true)),
                    const SizedBox(height: 8),
                    _DateButton(label: 'Fin', value: _end, onTap: () => _pickDate(false)),
                    const SizedBox(height: 12),
                    const _FieldLabel(label: 'Type de réservation'),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 12),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF5F6FB),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: Theme.of(context).dividerColor),
                      ),
                      child: Text(
                        _days > 0
                            ? '$_typeLabel — ${_durationText()}'
                            : 'Sélectionnez les dates',
                        style: TextStyle(
                          color: _days > 0 ? Colors.black87 : Colors.black45,
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),

              // Adresses + tarif
              ModuleCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const _FieldLabel(label: 'Détails'),
                    TextField(
                      controller: _pickupAddress,
                      decoration: const InputDecoration(
                          labelText: 'Adresse pickup (optionnel)'),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _deliveryAddress,
                      decoration: const InputDecoration(
                          labelText: 'Adresse livraison (optionnel)'),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _dailyRate,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(
                        labelText: 'Tarif / jour (MAD)',
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                    if (_estimatedPrice != null) ...[
                      const SizedBox(height: 10),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 12),
                        decoration: BoxDecoration(
                          color: const Color(0xFFF5F6FB),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Theme.of(context).dividerColor),
                        ),
                        child: Text(
                          'Prix estimé : ${money.format(_estimatedPrice)} MAD '
                          '($_days jour${_days > 1 ? 's' : ''} × '
                          '${money.format(double.tryParse(_dailyRate.text) ?? 0)} MAD)',
                          style: const TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                              color: Colors.black87),
                        ),
                      ),
                    ],
                  ],
                ),
              ),

              // Vérification disponibilité (mode confirmé uniquement)
              if (!_isDraft &&
                  _singleVehicle != null &&
                  _start != null &&
                  _end != null) ...[
                const SizedBox(height: 12),
                if (_availChecking)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 8),
                    child: Text('Vérification disponibilité…',
                        style: TextStyle(
                            fontSize: 12,
                            color: Colors.black54,
                            fontWeight: FontWeight.w600)),
                  ),
                if (isAvailable)
                  _NoticeBox(
                    color: Colors.green,
                    text: 'Créneau disponible pour ce véhicule.',
                  ),
                if (isBlocked)
                  _NoticeBox(
                    color: Colors.amber,
                    text: 'Créneau indisponible. ${conflict ?? ''}',
                    bold: true,
                  ),
              ],
              const SizedBox(height: 12),

              // Toggle brouillon / confirmée
              ModuleCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const _FieldLabel(label: 'Mode'),
                    _ModeChoice(
                      selected: !_isDraft,
                      title: 'Réservation confirmée',
                      subtitle: '1 véhicule bloqué · créneau réservé',
                      color: const Color(0xFF4F46E5),
                      onTap: () => setState(() {
                        _isDraft = false;
                        if (_vehicleIds.length > 1) {
                          _vehicleIds.removeWhere(
                              (id) => _vehicleIds.first != id);
                        }
                      }),
                    ),
                    const SizedBox(height: 8),
                    _ModeChoice(
                      selected: _isDraft,
                      title: 'Intention (brouillon)',
                      subtitle:
                          'Plusieurs véhicules possibles · non bloqués',
                      color: const Color(0xFFF59E0B),
                      onTap: () {
                        setState(() {
                          _isDraft = true;
                          _singleVehicle = null;
                          _availResult = null;
                        });
                      },
                    ),
                  ],
                ),
              ),

              if (_error != null) ...[
                const SizedBox(height: 12),
                _NoticeBox(color: Colors.red, text: _error!, bold: true),
              ],

              const SizedBox(height: 20),
              FilledButton(
                onPressed: (_submitting ||
                        (!_isDraft && isBlocked) ||
                        _customer == null ||
                        (_isDraft ? _vehicleIds.isEmpty : _singleVehicle == null) ||
                        _start == null ||
                        _end == null)
                    ? null
                    : _submit,
                style: FilledButton.styleFrom(
                  backgroundColor:
                      _isDraft ? const Color(0xFFD97706) : const Color(0xFF4F46E5),
                  minimumSize: const Size.fromHeight(52),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14)),
                ),
                child: _submitting
                    ? const SizedBox(
                        height: 22,
                        width: 22,
                        child: CircularProgressIndicator(
                            strokeWidth: 2.5, color: Colors.white),
                      )
                    : Text(
                        _isDraft
                            ? 'Créer intention${_vehicleIds.length > 1 ? ' (${_vehicleIds.length} véhicules)' : ''}'
                            : 'Créer réservation',
                        style: const TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 15),
                      ),
              ),
              const SizedBox(height: 20),
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
      return 'Chevauchement avec ${conflicts.length} réservation${conflicts.length > 1 ? 's' : ''}.';
    }
    return 'Chevauchement avec une autre réservation.';
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

class _FieldLabel extends StatelessWidget {
  const _FieldLabel({required this.label, this.trailing});
  final String label;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Expanded(
            child: Text(label,
                style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: Colors.black54)),
          ),
          if (trailing != null) trailing!,
        ],
      ),
    );
  }
}

class _PickerBox extends StatelessWidget {
  const _PickerBox({
    required this.value,
    required this.hint,
    required this.icon,
    required this.onTap,
  });
  final String? value;
  final String hint;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Theme.of(context).dividerColor),
        ),
        child: Row(
          children: [
            Icon(icon, size: 18, color: Colors.black45),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                value ?? hint,
                style: TextStyle(
                  color: value == null ? Colors.black45 : Colors.black87,
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                ),
              ),
            ),
            const Icon(Icons.arrow_drop_down, color: Colors.black45),
          ],
        ),
      ),
    );
  }
}

class _DateButton extends StatelessWidget {
  const _DateButton({required this.label, required this.value, required this.onTap});
  final String label;
  final DateTime? value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('EEE d MMM y, HH:mm', 'fr');
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: const Color(0xFFF5F6FB),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Theme.of(context).dividerColor),
        ),
        child: Row(
          children: [
            SizedBox(
              width: 50,
              child: Text(label,
                  style: const TextStyle(
                      color: Colors.black54,
                      fontSize: 13,
                      fontWeight: FontWeight.w600)),
            ),
            Expanded(
              child: Text(
                value != null ? fmt.format(value!) : 'Choisir',
                style: TextStyle(
                  color: value != null ? Colors.black87 : Colors.black45,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const Icon(Icons.event, size: 18, color: Colors.black45),
          ],
        ),
      ),
    );
  }
}

class _ModeChoice extends StatelessWidget {
  const _ModeChoice({
    required this.selected,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  final bool selected;
  final String title;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: selected ? color.withOpacity(0.08) : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? color : Colors.grey.shade200,
            width: selected ? 1.6 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(
              selected ? Icons.radio_button_checked : Icons.radio_button_off,
              color: selected ? color : Colors.black45,
              size: 22,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: const TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 2),
                  Text(subtitle,
                      style: const TextStyle(
                          fontSize: 11, color: Colors.black54)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _NoticeBox extends StatelessWidget {
  const _NoticeBox({required this.color, required this.text, this.bold = false});
  final MaterialColor color;
  final String text;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.shade200),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: color.shade800,
          fontSize: 13,
          fontWeight: bold ? FontWeight.w800 : FontWeight.w600,
        ),
      ),
    );
  }
}

// ── Bottom sheets ────────────────────────────────────────────────────────

class _ClientPickerSheet extends ConsumerStatefulWidget {
  const _ClientPickerSheet();

  @override
  ConsumerState<_ClientPickerSheet> createState() => _ClientPickerSheetState();
}

class _ClientPickerSheetState extends ConsumerState<_ClientPickerSheet> {
  String _q = '';

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(customersListProvider);
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
                  hintText: 'Rechercher un client…',
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
                  final list = items.where((c) {
                    if (_q.isEmpty) return true;
                    return (c.displayName ?? '').toLowerCase().contains(_q) ||
                        c.code.toLowerCase().contains(_q) ||
                        (c.nationalId ?? '').toLowerCase().contains(_q);
                  }).toList();
                  return ListView(
                    controller: ctrl,
                    children: [
                      ListTile(
                        leading: const Icon(Icons.add, color: Color(0xFF4F46E5)),
                        title: const Text('+ Nouveau client',
                            style: TextStyle(
                                fontWeight: FontWeight.w800,
                                color: Color(0xFF4F46E5))),
                        onTap: () => Navigator.of(context).pop(
                          const CustomerDto(
                            id: '__new__',
                            code: '',
                            type: 'PARTICULIER',
                          ),
                        ),
                      ),
                      const Divider(height: 1),
                      for (final c in list)
                        ListTile(
                          leading:
                              Icon(c.isCompany ? Icons.business : Icons.person),
                          title: Text(c.displayName ?? '—',
                              style:
                                  const TextStyle(fontWeight: FontWeight.w700)),
                          subtitle: Text(c.code),
                          onTap: () => Navigator.of(context).pop(c),
                        ),
                    ],
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

class _VehiclePickResult {
  _VehiclePickResult({required this.ids, this.single});
  final List<String> ids;
  final VehicleDto? single;
}

class _VehiclePickerSheet extends ConsumerStatefulWidget {
  const _VehiclePickerSheet({required this.isDraft, required this.selectedIds});
  final bool isDraft;
  final Set<String> selectedIds;

  @override
  ConsumerState<_VehiclePickerSheet> createState() => _VehiclePickerSheetState();
}

class _VehiclePickerSheetState extends ConsumerState<_VehiclePickerSheet> {
  String _q = '';
  late final Set<String> _picked = {...widget.selectedIds};

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
                  hintText: 'Rechercher marque, modèle, immatriculation…',
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
                      final isPicked = _picked.contains(v.id);
                      return ListTile(
                        leading: Icon(widget.isDraft
                            ? (isPicked
                                ? Icons.check_box
                                : Icons.check_box_outline_blank)
                            : Icons.directions_car),
                        title: Text(v.label,
                            style: const TextStyle(
                                fontWeight: FontWeight.w700)),
                        subtitle: Text(v.registration),
                        trailing: v.isSubRented
                            ? Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 8, vertical: 2),
                                decoration: BoxDecoration(
                                  color: Colors.amber.shade100,
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: const Text('SL',
                                    style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w800,
                                        color: Colors.orange)),
                              )
                            : null,
                        selected: isPicked,
                        selectedTileColor: const Color(0xFFEEF0FB),
                        onTap: () {
                          if (widget.isDraft) {
                            setState(() {
                              if (isPicked) {
                                _picked.remove(v.id);
                              } else {
                                _picked.add(v.id);
                              }
                            });
                          } else {
                            Navigator.of(context).pop(_VehiclePickResult(
                                ids: [v.id], single: v));
                          }
                        },
                      );
                    },
                  );
                },
              ),
            ),
            if (widget.isDraft)
              SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: FilledButton(
                    onPressed: () => Navigator.of(context).pop(
                      _VehiclePickResult(ids: _picked.toList()),
                    ),
                    style: FilledButton.styleFrom(
                      minimumSize: const Size.fromHeight(50),
                      backgroundColor: const Color(0xFF6366F1),
                    ),
                    child: Text(
                      _picked.isEmpty
                          ? 'Fermer'
                          : 'Valider · ${_picked.length} véhicule${_picked.length > 1 ? 's' : ''}',
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 14),
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}


