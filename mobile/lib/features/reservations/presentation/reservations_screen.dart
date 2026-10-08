import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../placeholders/placeholder_screen.dart';
import 'archive_reservations_screen.dart';
import 'availability_check_screen.dart';
import 'new_contract_from_reservation_screen.dart';
import 'new_reservation_screen.dart';
import '../data/reservation_dto.dart';
import '../data/reservations_repo.dart';
import 'reservation_detail_screen.dart';

/// Liste des réservations — alignée sur `ReservationsOpsPage.tsx` du web :
/// bannière des réservations urgentes (départ aujourd'hui/hier sans contrat),
/// boutons « Vérifier disponibilité » et « Nouvelle réservation », recherche,
/// cartes avec chip brouillon pointillé ambre, et actions par statut
/// (Valider, Détail, Générer contrat, + Mission).
class ReservationsScreen extends ConsumerStatefulWidget {
  const ReservationsScreen({super.key});

  @override
  ConsumerState<ReservationsScreen> createState() => _ReservationsScreenState();
}

class _ReservationsScreenState extends ConsumerState<ReservationsScreen> {
  final _searchCtrl = TextEditingController();
  String _query = '';
  final Set<String> _dismissedUrgent = {};

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  List<ReservationDto> _filter(List<ReservationDto> items) {
    // Les reservations annulees ne doivent pas apparaitre dans la liste
    // principale : elles sont consultables depuis l'onglet Archive, aligne
    // sur le web (ReservationsOpsPage.tsx : filtre `r.status === 'cancelled'`).
    final base =
        items.where((r) => r.status.toLowerCase() != 'cancelled').toList();
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return base;
    return base
        .where((r) =>
            r.number.toLowerCase().contains(q) ||
            (r.customerName ?? '').toLowerCase().contains(q) ||
            (r.vehicleLabel ?? '').toLowerCase().contains(q))
        .toList();
  }

  List<ReservationDto> _urgent(List<ReservationDto> items) {
    const preHandover = ['reserved', 'confirmed', 'pickup_scheduled'];
    final today = DateTime.now();
    final todayStart = DateTime(today.year, today.month, today.day);
    final yesterdayStart = todayStart.subtract(const Duration(days: 1));
    return items.where((r) {
      if (!preHandover.contains(r.status.toLowerCase())) return false;
      if (r.hasContract) return false;
      if (r.startAt == null) return false;
      final s =
          DateTime(r.startAt!.year, r.startAt!.month, r.startAt!.day);
      return s.isAtSameMomentAs(todayStart) ||
          s.isAtSameMomentAs(yesterdayStart);
    }).toList();
  }

