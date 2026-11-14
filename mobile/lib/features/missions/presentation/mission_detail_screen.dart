import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/widgets/module_scaffold.dart';
import '../../contracts/presentation/contract_pdf_preview_screen.dart';
import '../../contracts/presentation/signature_pad.dart';
import '../data/mission_action_queue.dart';
import '../data/mission_dto.dart';
import '../data/missions_repo.dart';
import 'generate_contract_screen.dart';

const _brand = Color(0xFFB8933F);

/// Fiche détail d'une mission : toutes les infos + justificatifs (photos,
/// états des lieux, signatures, incidents) + génération de contrat. Poussée
/// par Navigator (hors go_router) pour rester accessible au MISSIONNAIRE.
class MissionDetailScreen extends ConsumerWidget {
  const MissionDetailScreen({super.key, required this.missionId});
  final String missionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(missionDetailProvider(missionId));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Détail mission'),
        actions: [
          IconButton(
            tooltip: 'Rafraîchir',
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(missionDetailProvider(missionId)),
          ),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ModuleErrorView(message: friendlyError(e)),
        data: (detail) => _MissionDetailBody(detail: detail),
      ),
    );
  }
}

class _MissionDetailBody extends ConsumerStatefulWidget {
  const _MissionDetailBody({required this.detail});
  final MissionDetailDto detail;

  @override
  ConsumerState<_MissionDetailBody> createState() => _MissionDetailBodyState();
}

class _MissionDetailBodyState extends ConsumerState<_MissionDetailBody> {
  bool _busy = false;
  final _fmt = DateFormat('dd/MM/yyyy HH:mm', 'fr');

  MissionDto get m => widget.detail.mission;

  void _refresh() {
    ref.invalidate(missionDetailProvider(m.id));
    ref.invalidate(myMissionsProvider);
  }

