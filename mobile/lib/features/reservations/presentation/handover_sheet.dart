import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../documents/data/document_dto.dart';
import '../../documents/data/entity_documents_repo.dart';
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
    this.vehicleId,
    this.onDone,
  });

  final String reservationId;
  final HandoverMode mode;
  final List<PaymentDto> cautionPayments;
  final String? vehicleId;
  final VoidCallback? onDone;

  static Future<void> show(
    BuildContext context, {
    required String reservationId,
    required HandoverMode mode,
    List<PaymentDto> cautionPayments = const [],
    String? vehicleId,
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
          vehicleId: vehicleId,
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
            if (widget.vehicleId != null && widget.vehicleId!.isNotEmpty) ...[
              const SizedBox(height: 12),
              _VehicleDocumentsSection(vehicleId: widget.vehicleId!),
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

class _VehicleDocumentsSection extends ConsumerStatefulWidget {
  const _VehicleDocumentsSection({required this.vehicleId});
  final String vehicleId;

  @override
  ConsumerState<_VehicleDocumentsSection> createState() =>
      _VehicleDocumentsSectionState();
}

class _VehicleDocumentsSectionState
    extends ConsumerState<_VehicleDocumentsSection> {
  bool _uploading = false;
  String? _error;

  Future<void> _pickAndUpload(ImageSource source) async {
    setState(() {
      _uploading = true;
      _error = null;
    });
    try {
      final picked = await ImagePicker().pickImage(
        source: source,
        imageQuality: 85,
      );
      if (picked == null) {
        setState(() => _uploading = false);
        return;
      }
      await ref.read(entityDocumentsRepoProvider).upload(
            entityType: 'vehicle',
            entityId: widget.vehicleId,
            filePath: picked.path,
            fileName: picked.name,
            category: 'general',
            notes: 'Pris lors du Check-Out / Check-In',
          );
      ref.invalidate(entityDocumentsProvider(('vehicle', widget.vehicleId)));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Document ajouté au véhicule.')),
      );
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async =
        ref.watch(entityDocumentsProvider(('vehicle', widget.vehicleId)));
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.black12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text('Documents véhicule',
                    style: TextStyle(
                        fontWeight: FontWeight.w900,
                        fontSize: 11.5,
                        letterSpacing: 0.6)),
              ),
              if (_uploading)
                const SizedBox(
                    width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
              else ...[
                IconButton(
                  tooltip: 'Prendre une photo',
                  icon: const Icon(Icons.photo_camera_outlined, size: 20),
                  onPressed: () => _pickAndUpload(ImageSource.camera),
                ),
                IconButton(
                  tooltip: 'Choisir une photo',
                  icon: const Icon(Icons.photo_library_outlined, size: 20),
                  onPressed: () => _pickAndUpload(ImageSource.gallery),
                ),
              ],
            ],
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Text(_error!,
                  style: const TextStyle(color: Colors.redAccent, fontSize: 11)),
            ),
          async.when(
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: SizedBox(
                  width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
            ),
            error: (e, _) => Text('Erreur : $e',
                style: const TextStyle(fontSize: 11, color: Colors.redAccent)),
            data: (docs) => docs.isEmpty
                ? const Text(
                    'Aucun document — prenez une photo pour l\'ajouter au dossier.',
                    style: TextStyle(fontSize: 11.5, color: Colors.black45),
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      for (final d in docs) _docRow(d, dateFmt),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  Widget _docRow(DocumentDto d, DateFormat dateFmt) {
    final expired = d.expiryDate != null && d.expiryDate!.isBefore(DateTime.now());
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Icon(
            expired ? Icons.error_outline : Icons.check_circle_outline,
            size: 16,
            color: expired ? const Color(0xFFE11D48) : const Color(0xFF059669),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  d.title.isNotEmpty ? d.title : (d.category ?? 'Document'),
                  style: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 12),
                ),
                if (d.expiryDate != null)
                  Text(
                    'Expire ${dateFmt.format(d.expiryDate!)}${expired ? " · expiré" : ""}',
                    style: TextStyle(
                        fontSize: 10.5,
                        color: expired ? const Color(0xFFE11D48) : Colors.black54,
                        fontWeight: expired ? FontWeight.w800 : FontWeight.w500),
                  ),
              ],
            ),
          ),
        ],
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