  Future<void> _validate(ReservationDto r) async {
    try {
      await ref
          .read(reservationsRepoProvider)
          .validateReservation(r.id, vehicleId: r.vehicleId);
      ref.invalidate(reservationsListProvider);
      ref.invalidate(enrichedReservationsProvider);
      ref.invalidate(reservationDetailProvider(r.id));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Réservation validée.')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Erreur : $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(enrichedReservationsProvider);
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFFEEF0FB), Color(0xFFF7F8FD)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(reservationsListProvider);
              ref.invalidate(enrichedReservationsProvider);
            },
            child: async.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (err, _) => _ErrorView(message: '$err'),
              data: (items) {
                final urgent = _urgent(items)
                    .where((r) => !_dismissedUrgent.contains(r.id))
                    .toList();
                final list = _filter(items);
                return ListView(
                  padding: const EdgeInsets.only(bottom: 24),
                  children: [
                    _TopBar(onBack: () => Navigator.of(context).maybePop()),
                    if (urgent.isNotEmpty)
                      _UrgentBanner(
                        urgent: urgent,
                        onDismiss: (id) =>
                            setState(() => _dismissedUrgent.add(id)),
                      ),
                    const SizedBox(height: 10),
                    const _Title(),
                    const SizedBox(height: 16),
                    _ActionsRow(
                      // Archive = reservations annulees uniquement, comme le
                      // web (ReservationsOpsPage.tsx ligne 702 : cancelledCount).
                      // On comptait auparavant aussi closed + completed, ce
                      // qui gonflait le compteur et desynchronisait le
                      // mobile du web.
                      archiveCount: items
                          .where((r) => r.status.toLowerCase() == 'cancelled')
                          .length,
                      onNew: () {
                        Navigator.of(context).push(MaterialPageRoute(
                            builder: (_) => const NewReservationScreen()));
                      },
                      onCheck: () {
                        Navigator.of(context).push(MaterialPageRoute(
                            builder: (_) => const AvailabilityCheckScreen()));
                      },
                      onArchive: () {
                        Navigator.of(context).push(MaterialPageRoute(
                            builder: (_) =>
                                const ArchiveReservationsScreen()));
                      },
                    ),
                    const SizedBox(height: 14),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: _SearchField(
                        controller: _searchCtrl,
                        onChanged: (v) => setState(() => _query = v),
                      ),
                    ),
                    const SizedBox(height: 18),
                    if (list.isEmpty)
                      const Padding(
                        padding:
                            EdgeInsets.symmetric(horizontal: 20, vertical: 48),
                        child: Center(
                          child: Column(children: [
                            Icon(Icons.event_busy,
                                size: 56, color: Colors.black26),
                            SizedBox(height: 12),
                            Text('Aucune réservation.'),
                          ]),
                        ),
                      )
                    else
                      ...list.map((r) => Padding(
                            padding:
                                const EdgeInsets.fromLTRB(16, 0, 16, 12),
                            child: _ReservationCard(
                              r: r,
                              onValidate: () => _validate(r),
                            ),
                          )),
                  ],
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Header + title
// ---------------------------------------------------------------------------

class _TopBar extends StatelessWidget {
  const _TopBar({required this.onBack});
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
      child: Row(
        children: [
          IconButton(onPressed: onBack, icon: const Icon(Icons.arrow_back)),
          const Text('Opérations',
              style: TextStyle(color: Colors.black54, fontSize: 14)),
          const Icon(Icons.chevron_right, color: Colors.black26, size: 18),
          const Text('Réservations',
              style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
        ],
      ),
    );
  }
}

class _Title extends StatelessWidget {
  const _Title();
  @override
  Widget build(BuildContext context) {
    return const Padding(
      padding: EdgeInsets.symmetric(horizontal: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Réservations',
              style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
          SizedBox(height: 4),
          Text(
            'Gestion des réservations : disponibilité, remise, retour, dommages, prolongation et clôture.',
            style: TextStyle(color: Colors.black54, fontSize: 13, height: 1.4),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Urgent banner
// ---------------------------------------------------------------------------

/// Phrase d'entête de la bannière des réservations urgentes : séparée
/// pour que le libellé soit précis (aujourd'hui / hier / mix) au lieu de
/// l'ancien « aujourd'hui ou hier » qui restait flou quand il n'y en
/// avait qu'un seul des deux jours.
String _urgentHeadline(List<ReservationDto> urgent) {
  final today = DateTime.now();
  final todayStart = DateTime(today.year, today.month, today.day);
  int todayCount = 0;
  for (final r in urgent) {
    if (r.startAt == null) continue;
    final s = DateTime(r.startAt!.year, r.startAt!.month, r.startAt!.day);
    if (s.isAtSameMomentAs(todayStart)) todayCount++;
  }
  final yesterdayCount = urgent.length - todayCount;
  String plural(int n) => n > 1 ? 's' : '';
  final parts = <String>[];
  if (todayCount > 0) {
    parts.add(
        "$todayCount réservation${plural(todayCount)} sans contrat — départ aujourd'hui");
  }
  if (yesterdayCount > 0) {
    parts.add(
        "$yesterdayCount réservation${plural(yesterdayCount)} sans contrat — départ hier");
  }
  return parts.join(' · ');
}

class _UrgentBanner extends StatelessWidget {
  const _UrgentBanner({required this.urgent, required this.onDismiss});
  final List<ReservationDto> urgent;
  final ValueChanged<String> onDismiss;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        margin: const EdgeInsets.only(top: 10),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFFFFFBEB),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFFDE68A)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.notifications_active_outlined,
                    color: Color(0xFFB45309), size: 18),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _urgentHeadline(urgent),
                    style: const TextStyle(
                        color: Color(0xFF78350F),
                        fontWeight: FontWeight.w900,
                        fontSize: 13),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 2),
            const Padding(
              padding: EdgeInsets.only(left: 26),
              child: Text(
                'Générez le contrat avant la remise des clés.',
                style: TextStyle(color: Color(0xFF92400E), fontSize: 11.5),
              ),
            ),
            const SizedBox(height: 10),
            for (final r in urgent) _urgentRow(context, r),
          ],
        ),
      ),
    );
  }

  Widget _urgentRow(BuildContext context, ReservationDto r) {
    final today = DateTime.now();
    final startIsToday = r.startAt != null &&
        r.startAt!.year == today.year &&
        r.startAt!.month == today.month &&
        r.startAt!.day == today.day;
    final (badgeBg, badgeFg, badge) = startIsToday
        ? (const Color(0xFFFEE2E2), const Color(0xFFB91C1C), "AUJOURD'HUI")
        : (const Color(0xFFFEF3C7), const Color(0xFFB45309), 'HIER');
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFFDE68A)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                    color: badgeBg, borderRadius: BorderRadius.circular(999)),
                child: Text(badge,
                    style: TextStyle(
                        color: badgeFg,
                        fontSize: 9.5,
                        fontWeight: FontWeight.w900)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(r.number,
                        style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w900,
                            color: Color(0xFF334155))),
                    Text(
                      '${r.customerName ?? '—'} · ${r.vehicleLabel ?? '—'}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 11, color: Colors.black54),
                    ),
                  ],
                ),
              ),
              IconButton(
                onPressed: () => onDismiss(r.id),
                icon: const Icon(Icons.close,
                    color: Color(0xFFB45309), size: 16),
                tooltip: 'Ignorer',
                visualDensity: VisualDensity.compact,
              ),
            ],
          ),
          // Actions alignees sur le web : "Voir detail" (outline neutre)
          // puis "Generer contrat" (ambre, mis en avant).
          Padding(
            padding: const EdgeInsets.only(top: 8, left: 2, right: 2),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                OutlinedButton(
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => ReservationDetailScreen(id: r.id))),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF334155),
                    side: const BorderSide(color: Color(0xFFCBD5E1)),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 6),
                    minimumSize: const Size(0, 30),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                    textStyle: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 11),
                  ),
                  child: const Text('Voir détail'),
                ),
                const SizedBox(width: 6),
                FilledButton.icon(
                  onPressed: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => NewContractFromReservationScreen(
                          reservationId: r.id))),
                  icon: const Text('📄', style: TextStyle(fontSize: 11)),
                  label: const Text('Générer contrat'),
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFFD97706),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 6),
                    minimumSize: const Size(0, 30),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                    textStyle: const TextStyle(
                        fontWeight: FontWeight.w900, fontSize: 11),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Actions row (Nouvelle / Vérifier)
