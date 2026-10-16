import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../data/reservations_repo.dart';

/// Changement de véhicule — pendant mobile du VehicleSwapWizard web.
/// Flux compact en 3 écrans : motif, choix du véhicule, impact financier.
/// Appelle les mêmes endpoints `/vehicle-swaps/*` que le web.
class VehicleSwapSheet extends ConsumerStatefulWidget {
  const VehicleSwapSheet({
    super.key,
    this.reservationId,
    this.contractId,
    this.onDone,
  });

  final String? reservationId;
  final String? contractId;
  final VoidCallback? onDone;

  static Future<void> show(
    BuildContext context, {
    String? reservationId,
    String? contractId,
    VoidCallback? onDone,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: VehicleSwapSheet(
          reservationId: reservationId,
          contractId: contractId,
          onDone: onDone,
        ),
      ),
    );
  }

  @override
  ConsumerState<VehicleSwapSheet> createState() => _VehicleSwapSheetState();
}

enum _SwapStep { reason, vehicle, financial }

const _reasons = <MapEntry<String, String>>[
  MapEntry('customer_request', 'Demande client'),
  MapEntry('vehicle_unavailable', 'Véhicule indisponible'),
  MapEntry('breakdown', 'Panne mécanique'),
  MapEntry('accident', 'Accident'),
  MapEntry('other', 'Autre'),
];

const _availabilityReasonFr = <String, String>{
  'overlapping_reservation': 'Réservation en conflit',
  'active_contract_overlap': 'Contrat actif en conflit',
  'overlapping_mission': 'Mission planifiée en conflit',
  'vehicle_in_maintenance': 'En maintenance',
  'vehicle_in_scheduled_maintenance': 'Maintenance planifiée',
  'vehicle_accident_hold': 'Immobilisé (accident)',
  'vehicle_status_unavailable': 'Statut véhicule indisponible',
  'vehicle_availability_flag': 'Marqué indisponible',
  'vehicle_not_found': 'Véhicule introuvable',
  'invalid_range': 'Période invalide',
  'sub_rental_period_exceeded': 'Hors période sous-location',
  'sub_rental_no_active_contract': 'Pas de contrat sous-location actif',
};

String _reasonFr(String code) => _availabilityReasonFr[code] ?? code;

const _financialActions = <MapEntry<String, String>>[
  MapEntry('charge', 'Facturer la différence'),
  MapEntry('free_upgrade', 'Surclassement offert'),
  MapEntry('refund', 'Rembourser la différence'),
  MapEntry('ignore', 'Aucune action'),
];

class _VehicleSwapSheetState extends ConsumerState<VehicleSwapSheet> {
  _SwapStep _step = _SwapStep.reason;
  String? _reason;
  final _reasonNote = TextEditingController();
  String? _vehicleId;
  Map<String, dynamic>? _selectedVehicle;
  final _newRate = TextEditingController();
  String _financialAction = 'charge';
  bool _loadingEligible = false;
  bool _busy = false;
  String? _error;
  Map<String, dynamic>? _eligible;

  @override
  void dispose() {
    _reasonNote.dispose();
    _newRate.dispose();
    super.dispose();
  }

