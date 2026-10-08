import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/config/app_config.dart';
import '../../../core/widgets/module_scaffold.dart';
import '../data/used_car_dto.dart';
import '../data/used_cars_repo.dart';

class UsedCarsScreen extends ConsumerStatefulWidget {
  const UsedCarsScreen({super.key});

  @override
  ConsumerState<UsedCarsScreen> createState() => _UsedCarsScreenState();
}

class _UsedCarsScreenState extends ConsumerState<UsedCarsScreen> {
  final _search = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<UsedCarDto> _filter(List<UsedCarDto> items) {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return items;
    return items.where((u) {
      return u.label.toLowerCase().contains(q) ||
          (u.registration ?? '').toLowerCase().contains(q);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(usedCarsListProvider);
    return Scaffold(
      body: ModuleBackground(
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: () async => ref.invalidate(usedCarsListProvider),
            child: async.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ModuleErrorView(message: '$e'),
              data: (items) {
                final list = _filter(items);
                return ListView(
                  padding: const EdgeInsets.only(bottom: 24),
                  children: [
                    ModuleHeader(
                      title: 'Occasion',
                      subtitle:
                          'Véhicules sortis du parc et proposés à la vente.',
                      onBack: () => Navigator.of(context).maybePop(),
                    ),
                    const SizedBox(height: 18),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: ModuleSearchField(
                        controller: _search,
                        hint: 'Filtrer véhicules…',
                        onChanged: (v) => setState(() => _query = v),
                      ),
                    ),
                    const SizedBox(height: 20),
                    if (list.isEmpty)
                      const ModuleEmptyView(
                        icon: Icons.sell_outlined,
                        message: 'Aucun véhicule en vente.',
                      )
                    else
                      ...list.map((u) => Padding(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                            child: _UsedCarCard(u: u),
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

class _UsedCarCard extends StatelessWidget {
  const _UsedCarCard({required this.u});
  final UsedCarDto u;

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.currency(locale: 'fr', symbol: 'MAD');
    final base = AppConfig.apiBaseUrl.replaceAll('/api/v1', '');
    final photo = u.photoUrl != null && u.photoUrl!.startsWith('/')
        ? '$base${u.photoUrl}'
        : u.photoUrl;
    return ModuleCard(
      child: Row(
        children: [
          Container(
            width: 76,
            height: 76,
            decoration: BoxDecoration(
              color: const Color(0xFFEEF0FB),
              borderRadius: BorderRadius.circular(14),
            ),
            clipBehavior: Clip.antiAlias,
            child: photo != null
                ? Image.network(photo, fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => const Center(
                        child: Icon(Icons.sell_outlined,
                            color: Colors.black38)))
                : const Center(
                    child: Icon(Icons.sell_outlined, color: Colors.black38)),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (u.registration != null)
                  Text(u.registration!,
                      style: const TextStyle(
                          fontFamily: 'monospace',
                          color: Colors.black45,
                          fontSize: 12,
                          fontWeight: FontWeight.w700)),
                const SizedBox(height: 2),
                Text(u.label,
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 15)),
                const SizedBox(height: 2),
                Text(
                  [
                    if (u.year != null) '${u.year}',
                    if (u.mileageKm != null)
                      '${NumberFormat.decimalPattern('fr').format(u.mileageKm)} km',
                  ].join(' · '),
                  style: const TextStyle(color: Colors.black54, fontSize: 12),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    ModuleStatusChip(
                      label: usedCarStatusFr(u.status),
                      tone: _tone(u.status),
                    ),
                    const Spacer(),
                    if (u.askingPrice != null && u.askingPrice! > 0)
                      Text(money.format(u.askingPrice),
                          style: const TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 14)),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  ModuleStatusTone _tone(String s) {
    return switch (s.toLowerCase()) {
      'for_sale' => ModuleStatusTone.ok,
      'reserved' => ModuleStatusTone.warning,
      'sold' => ModuleStatusTone.neutral,
      _ => ModuleStatusTone.neutral,
    };
  }
}
