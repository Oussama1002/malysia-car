import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/widgets/module_scaffold.dart';
import '../data/mission_action_queue.dart';
import '../data/mission_dto.dart';
import '../data/missions_repo.dart';
import 'mission_detail_screen.dart';

const _brand = Color(0xFFB8933F);

/// Filtres de statut proposés en haut de l'écran (ordre du workflow terrain).
const _statusFilters = <String, String>{
  '': 'Toutes',
  'assigned': 'À accepter',
  'accepted': 'Acceptées',
  'in_progress': 'En cours',
  'arrived': 'Arrivé',
  'completed': 'Terminées',
};

/// Onglet « Mes missions » de l'agent terrain (MISSIONNAIRE). Liste les
/// missions assignées ; chaque carte ouvre la fiche détail (cycle de vie,
/// justificatifs, génération de contrat). Rafraîchissement automatique toutes
/// les 30 s (comme le web) et file d'attente hors-ligne.
class MissionsScreen extends ConsumerStatefulWidget {
  const MissionsScreen({super.key});

  @override
  ConsumerState<MissionsScreen> createState() => _MissionsScreenState();
}

class _MissionsScreenState extends ConsumerState<MissionsScreen> {
  Timer? _poll;
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    // Rejoue les actions hors-ligne en attente dès l'ouverture.
    WidgetsBinding.instance.addPostFrameCallback((_) => _flushQueue());
    // Auto-refresh : nouvelle mission assignée visible sans action manuelle.
    _poll = Timer.periodic(const Duration(seconds: 30), (_) {
      if (!mounted) return;
      ref.invalidate(myMissionsProvider);
      _flushQueue();
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _flushQueue() async {
    final applied = await ref.read(missionActionQueueProvider.notifier).flush();
    if (applied > 0 && mounted) {
      ref.invalidate(myMissionsProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$applied action(s) synchronisée(s).')),
      );
    }
  }

  List<MissionDto> _filtered(List<MissionDto> all, String q) {
    if (q.trim().isEmpty) return all;
    final needle = q.toLowerCase();
    return all.where((m) {
      final hay = [
        m.missionNumber,
        missionTypeFr(m.missionType),
        m.vehicleLabel ?? '',
        m.clientLabel ?? '',
        m.pickupAddress ?? '',
        m.dropoffAddress ?? '',
      ].join(' ').toLowerCase();
      return hay.contains(needle);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(myMissionsProvider);
    final filter = ref.watch(missionsStatusFilterProvider);
    final search = ref.watch(missionsSearchProvider);
    final queue = ref.watch(missionActionQueueProvider);

    return Scaffold(
      body: ModuleBackground(
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(myMissionsProvider);
              await _flushQueue();
            },
            child: ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                const Padding(
                  padding: EdgeInsets.fromLTRB(20, 16, 20, 0),
                  child: Text('Mes missions',
                      style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
                ),
                const SizedBox(height: 4),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 20),
                  child: Text(
                    'Les missions terrain qui vous sont assignées. Ouvrez une '
                    'mission pour la faire avancer et générer le contrat.',
                    style: TextStyle(color: Colors.black54, fontSize: 13, height: 1.4),
                  ),
                ),
                const SizedBox(height: 12),
                if (queue.isNotEmpty) _OfflineBanner(count: queue.length, onSync: _flushQueue),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                  child: ModuleSearchField(
                    controller: _searchCtrl,
                    hint: 'Rechercher (n°, véhicule, client, adresse)…',
                    onChanged: (v) =>
                        ref.read(missionsSearchProvider.notifier).state = v,
                  ),
                ),
                const SizedBox(height: 12),
                _FilterChips(
                  current: filter,
                  onChanged: (v) =>
                      ref.read(missionsStatusFilterProvider.notifier).state = v,
                ),
                const SizedBox(height: 14),
                async.when(
                  loading: () => const Padding(
                    padding: EdgeInsets.symmetric(vertical: 60),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                  error: (e, _) => ModuleErrorView(message: friendlyError(e)),
                  data: (all) {
                    final missions = _filtered(all, search);
                    if (missions.isEmpty) {
                      return ModuleEmptyView(
                        icon: Icons.map_outlined,
                        message: all.isEmpty
                            ? 'Aucune mission pour le moment.'
                            : 'Aucune mission ne correspond à la recherche.',
                      );
                    }
                    return Column(
                      children: [
                        for (final m in missions)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                            child: _MissionCard(mission: m),
                          ),
                      ],
                    );
                  },
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _OfflineBanner extends StatelessWidget {
  const _OfflineBanner({required this.count, required this.onSync});
  final int count;
  final VoidCallback onSync;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.amber.shade50,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.amber.shade200),
        ),
        child: Row(
          children: [
            Icon(Icons.cloud_off, size: 18, color: Colors.amber.shade800),
            const SizedBox(width: 8),
            Expanded(
              child: Text('$count action(s) en attente de synchronisation.',
                  style: TextStyle(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                      color: Colors.amber.shade900)),
            ),
            TextButton(onPressed: onSync, child: const Text('Synchroniser')),
          ],
        ),
      ),
    );
  }
}

class _FilterChips extends StatelessWidget {
  const _FilterChips({required this.current, required this.onChanged});
  final String current;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 38,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          for (final e in _statusFilters.entries)
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: ChoiceChip(
                label: Text(e.value),
                selected: current == e.key,
                onSelected: (_) => onChanged(e.key),
                selectedColor: _brand.withOpacity(0.18),
                labelStyle: TextStyle(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w800,
                  color: current == e.key ? const Color(0xFF7A5F22) : Colors.black54,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(999),
                  side: BorderSide(
                    color: current == e.key ? _brand : Theme.of(context).dividerColor,
                  ),
                ),
                backgroundColor: Theme.of(context).colorScheme.surface,
              ),
            ),
        ],
      ),
    );
  }
}

