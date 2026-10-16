import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/reservations_repo.dart';

/// Check-Out (pickup) / Check-In (return) — bottom sheet compacte qui
/// appelle les endpoints `/reservations/{id}/handover-pickup` et
/// `/handover-return`. Même look-and-feel que [VehicleSwapSheet].
class HandoverSheet extends ConsumerStatefulWidget {
  const HandoverSheet({
    super.key,
    required this.reservationId,
    required this.mode,
    this.onDone,
  });

  final String reservationId;
  final HandoverMode mode;
  final VoidCallback? onDone;

  static Future<void> show(
    BuildContext context, {
    required String reservationId,
    required HandoverMode mode,
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
