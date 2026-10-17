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
    this.handoverReports = const [],
    this.onDone,
  });

  final String reservationId;
  final HandoverMode mode;
  final List<PaymentDto> cautionPayments;
  final String? vehicleId;
  final List<HandoverReportDto> handoverReports;
  final VoidCallback? onDone;

  static Future<void> show(
    BuildContext context, {
    required String reservationId,
    required HandoverMode mode,
    List<PaymentDto> cautionPayments = const [],
    String? vehicleId,
    List<HandoverReportDto> handoverReports = const [],
    VoidCallback? onDone,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      useSafeArea: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: HandoverSheet(
          reservationId: reservationId,
          mode: mode,
          cautionPayments: cautionPayments,
          vehicleId: vehicleId,
          handoverReports: handoverReports,
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
  // Photos prises par zone (chemin local). On n'upload pas encore
  // automatiquement — comme sur le web, les zones restent indicatives
  // et peuvent être téléversées via le centre documentaire.
  final Map<String, XFile> _photos = {};

  List<HandoverReportDto> get _history {
    final kind =
        widget.mode == HandoverMode.checkOut ? 'pickup' : 'return';
    return widget.handoverReports
        .where((h) => h.kind.contains(kind))
        .toList();
  }

  HandoverReportDto? get _lastPickup {
    final pickups = widget.handoverReports
        .where((h) => h.kind.contains('pickup'))
        .toList();
    return pickups.isEmpty ? null : pickups.last;
  }

  int? get _extraKm {
    final odo = int.tryParse(_odometer.text.trim());
    final start = _lastPickup?.odometer;
    if (odo == null || start == null) return null;
    final d = odo - start;
    return d < 0 ? 0 : d;
  }

  double? get _fuelDiff {
    final cur = double.tryParse(_fuel.text.trim());
    final start = _lastPickup?.fuelLevel;
    if (cur == null || start == null) return null;
    return cur - start;
  }

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

  static const _photoZones = [
    'Avant',
    'Arrière',
    'Gauche',
    'Droite',
    'Intérieur',
    'Tableau de bord',
  ];

  Widget _formSectionTitle(String s) => Text(
        s.toUpperCase(),
        style: const TextStyle(
            color: Colors.black45,
            fontSize: 10.5,
            fontWeight: FontWeight.w800,
            letterSpacing: 1.3),
      );

  Widget _historySection() {
    final dateFmt = DateFormat('dd/MM/yyyy HH:mm', 'fr');
    final color = widget.mode == HandoverMode.checkOut
        ? const Color(0xFF065F46)
        : const Color(0xFF155E75);
    final bg = widget.mode == HandoverMode.checkOut
        ? const Color(0xFFECFDF5)
        : const Color(0xFFECFEFF);
    final border = widget.mode == HandoverMode.checkOut
        ? const Color(0xFFA7F3D0)
        : const Color(0xFFA5F3FC);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _formSectionTitle(widget.mode == HandoverMode.checkOut
            ? 'Historique Check-Out (${_history.length})'
            : 'Historique Check-In (${_history.length})'),
        const SizedBox(height: 6),
        for (final r in _history)
          Container(
            margin: const EdgeInsets.only(bottom: 6),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: bg,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        widget.mode == HandoverMode.checkOut
                            ? 'Check-Out effectué'
                            : 'Check-In effectué',
                        style: TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 12.5,
                            color: color),
                      ),
                    ),
                    if (r.at != null)
                      Text(dateFmt.format(r.at!),
                          style:
                              TextStyle(fontSize: 11, color: color.withOpacity(0.8))),
                  ],
                ),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 10,
                  runSpacing: 2,
                  children: [
                    Text('Km : ${r.odometer ?? '—'}',
                        style: const TextStyle(fontSize: 11.5)),
                    Text(
                        'Carburant : ${r.fuelLevel != null ? "${r.fuelLevel!.toStringAsFixed(0)}%" : "—"}',
                        style: const TextStyle(fontSize: 11.5)),
                    if (r.conditionNotes != null &&
                        r.conditionNotes!.isNotEmpty)
                      Text('Notes : ${r.conditionNotes}',
                          style: const TextStyle(fontSize: 11.5)),
                  ],
                ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _autoCalcBanner() {
    final ekm = _extraKm;
    final fd = _fuelDiff;
    if (ekm == null && fd == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          if (ekm != null) ...[
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFFEEF2FF),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('KM PARCOURUS',
                        style: TextStyle(
                            color: Color(0xFF818CF8),
                            fontSize: 9.5,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1)),
                    Text('${ekm.toString()} km',
                        style: const TextStyle(
                            color: Color(0xFF4338CA),
                            fontSize: 15,
                            fontWeight: FontWeight.w900)),
                  ],
                ),
              ),
            ),
            if (fd != null) const SizedBox(width: 8),
          ],
          if (fd != null)
            Expanded(
              child: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: fd < 0
                      ? const Color(0xFFFFF1F2)
                      : const Color(0xFFECFDF5),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('DIFF. CARBURANT',
                        style: TextStyle(
                            color: fd < 0
                                ? const Color(0xFFF43F5E)
                                : const Color(0xFF10B981),
                            fontSize: 9.5,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1)),
                    Text('${fd > 0 ? '+' : ''}${fd.toStringAsFixed(0)}%',
                        style: TextStyle(
                            color: fd < 0
                                ? const Color(0xFFBE123C)
                                : const Color(0xFF047857),
                            fontSize: 15,
                            fontWeight: FontWeight.w900)),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _photoZonesGrid() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _formSectionTitle('Photos du véhicule'),
        const SizedBox(height: 6),
        GridView.count(
          crossAxisCount: 3,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          childAspectRatio: 1.1,
          mainAxisSpacing: 6,
          crossAxisSpacing: 6,
          children: [
            for (final zone in _photoZones) _photoZoneTile(zone),
          ],
        ),
      ],
    );
  }

  Widget _photoZoneTile(String zone) {
    final file = _photos[zone];
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: () async {
        final picked = await ImagePicker().pickImage(
          source: ImageSource.camera,
          imageQuality: 75,
        );
        if (picked != null) {
          setState(() => _photos[zone] = picked);
          // Upload immédiat sur le dossier du véhicule — même catégorie
          // "handover_photo" avec document_number = zone (comme sur le web).
          final vehicleId = widget.vehicleId;
          if (vehicleId != null && vehicleId.isNotEmpty) {
            try {
              await ref.read(entityDocumentsRepoProvider).upload(
                    entityType: 'vehicle',
                    entityId: vehicleId,
                    filePath: picked.path,
                    fileName: picked.name,
                    category: 'handover_photo',
                    documentNumber: zone,
                    notes: widget.mode == HandoverMode.checkOut
                        ? 'Check-Out'
                        : 'Check-In',
                  );
              ref.invalidate(
                  entityDocumentsProvider(('vehicle', vehicleId)));
            } catch (_) {
              // Silencieux : la photo reste visible localement et
              // l'agent peut retenter via le centre documentaire.
            }
          }
        }
      },
      child: Container(
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(
          color: file != null ? const Color(0xFFECFDF5) : Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: file != null ? const Color(0xFF10B981) : Colors.black26,
            style: file != null ? BorderStyle.solid : BorderStyle.solid,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              file != null ? Icons.check_circle : Icons.photo_camera_outlined,
              size: 20,
              color: file != null ? const Color(0xFF059669) : Colors.black38,
            ),
            const SizedBox(height: 2),
            Text(zone,
                textAlign: TextAlign.center,
                style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    color: file != null
                        ? const Color(0xFF065F46)
                        : Colors.black54)),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // Même structure que TabCheckOut / TabCheckIn côté web :
    //   - franchise encaissée (banner) OU FranchisePanel (ici simple
    //     message laissant au web la saisie — l'encaissement se fait
    //     via Paiement)
    //   - historique des remises/retours
    //   - formulaire index km + carburant + remarques
    //   - bannière auto-calcul (Check-In)
    //   - zones photos (Avant / Arrière / Gauche / Droite / Intérieur /
    //     Tableau de bord) chacune ouvrant la caméra
    //   - zone signature (placeholder, comme sur le web)
    //   - documents du véhicule
    //   - bouton de validation
    final maxH = MediaQuery.of(context).size.height * 0.92;
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
            const SizedBox(height: 10),
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (widget.cautionPayments.isNotEmpty)
                      _FranchiseAlreadyBanner(
                        payments: widget.cautionPayments,
                        settleHint: widget.mode == HandoverMode.checkIn,
                      ),
                    if (_history.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      _historySection(),
                    ],
                    const SizedBox(height: 12),
                    _formSectionTitle(widget.mode == HandoverMode.checkOut
                        ? 'Nouveau Check-Out'
                        : 'Nouveau Check-In'),
                    const SizedBox(height: 8),
                    if (widget.mode == HandoverMode.checkIn)
                      _autoCalcBanner(),
                    TextField(
                      controller: _odometer,
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      onChanged: (_) => setState(() {}),
                      decoration: InputDecoration(
                        labelText: widget.mode == HandoverMode.checkOut
                            ? 'Kilométrage départ'
                            : 'Kilométrage retour',
                        hintText: _lastPickup?.odometer != null
                            ? 'Départ : ${_lastPickup!.odometer}'
                            : null,
                        border: const OutlineInputBorder(),
                        isDense: true,
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _fuel,
                      keyboardType:
                          const TextInputType.numberWithOptions(decimal: true),
                      onChanged: (_) => setState(() {}),
                      decoration: InputDecoration(
                        labelText: 'Niveau carburant (%)',
                        helperText: '0 à 100',
                        hintText: _lastPickup?.fuelLevel != null
                            ? 'Départ : ${_lastPickup!.fuelLevel!.toStringAsFixed(0)}%'
                            : null,
                        border: const OutlineInputBorder(),
                        isDense: true,
                      ),
                    ),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _notes,
                      maxLines: 3,
                      decoration: InputDecoration(
                        labelText: 'Observations / état du véhicule',
                        hintText: widget.mode == HandoverMode.checkOut
                            ? 'Rayures existantes, état des pneus, accessoires remis…'
                            : 'Nouveaux dommages, propreté, accessoires manquants…',
                        border: const OutlineInputBorder(),
                        isDense: true,
                      ),
                    ),
                    const SizedBox(height: 14),
                    _photoZonesGrid(),
                    if (widget.vehicleId != null &&
                        widget.vehicleId!.isNotEmpty) ...[
                      const SizedBox(height: 14),
                      _VehicleDocumentsSection(vehicleId: widget.vehicleId!),
                    ],
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
                          ? 'Valider le Check-Out'
                          : 'Valider le Check-In'),
                ),
              ],
            ),
          ],
        ),
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
                ? _emptyStarterGrid()
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

  Widget _emptyStarterGrid() {
    const slots = <(String, String, String)>[
      ('carte_grise_recto', 'Carte grise — Recto', 'Immatriculation, 1ère mise en circulation'),
      ('carte_grise_verso', 'Carte grise — Verso', 'Marque, modèle, châssis'),
      ('insurance', 'Assurance', 'Attestation en cours de validité'),
      ('circulation_authorization', 'Autorisation de circulation', 'Autorisation / vignette TSAV'),
      ('technical_inspection', 'Visite technique', 'Certificat de visite technique'),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(bottom: 6),
          child: Text(
            'Aucun document au dossier. Ajoutez au minimum ces pièces avant de remettre le véhicule.',
            style: TextStyle(fontSize: 11.5, color: Colors.black54),
          ),
        ),
        for (final s in slots)
          _starterSlotTile(category: s.$1, label: s.$2, desc: s.$3),
      ],
    );
  }

  Widget _starterSlotTile({
    required String category,
    required String label,
    required String desc,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.black12),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: const TextStyle(
                        fontWeight: FontWeight.w900, fontSize: 12)),
                Text(desc,
                    style: const TextStyle(
                        fontSize: 10.5, color: Colors.black54)),
              ],
            ),
          ),
          IconButton(
            tooltip: 'Prendre une photo',
            icon: const Icon(Icons.photo_camera_outlined, size: 20),
            onPressed: _uploading
                ? null
                : () => _pickAndUploadCategory(ImageSource.camera, category),
          ),
          IconButton(
            tooltip: 'Choisir dans la galerie',
            icon: const Icon(Icons.photo_library_outlined, size: 20),
            onPressed: _uploading
                ? null
                : () => _pickAndUploadCategory(ImageSource.gallery, category),
          ),
        ],
      ),
    );
  }

  Future<void> _pickAndUploadCategory(ImageSource source, String category) async {
    setState(() {
      _uploading = true;
      _error = null;
    });
    try {
      final picked =
          await ImagePicker().pickImage(source: source, imageQuality: 85);
      if (picked == null) {
        setState(() => _uploading = false);
        return;
      }
      await ref.read(entityDocumentsRepoProvider).upload(
            entityType: 'vehicle',
            entityId: widget.vehicleId,
            filePath: picked.path,
            fileName: picked.name,
            category: category,
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
