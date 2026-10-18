import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../data/reservations_repo.dart';

/// Nouvelle prolongation — pendant mobile du drawer web.
///
/// Affiche le contexte (date début, date retour, durée, tarif/jour),
/// calcule automatiquement le montant additionnel et le nouveau total
/// à partir de la nouvelle date de retour, puis POST
/// `/reservations/{id}/request-extension` (le backend journalise en
/// audit, cf. ReservationController@requestExtension).
class ExtensionSheet extends ConsumerStatefulWidget {
  const ExtensionSheet({
    super.key,
    required this.reservationId,
    this.startAt,
    this.endAt,
    this.dailyRate = 0,
    this.currentTotal = 0,
    this.onDone,
  });

  final String reservationId;
  final DateTime? startAt;
  final DateTime? endAt;
  final double dailyRate;
  final double currentTotal;
  final VoidCallback? onDone;

  static Future<void> show(
    BuildContext context, {
    required String reservationId,
    DateTime? startAt,
    DateTime? endAt,
    double dailyRate = 0,
    double currentTotal = 0,
    VoidCallback? onDone,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      useSafeArea: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: ExtensionSheet(
          reservationId: reservationId,
          startAt: startAt,
          endAt: endAt,
          dailyRate: dailyRate,
          currentTotal: currentTotal,
          onDone: onDone,
        ),
      ),
    );
  }

  @override
  ConsumerState<ExtensionSheet> createState() => _ExtensionSheetState();
}