// ---------------------------------------------------------------------------

class _ActionsRow extends StatelessWidget {
  const _ActionsRow({
    required this.archiveCount,
    required this.onNew,
    required this.onCheck,
    required this.onArchive,
  });
  final int archiveCount;
  final VoidCallback onNew;
  final VoidCallback onCheck;
  final VoidCallback onArchive;

  @override
  Widget build(BuildContext context) {
    // Row horizontale défilable : les trois boutons restent sur la même
    // ligne même quand les libellés sont longs. Évite le wrap qui créait
    // un décalage visuel sur « Nouvelle réservation ».
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        children: [
          OutlinedButton.icon(
            onPressed: onArchive,
            icon: const Icon(Icons.inventory_2_outlined, size: 14),
            label: Text('Archive ($archiveCount)'),
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFF334155),
              side: const BorderSide(color: Color(0xFFCBD5E1)),
              backgroundColor: Colors.white,
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              minimumSize: const Size(0, 38),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
              textStyle:
                  const TextStyle(fontWeight: FontWeight.w900, fontSize: 11.5),
            ),
          ),
          const SizedBox(width: 6),
          OutlinedButton.icon(
            onPressed: onCheck,
            icon: const Icon(Icons.search, size: 14),
            label: const Text('Vérifier dispo.'),
            style: OutlinedButton.styleFrom(
              foregroundColor: const Color(0xFF334155),
              side: const BorderSide(color: Color(0xFFCBD5E1)),
              backgroundColor: Colors.white,
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              minimumSize: const Size(0, 38),
              shape:
                  RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              textStyle:
                  const TextStyle(fontWeight: FontWeight.w900, fontSize: 11.5),
            ),
          ),
          const SizedBox(width: 6),
          FilledButton.icon(
            onPressed: onNew,
            icon: const Icon(Icons.add, size: 14),
            label: const Text('Nouvelle rés.'),
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF4F46E5),
              foregroundColor: Colors.white,
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              minimumSize: const Size(0, 38),
              shape:
                  RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              textStyle:
                  const TextStyle(fontWeight: FontWeight.w900, fontSize: 11.5),
            ),
          ),
        ],
      ),
    );
  }
}

