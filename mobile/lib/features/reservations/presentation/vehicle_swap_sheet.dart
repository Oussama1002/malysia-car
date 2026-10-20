import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../data/reservations_repo.dart';

/// Changement de véhicule — pendant mobile du VehicleSwapWizard web.
/// Six étapes qui reproduisent le wizard web : Motif → Résumé → Véhicule →
/// Impact → Opérations → Confirmation. Appelle les mêmes endpoints
/// `/vehicle-swaps/*` que le web, avec les deux actions finales
/// « Enregistrer comme demande » et « Changer le véhicule immédiat ».
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
        child: FractionallySizedBox(
          heightFactor: 0.92,
          child: VehicleSwapSheet(
            reservationId: reservationId,
            contractId: contractId,
            onDone: onDone,
          ),
        ),
      ),
    );
  }

  @override
  ConsumerState<VehicleSwapSheet> createState() => _VehicleSwapSheetState();
}

enum _SwapStep { reason, summary, vehicle, financial, operations, confirmation }

const _reasons = <MapEntry<String, String>>[
  MapEntry('mechanical_breakdown', 'Panne mécanique'),
  MapEntry('accident', 'Accident'),
  MapEntry('maintenance', 'Maintenance'),
  MapEntry('customer_request', 'Demande client'),
  MapEntry('upgrade', 'Upgrade'),
  MapEntry('downgrade', 'Downgrade'),
  MapEntry('vehicle_unavailable', 'Véhicule indisponible'),
  MapEntry('commercial_gesture', 'Geste commercial'),
  MapEntry('other', 'Autre'),
];

String _reasonLabel(String? code) =>
    _reasons.firstWhere((e) => e.key == code, orElse: () => const MapEntry('', '—')).value;

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

String _availReasonFr(String code) => _availabilityReasonFr[code] ?? code;

const _vehicleTabs = <MapEntry<String, String>>[
  MapEntry('all', 'Tous'),
  MapEntry('recommended', 'Recommandés'),
  MapEntry('upgrade', 'Supérieure'),
  MapEntry('downgrade', 'Inférieure'),
];

const _financialActions = <MapEntry<String, String>>[
  MapEntry('charge', 'Facturer'),
  MapEntry('free_upgrade', 'Geste commercial'),
  MapEntry('refund', 'Rembourser'),
  MapEntry('ignore', 'Ignorer'),
];

String _financialActionLabel(String key) => _financialActions
    .firstWhere((e) => e.key == key, orElse: () => const MapEntry('', '—'))
    .value;

class _VehicleSwapSheetState extends ConsumerState<VehicleSwapSheet> {
  _SwapStep _step = _SwapStep.reason;
  String? _reason;
  final _reasonNote = TextEditingController();
  String? _vehicleId;
  Map<String, dynamic>? _selectedVehicle;
  final _newRate = TextEditingController();
  String _financialAction = 'charge';
  bool _createMissions = true;
  bool _oldVehicleRecovered = false;
  String _vehicleTab = 'all';
  final _vehicleSearch = TextEditingController();

  bool _loadingEligible = false;
  bool _busy = false;
  String? _error;
  Map<String, dynamic>? _eligible;
  List<Map<String, dynamic>>? _swaps;

  @override
  void initState() {
    super.initState();
    _loadSwapHistory();
  }

  @override
  void dispose() {
    _reasonNote.dispose();
    _newRate.dispose();
    _vehicleSearch.dispose();
    super.dispose();
  }

  Future<void> _loadSwapHistory() async {
    try {
      final rows = await ref.read(reservationsRepoProvider).vehicleSwaps(
            reservationId: widget.reservationId,
            contractId: widget.contractId,
          );
      if (!mounted) return;
      setState(() => _swaps = rows);
    } catch (_) {
      // Non-bloquant : on affichera la section sans historique.
    }
  }