  /// Exécute une transition. Hors-ligne → on enfile l'action et on informe.
  Future<void> _run(String action, Future<void> Function(MissionsRepo) call,
      String okMsg,
      {String? status, String? notes}) async {
    setState(() => _busy = true);
    try {
      await call(ref.read(missionsRepoProvider));
      _refresh();
      _snack(okMsg);
    } catch (e) {
      if (isNetworkError(e)) {
        await ref.read(missionActionQueueProvider.notifier).enqueue(
              QueuedMissionAction(
                missionId: m.id,
                action: action,
                status: status,
                notes: notes,
                queuedAt: DateTime.now(),
              ),
            );
        _snack('Hors-ligne : action enregistrée, elle partira à la reconnexion.');
      } else {
        _snack(friendlyError(e));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.detail;
    return RefreshIndicator(
      onRefresh: () async => _refresh(),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
        children: [
          _headerCard(),
          const SizedBox(height: 12),
          _StatusStepper(status: m.status),
          const SizedBox(height: 12),
          _infoCard(),
          const SizedBox(height: 12),
          _contractCard(),
          const SizedBox(height: 12),
          _proofSection(
              'Photos', Icons.photo_camera_outlined, d.photos.length,
              child: _photosBody(d), onAdd: _addPhotos),
          const SizedBox(height: 12),
          _proofSection('États des lieux', Icons.fact_check_outlined,
              d.inspections.length,
              child: _inspectionsBody(d), onAdd: _addInspection),
          const SizedBox(height: 12),
          _proofSection('Signature client', Icons.draw_outlined,
              d.signatures.length,
              child: _signaturesBody(d), onAdd: _captureSignature),
          const SizedBox(height: 12),
          _proofSection('Incidents', Icons.report_problem_outlined,
              d.issues.length,
              child: _issuesBody(d), onAdd: _reportIssue),
          const SizedBox(height: 20),
          _actionBar(),
        ],
      ),
    );
  }

  // ── Cartes ────────────────────────────────────────────────────────────────

  Widget _headerCard() {
    return ModuleCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(missionTypeFr(m.missionType),
                        style: const TextStyle(
                            fontWeight: FontWeight.w900, fontSize: 18)),
                    if (m.missionNumber.isNotEmpty)
                      Text(m.missionNumber,
                          style: const TextStyle(
                              color: Colors.black45, fontSize: 12)),
                  ],
                ),
              ),
              ModuleStatusChip(
                  label: missionStatusFr(m.status),
                  tone: missionStatusTone(m.status)),
            ],
          ),
          if (missionPriorityFr(m.priority) != null && m.priority != 'normal') ...[
            const SizedBox(height: 10),
            Row(children: [
              const Icon(Icons.flag_outlined, size: 15, color: Colors.black45),
              const SizedBox(width: 6),
              Text('Priorité : ${missionPriorityFr(m.priority)}',
                  style: const TextStyle(
                      fontSize: 12.5, fontWeight: FontWeight.w700)),
            ]),
          ],
        ],
      ),
    );
  }

  Widget _infoCard() {
    final rows = <Widget>[];
    void kv(String label, String? value) {
      if (value == null || value.isEmpty) return;
      rows.add(ModuleKV(label: label, value: value));
    }

    kv('Véhicule', m.vehicleLabel);
    kv('Client', m.clientLabel);
    kv('Début prévu',
        m.scheduledStartAt != null ? _fmt.format(m.scheduledStartAt!) : null);
    kv('Fin prévue',
        m.scheduledEndAt != null ? _fmt.format(m.scheduledEndAt!) : null);
    kv('Démarrée le',
        m.actualStartAt != null ? _fmt.format(m.actualStartAt!) : null);
    kv('Arrivé le', m.arrivedAt != null ? _fmt.format(m.arrivedAt!) : null);
    kv('Clôturée le',
        m.actualEndAt != null ? _fmt.format(m.actualEndAt!) : null);
    kv('Départ', m.pickupAddress ?? m.originAddress);
    kv('Arrivée', m.dropoffAddress ?? m.destinationAddress);

    return ModuleCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Informations',
              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14)),
          const SizedBox(height: 8),
          if (rows.isEmpty)
            const Text('—', style: TextStyle(color: Colors.black45))
          else
            ...rows,
          if ((m.clientInstructions ?? '').isNotEmpty) ...[
            const SizedBox(height: 10),
            _calloutBox('Consignes client', m.clientInstructions!),
          ],
          if ((m.notes ?? '').isNotEmpty) ...[
            const SizedBox(height: 10),
            _calloutBox('Notes', m.notes!),
          ],
        ],
      ),
    );
  }

  Widget _calloutBox(String title, String body) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: const Color(0xFFF5F6FB),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style: const TextStyle(
                    fontSize: 11, fontWeight: FontWeight.w800, color: Colors.black54)),
            const SizedBox(height: 4),
            Text(body, style: const TextStyle(fontSize: 12.5, color: Colors.black87)),
          ],
        ),
      );

  Widget _contractCard() {
    return ModuleCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(children: [
            Icon(Icons.description_outlined, size: 18, color: _brand),
            SizedBox(width: 8),
            Text('Contrat',
                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14)),
          ]),
          const SizedBox(height: 10),
          if (m.hasContract) ...[
            Text('Contrat ${m.contractNumber ?? m.contractId!}',
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
            const SizedBox(height: 10),
            FilledButton.icon(
              onPressed: _busy
                  ? null
                  : () => Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => ContractPdfPreviewScreen(
                          contractId: m.contractId!,
                          contractNumber: m.contractNumber,
                        ),
                      )),
              style: FilledButton.styleFrom(
                  backgroundColor: _brand, minimumSize: const Size.fromHeight(46)),
              icon: const Icon(Icons.picture_as_pdf_outlined),
              label: const Text('Voir / imprimer le contrat'),
            ),
          ] else if (m.canGenerateContract) ...[
            const Text(
                'Aucun contrat rattaché. Générez-le depuis la réservation à la remise du véhicule.',
                style: TextStyle(fontSize: 12.5, color: Colors.black54, height: 1.4)),
            const SizedBox(height: 10),
            FilledButton.icon(
              onPressed: _busy
                  ? null
                  : () => Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => GenerateContractScreen(mission: m),
                      )),
              style: FilledButton.styleFrom(
                  backgroundColor: _brand, minimumSize: const Size.fromHeight(46)),
              icon: const Icon(Icons.add),
              label: const Text('Générer le contrat'),
            ),
          ] else
            const Text(
                'Cette mission n\'est pas rattachée à une réservation : pas de contrat à générer ici.',
                style: TextStyle(fontSize: 12.5, color: Colors.black45, height: 1.4)),
        ],
      ),
    );
  }

  // ── Sections justificatifs ─────────────────────────────────────────────────

  Widget _proofSection(String title, IconData icon, int count,
      {required Widget child, required VoidCallback onAdd}) {
    return ModuleCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(icon, size: 18, color: _brand),
            const SizedBox(width: 8),
            Text(title,
                style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 14)),
            if (count > 0) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 1),
                decoration: BoxDecoration(
                    color: _brand.withOpacity(0.14),
                    borderRadius: BorderRadius.circular(999)),
                child: Text('$count',
                    style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF7A5F22))),
              ),
            ],
            const Spacer(),
            TextButton.icon(
              onPressed: _busy ? null : onAdd,
              icon: const Icon(Icons.add, size: 16),
              label: const Text('Ajouter'),
              style: TextButton.styleFrom(foregroundColor: _brand),
            ),
          ]),
          const SizedBox(height: 4),
          child,
        ],
      ),
    );
  }

  Widget _photosBody(MissionDetailDto d) {
    if (d.photos.isEmpty) return _emptyLine('Aucune photo.');
    return Column(
      children: [
        for (final p in d.photos)
          _lineTile(
            Icons.image_outlined,
            p.label ?? p.phase ?? 'Photo',
            p.createdAt != null ? _fmt.format(p.createdAt!) : null,
          ),
      ],
    );
  }

  Widget _inspectionsBody(MissionDetailDto d) {
    if (d.inspections.isEmpty) return _emptyLine('Aucun état des lieux.');
    String label(MissionInspectionDto i) {
      final t = i.inspectionType == 'check_out' ? 'Sortie' : 'Entrée';
      final km = i.odometerKm != null ? ' · ${i.odometerKm} km' : '';
      final fuel = i.fuelLevel != null ? ' · ${i.fuelLevel}%' : '';
      return '$t$km$fuel';
    }

    return Column(
      children: [
        for (final i in d.inspections)
          _lineTile(Icons.fact_check_outlined, label(i),
              i.createdAt != null ? _fmt.format(i.createdAt!) : null),
      ],
    );
  }

  Widget _signaturesBody(MissionDetailDto d) {
    if (d.signatures.isEmpty) return _emptyLine('Pas encore de signature.');
    return Column(
      children: [
        for (final s in d.signatures)
          _lineTile(Icons.verified_outlined, s.signerName ?? 'Client',
              s.signedAt != null ? _fmt.format(s.signedAt!) : null),
      ],
    );
  }

  Widget _issuesBody(MissionDetailDto d) {
    if (d.issues.isEmpty) return _emptyLine('Aucun incident signalé.');
    return Column(
      children: [
        for (final i in d.issues)
          _lineTile(
            i.isResolved ? Icons.check_circle_outline : Icons.report_problem_outlined,
            i.description ?? i.issueType ?? 'Incident',
            i.isResolved ? 'Résolu' : (i.severity ?? ''),
            danger: !i.isResolved && (i.severity == 'high' || i.severity == 'critical'),
          ),
      ],
    );
  }

  Widget _emptyLine(String text) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Text(text,
            style: const TextStyle(color: Colors.black45, fontSize: 12.5)),
      );

  Widget _lineTile(IconData icon, String title, String? trailing,
      {bool danger = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        children: [
          Icon(icon, size: 16, color: danger ? Colors.red : Colors.black45),
          const SizedBox(width: 8),
          Expanded(
            child: Text(title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 12.5)),
          ),
          if (trailing != null && trailing.isNotEmpty)
            Text(trailing,
                style: const TextStyle(fontSize: 11, color: Colors.black45)),
        ],
      ),
    );
  }

  // ── Barre d'actions (cycle de vie) ──────────────────────────────────────────

  Widget _actionBar() {
    final buttons = <Widget>[];
    final s = m.status;

    // Une seule action « suivante » proposée à la fois (machine à états).
    if (s == 'assigned' || s == 'pending') {
      buttons.add(_primary('Accepter la mission',
          () => _run('accept', (r) => r.accept(m.id), 'Mission acceptée.')));
    } else if (s == 'accepted' || s == 'planned') {
      buttons.add(_primary('Démarrer',
          () => _run('start', (r) => r.start(m.id), 'Mission démarrée.')));
    } else if (s == 'in_progress') {
      buttons.add(_primary('Arrivé sur site',
          () => _run('arrive', (r) => r.arrive(m.id), 'Arrivée enregistrée.')));
    } else if (s == 'arrived') {
      buttons.add(_primary('Terminer la mission', _complete));
    }

    final dropoff = m.dropoffAddress ?? m.destinationAddress;
    final pickup = m.pickupAddress ?? m.originAddress;
    final navTarget = (dropoff != null && dropoff.isNotEmpty)
        ? dropoff
        : (pickup != null && pickup.isNotEmpty ? pickup : null);
    if (navTarget != null) {
      buttons.add(_ghost('Itinéraire', Icons.navigation_outlined,
          () => _openMaps(navTarget)));
    }
    final active = !['completed', 'failed', 'cancelled'].contains(s);
    if (active && (s == 'in_progress' || s == 'arrived')) {
      buttons.add(_ghost('Marquer en échec', Icons.cancel_outlined,
          () => _complete(fail: true),
          danger: true));
    }

    if (buttons.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final b in buttons)
          Padding(padding: const EdgeInsets.only(bottom: 10), child: b),
      ],
    );
  }

  Widget _primary(String label, VoidCallback onTap) => FilledButton(
        onPressed: _busy ? null : onTap,
        style: FilledButton.styleFrom(
            backgroundColor: _brand, minimumSize: const Size.fromHeight(50)),
        child: Text(label, style: const TextStyle(fontWeight: FontWeight.w800)),
      );

  Widget _ghost(String label, IconData icon, VoidCallback onTap,
          {bool danger = false}) =>
      OutlinedButton.icon(
        onPressed: _busy ? null : onTap,
        icon: Icon(icon, size: 18),
        label: Text(label),
        style: OutlinedButton.styleFrom(
          foregroundColor: danger ? Colors.red : Colors.black87,
          minimumSize: const Size.fromHeight(48),
          side: BorderSide(color: danger ? Colors.red.shade200 : Colors.black26),
        ),
      );

  // ── Dialogues / sheets ──────────────────────────────────────────────────────

  Future<void> _complete({bool fail = false}) async {
    final notesCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(fail ? 'Marquer en échec ?' : 'Terminer la mission ?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(fail
                ? 'La mission sera clôturée comme échouée.'
                : 'Confirmez la clôture de la mission.'),
            const SizedBox(height: 12),
            TextField(
              controller: notesCtrl,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: fail ? 'Motif de l\'échec (recommandé)' : 'Notes (facultatif)',
                border: const OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Annuler')),
          FilledButton(
            style: FilledButton.styleFrom(
                backgroundColor: fail ? Colors.red : _brand),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(fail ? 'Marquer échec' : 'Terminer'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final status = fail ? 'failed' : 'completed';
    final notes = notesCtrl.text.trim();
    await _run(
      'complete',
      (r) => r.complete(m.id, status: status, notes: notes.isEmpty ? null : notes),
      fail ? 'Mission marquée en échec.' : 'Mission terminée.',
      status: status,
      notes: notes.isEmpty ? null : notes,
    );
  }

  Future<void> _addPhotos() async {
    final picker = ImagePicker();
    final picked = await picker.pickMultiImage(imageQuality: 70);
    if (picked.isEmpty) return;
    setState(() => _busy = true);
    try {
      final files = <MultipartFile>[];
      for (final x in picked) {
        final bytes = await x.readAsBytes();
        files.add(MultipartFile.fromBytes(bytes, filename: x.name));
      }
      await ref.read(missionsRepoProvider).uploadPhotos(m.id,
          files: files, phase: 'handover', label: 'Photo terrain');
      _refresh();
      _snack('${files.length} photo(s) ajoutée(s).');
    } catch (e) {
      _snack(friendlyError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _addInspection() async {
    final result = await showModalBottomSheet<_InspectionInput>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _InspectionSheet(),
    );
    if (result == null) return;
    setState(() => _busy = true);
    try {
      await ref.read(missionsRepoProvider).submitInspection(
            m.id,
            inspectionType: result.type,
            odometerKm: result.odometerKm,
            fuelLevel: result.fuelLevel,
            exteriorCondition: result.exterior,
            interiorCondition: result.interior,
            damageNotes: result.notes,
          );
      _refresh();
      _snack('État des lieux enregistré.');
    } catch (e) {
      _snack(friendlyError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _reportIssue() async {
    final result = await showModalBottomSheet<_IssueInput>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _IssueSheet(),
    );
    if (result == null) return;
    setState(() => _busy = true);
    try {
      await ref.read(missionsRepoProvider).reportIssue(
            m.id,
            issueType: result.type,
            severity: result.severity,
            description: result.description,
          );
      _refresh();
      _snack('Incident signalé.');
    } catch (e) {
      _snack(friendlyError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _captureSignature() async {
    final result = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => _SignatureScreen(missionId: m.id),
    ));
    if (result == true) {
      _refresh();
      _snack('Signature enregistrée.');
    }
  }

  Future<void> _openMaps(String address) async {
    final uri = Uri.parse(
        'https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(address)}');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}

// ── Stepper de statut ─────────────────────────────────────────────────────────

class _StatusStepper extends StatelessWidget {
  const _StatusStepper({required this.status});
  final String status;

  static const _steps = ['assigned', 'accepted', 'in_progress', 'arrived', 'completed'];
  static const _labels = ['Assignée', 'Acceptée', 'En cours', 'Arrivé', 'Terminée'];

  int get _currentIndex {
    if (status == 'failed' || status == 'cancelled') return -1;
    final i = _steps.indexOf(status);
    if (i >= 0) return i;
    if (status == 'pending' || status == 'planned') return 0;
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    if (status == 'failed' || status == 'cancelled') {
      return const SizedBox.shrink();
    }
    final current = _currentIndex;
    return Row(
      children: [
        for (var i = 0; i < _steps.length; i++) ...[
          Expanded(
            child: Column(
              children: [
                Container(
                  width: 24,
                  height: 24,
                  decoration: BoxDecoration(
                    color: i <= current ? _brand : Colors.grey.shade300,
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    i < current ? Icons.check : Icons.circle,
                    size: i < current ? 15 : 8,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                Text(_labels[i],
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: 9.5,
                        fontWeight: i == current ? FontWeight.w800 : FontWeight.w500,
                        color: i <= current ? const Color(0xFF7A5F22) : Colors.black45)),
              ],
            ),
          ),
          if (i < _steps.length - 1)
            Container(
                width: 12,
                height: 2,
                margin: const EdgeInsets.only(bottom: 18),
                color: i < current ? _brand : Colors.grey.shade300),
        ],
      ],
    );
  }
}

// ── Sheet : état des lieux ─────────────────────────────────────────────────────

class _InspectionInput {
  _InspectionInput(this.type, this.odometerKm, this.fuelLevel, this.exterior,
      this.interior, this.notes);
  final String type;
  final int? odometerKm;
  final int? fuelLevel;
  final String exterior;
  final String interior;
  final String? notes;
}

class _InspectionSheet extends StatefulWidget {
  const _InspectionSheet();
  @override
  State<_InspectionSheet> createState() => _InspectionSheetState();
}

class _InspectionSheetState extends State<_InspectionSheet> {
  String _type = 'check_out';
  String _exterior = 'good';
  String _interior = 'good';
  final _km = TextEditingController();
  final _fuel = TextEditingController();
  final _notes = TextEditingController();

  static const _conditions = {
    'good': 'Bon état',
    'minor_damage': 'Dégâts mineurs',
    'major_damage': 'Dégâts majeurs',
  };

  @override
  void dispose() {
    _km.dispose();
    _fuel.dispose();
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
          left: 16, right: 16, top: 16,
          bottom: MediaQuery.of(context).viewInsets.bottom + 16),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('État des lieux',
                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
            const SizedBox(height: 12),
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'check_in', label: Text('Entrée')),
                ButtonSegment(value: 'check_out', label: Text('Sortie')),
              ],
              selected: {_type},
              onSelectionChanged: (s) => setState(() => _type = s.first),
            ),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(child: _field(_km, 'Compteur (km)', number: true)),
              const SizedBox(width: 12),
              Expanded(child: _field(_fuel, 'Carburant (%)', number: true)),
            ]),
            const SizedBox(height: 12),
            _dropdown('Extérieur', _exterior, _conditions,
                (v) => setState(() => _exterior = v)),
            const SizedBox(height: 10),
            _dropdown('Intérieur', _interior, _conditions,
                (v) => setState(() => _interior = v)),
            const SizedBox(height: 12),
            _field(_notes, 'Observations / dégâts', lines: 2),
            const SizedBox(height: 16),
            FilledButton(
              style: FilledButton.styleFrom(
                  backgroundColor: _brand, minimumSize: const Size.fromHeight(48)),
              onPressed: () => Navigator.pop(
                context,
                _InspectionInput(
                  _type,
                  int.tryParse(_km.text.trim()),
                  int.tryParse(_fuel.text.trim()),
                  _exterior,
                  _interior,
                  _notes.text.trim().isEmpty ? null : _notes.text.trim(),
                ),
              ),
              child: const Text('Enregistrer'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _field(TextEditingController c, String hint,
          {bool number = false, int lines = 1}) =>
      TextField(
        controller: c,
        keyboardType: number ? TextInputType.number : TextInputType.text,
        maxLines: lines,
        decoration: InputDecoration(
            labelText: hint, border: const OutlineInputBorder(), isDense: true),
      );

  Widget _dropdown(String label, String value, Map<String, String> items,
          ValueChanged<String> onChanged) =>
      InputDecorator(
        decoration: InputDecoration(
            labelText: label, border: const OutlineInputBorder(), isDense: true),
        child: DropdownButtonHideUnderline(
          child: DropdownButton<String>(
            value: value,
            isExpanded: true,
            items: [
              for (final e in items.entries)
                DropdownMenuItem(value: e.key, child: Text(e.value))
            ],
            onChanged: (v) => v == null ? null : onChanged(v),
          ),
        ),
      );
}

// ── Sheet : incident ───────────────────────────────────────────────────────────

class _IssueInput {
  _IssueInput(this.type, this.severity, this.description);
  final String type;
  final String severity;
  final String description;
}

class _IssueSheet extends StatefulWidget {
  const _IssueSheet();
  @override
  State<_IssueSheet> createState() => _IssueSheetState();
}

class _IssueSheetState extends State<_IssueSheet> {
  String _type = 'other';
  String _severity = 'medium';
  final _desc = TextEditingController();

  static const _types = {
    'vehicle_damage': 'Dégât véhicule',
    'customer_absent': 'Client absent',
    'wrong_address': 'Mauvaise adresse',
    'mechanical': 'Panne mécanique',
    'other': 'Autre',
  };
  static const _severities = {
    'low': 'Faible',
    'medium': 'Moyenne',
    'high': 'Élevée',
    'critical': 'Critique',
  };

  @override
  void dispose() {
    _desc.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
          left: 16, right: 16, top: 16,
          bottom: MediaQuery.of(context).viewInsets.bottom + 16),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Signaler un incident',
                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 16)),
            const SizedBox(height: 12),
            _dropdown('Type', _type, _types, (v) => setState(() => _type = v)),
            const SizedBox(height: 10),
            _dropdown('Gravité', _severity, _severities,
                (v) => setState(() => _severity = v)),
            const SizedBox(height: 10),
            TextField(
              controller: _desc,
              maxLines: 3,
              decoration: const InputDecoration(
                  labelText: 'Description', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 16),
            FilledButton(
              style: FilledButton.styleFrom(
                  backgroundColor: _brand, minimumSize: const Size.fromHeight(48)),
              onPressed: () {
                if (_desc.text.trim().isEmpty) {
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                      content: Text('Décrivez l\'incident.')));
                  return;
                }
                Navigator.pop(context,
                    _IssueInput(_type, _severity, _desc.text.trim()));
              },
              child: const Text('Signaler'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _dropdown(String label, String value, Map<String, String> items,
          ValueChanged<String> onChanged) =>
      InputDecorator(
        decoration: InputDecoration(
            labelText: label, border: const OutlineInputBorder(), isDense: true),
        child: DropdownButtonHideUnderline(
          child: DropdownButton<String>(
            value: value,
            isExpanded: true,
            items: [
              for (final e in items.entries)
                DropdownMenuItem(value: e.key, child: Text(e.value))
            ],
            onChanged: (v) => v == null ? null : onChanged(v),
          ),
        ),
      );
}

// ── Écran : capture de signature ───────────────────────────────────────────────

class _SignatureScreen extends ConsumerStatefulWidget {
  const _SignatureScreen({required this.missionId});
  final String missionId;
  @override
  ConsumerState<_SignatureScreen> createState() => _SignatureScreenState();
}

class _SignatureScreenState extends ConsumerState<_SignatureScreen> {
  final _padKey = GlobalKey<SignaturePadState>();
  final _name = TextEditingController();
  bool _hasStrokes = false;
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Nom du signataire requis.')));
      return;
    }
    final png = await _padKey.currentState?.exportPng();
    if (!mounted) return;
    if (png == null) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Veuillez signer dans le cadre.')));
      return;
    }
    setState(() => _busy = true);
    try {
      await ref.read(missionsRepoProvider).captureSignature(widget.missionId,
          signerName: _name.text.trim(), pngBytes: png);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(friendlyError(e))));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Signature client')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _name,
              decoration: const InputDecoration(
                  labelText: 'Nom du signataire',
                  border: OutlineInputBorder()),
            ),
            const SizedBox(height: 16),
            SignaturePad(
              key: _padKey,
              height: 220,
              onChanged: (h) => setState(() => _hasStrokes = h),
            ),
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: () => _padKey.currentState?.clear(),
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('Effacer'),
              ),
            ),
            const Spacer(),
            FilledButton(
              style: FilledButton.styleFrom(
                  backgroundColor: _brand, minimumSize: const Size.fromHeight(50)),
              onPressed: (_busy || !_hasStrokes) ? null : _save,
              child: _busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: Colors.white))
                  : const Text('Enregistrer la signature'),
            ),
          ],
        ),
      ),
    );
  }
}