  Future<void> _loadEligible() async {
    setState(() {
      _loadingEligible = true;
      _error = null;
    });
    try {
      final data = await ref.read(reservationsRepoProvider).swapEligibleVehicles(
            reservationId: widget.reservationId,
            contractId: widget.contractId,
          );
      setState(() => _eligible = data);
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _loadingEligible = false);
    }
  }

  Future<void> _submit() async {
    if (_vehicleId == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final rate = double.tryParse(_newRate.text.trim());
      final reason = [_reason, _reasonNote.text.trim()]
          .where((s) => s != null && s.isNotEmpty)
          .join(' — ');
      await ref.read(reservationsRepoProvider).instantVehicleSwap(
            reservationId: widget.reservationId,
            contractId: widget.contractId,
            newVehicleId: _vehicleId!,
            reason: reason.isEmpty ? null : reason,
            newRate: rate,
            financialAction: _financialAction,
          );
      if (!mounted) return;
      Navigator.of(context).pop();
      widget.onDone?.call();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Véhicule changé.')),
      );
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  List<Map<String, dynamic>> get _availableVehicles {
    final cats = _eligible?['categories'];
    if (cats is! Map) return const [];
    final all = cats['all'];
    if (all is! List) return const [];
    return all
        .whereType<Map>()
        .map((e) => e.map((k, v) => MapEntry(k.toString(), v)))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 10),
                decoration: BoxDecoration(
                  color: Colors.black12,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            Row(
              children: [
                const Text(
                  'Changement de véhicule',
                  style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close, size: 20),
                  onPressed: _busy ? null : () => Navigator.of(context).pop(),
                ),
              ],
            ),
            _StepHeader(step: _step),
            const SizedBox(height: 10),
            Flexible(
              child: SingleChildScrollView(
                child: switch (_step) {
                  _SwapStep.reason => _buildReasonStep(),
                  _SwapStep.vehicle => _buildVehicleStep(),
                  _SwapStep.financial => _buildFinancialStep(),
                },
              ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_error!,
                    style: const TextStyle(color: Colors.redAccent, fontSize: 12)),
              ),
            const SizedBox(height: 12),
            _buildNav(),
          ],
        ),
      ),
    );
  }

  Widget _buildReasonStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Motif *',
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
        const SizedBox(height: 6),
        for (final r in _reasons)
          RadioListTile<String>(
            dense: true,
            contentPadding: EdgeInsets.zero,
            visualDensity: VisualDensity.compact,
            value: r.key,
            groupValue: _reason,
            onChanged: (v) => setState(() => _reason = v),
            title: Text(r.value, style: const TextStyle(fontSize: 13)),
          ),
        const SizedBox(height: 8),
        TextField(
          controller: _reasonNote,
          decoration: const InputDecoration(
            labelText: 'Précisions (facultatif)',
            border: OutlineInputBorder(),
            isDense: true,
          ),
          maxLines: 2,
          maxLength: 500,
        ),
      ],
    );
  }

  Widget _buildVehicleStep() {
    if (_loadingEligible) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 40),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    final vehicles = _availableVehicles;
    if (vehicles.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 20),
        child: Text('Aucun véhicule disponible pour la période.',
            style: TextStyle(fontSize: 13, color: Colors.black54)),
      );
    }
    return Column(
      children: [
        for (final v in vehicles) _vehicleCard(v),
      ],
    );
  }

  Widget _vehicleCard(Map<String, dynamic> v) {
    final selected = _vehicleId == v['id'];
    final isAvail = v['available'] == true;
    final brand = (v['brand_name'] ?? v['brand']?['name'] ?? '').toString();
    final model =
        (v['model_name'] ?? v['model']?['model_name'] ?? v['model']?['name'] ?? '')
            .toString();
    final plate = (v['registration_number'] ?? '—').toString();
    final reasonsRaw = v['availability_reasons'];
    final reasonFr = (!isAvail && reasonsRaw is List && reasonsRaw.isNotEmpty)
        ? _reasonFr(reasonsRaw.first.toString())
        : null;
    return Opacity(
      opacity: isAvail ? 1.0 : 0.55,
      child: InkWell(
      onTap: !isAvail
          ? null
          : () => setState(() {
                _vehicleId = v['id']?.toString();
                _selectedVehicle = v;
              }),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: selected ? const Color(0xFFEEF2FF) : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? const Color(0xFF6366F1) : Colors.black12,
            width: selected ? 1.6 : 1,
          ),
        ),
        child: Row(
          children: [
            Icon(
              selected
                  ? Icons.radio_button_checked
                  : Icons.radio_button_unchecked,
              color: selected ? const Color(0xFF6366F1) : Colors.black38,
              size: 18,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('$brand $model'.trim().isEmpty ? '—' : '$brand $model',
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 13)),
                  Text(plate,
                      style: const TextStyle(
                          color: Colors.black45, fontSize: 11)),
                  if (reasonFr != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(reasonFr,
                          style: const TextStyle(
                              color: Color(0xFFE11D48),
                              fontSize: 10,
                              fontWeight: FontWeight.w700)),
                    ),
                  Wrap(
                    spacing: 4,
                    children: [
                      for (final tag in [
                        v['categorie'],
                        v['fuel_type'],
                        v['transmission'],
                      ].whereType<String>().where((s) => s.isNotEmpty))
                        Container(
                          margin: const EdgeInsets.only(top: 3),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(
                            color: Colors.black.withOpacity(0.05),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(tag,
                              style: const TextStyle(
                                  fontSize: 9.5, fontWeight: FontWeight.w700)),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      ),
    );
  }

  Widget _buildFinancialStep() {
    final period = _eligible?['rental_period'] as Map?;
    final remainingDays = (period?['remaining_days'] as num?)?.toInt() ?? 0;
    final oldRate = (period?['old_daily_rate'] as num?)?.toDouble() ?? 0;
    final newRate = double.tryParse(_newRate.text.trim()) ?? 0;
    final money = NumberFormat.decimalPattern('fr');
    final subtotal = newRate * remainingDays;
    final v = _selectedVehicle;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (v != null)
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.black12),
            ),
            child: Row(
              children: [
                const Icon(Icons.directions_car, size: 18, color: Colors.black54),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '${v['brand_name'] ?? ''} ${v['model_name'] ?? ''} · ${v['registration_number'] ?? ''}',
                    style:
                        const TextStyle(fontWeight: FontWeight.w800, fontSize: 12.5),
                  ),
                ),
              ],
            ),
          ),
        const SizedBox(height: 12),
        TextField(
          controller: _newRate,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(
            labelText: 'Nouveau tarif / jour (MAD)',
            border: OutlineInputBorder(),
            isDense: true,
          ),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 10),
        _InfoRow(label: 'Jours restants', value: '$remainingDays j'),
        _InfoRow(
            label: 'Ancien tarif / jour',
            value: '${money.format(oldRate)} MAD'),
        _InfoRow(
            label: 'Sous-total nouveau véhicule',
            value: '${money.format(subtotal)} MAD'),
        const SizedBox(height: 10),
        const Text('Action financière *',
            style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
        for (final a in _financialActions)
          RadioListTile<String>(
            dense: true,
            contentPadding: EdgeInsets.zero,
            visualDensity: VisualDensity.compact,
            value: a.key,
            groupValue: _financialAction,
            onChanged: (v) => setState(() => _financialAction = v!),
            title: Text(a.value, style: const TextStyle(fontSize: 13)),
          ),
      ],
    );
  }

  Widget _buildNav() {
    final canNext = switch (_step) {
      _SwapStep.reason => _reason != null,
      _SwapStep.vehicle => _vehicleId != null,
      _SwapStep.financial => _financialAction.isNotEmpty,
    };
    final isLast = _step == _SwapStep.financial;
    return Row(
      children: [
        if (_step != _SwapStep.reason)
          OutlinedButton(
            onPressed: _busy
                ? null
                : () => setState(() => _step =
                    _SwapStep.values[_step.index - 1]),
            child: const Text('Retour'),
          ),
        const Spacer(),
        FilledButton(
          onPressed: !canNext || _busy
              ? null
              : () async {
                  if (isLast) {
                    await _submit();
                  } else {
                    final nextStep = _SwapStep.values[_step.index + 1];
                    setState(() => _step = nextStep);
                    if (nextStep == _SwapStep.vehicle && _eligible == null) {
                      await _loadEligible();
                    }
                  }
                },
          child: _busy
              ? const SizedBox(
                  width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : Text(isLast ? 'Confirmer le changement' : 'Suivant'),
        ),
      ],
    );
  }
}

class _StepHeader extends StatelessWidget {
  const _StepHeader({required this.step});
  final _SwapStep step;

  @override
  Widget build(BuildContext context) {
    final labels = ['Motif', 'Véhicule', 'Impact'];
    return Row(
      children: [
        for (var i = 0; i < labels.length; i++) ...[
          Container(
            width: 18,
            height: 18,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: i <= step.index
                  ? const Color(0xFF6366F1)
                  : Colors.black12,
            ),
            child: Text('${i + 1}',
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.w800)),
          ),
          const SizedBox(width: 6),
          Text(labels[i],
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w800,
                color: i == step.index
                    ? const Color(0xFF6366F1)
                    : Colors.black54,
              )),
          if (i < labels.length - 1)
            const Expanded(
                child: Padding(
              padding: EdgeInsets.symmetric(horizontal: 6),
              child: Divider(height: 1),
            )),
        ],
      ],
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            child: Text(label,
                style: const TextStyle(fontSize: 12, color: Colors.black54)),
          ),
          Text(value,
              style:
                  const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}