  Future<void> _loadEligible() async {
    if (_eligible != null) return;
    setState(() {
      _loadingEligible = true;
      _error = null;
    });
    try {
      final data = await ref.read(reservationsRepoProvider).swapEligibleVehicles(
            reservationId: widget.reservationId,
            contractId: widget.contractId,
          );
      if (!mounted) return;
      setState(() => _eligible = data);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _loadingEligible = false);
    }
  }

  Future<void> _submit({required bool instant}) async {
    if (_vehicleId == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final reason = _reason == 'other'
          ? _reasonNote.text.trim()
          : _reasonLabel(_reason);
      final rate = double.tryParse(_newRate.text.trim().replaceAll(',', '.'));
      if (instant) {
        await ref.read(reservationsRepoProvider).instantVehicleSwap(
              reservationId: widget.reservationId,
              contractId: widget.contractId,
              newVehicleId: _vehicleId!,
              reason: reason.isEmpty ? null : reason,
              newRate: rate,
              financialAction: _financialAction,
              createMissions: _createMissions,
              oldVehicleRecovered: _oldVehicleRecovered,
            );
      } else {
        await ref.read(reservationsRepoProvider).requestVehicleSwap(
              reservationId: widget.reservationId,
              contractId: widget.contractId,
              newVehicleId: _vehicleId!,
              reason: reason.isEmpty ? null : reason,
            );
      }
      if (!mounted) return;
      Navigator.of(context).pop();
      widget.onDone?.call();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(instant
            ? 'Véhicule changé.'
            : 'Demande de changement enregistrée.')),
      );
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Dérivations partagées
  // ──────────────────────────────────────────────────────────────────────

  Map<String, dynamic>? get _currentVehicle {
    final v = _eligible?['current_vehicle'];
    return v is Map ? v.map((k, vv) => MapEntry(k.toString(), vv)) : null;
  }

  Map<String, dynamic>? get _rentalPeriod {
    final p = _eligible?['rental_period'];
    return p is Map ? p.map((k, vv) => MapEntry(k.toString(), vv)) : null;
  }

  List<Map<String, dynamic>> _categoryList(String key) {
    final cats = _eligible?['categories'];
    if (cats is! Map) return const [];
    final list = cats[key];
    if (list is! List) return const [];
    return list
        .whereType<Map>()
        .map((e) => e.map((k, v) => MapEntry(k.toString(), v)))
        .toList();
  }

  List<Map<String, dynamic>> get _searchPool {
    final q = _vehicleSearch.text.trim().toLowerCase();
    if (q.isEmpty) return _categoryList(_vehicleTab);
    return _categoryList('all').where((v) {
      final hay = [
        v['brand_name'], v['model_name'], v['registration_number'],
        v['categorie'], v['gamme'], v['fuel_type'], v['transmission'],
      ].whereType<String>().join(' ').toLowerCase();
      return hay.contains(q);
    }).toList();
  }

  double get _oldDailyRate =>
      ((_rentalPeriod?['old_daily_rate'] as num?)?.toDouble() ?? 0);
  int get _totalDays =>
      ((_rentalPeriod?['total_days'] as num?)?.toInt() ?? 0);
  int get _elapsedDays =>
      ((_rentalPeriod?['elapsed_days'] as num?)?.toInt() ?? 0);
  int get _remainingDays =>
      ((_rentalPeriod?['remaining_days'] as num?)?.toInt() ?? 0);
  String? get _pivot => _rentalPeriod?['pivot']?.toString();
  String? get _periodStart => _rentalPeriod?['start']?.toString();
  String? get _periodEnd => _rentalPeriod?['end']?.toString();
  double get _newDailyRate =>
      double.tryParse(_newRate.text.trim().replaceAll(',', '.')) ?? 0;

  double get _oldSubtotal => _elapsedDays * _oldDailyRate;
  double get _newSubtotal => _remainingDays * _newDailyRate;
  double get _originalPlan => _totalDays * _oldDailyRate;
  double get _newPlan => _oldSubtotal + _newSubtotal;
  double get _totalDifference => _newPlan - _originalPlan;

  // ──────────────────────────────────────────────────────────────────────
  // Build
  // ──────────────────────────────────────────────────────────────────────

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
                const Text('Changement de véhicule',
                    style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close, size: 20),
                  onPressed: _busy ? null : () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const SizedBox(height: 4),
            _StepperBar(step: _step),
            const SizedBox(height: 12),
            Expanded(
              child: SingleChildScrollView(
                child: switch (_step) {
                  _SwapStep.reason => _buildReasonStep(),
                  _SwapStep.summary => _buildSummaryStep(),
                  _SwapStep.vehicle => _buildVehicleStep(),
                  _SwapStep.financial => _buildFinancialStep(),
                  _SwapStep.operations => _buildOperationsStep(),
                  _SwapStep.confirmation => _buildConfirmationStep(),
                },
              ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_error!,
                    style: const TextStyle(color: Colors.redAccent, fontSize: 12)),
              ),
            const SizedBox(height: 10),
            _buildNav(),
          ],
        ),
      ),
    );
  }

  // ───────── Step 1 — Motif ─────────
  Widget _buildReasonStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Motif du changement *',
            style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800)),
        const SizedBox(height: 6),
        DropdownButtonFormField<String>(
          value: _reason,
          isExpanded: true,
          decoration: const InputDecoration(
            border: OutlineInputBorder(),
            isDense: true,
            contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          ),
          hint: const Text('— Sélectionner un motif —',
              style: TextStyle(fontSize: 13)),
          items: [
            for (final r in _reasons)
              DropdownMenuItem(value: r.key, child: Text(r.value)),
          ],
          onChanged: (v) => setState(() => _reason = v),
        ),
        if (_reason == 'other') ...[
          const SizedBox(height: 10),
          const Text('Description *',
              style: TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800)),
          const SizedBox(height: 6),
          TextField(
            controller: _reasonNote,
            decoration: const InputDecoration(
              hintText: 'Décrivez la raison du changement…',
              border: OutlineInputBorder(),
              isDense: true,
            ),
            maxLines: 3,
            maxLength: 500,
            onChanged: (_) => setState(() {}),
          ),
        ],
      ],
    );
  }

  // ───────── Step 2 — Résumé réservation ─────────
  Widget _buildSummaryStep() {
    if (_loadingEligible) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 40),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    final cv = _currentVehicle;
    final vName = cv == null
        ? '—'
        : '${cv['brand_name'] ?? ''} ${cv['model_name'] ?? ''}'.trim();
    final plate = cv?['registration_number']?.toString() ?? '—';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFFF8FAFC),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.black12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _summaryRow('Véhicule actuel', vName.isEmpty ? '—' : vName),
              _summaryRow('Immatriculation', plate),
              _summaryRow(
                'Période',
                _periodStart != null && _periodEnd != null
                    ? '${dateFmt.format(DateTime.parse(_periodStart!))} → ${dateFmt.format(DateTime.parse(_periodEnd!))}'
                    : '—',
              ),
              _summaryRow('Jours restants', '$_remainingDays j'),
              _summaryRow('Durée totale', '$_totalDays j'),
              if (_oldDailyRate > 0)
                _summaryRow('Tarif / jour actuel',
                    '${NumberFormat.decimalPattern('fr').format(_oldDailyRate)} MAD'),
            ],
          ),
        ),
        const SizedBox(height: 14),
        const Text('Historique des changements',
            style: TextStyle(
                fontSize: 10.5,
                fontWeight: FontWeight.w900,
                letterSpacing: 1.1,
                color: Colors.black45)),
        const SizedBox(height: 6),
        if ((_swaps ?? const []).isEmpty)
          const Text('Aucun changement précédent.',
              style: TextStyle(fontSize: 12.5, color: Colors.black45))
        else
          for (final s in _swaps!) _swapHistoryRow(s),
      ],
    );
  }

  Widget _summaryRow(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
            child: Text(k,
                style: const TextStyle(fontSize: 12, color: Colors.black54)),
          ),
          Flexible(
            child: Text(v,
                textAlign: TextAlign.end,
                overflow: TextOverflow.ellipsis,
                style:
                    const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800)),
          ),
        ],
      ),
    );
  }

  Widget _swapHistoryRow(Map<String, dynamic> s) {
    String name(dynamic v) {
      if (v is! Map) return '';
      final brand = v['brand']?['name'] ?? v['brand_name'] ?? '';
      final model = v['model']?['model_name'] ?? v['model']?['name'] ?? v['model_name'] ?? '';
      return '$brand $model'.trim();
    }

    final status = (s['status'] ?? '').toString();
    final badgeColor = switch (status) {
      'approved' => const Color(0xFF059669),
      'rejected' => const Color(0xFFE11D48),
      _ => const Color(0xFFB45309),
    };
    final badgeLabel = switch (status) {
      'approved' => 'Validé',
      'rejected' => 'Refusé',
      _ => 'En attente',
    };
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.black12),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              '${name(s['old_vehicle'])} → ${name(s['new_vehicle'])}',
              style: const TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w800),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: badgeColor.withOpacity(0.12),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(badgeLabel,
                style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                    color: badgeColor)),
          ),
        ],
      ),
    );
  }

  // ───────── Step 3 — Véhicule ─────────
  Widget _buildVehicleStep() {
    if (_loadingEligible) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 40),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    final pool = _searchPool;
    final q = _vehicleSearch.text.trim();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _vehicleSearch,
          decoration: InputDecoration(
            prefixIcon: const Icon(Icons.search, size: 18),
            hintText: 'Rechercher (marque, modèle, immat…)',
            isDense: true,
            border: const OutlineInputBorder(),
            suffixIcon: q.isEmpty
                ? null
                : IconButton(
                    icon: const Icon(Icons.close, size: 18),
                    onPressed: () => setState(() => _vehicleSearch.clear()),
                  ),
          ),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 10),
        if (q.isEmpty)
          SizedBox(
            height: 36,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: _vehicleTabs.length,
              separatorBuilder: (_, __) => const SizedBox(width: 6),
              itemBuilder: (_, i) {
                final t = _vehicleTabs[i];
                final active = _vehicleTab == t.key;
                final count = _categoryList(t.key).length;
                return ChoiceChip(
                  label: Text('${t.value} ($count)',
                      style: const TextStyle(
                          fontSize: 11.5, fontWeight: FontWeight.w800)),
                  selected: active,
                  onSelected: (_) => setState(() => _vehicleTab = t.key),
                );
              },
            ),
          )
        else
          Text('Résultats : ${pool.length} véhicule${pool.length > 1 ? 's' : ''}',
              style: const TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.1,
                  color: Colors.black45)),
        const SizedBox(height: 10),
        if (pool.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 20),
            child: Text('Aucun véhicule disponible.',
                style: TextStyle(fontSize: 13, color: Colors.black54)),
          )
        else
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
              childAspectRatio: 0.74,
            ),
            itemCount: pool.length,
            itemBuilder: (_, i) => _vehicleCard(pool[i]),
          ),
        if (_selectedVehicle != null) _compatibilityBlock(),
      ],
    );
  }

  Widget _vehicleCard(Map<String, dynamic> v) {
    final selected = _vehicleId == v['id'];
    final isAvail = v['available'] == true;
    final brand = (v['brand_name'] ?? v['brand']?['name'] ?? '').toString();
    final model = (v['model_name'] ??
            v['model']?['model_name'] ??
            v['model']?['name'] ??
            '')
        .toString();
    final plate = (v['registration_number'] ?? '—').toString();
    final reasonsRaw = v['availability_reasons'];
    final reasonFr = (!isAvail && reasonsRaw is List && reasonsRaw.isNotEmpty)
        ? _availReasonFr(reasonsRaw.first.toString())
        : null;
    final photo = v['photo_url']?.toString();
    return Opacity(
      opacity: isAvail ? 1.0 : 0.55,
      child: InkWell(
        onTap: !isAvail ? null : () => _openPricePopup(v),
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: selected ? const Color(0xFFEEF2FF) : Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected ? const Color(0xFF6366F1) : Colors.black12,
              width: selected ? 1.6 : 1,
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AspectRatio(
                aspectRatio: 16 / 9,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Container(
                    color: const Color(0xFFF1F5F9),
                    alignment: Alignment.center,
                    child: (photo != null && photo.isNotEmpty)
                        ? Image.network(photo, fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) =>
                                const Icon(Icons.directions_car, color: Colors.black26))
                        : const Icon(Icons.directions_car, color: Colors.black26),
                  ),
                ),
              ),
              const SizedBox(height: 6),
              Text('$brand $model'.trim().isEmpty ? '—' : '$brand $model',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style:
                      const TextStyle(fontWeight: FontWeight.w900, fontSize: 12)),
              Text(plate,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style:
                      const TextStyle(color: Colors.black45, fontSize: 10.5)),
              Wrap(
                spacing: 4,
                runSpacing: 2,
                children: [
                  for (final tag in [
                    v['categorie'],
                    v['fuel_type'],
                    v['transmission'],
                  ].whereType<String>().where((s) => s.isNotEmpty))
                    Container(
                      margin: const EdgeInsets.only(top: 2),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 5, vertical: 1),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.05),
                        borderRadius: BorderRadius.circular(5),
                      ),
                      child: Text(tag,
                          style: const TextStyle(
                              fontSize: 9, fontWeight: FontWeight.w800)),
                    ),
                ],
              ),
              const Spacer(),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: isAvail
                      ? const Color(0xFFECFDF5)
                      : const Color(0xFFFEF2F2),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text(
                  isAvail ? 'Disponible' : (reasonFr ?? 'Indisponible'),
                  style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w900,
                      color: isAvail
                          ? const Color(0xFF059669)
                          : const Color(0xFFE11D48)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _compatibilityBlock() {
    final cv = _currentVehicle;
    final sv = _selectedVehicle;
    if (cv == null || sv == null) return const SizedBox.shrink();
    final rows = <List<String>>[
      ['Catégorie', (cv['categorie'] ?? '').toString(), (sv['categorie'] ?? '').toString()],
      ['Gamme', (cv['gamme'] ?? '').toString(), (sv['gamme'] ?? '').toString()],
      ['Transmission', (cv['transmission'] ?? '').toString(), (sv['transmission'] ?? '').toString()],
      ['Carburant', (cv['fuel_type'] ?? '').toString(), (sv['fuel_type'] ?? '').toString()],
    ];
    return Container(
      margin: const EdgeInsets.only(top: 12),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.black12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Comparaison',
              style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.1,
                  color: Colors.black45)),
          const SizedBox(height: 6),
          const Row(children: [
            Expanded(flex: 2, child: SizedBox()),
            Expanded(flex: 3, child: Text('Actuel', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800))),
            Expanded(flex: 3, child: Text('Nouveau', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Color(0xFF6366F1)))),
          ]),
          for (final r in rows) _compatRow(r[0], r[1], r[2]),
        ],
      ),
    );
  }

  Widget _compatRow(String label, String oldV, String newV) {
    final diff = oldV.isNotEmpty && newV.isNotEmpty && oldV != newV;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(flex: 2, child: Text(label, style: const TextStyle(fontSize: 11.5, color: Colors.black54))),
          Expanded(flex: 3, child: Text(oldV.isEmpty ? '—' : oldV, style: const TextStyle(fontSize: 11.5, fontWeight: FontWeight.w800))),
          Expanded(
            flex: 3,
            child: Row(
              children: [
                Expanded(
                  child: Text(newV.isEmpty ? '—' : newV,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w800,
                          color: diff ? const Color(0xFFB45309) : null)),
                ),
                if (diff)
                  const Padding(
                    padding: EdgeInsets.only(left: 2),
                    child: Icon(Icons.warning_amber_rounded,
                        color: Color(0xFFB45309), size: 14),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _openPricePopup(Map<String, dynamic> v) async {
    final controller = TextEditingController(
      text: (v['id'] == _vehicleId && _newRate.text.isNotEmpty) ? _newRate.text : '',
    );
    final money = NumberFormat.decimalPattern('fr');
    await showDialog<void>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(builder: (ctx, setLocal) {
          final rate = double.tryParse(controller.text.replaceAll(',', '.')) ?? 0;
          final subtotal = rate * _remainingDays;
          final vName =
              '${v['brand_name'] ?? ''} ${v['model_name'] ?? ''}'.trim();
          return AlertDialog(
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Nouveau véhicule',
                    style: TextStyle(fontSize: 11, color: Colors.black45)),
                Text(vName.isEmpty ? 'Véhicule' : vName,
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
                Text(v['registration_number']?.toString() ?? '—',
                    style: const TextStyle(fontSize: 11, color: Colors.black54)),
              ],
            ),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                  controller: controller,
                  autofocus: true,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(
                    labelText: 'Tarif facturé au client (MAD / jour)',
                    border: OutlineInputBorder(),
                    isDense: true,
                  ),
                  onChanged: (_) => setLocal(() {}),
                ),
                const SizedBox(height: 8),
                if (rate > 0 && _remainingDays > 0)
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: const Color(0xFFEEF2FF),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text('Sous-total $_remainingDays j restants',
                              style: const TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w800,
                                  color: Color(0xFF4F46E5))),
                        ),
                        Text('${money.format(subtotal)} MAD',
                            style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.w900,
                                color: Color(0xFF4F46E5))),
                      ],
                    ),
                  ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.of(ctx).pop(),
                child: const Text('Annuler'),
              ),
              FilledButton(
                onPressed: () {
                  setState(() {
                    _vehicleId = v['id']?.toString();
                    _selectedVehicle = v;
                    _newRate.text = controller.text.trim();
                  });
                  Navigator.of(ctx).pop();
                },
                child: const Text('Confirmer'),
              ),
            ],
          );
        });
      },
    );
  }

  // ───────── Step 4 — Impact financier ─────────
  Widget _buildFinancialStep() {
    final money = NumberFormat.decimalPattern('fr');
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    final elapsedPct = _totalDays > 0 ? (_elapsedDays / _totalDays).clamp(0, 1) : 0;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.black12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Répartition du séjour',
                      style: TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1.1,
                          color: Colors.black45)),
                  Text('$_totalDays jour${_totalDays > 1 ? "s" : ""}',
                      style: const TextStyle(
                          fontSize: 10.5, fontWeight: FontWeight.w800)),
                ],
              ),
              const SizedBox(height: 6),
              ClipRRect(
                borderRadius: BorderRadius.circular(999),
                child: Row(
                  children: [
                    Expanded(
                        flex: (elapsedPct * 100).round(),
                        child: Container(
                            height: 10, color: const Color(0xFF94A3B8))),
                    Expanded(
                        flex: 100 - (elapsedPct * 100).round(),
                        child: Container(
                            height: 10, color: const Color(0xFF6366F1))),
                  ],
                ),
              ),
              const SizedBox(height: 6),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(_periodStart != null
                      ? dateFmt.format(DateTime.parse(_periodStart!))
                      : '—',
                      style: const TextStyle(fontSize: 10, color: Colors.black45)),
                  if (_pivot != null)
                    Text('⇵ ${dateFmt.format(DateTime.parse(_pivot!))}',
                        style: const TextStyle(fontSize: 10, color: Colors.black45)),
                  Text(_periodEnd != null
                      ? dateFmt.format(DateTime.parse(_periodEnd!))
                      : '—',
                      style: const TextStyle(fontSize: 10, color: Colors.black45)),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _vehicleColumn(
          tone: 'old',
          heading: 'Ancien véhicule',
          v: _currentVehicle,
          days: _elapsedDays,
          daysLabel: 'Jours utilisés',
          dailyRate: _oldDailyRate,
          subtotal: _oldSubtotal,
        ),
        const SizedBox(height: 10),
        _vehicleColumn(
          tone: 'new',
          heading: 'Nouveau véhicule',
          v: _selectedVehicle,
          days: _remainingDays,
          daysLabel: 'Jours restants',
          dailyRate: _newDailyRate,
          subtotal: _newSubtotal,
          editableRate: true,
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.black12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Récapitulatif financier',
                  style: TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.1,
                      color: Colors.black45)),
              const SizedBox(height: 6),
              _summaryRow('Plan initial',
                  '${money.format(_originalPlan)} MAD'),
              _summaryRow('Nouveau plan', '${money.format(_newPlan)} MAD'),
              const Divider(height: 16),
              Row(
                children: [
                  const Expanded(
                    child: Text('Différence à facturer',
                        style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w900)),
                  ),
                  Text(
                    '${_totalDifference > 0 ? "+" : ""}${money.format(_totalDifference)} MAD',
                    style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w900,
                        color: _totalDifference > 0
                            ? const Color(0xFFE11D48)
                            : _totalDifference < 0
                                ? const Color(0xFF059669)
                                : Colors.black87),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          childAspectRatio: 2.6,
          children: [
            for (final a in _financialActions)
              InkWell(
                onTap: () => setState(() => _financialAction = a.key),
                borderRadius: BorderRadius.circular(10),
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: _financialAction == a.key
                        ? const Color(0xFFEEF2FF)
                        : Colors.white,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(
                      color: _financialAction == a.key
                          ? const Color(0xFF6366F1)
                          : Colors.black12,
                      width: _financialAction == a.key ? 1.6 : 1,
                    ),
                  ),
                  child: Center(
                    child: Text(a.value,
                        style: const TextStyle(
                            fontSize: 12, fontWeight: FontWeight.w900)),
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }

  Widget _vehicleColumn({
    required String tone,
    required String heading,
    required Map<String, dynamic>? v,
    required int days,
    required String daysLabel,
    required double dailyRate,
    required double subtotal,
    bool editableRate = false,
  }) {
    final money = NumberFormat.decimalPattern('fr');
    final chrome = tone == 'old'
        ? const Color(0xFFF8FAFC)
        : const Color(0xFFEEF2FF);
    final borderC = tone == 'old' ? Colors.black12 : const Color(0xFFC7D2FE);
    final headingC = tone == 'old' ? Colors.black54 : const Color(0xFF4F46E5);
    final name = v == null
        ? '—'
        : '${v['brand_name'] ?? v['brand']?['name'] ?? ''} ${v['model_name'] ?? v['model']?['model_name'] ?? v['model']?['name'] ?? ''}'
            .trim();
    final plate = v?['registration_number']?.toString() ?? '—';
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: chrome,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: borderC),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(heading,
              style: TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.1,
                  color: headingC)),
          const SizedBox(height: 6),
          Text(name.isEmpty ? '—' : name,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w900)),
          Text(plate,
              style: const TextStyle(fontSize: 11, color: Colors.black54)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(child: _kv(daysLabel, '$days j')),
              const SizedBox(width: 8),
              Expanded(
                child: editableRate
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Tarif / jour',
                              style: TextStyle(
                                  fontSize: 9.5,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.black45)),
                          TextField(
                            controller: _newRate,
                            keyboardType: const TextInputType.numberWithOptions(decimal: true),
                            decoration: const InputDecoration(
                              isDense: true,
                              border: InputBorder.none,
                              hintText: '0',
                            ),
                            style: const TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w900,
                                color: Color(0xFF4F46E5)),
                            onChanged: (_) => setState(() {}),
                          ),
                        ],
                      )
                    : _kv('Tarif / jour', '${money.format(dailyRate)} MAD'),
              ),
            ],
          ),
          const SizedBox(height: 6),
          const Divider(height: 10),
          Row(
            children: [
              const Expanded(
                child: Text('Sous-total',
                    style:
                        TextStyle(fontSize: 11, fontWeight: FontWeight.w800)),
              ),
              Text('${money.format(subtotal)} MAD',
                  style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w900,
                      color: tone == 'old' ? Colors.black87 : const Color(0xFF4F46E5))),
            ],
          ),
        ],
      ),
    );
  }

  Widget _kv(String k, String v) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(k,
            style: const TextStyle(
                fontSize: 9.5, fontWeight: FontWeight.w800, color: Colors.black45)),
        Text(v,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
      ],
    );
  }

  // ───────── Step 5 — Opérations ─────────
  Widget _buildOperationsStep() {
    final rows = <String>[
      "Retour de l'ancien véhicule",
      'Mise à jour de la réservation',
      if (widget.contractId != null) 'Mise à jour du contrat',
      'Notification au client',
      'Notification au gestionnaire de flotte',
      "Création du journal d'audit",
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.black12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Les opérations suivantes seront effectuées',
                  style: TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.1,
                      color: Colors.black45)),
              const SizedBox(height: 8),
              for (final r in rows)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    children: [
                      Container(
                        width: 18, height: 18,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: Color(0xFFECFDF5),
                        ),
                        alignment: Alignment.center,
                        child: const Icon(Icons.check,
                            size: 12, color: Color(0xFF059669)),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(r,
                            style: const TextStyle(fontSize: 12.5)),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.black12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              CheckboxListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                value: _createMissions,
                onChanged: (v) =>
                    setState(() => _createMissions = v ?? true),
                title: const Text('Créer automatiquement les missions',
                    style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w800)),
                subtitle: const Text(
                    'Mission de récupération + mission de livraison',
                    style: TextStyle(fontSize: 11, color: Colors.black54)),
              ),
              if (_createMissions) ...[
                const Divider(height: 10),
                const Text("L'ancien véhicule a-t-il déjà été récupéré ?",
                    style: TextStyle(
                        fontSize: 11.5, fontWeight: FontWeight.w800)),
                Row(
                  children: [
                    Radio<bool>(
                      value: true,
                      groupValue: _oldVehicleRecovered,
                      onChanged: (v) =>
                          setState(() => _oldVehicleRecovered = v ?? false),
                    ),
                    const Text('Oui', style: TextStyle(fontSize: 12.5)),
                    const SizedBox(width: 16),
                    Radio<bool>(
                      value: false,
                      groupValue: _oldVehicleRecovered,
                      onChanged: (v) =>
                          setState(() => _oldVehicleRecovered = v ?? false),
                    ),
                    const Text('Non', style: TextStyle(fontSize: 12.5)),
                  ],
                ),
                const SizedBox(height: 4),
                if (!_oldVehicleRecovered)
                  const Text('→ Mission de récupération sera créée',
                      style: TextStyle(
                          fontSize: 11.5,
                          color: Color(0xFFB45309),
                          fontWeight: FontWeight.w800)),
                const Text('→ Mission de livraison sera créée',
                    style: TextStyle(
                        fontSize: 11.5,
                        color: Color(0xFF4F46E5),
                        fontWeight: FontWeight.w800)),
              ],
            ],
          ),
        ),
      ],
    );
  }

  // ───────── Step 6 — Confirmation ─────────
  Widget _buildConfirmationStep() {
    final money = NumberFormat.decimalPattern('fr');
    final cv = _currentVehicle;
    final sv = _selectedVehicle;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            gradient: const LinearGradient(colors: [
              Color(0xFFF8FAFC),
              Color(0xFFEEF2FF),
            ]),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: const Color(0xFFC7D2FE)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Échange de véhicule',
                  style: TextStyle(
                      fontSize: 10.5,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.1,
                      color: Colors.black45)),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: _confirmBox('Ancien',
                        '${cv?['brand_name'] ?? ''} ${cv?['model_name'] ?? ''}'.trim(),
                        cv?['registration_number']?.toString() ?? '—',
                        bg: Colors.white, fg: Colors.black87),
                  ),
                  const Padding(
                    padding: EdgeInsets.symmetric(horizontal: 6),
                    child: Icon(Icons.arrow_forward_rounded,
                        color: Color(0xFF6366F1)),
                  ),
                  Expanded(
                    child: _confirmBox('Nouveau',
                        '${sv?['brand_name'] ?? ''} ${sv?['model_name'] ?? ''}'.trim(),
                        sv?['registration_number']?.toString() ?? '—',
                        bg: const Color(0xFF6366F1), fg: Colors.white),
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.black12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _summaryRow('Motif',
                  _reason == 'other' ? _reasonNote.text.trim() : _reasonLabel(_reason)),
              _summaryRow(
                  'Impact financier',
                  '${_totalDifference > 0 ? "+" : ""}${money.format(_totalDifference)} MAD'),
              _summaryRow('Nouveau tarif',
                  '${money.format(_newDailyRate)} MAD / j'),
              _summaryRow('Action financière', _financialActionLabel(_financialAction)),
              _summaryRow('Missions',
                  _createMissions
                      ? '${_oldVehicleRecovered ? 1 : 2} mission(s)'
                      : 'Aucune'),
            ],
          ),
        ),
      ],
    );
  }

  Widget _confirmBox(String tag, String name, String plate,
      {required Color bg, required Color fg}) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.black12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Text(tag,
              style: TextStyle(
                  fontSize: 9.5,
                  fontWeight: FontWeight.w800,
                  color: fg.withOpacity(0.7))),
          const SizedBox(height: 4),
          Text(name.isEmpty ? '—' : name,
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w900, color: fg)),
          Text(plate,
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 10, color: fg.withOpacity(0.7))),
        ],
      ),
    );
  }

  // ───────── Navigation ─────────
  bool _canAdvance() {
    switch (_step) {
      case _SwapStep.reason:
        if (_reason == null) return false;
        if (_reason == 'other' && _reasonNote.text.trim().isEmpty) return false;
        return true;
      case _SwapStep.summary:
        return true;
      case _SwapStep.vehicle:
        return _vehicleId != null && (_selectedVehicle?['available'] == true);
      case _SwapStep.financial:
        return _financialAction.isNotEmpty;
      case _SwapStep.operations:
        return true;
      case _SwapStep.confirmation:
        return true;
    }
  }

  Future<void> _next() async {
    if (!_canAdvance()) return;
    final nextIdx = _step.index + 1;
    if (nextIdx >= _SwapStep.values.length) return;
    final next = _SwapStep.values[nextIdx];
    // Lazy-load eligible vehicles on first entry to Résumé (so the summary
    // can read current_vehicle + rental_period from the same payload).
    if (next == _SwapStep.summary || next == _SwapStep.vehicle) {
      await _loadEligible();
    }
    if (!mounted) return;
    setState(() => _step = next);
  }

  void _prev() {
    final prevIdx = _step.index - 1;
    if (prevIdx < 0) return;
    setState(() => _step = _SwapStep.values[prevIdx]);
  }

  Widget _buildNav() {
    final atLast = _step == _SwapStep.confirmation;
    return Row(
      children: [
        if (_step != _SwapStep.reason)
          OutlinedButton(
            onPressed: _busy ? null : _prev,
            child: const Text('Précédent'),
          ),
        const Spacer(),
        if (!atLast)
          FilledButton(
            onPressed: !_canAdvance() || _busy ? null : _next,
            child: const Text('Suivant'),
          )
        else ...[
          OutlinedButton(
            onPressed: _busy ? null : () => _submit(instant: false),
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFFB45309),
              side: const BorderSide(color: Color(0xFFF59E0B)),
            ),
            child: _busy
                ? const SizedBox(
                    width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Enregistrer comme demande'),
          ),
          const SizedBox(width: 8),
          FilledButton(
            onPressed: _busy ? null : () => _submit(instant: true),
            child: _busy
                ? const SizedBox(
                    width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Changer le véhicule'),
          ),
        ],
      ],
    );
  }
}

class _StepperBar extends StatelessWidget {
  const _StepperBar({required this.step});
  final _SwapStep step;

  static const _labels = [
    'Motif',
    'Résumé',
    'Véhicule',
    'Impact',
    'Opérations',
    'Confirmation',
  ];

  @override
  Widget build(BuildContext context) {
    final idx = step.index;
    return SizedBox(
      height: 22,
      child: Row(
        children: [
          for (var i = 0; i < _labels.length; i++) ...[
            Container(
              width: 18,
              height: 18,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: i <= idx ? const Color(0xFF6366F1) : Colors.black12,
              ),
              child: i < idx
                  ? const Icon(Icons.check, size: 11, color: Colors.white)
                  : Text('${i + 1}',
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 9.5,
                          fontWeight: FontWeight.w900)),
            ),
            if (i < _labels.length - 1)
              Expanded(
                child: Container(
                  height: 2,
                  margin: const EdgeInsets.symmetric(horizontal: 3),
                  color: i < idx ? const Color(0xFF6366F1) : Colors.black12,
                ),
              ),
          ],
        ],
      ),
    );
  }
}
