import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/widgets/module_scaffold.dart';
import '../data/sub_rental_dto.dart';
import '../data/sub_rentals_repo.dart';
import 'sub_rental_detail_screen.dart';

/// Sous-location (SL) : header + 5 KPI identiques au web + ligne de filtres
/// (Tous / Actifs / Retour imminent / En retard / Brouillons / Retournés /
/// Clôturés) + liste des contrats fournisseur.
class SubRentalsScreen extends ConsumerStatefulWidget {
  const SubRentalsScreen({super.key});

  @override
  ConsumerState<SubRentalsScreen> createState() => _SubRentalsScreenState();
}

class _SubRentalsScreenState extends ConsumerState<SubRentalsScreen> {
  final _search = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<SubRentalDto> _filter(List<SubRentalDto> items) {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return items;
    return items.where((s) {
      return s.number.toLowerCase().contains(q) ||
          (s.supplierName ?? '').toLowerCase().contains(q) ||
          (s.vehicleLabel ?? '').toLowerCase().contains(q);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(subRentalsListProvider);
    final dash = ref.watch(subRentalsDashboardProvider);
    final filter = ref.watch(subRentalFilterProvider);
    return Scaffold(
      body: ModuleBackground(
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(subRentalsListProvider);
              ref.invalidate(subRentalsDashboardProvider);
            },
            child: ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                ModuleHeader(
                  title: 'Sous-location',
                  subtitle:
                      'Contrats de sous-location avec agences fournisseurs.',
                  onBack: () => Navigator.of(context).maybePop(),
                ),
                const SizedBox(height: 16),
                _KpiBand(dash: dash),
                const SizedBox(height: 14),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: ModuleSearchField(
                    controller: _search,
                    hint: 'Rechercher (n°, fournisseur, véhicule)…',
                    onChanged: (v) => setState(() => _query = v),
                  ),
                ),
                const SizedBox(height: 12),
                _FilterRow(
                  current: filter,
                  onChanged: (f) => ref
                      .read(subRentalFilterProvider.notifier)
                      .state = f,
                ),
                const SizedBox(height: 18),
                async.when(
                  loading: () => const Padding(
                    padding: EdgeInsets.symmetric(vertical: 32),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                  error: (e, _) => ModuleErrorView(message: '$e'),
                  data: (items) {
                    final list = _filter(items);
                    if (list.isEmpty) {
                      return const ModuleEmptyView(
                        icon: Icons.vpn_key_outlined,
                        message: 'Aucun contrat trouvé.',
                      );
                    }
                    return Column(
                      children: [
                        for (final s in list)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                            child: _SubRentalCard(s: s),
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

/// Bandeau de 5 KPI (actifs, retour imminent, en retard, coût mensuel, marge)
/// identique au dashboard web.
class _KpiBand extends StatelessWidget {
  const _KpiBand({required this.dash});
  final AsyncValue<SubRentalDashboardDto> dash;

  @override
  Widget build(BuildContext context) {
    return dash.when(
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
      data: (d) {
        final money = NumberFormat.decimalPattern('fr');
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _KpiBox(
                  label: 'Actifs',
                  value: '${d.activeSubRentals}',
                  color: const Color(0xFF059669),
                  bg: const Color(0xFFECFDF5),
                ),
                _KpiBox(
                  label: 'Retour imminent',
                  value: '${d.dueSoon}',
                  color: const Color(0xFFB45309),
                  bg: const Color(0xFFFFFBEB),
                ),
                _KpiBox(
                  label: 'En retard',
                  value: '${d.overdue}',
                  color: const Color(0xFFB91C1C),
                  bg: const Color(0xFFFEF2F2),
                ),
                _KpiBox(
                  label: 'Coût fourn. (mois)',
                  value: '${money.format(d.monthlySupplierCost)} MAD',
                  color: const Color(0xFF1F2937),
                  bg: Colors.white,
                ),
                _KpiBox(
                  label: 'Marge totale',
                  value:
                      '${d.totalMargin >= 0 ? '+' : ''}${money.format(d.totalMargin)} MAD',
                  color: d.totalMargin >= 0
                      ? const Color(0xFF047857)
                      : const Color(0xFFB91C1C),
                  bg: d.totalMargin >= 0
                      ? const Color(0xFFF0FDF4)
                      : const Color(0xFFFEF2F2),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _KpiBox extends StatelessWidget {
  const _KpiBox({
    required this.label,
    required this.value,
    required this.color,
    required this.bg,
  });
  final String label;
  final String value;
  final Color color;
  final Color bg;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 150,
      margin: const EdgeInsets.symmetric(horizontal: 4),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(),
              style: TextStyle(
                  fontSize: 9.5,
                  fontWeight: FontWeight.w800,
                  color: color.withOpacity(0.75),
                  letterSpacing: 1.1)),
          const SizedBox(height: 4),
          Text(value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  color: color,
                  fontSize: 16,
                  fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}

class _FilterRow extends StatelessWidget {
  const _FilterRow({required this.current, required this.onChanged});
  final SubRentalFilter current;
  final ValueChanged<SubRentalFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    final items = [
      (SubRentalFilter.all, 'Tous'),
      (SubRentalFilter.active, 'Actifs'),
      (SubRentalFilter.dueSoon, 'Retour imminent'),
      (SubRentalFilter.overdue, 'En retard'),
      (SubRentalFilter.draft, 'Brouillons'),
      (SubRentalFilter.returned, 'Retournés'),
      (SubRentalFilter.closed, 'Clôturés'),
    ];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        children: [
          for (final it in items) ...[
            _FilterPill(
              label: it.$2,
              selected: current == it.$1,
              onTap: () => onChanged(it.$1),
            ),
            const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }
}

class _FilterPill extends StatelessWidget {
  const _FilterPill({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? const Color(0xFF4F46E5) : const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.circular(999),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? Colors.white : const Color(0xFF475569),
            fontWeight: FontWeight.w800,
            fontSize: 11.5,
          ),
        ),
      ),
    );
  }
}

class _SubRentalCard extends StatelessWidget {
  const _SubRentalCard({required this.s});
  final SubRentalDto s;

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    final money = NumberFormat.decimalPattern('fr');
    return ModuleCard(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => SubRentalDetailScreen(id: s.id))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(s.number,
                    style: const TextStyle(
                        color: Color(0xFF4F46E5),
                        fontWeight: FontWeight.w800,
                        fontSize: 14.5)),
              ),
              _StatusPill(status: s.status),
            ],
          ),
          const SizedBox(height: 6),
          Text(s.supplierName ?? '—',
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
          if (s.vehicleLabel != null && s.vehicleLabel!.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(s.vehicleLabel!,
                style: const TextStyle(color: Colors.black54, fontSize: 12.5)),
          ],
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Text(
                  s.startDate != null ? dateFmt.format(s.startDate!) : '—',
                  style: const TextStyle(color: Colors.black54, fontSize: 12.5)),
              const SizedBox(width: 6),
              const Icon(Icons.arrow_right_alt,
                  size: 14, color: Colors.black38),
              const SizedBox(width: 6),
              Text(
                s.endDate != null ? dateFmt.format(s.endDate!) : '—',
                style: TextStyle(
                  color: s.isOverdue
                      ? const Color(0xFFB91C1C)
                      : s.isDueSoon
                          ? const Color(0xFFB45309)
                          : Colors.black54,
                  fontSize: 12.5,
                  fontWeight:
                      s.isOverdue || s.isDueSoon ? FontWeight.w800 : null,
                ),
              ),
              if (s.isOverdue) ...[
                const SizedBox(width: 6),
                const _MiniBadge(
                    label: 'RETARD',
                    color: Color(0xFFB91C1C),
                    bg: Color(0xFFFEE2E2)),
              ] else if (s.isDueSoon) ...[
                const SizedBox(width: 6),
                const _MiniBadge(
                    label: 'BIENTÔT',
                    color: Color(0xFFB45309),
                    bg: Color(0xFFFEF3C7)),
              ],
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _PaymentPill(status: s.paymentStatus),
              const Spacer(),
              if (s.dailyCost != null)
                Text('${money.format(s.dailyCost)} MAD/j',
                    style: const TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 12.5,
                        color: Colors.black54)),
              if (s.totalCost != null) ...[
                const SizedBox(width: 10),
                Text('${money.format(s.totalCost)} MAD',
                    style: const TextStyle(
                        fontWeight: FontWeight.w900, fontSize: 14)),
              ],
            ],
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
      'draft' => (const Color(0xFFF1F5F9), const Color(0xFF475569)),
      'active' => (const Color(0xFFDCFCE7), const Color(0xFF065F46)),
      'returned' => (const Color(0xFFDBEAFE), const Color(0xFF1E40AF)),
      'closed' => (const Color(0xFFE9D5FF), const Color(0xFF6B21A8)),
      'cancelled' => (const Color(0xFFFEE2E2), const Color(0xFFB91C1C)),
      _ => (const Color(0xFFF1F5F9), const Color(0xFF475569)),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(subRentalStatusFr(status),
          style: TextStyle(
              color: fg,
              fontSize: 10.5,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.3)),
    );
  }
}

class _PaymentPill extends StatelessWidget {
  const _PaymentPill({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (status) {
      'paid' => (const Color(0xFFDCFCE7), const Color(0xFF166534)),
      'partial' => (const Color(0xFFFEF3C7), const Color(0xFF92400E)),
      _ => (const Color(0xFFFEE2E2), const Color(0xFFB91C1C)),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(subRentalPaymentStatusFr(status),
          style: TextStyle(
              color: fg, fontSize: 10, fontWeight: FontWeight.w900)),
    );
  }
}

class _MiniBadge extends StatelessWidget {
  const _MiniBadge({required this.label, required this.color, required this.bg});
  final String label;
  final Color color;
  final Color bg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1.5),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(4)),
      child: Text(label,
          style: TextStyle(
              color: color, fontSize: 9, fontWeight: FontWeight.w900)),
    );
  }
}