class _ExtensionSheetState extends ConsumerState<ExtensionSheet> {
  DateTime? _newEnd;
  final _amount = TextEditingController();
  final _notes = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    _notes.dispose();
    super.dispose();
  }

  int get _addedDays {
    final from = widget.endAt;
    if (from == null || _newEnd == null) return 0;
    final d = _newEnd!.difference(from).inDays;
    return d > 0 ? d : 0;
  }

  /// Tarif/jour fiable. Le backend `totals.daily_rate` renvoie parfois
  /// le MONTANT TOTAL quand la réservation couvre un seul jour
  /// (contract_total / 1 = contract_total). On préfère donc dériver le
  /// tarif journalier localement à partir du total courant et de la
  /// durée, puis on retombe sur le widget.dailyRate. L'auto-calcul ne
  /// peut plus multiplier le total par les jours.
  double get _reliableDailyRate {
    final derived = (_totalDays > 0 && widget.currentTotal > 0)
        ? widget.currentTotal / _totalDays
        : 0.0;
    return derived > 0 ? derived : widget.dailyRate;
  }

  double get _autoAdditional => _addedDays * _reliableDailyRate;

  double get _effectiveAdditional {
    final typed = double.tryParse(_amount.text.trim().replaceAll(',', '.'));
    if (_amount.text.trim().isNotEmpty && typed != null) return typed;
    return _autoAdditional;
  }

  double get _newTotal => widget.currentTotal + _effectiveAdditional;

  int get _totalDays {
    final s = widget.startAt;
    final e = widget.endAt;
    if (s == null || e == null) return 0;
    final d = e.difference(s).inDays;
    return d > 0 ? d : 0;
  }

  Future<void> _submit() async {
    if (_newEnd == null) {
      setState(() => _error = 'Choisissez la nouvelle date de retour.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(reservationsRepoProvider).requestExtension(
        widget.reservationId,
        {
          'new_end_at': _newEnd!.toUtc().toIso8601String(),
          'additional_amount': _effectiveAdditional,
          if (_notes.text.trim().isNotEmpty) 'notes': _notes.text.trim(),
        },
      );
      if (!mounted) return;
      Navigator.of(context).pop();
      widget.onDone?.call();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Prolongation enregistrée.')),
      );
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.decimalPattern('fr');
    final dateFmt = DateFormat('dd/MM/yyyy HH:mm', 'fr');
    final maxH = MediaQuery.of(context).size.height * 0.9;
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: maxH),
      child: Container(
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
                  const Icon(Icons.update_outlined,
                      color: Color(0xFFF59E0B), size: 20),
                  const SizedBox(width: 8),
                  const Text('Nouvelle prolongation',
                      style:
                          TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.close, size: 20),
                    onPressed:
                        _busy ? null : () => Navigator.of(context).pop(),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      GridView.count(
                        crossAxisCount: 2,
                        shrinkWrap: true,
                        physics: const NeverScrollableScrollPhysics(),
                        childAspectRatio: 3,
                        mainAxisSpacing: 6,
                        crossAxisSpacing: 6,
                        children: [
                          _tile('Date début',
                              widget.startAt == null
                                  ? '—'
                                  : dateFmt.format(widget.startAt!)),
                          _tile('Date retour',
                              widget.endAt == null
                                  ? '—'
                                  : dateFmt.format(widget.endAt!)),
                          _tile('Durée',
                              _totalDays > 0 ? '$_totalDays j' : '—'),
                          _tile('Tarif / jour',
                              _reliableDailyRate > 0
                                  ? '${money.format(_reliableDailyRate)} MAD'
                                  : '—'),
                        ],
                      ),
                      if (widget.currentTotal > 0) ...[
                        const SizedBox(height: 6),
                        _tile('Montant total actuel',
                            '${money.format(widget.currentTotal)} MAD'),
                      ],
                      const SizedBox(height: 12),
                      InkWell(
                        onTap: () async {
                          final picked = await showDatePicker(
                            context: context,
                            initialDate: _newEnd ??
                                widget.endAt?.add(const Duration(days: 1)) ??
                                DateTime.now(),
                            firstDate: widget.endAt ?? DateTime(2000),
                            lastDate: DateTime(2100),
                            locale: const Locale('fr'),
                          );
                          if (picked == null) return;
                          final time = await showTimePicker(
                            context: context,
                            initialTime: TimeOfDay(
                                hour: widget.endAt?.hour ?? 18,
                                minute: widget.endAt?.minute ?? 0),
                          );
                          setState(() {
                            _newEnd = DateTime(
                              picked.year,
                              picked.month,
                              picked.day,
                              time?.hour ?? 18,
                              time?.minute ?? 0,
                            );
                          });
                        },
                        child: InputDecorator(
                          decoration: const InputDecoration(
                            labelText: 'Nouvelle date de retour *',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                          child: Row(
                            children: [
                              Expanded(
                                child: Text(
                                  _newEnd == null
                                      ? 'Choisir…'
                                      : dateFmt.format(_newEnd!),
                                  style: TextStyle(
                                    color: _newEnd == null
                                        ? Colors.black45
                                        : Colors.black87,
                                  ),
                                ),
                              ),
                              const Icon(Icons.calendar_today,
                                  size: 16, color: Colors.black54),
                            ],
                          ),
                        ),
                      ),
                      if (_addedDays > 0)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                            '+ $_addedDays jour${_addedDays > 1 ? "s" : ""}',
                            style: const TextStyle(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w800,
                                color: Color(0xFF4338CA)),
                          ),
                        ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _amount,
                        keyboardType: const TextInputType.numberWithOptions(
                            decimal: true),
                        onChanged: (_) => setState(() {}),
                        decoration: InputDecoration(
                          labelText: 'Montant additionnel (MAD)',
                          helperText: _autoAdditional > 0
                              ? 'Auto : ${money.format(_autoAdditional)} '
                                  '($_addedDays j × ${money.format(_reliableDailyRate)})'
                              : null,
                          border: const OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: _tile(
                              'Montant ajouté',
                              '${money.format(_effectiveAdditional)} MAD',
                              tone: const Color(0xFFEEF2FF),
                              fg: const Color(0xFF4338CA),
                            ),
                          ),
                          const SizedBox(width: 6),
                          Expanded(
                            child: _tile(
                              'Nouveau total',
                              '${money.format(_newTotal)} MAD',
                              tone: const Color(0xFFECFDF5),
                              fg: const Color(0xFF047857),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _notes,
                        decoration: const InputDecoration(
                          labelText: 'Raison',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                      if (_error != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(_error!,
                              style: const TextStyle(
                                  color: Colors.redAccent, fontSize: 12)),
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  OutlinedButton(
                    onPressed:
                        _busy ? null : () => Navigator.of(context).pop(),
                    child: const Text('Annuler'),
                  ),
                  const Spacer(),
                  FilledButton(
                    onPressed: _busy || _newEnd == null ? null : _submit,
                    style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFFF59E0B)),
                    child: _busy
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white))
                        : const Text('Appliquer prolongation'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _tile(String label, String value, {Color? tone, Color? fg}) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: tone ?? const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(label,
              style: TextStyle(
                  color: fg?.withOpacity(0.8) ?? Colors.black45,
                  fontSize: 9.5,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.8)),
          const SizedBox(height: 2),
          Text(value,
              style: TextStyle(
                  color: fg ?? Colors.black87,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }
}