/// Carte de liste : résumé + ouverture de la fiche détail au tap. Les actions
/// de cycle de vie vivent désormais dans la fiche détail (une seule action
/// « suivante » à la fois, plus de boutons qui se chevauchent).
class _MissionCard extends StatelessWidget {
  const _MissionCard({required this.mission});
  final MissionDto mission;

  @override
  Widget build(BuildContext context) {
    final m = mission;
    final fmt = DateFormat('dd/MM/yyyy HH:mm', 'fr');
    final pickup = m.pickupAddress ?? m.originAddress;
    final dropoff = m.dropoffAddress ?? m.destinationAddress;

    return ModuleCard(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => MissionDetailScreen(missionId: m.id),
      )),
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
                            fontWeight: FontWeight.w900, fontSize: 15.5)),
                    if (m.missionNumber.isNotEmpty)
                      Text(m.missionNumber,
                          style: const TextStyle(
                              color: Colors.black45, fontSize: 11.5)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              ModuleStatusChip(
                  label: missionStatusFr(m.status),
                  tone: missionStatusTone(m.status)),
            ],
          ),
          if (m.scheduledStartAt != null) ...[
            const SizedBox(height: 10),
            _iconLine(Icons.schedule, fmt.format(m.scheduledStartAt!)),
          ],
          if (m.vehicleLabel != null) ...[
            const SizedBox(height: 8),
            _iconLine(Icons.directions_car, m.vehicleLabel!),
          ],
          if (m.clientLabel != null) ...[
            const SizedBox(height: 6),
            _iconLine(Icons.person_outline, m.clientLabel!),
          ],
          if (dropoff != null && dropoff.isNotEmpty) ...[
            const SizedBox(height: 6),
            _iconLine(Icons.place_outlined, dropoff),
          ] else if (pickup != null && pickup.isNotEmpty) ...[
            const SizedBox(height: 6),
            _iconLine(Icons.place_outlined, pickup),
          ],
          const SizedBox(height: 10),
          Row(
            children: [
              if (m.hasContract)
                _chipHint(Icons.description, 'Contrat', const Color(0xFF2E7D32))
              else if (m.canGenerateContract)
                _chipHint(Icons.note_add_outlined, 'Contrat à générer', _brand),
              const Spacer(),
              const Text('Ouvrir',
                  style: TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w800, color: _brand)),
              const Icon(Icons.chevron_right, size: 18, color: _brand),
            ],
          ),
        ],
      ),
    );
  }

  Widget _iconLine(IconData icon, String text) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 15, color: Colors.black45),
          const SizedBox(width: 6),
          Expanded(
            child: Text(text,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    fontSize: 12.5, fontWeight: FontWeight.w700)),
          ),
        ],
      );

  Widget _chipHint(IconData icon, String label, Color color) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: color.withOpacity(0.10),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 4),
          Text(label,
              style: TextStyle(
                  fontSize: 10.5, fontWeight: FontWeight.w800, color: color)),
        ]),
      );
}
