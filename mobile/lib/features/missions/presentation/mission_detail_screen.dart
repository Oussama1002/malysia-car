import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/widgets/module_scaffold.dart';
import '../../contracts/presentation/contract_pdf_preview_screen.dart';
import '../../contracts/presentation/signature_pad.dart';
import '../../reservations/presentation/new_contract_from_reservation_screen.dart';
import '../data/mission_action_queue.dart';
import '../data/mission_dto.dart';
import '../data/missions_repo.dart';

const _brand = Color(0xFFB8933F);

/// Fiche dÃ©tail d'une mission : toutes les infos + justificatifs (photos,
/// Ã©tats des lieux, signatures, incidents) + gÃ©nÃ©ration de contrat. PoussÃ©e
/// par Navigator (hors go_router) pour rester accessible au MISSIONNAIRE.
class MissionDetailScreen extends ConsumerWidget {
  const MissionDetailScreen({super.key, required this.missionId});
  final String missionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(missionDetailProvider(missionId));
    return Scaffold(
      appBar: AppBar(
        title: const Text('DÃ©tail mission'),
        actions: [
          IconButton(
            tooltip: 'RafraÃ®chir',
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

  /// ExÃ©cute une transition. Hors-ligne â†’ on enfile l'action et on informe.
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
        _snack('Hors-ligne : action enregistrÃ©e, elle partira Ã  la reconnexion.');
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
          // Ã€ partir d'ici toutes les sections de justificatifs sont des
          // formulaires INLINE (photos, Ã©tats des lieux, signature client,
          // incidents), Ã  la maniÃ¨re de l'Ã©tape Annexes du wizard
          // Â« GÃ©nÃ©rer le contrat Â». Plus de bottom-sheet ni d'Ã©cran
          // dÃ©diÃ© : le missionnaire voit les blocs existants et les champs
          // de saisie du nouveau justificatif sur la mÃªme page.
          _proofSection(
              'Photos', Icons.photo_camera_outlined, d.photos.length,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _photosBody(d),
                  const SizedBox(height: 8),
                  _PhotosInlineForm(
                      missionId: m.id,
                      busy: _busy,
                      onBusy: (b) => setState(() => _busy = b),
                      onSaved: (count) {
                        _refresh();
                        _snack('$count photo(s) ajoutÃ©e(s).');
                      },
                      onError: (msg) => _snack(msg)),
                ],
              )),
          const SizedBox(height: 12),
          _proofSection('Ã‰tats des lieux', Icons.fact_check_outlined,
              d.inspections.length,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _inspectionsBody(d),
                  const SizedBox(height: 8),
                  _InspectionInlineForm(
                      missionId: m.id,
                      busy: _busy,
                      onBusy: (b) => setState(() => _busy = b),
                      onSaved: () {
                        _refresh();
                        _snack('Ã‰tat des lieux enregistrÃ©.');
                      },
                      onError: (msg) => _snack(msg)),
                ],
              )),
          const SizedBox(height: 12),
          _proofSection('Signature client', Icons.draw_outlined,
              d.signatures.length,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _signaturesBody(d),
                  const SizedBox(height: 8),
                  _SignatureInlineForm(
                      missionId: m.id,
                      busy: _busy,
                      onBusy: (b) => setState(() => _busy = b),
                      onSaved: () {
                        _refresh();
                        _snack('Signature enregistrÃ©e.');
                      },
                      onError: (msg) => _snack(msg)),
                ],
              )),
          const SizedBox(height: 12),
          _proofSection('Incidents', Icons.report_problem_outlined,
              d.issues.length,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _issuesBody(d),
                  const SizedBox(height: 8),
                  _IssueInlineForm(
                      missionId: m.id,
                      busy: _busy,
                      onBusy: (b) => setState(() => _busy = b),
                      onSaved: () {
                        _refresh();
                        _snack('Incident signalÃ©.');
                      },
                      onError: (msg) => _snack(msg)),
                ],
              )),
          const SizedBox(height: 20),
          _actionBar(),
        ],
      ),
    );
  }

  // â”€â”€ Cartes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
              Text('PrioritÃ© : ${missionPriorityFr(m.priority)}',
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

    kv('VÃ©hicule', m.vehicleLabel);
    kv('Client', m.clientLabel);
    kv('DÃ©but prÃ©vu',
        m.scheduledStartAt != null ? _fmt.format(m.scheduledStartAt!) : null);
    kv('Fin prÃ©vue',
        m.scheduledEndAt != null ? _fmt.format(m.scheduledEndAt!) : null);
    kv('DÃ©marrÃ©e le',
        m.actualStartAt != null ? _fmt.format(m.actualStartAt!) : null);
    kv('ArrivÃ© le', m.arrivedAt != null ? _fmt.format(m.arrivedAt!) : null);
    kv('ClÃ´turÃ©e le',
        m.actualEndAt != null ? _fmt.format(m.actualEndAt!) : null);
    kv('DÃ©part', m.pickupAddress ?? m.originAddress);
    kv('ArrivÃ©e', m.dropoffAddress ?? m.destinationAddress);

    return ModuleCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Informations',
              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 14)),
          const SizedBox(height: 8),
          if (rows.isEmpty)
            const Text('â€”', style: TextStyle(color: Colors.black45))
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
                'Aucun contrat rattachÃ©. GÃ©nÃ©rez-le depuis la rÃ©servation Ã  la remise du vÃ©hicule.',
                style: TextStyle(fontSize: 12.5, color: Colors.black54, height: 1.4)),
            const SizedBox(height: 10),
            FilledButton.icon(
              // MÃªme architecture que le wizard "GÃ©nÃ©rer un contrat" depuis
              // la rÃ©servation (web + mobile) : 6 Ã©tapes Client â†’ VÃ©hicule â†’
              // Type â†’ Conditions â†’ Annexes â†’ Validation, prÃ©-remplies
              // depuis la rÃ©servation attachÃ©e Ã  la mission. Le flux
              // backend est strictement celui d'AGENTS.md Â§5.3
              // (POST /contracts draft â†’ POST /payments â†’ activate
              // best-effort â†’ POST /generate-pdf), gÃ©rÃ© par l'Ã©cran lui-mÃªme.
              onPressed: _busy
                  ? null
                  : () => Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => NewContractFromReservationScreen(
                          reservationId: m.reservationId,
                        ),
                      )),
              style: FilledButton.styleFrom(
                  backgroundColor: _brand, minimumSize: const Size.fromHeight(46)),
              icon: const Icon(Icons.add),
              label: const Text('GÃ©nÃ©rer le contrat'),
            ),
          ] else
            const Text(
                'Cette mission n\'est pas rattachÃ©e Ã  une rÃ©servation : pas de contrat Ã  gÃ©nÃ©rer ici.',
                style: TextStyle(fontSize: 12.5, color: Colors.black45, height: 1.4)),
        ],
      ),
    );
  }

  // â”€â”€ Sections justificatifs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  Widget _proofSection(String title, IconData icon, int count,
      {required Widget child}) {
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
    if (d.inspections.isEmpty) return _emptyLine('Aucun Ã©tat des lieux.');
    String label(MissionInspectionDto i) {
      final t = i.inspectionType == 'check_out' ? 'Sortie' : 'EntrÃ©e';
      final km = i.odometerKm != null ? ' Â· ${i.odometerKm} km' : '';
      final fuel = i.fuelLevel != null ? ' Â· ${i.fuelLevel}%' : '';
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
    if (d.issues.isEmpty) return _emptyLine('Aucun incident signalÃ©.');
    return Column(
      children: [
        for (final i in d.issues)
          _lineTile(
            i.isResolved ? Icons.check_circle_outline : Icons.report_problem_outlined,
            i.description ?? i.issueType ?? 'Incident',
            i.isResolved ? 'RÃ©solu' : (i.severity ?? ''),
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

  // â”€â”€ Barre d'actions (cycle de vie) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  Widget _actionBar() {
    final buttons = <Widget>[];
    final s = m.status;

    // Une seule action Â« suivante Â» proposÃ©e Ã  la fois (machine Ã  Ã©tats).
    if (s == 'assigned' || s == 'pending') {
      buttons.add(_primary('Accepter la mission',
          () => _run('accept', (r) => r.accept(m.id), 'Mission acceptÃ©e.')));
    } else if (s == 'accepted' || s == 'planned') {
      buttons.add(_primary('DÃ©marrer',
          () => _run('start', (r) => r.start(m.id), 'Mission dÃ©marrÃ©e.')));
    } else if (s == 'in_progress') {
      buttons.add(_primary('ArrivÃ© sur site',
          () => _run('arrive', (r) => r.arrive(m.id), 'ArrivÃ©e enregistrÃ©e.')));
    } else if (s == 'arrived') {
      buttons.add(_primary('Terminer la mission', _complete));
    }

    // ItinÃ©raire complet tel que dÃ©fini dans l'ERP web : origine (dÃ©part) â†’
    // destination (arrivÃ©e). On ouvre un vrai itinÃ©raire Google Maps avec les
    // deux points quand ils sont connus ; sinon une simple recherche du point
    // disponible.
    // Un seul bouton de navigation. On privilÃ©gie le lien Google Maps Ã©pinglÃ© de
    // l'agence (ParamÃ¨tres â†’ Agences sur l'ERP web) : c'est le point exact.
    // Sinon on retombe sur l'itinÃ©raire complet origine (dÃ©part) â†’ destination
    // (arrivÃ©e) tel que dÃ©fini dans l'ERP web.
    final destination = m.dropoffAddress ?? m.destinationAddress;
    final origin = m.pickupAddress ?? m.originAddress;
    final hasDestination = destination != null && destination.trim().isNotEmpty;
    final hasOrigin = origin != null && origin.trim().isNotEmpty;
    final branchMaps = m.branchMapsUrl?.trim();
    final hasBranchMaps = branchMaps != null && branchMaps.isNotEmpty;
    if (hasBranchMaps || hasDestination || hasOrigin) {
      buttons.add(_ghost('ItinÃ©raire', Icons.navigation_outlined, () {
        if (branchMaps != null && branchMaps.isNotEmpty) {
          _openRawUrl(branchMaps);
        } else {
          _openItinerary(origin, destination);
        }
      }));
    }

    final active = !['completed', 'failed', 'cancelled'].contains(s);
    if (active && (s == 'in_progress' || s == 'arrived')) {
      buttons.add(_ghost('Marquer en Ã©chec', Icons.cancel_outlined,
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

  // â”€â”€ Dialogues / sheets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  Future<void> _complete({bool fail = false}) async {
    final notesCtrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(fail ? 'Marquer en Ã©chec ?' : 'Terminer la mission ?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(fail
                ? 'La mission sera clÃ´turÃ©e comme Ã©chouÃ©e.'
                : 'Confirmez la clÃ´ture de la mission.'),
            const SizedBox(height: 12),
            TextField(
              controller: notesCtrl,
              maxLines: 3,
              decoration: InputDecoration(
                hintText: fail ? 'Motif de l\'Ã©chec (recommandÃ©)' : 'Notes (facultatif)',
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
            child: Text(fail ? 'Marquer Ã©chec' : 'Terminer'),
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
      fail ? 'Mission marquÃ©e en Ã©chec.' : 'Mission terminÃ©e.',
      status: status,
      notes: notes.isEmpty ? null : notes,
    );
  }

  Future<void> _openMaps(String address) async {
    final uri = Uri.parse(
        'https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(address)}');
    // On lance directement (comme partout ailleurs dans l'app) : sur la PWA
    // Flutter-web `canLaunchUrl` renvoie `false` pour un https externe et le
    // `await` casse le geste utilisateur â†’ l'onglet est bloquÃ©.
    try {
      await launchUrl(uri,
          mode: LaunchMode.externalApplication, webOnlyWindowName: '_blank');
    } catch (_) {/* le navigateur a bloquÃ© l'ouverture : on ignore */}
  }

  /// Ouvre un lien tel quel (ex. le lien Google Maps Ã©pinglÃ© de l'agence). On
  /// lance directement, sans `canLaunchUrl`, pour ne pas casser le geste
  /// utilisateur sur la PWA Flutter-web.
  Future<void> _openRawUrl(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    try {
      await launchUrl(uri,
          mode: LaunchMode.externalApplication, webOnlyWindowName: '_blank');
    } catch (_) {/* le navigateur a bloquÃ© l'ouverture : on ignore */}
  }

  /// Ouvre l'itinÃ©raire de la mission dans Google Maps. Avec une origine ET une
  /// destination, on lance un vrai itinÃ©raire routier (dir) â€” le mÃªme trajet
  /// que celui saisi dans l'ERP web. Avec un seul point connu, on retombe sur
  /// une recherche simple de ce point.
  Future<void> _openItinerary(String? origin, String? destination) async {
    final dest = (destination != null && destination.trim().isNotEmpty)
        ? destination.trim()
        : null;
    final orig = (origin != null && origin.trim().isNotEmpty)
        ? origin.trim()
        : null;
    if (dest == null && orig == null) return;

    if (dest == null || orig == null) {
      // Un seul point connu â†’ recherche simple de ce point.
      await _openMaps((dest ?? orig)!);
      return;
    }
    final uri = Uri.parse(
        'https://www.google.com/maps/dir/?api=1'
        '&origin=${Uri.encodeComponent(orig)}'
        '&destination=${Uri.encodeComponent(dest)}'
        '&travelmode=driving');
    try {
      await launchUrl(uri,
          mode: LaunchMode.externalApplication, webOnlyWindowName: '_blank');
    } catch (_) {/* le navigateur a bloquÃ© l'ouverture : on ignore */}
  }
}

// â”€â”€ Stepper de statut â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class _StatusStepper extends StatelessWidget {
  const _StatusStepper({required this.status});
  final String status;

  static const _steps = ['assigned', 'accepted', 'in_progress', 'arrived', 'completed'];
  static const _labels = ['AssignÃ©e', 'AcceptÃ©e', 'En cours', 'ArrivÃ©', 'TerminÃ©e'];

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

// â”€â”€ Formulaires INLINE (photos, Ã©tats des lieux, signature, incidents) â”€â”€â”€â”€â”€â”€
//
// MÃªme philosophie que l'Ã©tape Annexes du wizard Â« GÃ©nÃ©rer le contrat Â» :
// le missionnaire voit les champs de saisie directement dans la fiche de
// mission, pas dans un bottom-sheet ou un Ã©cran dÃ©diÃ©. Chaque widget gÃ¨re
// ses propres contrÃ´leurs et appelle `missionsRepoProvider` ; le parent lui
// envoie un callback `onBusy` pour dÃ©sactiver les boutons d'action pendant
// l'envoi.

typedef _BusyCb = void Function(bool);
typedef _SavedCb = void Function();
typedef _SavedCountCb = void Function(int);
typedef _ErrorCb = void Function(String);

class _PhotosInlineForm extends ConsumerStatefulWidget {
  const _PhotosInlineForm({
    required this.missionId,
    required this.busy,
    required this.onBusy,
    required this.onSaved,
    required this.onError,
  });
  final String missionId;
  final bool busy;
  final _BusyCb onBusy;
  final _SavedCountCb onSaved;
  final _ErrorCb onError;

  @override
  ConsumerState<_PhotosInlineForm> createState() => _PhotosInlineFormState();
}

class _PhotosInlineFormState extends ConsumerState<_PhotosInlineForm> {
  Future<void> _pick(ImageSource source) async {
    try {
      final picker = ImagePicker();
      final List<XFile> picked;
      if (source == ImageSource.camera) {
        final one = await picker.pickImage(
            source: ImageSource.camera, imageQuality: 70);
        picked = one == null ? const <XFile>[] : <XFile>[one];
      } else {
        picked = await picker.pickMultiImage(imageQuality: 70);
      }
      if (picked.isEmpty) return;
      widget.onBusy(true);
      final files = <MultipartFile>[];
      for (final x in picked) {
        final bytes = await x.readAsBytes();
        files.add(MultipartFile.fromBytes(bytes, filename: x.name));
      }
      await ref.read(missionsRepoProvider).uploadPhotos(widget.missionId,
          files: files, phase: 'handover', label: 'Photo terrain');
      widget.onSaved(files.length);
    } catch (e) {
      widget.onError(friendlyError(e));
    } finally {
      widget.onBusy(false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      Expanded(
        child: OutlinedButton.icon(
          onPressed: widget.busy ? null : () => _pick(ImageSource.camera),
          icon: const Icon(Icons.photo_camera, size: 16),
          label: const Text('Prendre photo'),
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(40)),
        ),
      ),
      const SizedBox(width: 8),
      Expanded(
        child: OutlinedButton.icon(
          onPressed: widget.busy ? null : () => _pick(ImageSource.gallery),
          icon: const Icon(Icons.image_outlined, size: 16),
          label: const Text('Galerie'),
          style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(40)),
        ),
      ),
    ]);
  }
}

class _InspectionInlineForm extends ConsumerStatefulWidget {
  const _InspectionInlineForm({
    required this.missionId,
    required this.busy,
    required this.onBusy,
    required this.onSaved,
    required this.onError,
  });
  final String missionId;
  final bool busy;
  final _BusyCb onBusy;
  final _SavedCb onSaved;
  final _ErrorCb onError;

  @override
  ConsumerState<_InspectionInlineForm> createState() =>
      _InspectionInlineFormState();
}

class _InspectionInlineFormState extends ConsumerState<_InspectionInlineForm> {
  String _type = 'check_out';
  String _exterior = 'good';
  String _interior = 'good';
  final _km = TextEditingController();
  final _fuel = TextEditingController();
  final _notes = TextEditingController();

  static const _conditions = {
    'good': 'Bon Ã©tat',
    'minor_damage': 'DÃ©gÃ¢ts mineurs',
    'major_damage': 'DÃ©gÃ¢ts majeurs',
  };

  @override
  void dispose() {
    _km.dispose();
    _fuel.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    widget.onBusy(true);
    try {
      await ref.read(missionsRepoProvider).submitInspection(
            widget.missionId,
            inspectionType: _type,
            odometerKm: int.tryParse(_km.text.trim()),
            fuelLevel: int.tryParse(_fuel.text.trim()),
            exteriorCondition: _exterior,
            interiorCondition: _interior,
            damageNotes: _notes.text.trim().isEmpty ? null : _notes.text.trim(),
          );
      _km.clear();
      _fuel.clear();
      _notes.clear();
      widget.onSaved();
    } catch (e) {
      widget.onError(friendlyError(e));
    } finally {
      widget.onBusy(false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'check_in', label: Text('EntrÃ©e')),
            ButtonSegment(value: 'check_out', label: Text('Sortie')),
          ],
          selected: {_type},
          onSelectionChanged: (s) => setState(() => _type = s.first),
        ),
        const SizedBox(height: 10),
        Row(children: [
          Expanded(child: _field(_km, 'Compteur (km)', number: true)),
          const SizedBox(width: 10),
          Expanded(child: _field(_fuel, 'Carburant (%)', number: true)),
        ]),
        const SizedBox(height: 10),
        _dropdown('ExtÃ©rieur', _exterior, _conditions,
            (v) => setState(() => _exterior = v)),
        const SizedBox(height: 8),
        _dropdown('IntÃ©rieur', _interior, _conditions,
            (v) => setState(() => _interior = v)),
        const SizedBox(height: 10),
        _field(_notes, 'Observations / dÃ©gÃ¢ts', lines: 2),
        const SizedBox(height: 10),
        FilledButton.icon(
          onPressed: widget.busy ? null : _save,
          icon: const Icon(Icons.check, size: 16),
          label: const Text("Enregistrer l'Ã©tat des lieux"),
          style: FilledButton.styleFrom(
              backgroundColor: _brand, minimumSize: const Size.fromHeight(44)),
        ),
      ],
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

class _SignatureInlineForm extends ConsumerStatefulWidget {
  const _SignatureInlineForm({
    required this.missionId,
    required this.busy,
    required this.onBusy,
    required this.onSaved,
    required this.onError,
  });
  final String missionId;
  final bool busy;
  final _BusyCb onBusy;
  final _SavedCb onSaved;
  final _ErrorCb onError;

  @override
  ConsumerState<_SignatureInlineForm> createState() =>
      _SignatureInlineFormState();
}

class _SignatureInlineFormState extends ConsumerState<_SignatureInlineForm> {
  final _padKey = GlobalKey<SignaturePadState>();
  final _name = TextEditingController();
  bool _hasStrokes = false;

  @override
  void dispose() {
    _name.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_name.text.trim().isEmpty) {
      widget.onError('Nom du signataire requis.');
      return;
    }
    final png = await _padKey.currentState?.exportPng();
    if (png == null) {
      widget.onError('Veuillez signer dans le cadre.');
      return;
    }
    widget.onBusy(true);
    try {
      await ref.read(missionsRepoProvider).captureSignature(widget.missionId,
          signerName: _name.text.trim(), pngBytes: png);
      _padKey.currentState?.clear();
      _name.clear();
      setState(() => _hasStrokes = false);
      widget.onSaved();
    } catch (e) {
      widget.onError(friendlyError(e));
    } finally {
      widget.onBusy(false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _name,
          decoration: const InputDecoration(
              labelText: 'Nom du signataire',
              border: OutlineInputBorder(),
              isDense: true),
        ),
        const SizedBox(height: 10),
        SignaturePad(
          key: _padKey,
          height: 180,
          onChanged: (h) => setState(() => _hasStrokes = h),
        ),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton.icon(
            onPressed: () {
              _padKey.currentState?.clear();
              setState(() => _hasStrokes = false);
            },
            icon: const Icon(Icons.refresh, size: 16),
            label: const Text('Effacer'),
          ),
        ),
        FilledButton.icon(
          onPressed: (widget.busy || !_hasStrokes) ? null : _save,
          icon: const Icon(Icons.verified_outlined, size: 16),
          label: const Text('Enregistrer la signature'),
          style: FilledButton.styleFrom(
              backgroundColor: _brand, minimumSize: const Size.fromHeight(44)),
        ),
      ],
    );
  }
}

class _IssueInlineForm extends ConsumerStatefulWidget {
  const _IssueInlineForm({
    required this.missionId,
    required this.busy,
    required this.onBusy,
    required this.onSaved,
    required this.onError,
  });
  final String missionId;
  final bool busy;
  final _BusyCb onBusy;
  final _SavedCb onSaved;
  final _ErrorCb onError;

  @override
  ConsumerState<_IssueInlineForm> createState() => _IssueInlineFormState();
}

class _IssueInlineFormState extends ConsumerState<_IssueInlineForm> {
  String _type = 'other';
  String _severity = 'medium';
  final _desc = TextEditingController();

  static const _types = {
    'vehicle_damage': 'DÃ©gÃ¢t vÃ©hicule',
    'customer_absent': 'Client absent',
    'wrong_address': 'Mauvaise adresse',
    'mechanical': 'Panne mÃ©canique',
    'other': 'Autre',
  };
  static const _severities = {
    'low': 'Faible',
    'medium': 'Moyenne',
    'high': 'Ã‰levÃ©e',
    'critical': 'Critique',
  };

  @override
  void dispose() {
    _desc.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_desc.text.trim().isEmpty) {
      widget.onError("DÃ©crivez l'incident.");
      return;
    }
    widget.onBusy(true);
    try {
      await ref.read(missionsRepoProvider).reportIssue(
            widget.missionId,
            issueType: _type,
            severity: _severity,
            description: _desc.text.trim(),
          );
      _desc.clear();
      widget.onSaved();
    } catch (e) {
      widget.onError(friendlyError(e));
    } finally {
      widget.onBusy(false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _dropdown('Type', _type, _types, (v) => setState(() => _type = v)),
        const SizedBox(height: 8),
        _dropdown('GravitÃ©', _severity, _severities,
            (v) => setState(() => _severity = v)),
        const SizedBox(height: 10),
        TextField(
          controller: _desc,
          maxLines: 3,
          decoration: const InputDecoration(
              labelText: 'Description',
              border: OutlineInputBorder(),
              isDense: true),
        ),
        const SizedBox(height: 10),
        FilledButton.icon(
          onPressed: widget.busy ? null : _save,
          icon: const Icon(Icons.report_problem_outlined, size: 16),
          label: const Text('Signaler'),
          style: FilledButton.styleFrom(
              backgroundColor: _brand, minimumSize: const Size.fromHeight(44)),
        ),
      ],
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
