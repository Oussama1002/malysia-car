import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/widgets/module_scaffold.dart';
import '../data/mission_dto.dart';
import '../data/missions_repo.dart';

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

/// Onglet « Mes missions » de l'agent terrain (MISSIONNAIRE). Affiche les
/// missions qui lui sont assignées et permet de les faire avancer dans leur
/// cycle de vie (accepter → démarrer → arrivé → terminer).
class MissionsScreen extends ConsumerWidget {
  const MissionsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myMissionsProvider);
    final filter = ref.watch(missionsStatusFilterProvider);

    return Scaffold(
      body: ModuleBackground(
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: () async => ref.invalidate(myMissionsProvider),
            child: ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                const Padding(
                  padding: EdgeInsets.fromLTRB(20, 16, 20, 0),
                  child: Text('Mes missions',
                      style: TextStyle(
                          fontSize: 28, fontWeight: FontWeight.w900)),
                ),
                const SizedBox(height: 4),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 20),
                  child: Text(
                    'Les missions terrain qui vous sont assignées. Faites-les '
                    'avancer au fur et à mesure.',
                    style: TextStyle(
                        color: Colors.black54, fontSize: 13, height: 1.4),
                  ),
                ),
                const SizedBox(height: 14),
                _FilterChips(
                  current: filter,
                  onChanged: (v) => ref
                      .read(missionsStatusFilterProvider.notifier)
                      .state = v,
                ),
                const SizedBox(height: 14),
                async.when(
                  loading: () => const Padding(
                    padding: EdgeInsets.symmetric(vertical: 60),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                  error: (e, _) => ModuleErrorView(message: '$e'),
                  data: (missions) {
                    if (missions.isEmpty) {
                      return const _EmptyMissions();
                    }
                    return Column(
                      children: [
                        for (final m in missions)
                          Padding(
                            padding:
                                const EdgeInsets.fromLTRB(16, 0, 16, 12),
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

class _EmptyMissions extends StatelessWidget {
  const _EmptyMissions();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.all(40),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.grey.shade200),
        ),
        child: const Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.map_outlined, size: 56, color: Colors.black26),
            SizedBox(height: 12),
            Text('Aucune mission pour le moment.',
                style: TextStyle(color: Colors.black45, fontSize: 13.5)),
          ],
        ),
      ),
    );
  }
}

class _MissionCard extends ConsumerStatefulWidget {
  const _MissionCard({required this.mission});
  final MissionDto mission;

  @override
  ConsumerState<_MissionCard> createState() => _MissionCardState();
}

class _MissionCardState extends ConsumerState<_MissionCard> {
  bool _busy = false;

  Future<void> _run(Future<void> Function(MissionsRepo repo) action,
      String okMsg) async {
    setState(() => _busy = true);
    try {
      await action(ref.read(missionsRepoProvider));
      ref.invalidate(myMissionsProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text(okMsg)));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Action impossible : $e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _complete() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Terminer la mission ?'),
        content: const Text('Confirmez-vous que la mission est terminée ?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Annuler')),
          FilledButton(
              style: FilledButton.styleFrom(backgroundColor: _brand),
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('Terminer')),
        ],
      ),
    );
    if (confirmed != true) return;
    await _run((r) => r.complete(widget.mission.id), 'Mission terminée.');
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.mission;
    final fmt = DateFormat('dd/MM/yyyy HH:mm', 'fr');
    final pickup = m.pickupAddress ?? m.originAddress;
    final dropoff = m.dropoffAddress ?? m.destinationAddress;

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
                            fontWeight: FontWeight.w900, fontSize: 15.5)),
                    if (m.missionNumber.isNotEmpty)
                      Text(m.missionNumber,
                          style: const TextStyle(
                              color: Colors.black45, fontSize: 11.5)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              _StatusPill(status: m.status),
            ],
          ),
          if (m.scheduledStartAt != null) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                const Icon(Icons.schedule, size: 15, color: Colors.black45),
                const SizedBox(width: 6),
                Text(fmt.format(m.scheduledStartAt!),
                    style: const TextStyle(
                        fontSize: 12.5, fontWeight: FontWeight.w700)),
              ],
            ),
          ],
          if (m.vehicleLabel != null) ...[
            const SizedBox(height: 8),
            Row(
              children: [
                const Icon(Icons.directions_car,
                    size: 15, color: Colors.black45),
                const SizedBox(width: 6),
                Text(m.vehicleLabel!,
                    style: const TextStyle(
                        fontSize: 12.5, fontWeight: FontWeight.w700)),
                if (m.clientCode != null) ...[
                  const SizedBox(width: 12),
                  const Icon(Icons.person_outline,
                      size: 15, color: Colors.black45),
                  const SizedBox(width: 6),
                  Text(m.clientCode!,
                      style: const TextStyle(
                          fontSize: 12.5, fontWeight: FontWeight.w700)),
                ],
              ],
            ),
          ],
          if (pickup != null && pickup.isNotEmpty)
            _AddressRow(icon: Icons.trip_origin, label: 'Départ', value: pickup),
          if (dropoff != null && dropoff.isNotEmpty)
            _AddressRow(
                icon: Icons.place_outlined, label: 'Arrivée', value: dropoff),
          if (m.clientInstructions != null &&
              m.clientInstructions!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFFF5F6FB),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(m.clientInstructions!,
                  style: const TextStyle(fontSize: 12.5, color: Colors.black87)),
            ),
          ],
          const SizedBox(height: 12),
          _Actions(
            status: m.status,
            busy: _busy,
            onAccept: () =>
                _run((r) => r.accept(m.id), 'Mission acceptée.'),
            onStart: () => _run((r) => r.start(m.id), 'Mission démarrée.'),
            onArrive: () =>
                _run((r) => r.arrive(m.id), 'Arrivée enregistrée.'),
            onComplete: _complete,
            onNavigate: (dropoff != null && dropoff.isNotEmpty)
                ? () => _openMaps(dropoff)
                : (pickup != null && pickup.isNotEmpty)
                    ? () => _openMaps(pickup)
                    : null,
          ),
        ],
      ),
    );
  }

  Future<void> _openMaps(String address) async {
    final uri = Uri.parse(
        'https://www.google.com/maps/search/?api=1&query=${Uri.encodeComponent(address)}');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }
}

