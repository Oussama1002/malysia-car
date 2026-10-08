import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../data/reservation_dto.dart';
import '../data/reservations_repo.dart';
import 'reservation_detail_screen.dart';

/// Archive des réservations : liste filtrée aux statuts terminaux
/// (`closed`, `cancelled`, `completed`). On réutilise le provider enrichi
/// afin de garder les mêmes informations client / véhicule que la liste
/// principale.
class ArchiveReservationsScreen extends ConsumerStatefulWidget {
  const ArchiveReservationsScreen({super.key});

  @override
  ConsumerState<ArchiveReservationsScreen> createState() =>
      _ArchiveReservationsScreenState();
}

class _ArchiveReservationsScreenState
    extends ConsumerState<ArchiveReservationsScreen> {
  final _searchCtrl = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  List<ReservationDto> _filter(List<ReservationDto> items) {
    // Archive = reservations annulees uniquement, aligne sur le web
    // (ReservationsOpsPage.tsx : filtre `r.status === 'cancelled'`).
    final q = _query.trim().toLowerCase();
    return items.where((r) {
      if (r.status.toLowerCase() != 'cancelled') return false;
      if (q.isEmpty) return true;
      return r.number.toLowerCase().contains(q) ||
          (r.customerName ?? '').toLowerCase().contains(q) ||
          (r.vehicleLabel ?? '').toLowerCase().contains(q);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(enrichedReservationsProvider);
    return Scaffold(
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(reservationsListProvider);
            ref.invalidate(enrichedReservationsProvider);
          },
          child: async.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text('Erreur : $e',
                    style: const TextStyle(color: Colors.redAccent)),
              ),
            ),
            data: (items) {
              final list = _filter(items);
              return ListView(
                padding: const EdgeInsets.only(bottom: 24),
                children: [
                  _TopBar(onBack: () => Navigator.of(context).maybePop()),
                  const _Title(),
                  const SizedBox(height: 14),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: TextField(
                      controller: _searchCtrl,
                      onChanged: (v) => setState(() => _query = v),
                      decoration: InputDecoration(
                        prefixIcon:
                            const Icon(Icons.search, color: Colors.black45),
                        hintText: "Rechercher dans l'archive…",
                        filled: true,
                        fillColor: Colors.white,
                        contentPadding: const EdgeInsets.symmetric(
                            vertical: 14, horizontal: 10),
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide(color: Theme.of(context).dividerColor),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: BorderSide(color: Theme.of(context).dividerColor),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(14),
                          borderSide: const BorderSide(
                              color: Color(0xFF6366F1), width: 1.4),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (list.isEmpty)
                    const Padding(
                      padding:
                          EdgeInsets.symmetric(horizontal: 20, vertical: 48),
                      child: Center(
                        child: Column(children: [
                          Icon(Icons.inventory_2_outlined,
                              size: 56, color: Colors.black26),
                          SizedBox(height: 12),
                          Text("Aucune réservation archivée.",
                              style: TextStyle(color: Colors.black45)),
                        ]),
                      ),
                    )
                  else
                    ...list.map((r) => Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                          child: _ArchiveCard(r: r),
                        )),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

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
          const Text('Réservations',
              style: TextStyle(color: Colors.black54, fontSize: 14)),
          const Icon(Icons.chevron_right, color: Colors.black26, size: 18),
          const Text('Archive',
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
          Text('Archive',
              style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900)),
          SizedBox(height: 4),
          Text(
            'Réservations clôturées, annulées et terminées.',
            style: TextStyle(color: Colors.black54, fontSize: 13, height: 1.4),
          ),
        ],
      ),
    );
  }
}

class _ArchiveCard extends StatelessWidget {
  const _ArchiveCard({required this.r});
  final ReservationDto r;

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    final (bg, fg) = switch (r.status.toLowerCase()) {
      'closed' => (
        const Color(0xFFE9D5FF),
        const Color(0xFF6B21A8),
      ),
      'cancelled' => (
        const Color(0xFFFEE2E2),
        const Color(0xFFB91C1C),
      ),
      _ => (const Color(0xFFDCFCE7), const Color(0xFF166534)),
    };
    return InkWell(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => ReservationDetailScreen(id: r.id))),
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Theme.of(context).dividerColor),
        ),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(r.number,
                      style: const TextStyle(
                          color: Colors.black38,
                          fontWeight: FontWeight.w800,
                          fontSize: 11,
                          letterSpacing: 1.2)),
                  const SizedBox(height: 3),
                  Text(r.customerName ?? '—',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 13.5)),
                  if (r.vehicleLabel != null)
                    Text(r.vehicleLabel!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            color: Colors.black54,
                            fontSize: 11.5,
                            fontFamily: 'monospace')),
                  const SizedBox(height: 4),
                  Text(
                    '${r.startAt != null ? dateFmt.format(r.startAt!) : '—'} → '
                    '${r.endAt != null ? dateFmt.format(r.endAt!) : '—'}',
                    style:
                        const TextStyle(color: Colors.black54, fontSize: 11.5),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                  color: bg, borderRadius: BorderRadius.circular(999)),
              child: Text(frenchStatus(r.status).toUpperCase(),
                  style: TextStyle(
                      color: fg,
                      fontSize: 10,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.5)),
            ),
          ],
        ),
      ),
    );
  }
}