class _SearchField extends StatelessWidget {
  const _SearchField({required this.controller, required this.onChanged});
  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      onChanged: onChanged,
      decoration: InputDecoration(
        prefixIcon: const Icon(Icons.search, color: Colors.black45),
        hintText: 'Filtrer réservations…',
        hintStyle: const TextStyle(color: Colors.black45),
        filled: true,
        fillColor: Colors.white,
        contentPadding:
            const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: Colors.grey.shade200),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: Colors.grey.shade200),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFF6366F1), width: 1.4),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Reservation card
// ---------------------------------------------------------------------------

class _ReservationCard extends StatelessWidget {
  const _ReservationCard({required this.r, required this.onValidate});
  final ReservationDto r;
  final VoidCallback onValidate;

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd/MM/yyyy HH:mm', 'fr');
    return InkWell(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => ReservationDetailScreen(id: r.id))),
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.grey.shade200),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.03),
              blurRadius: 10,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(r.number,
                style: const TextStyle(
                    color: Colors.black38,
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                    letterSpacing: 1.3)),
            const SizedBox(height: 6),
            // Client et véhicule sur la MÊME ligne, comme la liste web :
            // `Client · Véhicule`. On passe en Wrap pour que ça retombe
            // proprement sur deux lignes si l'écran est trop étroit, sans
            // décaler la carte.
            Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 6,
              children: [
                Text(r.customerName ?? '—',
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 15)),
                const Text('·',
                    style: TextStyle(color: Colors.black38, fontSize: 15)),
                Text(r.vehicleLabel ?? '—',
                    style: const TextStyle(
                        color: Colors.black54,
                        fontSize: 12.5,
                        fontWeight: FontWeight.w700,
                        fontFamily: 'monospace')),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              '${r.startAt != null ? dateFmt.format(r.startAt!) : '—'} → '
              '${r.endAt != null ? dateFmt.format(r.endAt!) : '—'}',
              style: const TextStyle(color: Colors.black54, fontSize: 12),
            ),
            const SizedBox(height: 10),
            const SizedBox(height: 10),
            // Tout sur une seule ligne horizontale, défilable si trop large :
            // chip de statut puis boutons d'action. Évite le wrap de boutons
            // qui créait un décalage visuel sur « Générer contrat ».
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  if (r.isDraft) const _DraftChip() else _StatusChip(status: r.status),
                  const SizedBox(width: 8),
                  for (final btn in _actions(context)) ...[
                    btn,
                    const SizedBox(width: 6),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<Widget> _actions(BuildContext context) {
    final out = <Widget>[];
    if (r.isDraft) {
      out.add(_ActionBtn.green(label: '✓ Valider', onTap: onValidate));
    }
    out.add(_ActionBtn.primary(
      label: 'Détail →',
      onTap: () => Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => ReservationDetailScreen(id: r.id))),
    ));
    if (!r.isDraft && !r.isCancelled && !r.isClosed && !r.hasContract) {
      out.add(_ActionBtn.orange(
        label: 'Générer contrat',
        onTap: () => Navigator.of(context).push(MaterialPageRoute(
          builder: (_) =>
              NewContractFromReservationScreen(reservationId: r.id),
        )),
      ));
    }
    if (!r.isDraft && !r.isCancelled && !r.isClosed) {
      out.add(_ActionBtn.dark(
        label: '+ Mission',
        onTap: () => Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => const PlaceholderScreen(
              title: 'Nouvelle mission', icon: Icons.assignment_outlined),
        )),
      ));
    }
    return out;
  }
}

