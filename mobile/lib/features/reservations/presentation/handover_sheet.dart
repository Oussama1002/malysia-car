import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../data/reservation_detail_dto.dart';
import '../data/reservations_repo.dart';

/// Check-Out (pickup) / Check-In (return) — bottom sheet compacte qui
/// appelle les endpoints `/reservations/{id}/handover-pickup` et
/// `/handover-return`. Même look-and-feel que [VehicleSwapSheet].
class HandoverSheet extends ConsumerStatefulWidget {
  const HandoverSheet({
    super.key,
    required this.reservationId,
    required this.mode,
    this.cautionPayments = const [],
    this.onDone,
  });

  final String reservationId;
  final HandoverMode mode;
  final List<PaymentDto> cautionPayments;
  final VoidCallback? onDone;

  static Future<void> show(
    BuildContext context, {
    required String reservationId,
    required HandoverMode mode,
    List<PaymentDto> cautionPayments = const [],
    VoidCallback? onDone,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: HandoverSheet(
          reservationId: reservationId,
          mode: mode,
          cautionPayments: cautionPayments,
          onDone: onDone,
        ),
      ),
    );
  }

  @override
  ConsumerState<HandoverSheet> createState() => _HandoverSheetState();
}

enum HandoverMode { checkOut, checkIn }

class _HandoverSheetState extends ConsumerState<HandoverSheet> {
  final _odometer = TextEditingController();
  final _fuel = TextEditingController();
  final _notes = TextEditingController();
  bool _busy = false;
  String? _error;

  String get _title =>
      widget.mode == HandoverMode.checkOut ? 'Check-Out' : 'Check-In';

  Color get _accent => widget.mode == HandoverMode.checkOut
      ? const Color(0xFF10B981) // emerald — remise
      : const Color(0xFFB08D57); // bronze — retour

  @override
  void dispose() {
    _odometer.dispose();
    _fuel.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final body = <String, dynamic>{
        if (_odometer.text.trim().isNotEmpty)
          'odometer': double.tryParse(_odometer.text.trim()),
        if (_fuel.text.trim().isNotEmpty)
          'fuel_level': double.tryParse(_fuel.text.trim()),
        if (_notes.text.trim().isNotEmpty) 'condition_notes': _notes.text.trim(),
      };
      final repo = ref.read(reservationsRepoProvider);
      if (widget.mode == HandoverMode.checkOut) {
        await repo.handoverPickup(widget.reservationId, body);
      } else {
        await repo.handoverReturn(widget.reservationId, body);
      }
      if (!mounted) return;
      Navigator.of(context).pop();
      widget.onDone?.call();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(widget.mode == HandoverMode.checkOut
            ? 'Véhicule remis au client.'
            : 'Véhicule rendu.'),
      ));
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
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
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(shape: BoxShape.circle, color: _accent),
                ),
                const SizedBox(width: 8),
                Text(_title,
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close, size: 20),
                  onPressed: _busy ? null : () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              widget.mode == HandoverMode.checkOut
                  ? 'Enregistrer la remise du véhicule au client.'
                  : 'Enregistrer le retour du véhicule et son état.',
              style: const TextStyle(color: Colors.black54, fontSize: 11.5),
            ),
            if (widget.cautionPayments.isNotEmpty) ...[
              const SizedBox(height: 12),
              _FranchiseAlreadyBanner(
                payments: widget.cautionPayments,
                settleHint: widget.mode == HandoverMode.checkIn,
              ),
            ],
            const SizedBox(height: 14),
            TextField(
              controller: _odometer,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Index compteur (km)',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _fuel,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Niveau carburant (%)',
                border: OutlineInputBorder(),
                isDense: true,
                helperText: '0 à 100',
              ),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _notes,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'État / Remarques',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Text(_error!,
                    style: const TextStyle(color: Colors.redAccent, fontSize: 12)),
              ),
            const SizedBox(height: 14),
            Row(
              children: [
                OutlinedButton(
                  onPressed: _busy ? null : () => Navigator.of(context).pop(),
                  child: const Text('Annuler'),
                ),
                const Spacer(),
                FilledButton(
                  onPressed: _busy ? null : _submit,
                  style: FilledButton.styleFrom(backgroundColor: _accent),
                  child: _busy
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : Text(widget.mode == HandoverMode.checkOut
                          ? 'Confirmer la remise'
                          : 'Confirmer le retour'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _FranchiseAlreadyBanner extends StatelessWidget {
  const _FranchiseAlreadyBanner({required this.payments, this.settleHint = false});
  final List<PaymentDto> payments;
  final bool settleHint;

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.decimalPattern('fr');
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFFECFDF5),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFA7F3D0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text("Franchise d'assurance encaissée",
              style: TextStyle(
                  color: Color(0xFF047857),
                  fontWeight: FontWeight.w900,
                  fontSize: 11.5,
                  letterSpacing: 0.6)),
          const SizedBox(height: 6),
          for (final p in payments)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      '${money.format(p.amount)} MAD · ${kPaymentMethodFr[p.method] ?? p.method}'
                      '${p.paymentDate != null ? " · ${dateFmt.format(p.paymentDate!)}" : ""}',
                      style: const TextStyle(
                          color: Color(0xFF065F46), fontSize: 12),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: const Color(0xFFA7F3D0),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: const Text('Détenue',
                        style: TextStyle(
                            color: Color(0xFF065F46),
                            fontSize: 9,
                            fontWeight: FontWeight.w900)),
                  ),
                ],
              ),
            ),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              settleHint
                  ? "Vérifiez les dommages avant de restituer la franchise."
                  : "Le véhicule peut être remis au client — la franchise est déjà au coffre.",
              style: const TextStyle(color: Color(0xFF047857), fontSize: 10.5),
            ),
          ),
        ],
      ),
    );
  }
}