class _AddressRow extends StatelessWidget {
  const _AddressRow(
      {required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 15, color: Colors.black45),
          const SizedBox(width: 6),
          Expanded(
            child: RichText(
              text: TextSpan(
                style: const TextStyle(fontSize: 12.5, color: Colors.black87),
                children: [
                  TextSpan(
                      text: '$label : ',
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, color: Colors.black54)),
                  TextSpan(text: value),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (status) {
      'assigned' || 'pending' || 'planned' => (Colors.amber.shade100, Colors.amber.shade800),
      'accepted' => (Colors.blue.shade100, Colors.blue.shade700),
      'in_progress' || 'arrived' => (Colors.indigo.shade100, Colors.indigo.shade700),
      'completed' => (Colors.green.shade100, Colors.green.shade700),
      'failed' || 'cancelled' => (Colors.red.shade100, Colors.red.shade700),
      _ => (Colors.blueGrey.shade100, Colors.blueGrey.shade700),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        missionStatusFr(status),
        style: TextStyle(
            color: fg,
            fontSize: 10.5,
            fontWeight: FontWeight.w900,
            letterSpacing: 0.3),
      ),
    );
  }
}

class _Actions extends StatelessWidget {
  const _Actions({
    required this.status,
    required this.busy,
    required this.onAccept,
    required this.onStart,
    required this.onArrive,
    required this.onComplete,
    required this.onNavigate,
  });

  final String status;
  final bool busy;
  final VoidCallback onAccept;
  final VoidCallback onStart;
  final VoidCallback onArrive;
  final VoidCallback onComplete;
  final VoidCallback? onNavigate;

  @override
  Widget build(BuildContext context) {
    final buttons = <Widget>[];

    if (status == 'assigned' || status == 'pending') {
      buttons.add(_PrimaryBtn(label: 'Accepter', onTap: busy ? null : onAccept));
    }
    if (status == 'planned' || status == 'assigned' || status == 'accepted') {
      buttons.add(_PrimaryBtn(label: 'Démarrer', onTap: busy ? null : onStart));
    }
    if (status == 'in_progress' || status == 'accepted') {
      buttons.add(_GhostBtn(label: 'Arrivé sur site', onTap: busy ? null : onArrive));
    }
    if (status == 'in_progress' || status == 'arrived') {
      buttons.add(_PrimaryBtn(label: 'Terminer', onTap: busy ? null : onComplete));
    }
    if (onNavigate != null) {
      buttons.add(_GhostBtn(
          label: 'Itinéraire', icon: Icons.navigation_outlined, onTap: onNavigate));
    }

    if (buttons.isEmpty) return const SizedBox.shrink();
    return Wrap(spacing: 8, runSpacing: 8, children: buttons);
  }
}

class _PrimaryBtn extends StatelessWidget {
  const _PrimaryBtn({required this.label, required this.onTap});
  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: onTap,
      style: FilledButton.styleFrom(
        backgroundColor: _brand,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12),
        minimumSize: const Size(0, 38),
      ),
      child: Text(label),
    );
  }
}

class _GhostBtn extends StatelessWidget {
  const _GhostBtn({required this.label, this.icon, required this.onTap});
  final String label;
  final IconData? icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final child = icon != null
        ? Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(icon, size: 14),
            const SizedBox(width: 6),
            Text(label),
          ])
        : Text(label);
    return OutlinedButton(
      onPressed: onTap,
      style: OutlinedButton.styleFrom(
        foregroundColor: Colors.black87,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        side: BorderSide(color: Theme.of(context).dividerColor),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12),
        minimumSize: const Size(0, 38),
      ),
      child: child,
    );
  }
}