class _DraftChip extends StatelessWidget {
  const _DraftChip();
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFFFFFBEB),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
            color: const Color(0xFFF59E0B), width: 1.4, style: BorderStyle.solid),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: const [
          Icon(Icons.hourglass_top, size: 11, color: Color(0xFFB45309)),
          SizedBox(width: 4),
          Text('INTENTION · NON VALIDÉE',
              style: TextStyle(
                  color: Color(0xFFB45309),
                  fontSize: 9.5,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0.5)),
        ],
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final s = status.toLowerCase();
    final (bg, fg) = switch (s) {
      'closed' || 'reserved' || 'confirmed' => (
        const Color(0xFFDCFCE7),
        const Color(0xFF166534)
      ),
      'cancelled' => (
        const Color(0xFFFEE2E2),
        const Color(0xFFB91C1C)
      ),
      'active' || 'handed_over' => (
        const Color(0xFFE0E7FF),
        const Color(0xFF3730A3)
      ),
      _ when s.contains('pending') || s == 'extension_requested' => (
        const Color(0xFFFEF3C7),
        const Color(0xFF92400E)
      ),
      _ => (const Color(0xFFDBEAFE), const Color(0xFF1E3A8A)),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(frenchStatus(status).toUpperCase(),
          style: TextStyle(
              color: fg,
              fontSize: 10.5,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.5)),
    );
  }
}

class _ActionBtn extends StatelessWidget {
  const _ActionBtn.primary({required this.label, required this.onTap})
      : _color = const Color(0xFF6366F1),
        _fg = Colors.white;
  const _ActionBtn.orange({required this.label, required this.onTap})
      : _color = const Color(0xFFF59E0B),
        _fg = Colors.white;
  const _ActionBtn.dark({required this.label, required this.onTap})
      : _color = const Color(0xFF0F172A),
        _fg = Colors.white;
  const _ActionBtn.green({required this.label, required this.onTap})
      : _color = const Color(0xFF10B981),
        _fg = Colors.white;

  final String label;
  final VoidCallback onTap;
  final Color _color;
  final Color _fg;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: onTap,
      style: FilledButton.styleFrom(
        backgroundColor: _color,
        foregroundColor: _fg,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle:
            const TextStyle(fontWeight: FontWeight.w900, fontSize: 11.5),
        minimumSize: const Size(0, 34),
      ),
      child: Text(label),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message});
  final String message;
  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 60),
        const Icon(Icons.cloud_off, size: 56, color: Colors.black26),
        const SizedBox(height: 12),
        const Center(
            child: Text('Impossible de charger les réservations.',
                style: TextStyle(fontWeight: FontWeight.w600))),
        const SizedBox(height: 8),
        Center(
            child: Text(message,
                textAlign: TextAlign.center,
                style: const TextStyle(
                    color: Colors.black54, fontSize: 12))),
      ],
    );
  }
}
