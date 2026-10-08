import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/module_scaffold.dart';
import '../data/customer_dto.dart';
import '../data/customers_repo.dart';
import 'customer_detail_screen.dart';
import 'new_customer_screen.dart';

class CustomersScreen extends ConsumerStatefulWidget {
  const CustomersScreen({super.key});

  @override
  ConsumerState<CustomersScreen> createState() => _CustomersScreenState();
}

class _CustomersScreenState extends ConsumerState<CustomersScreen> {
  final _search = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<CustomerDto> _filter(List<CustomerDto> items) {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return items;
    return items.where((c) {
      return (c.displayName ?? '').toLowerCase().contains(q) ||
          c.code.toLowerCase().contains(q) ||
          (c.nationalId ?? '').toLowerCase().contains(q) ||
          (c.ice ?? '').toLowerCase().contains(q) ||
          (c.email ?? '').toLowerCase().contains(q) ||
          (c.phone ?? '').toLowerCase().contains(q);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(customersListProvider);
    final filters = ref.watch(customerListFiltersProvider);
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => const NewCustomerScreen(),
          ));
        },
        icon: const Icon(Icons.add),
        label: const Text('Nouveau client'),
        backgroundColor: const Color(0xFF6366F1),
        foregroundColor: Colors.white,
      ),
      body: ModuleBackground(
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: () async => ref.invalidate(customersListProvider),
            child: async.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ModuleErrorView(message: '$e'),
              data: (items) {
                final list = _filter(items);
                return ListView(
                  padding: const EdgeInsets.only(bottom: 100),
                  children: [
                    ModuleHeader(
                      title: 'Clients',
                      subtitle:
                          'Particuliers et entreprises — KYC, risque, blacklist.',
                      onBack: () => Navigator.of(context).maybePop(),
                    ),
                    const SizedBox(height: 18),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: ModuleSearchField(
                        controller: _search,
                        hint: 'Rechercher (nom, code, email, téléphone)…',
                        onChanged: (v) => setState(() => _query = v),
                      ),
                    ),
                    const SizedBox(height: 12),
                    _FilterRow(filters: filters),
                    const SizedBox(height: 16),
                    if (list.isEmpty)
                      const ModuleEmptyView(
                        icon: Icons.people_outline,
                        message:
                            'Aucun client. Modifiez les filtres ou créez le premier.',
                      )
                    else
                      ...list.map((c) => Padding(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                            child: _CustomerCard(c: c),
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

class _FilterRow extends ConsumerWidget {
  const _FilterRow({required this.filters});
  final CustomerListFilters filters;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifier = ref.read(customerListFiltersProvider.notifier);
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        children: [
          _FilterPill(
            label: 'Type',
            selected: filters.type,
            options: const {
              '': 'Tous les types',
              'PARTICULIER': 'Particulier',
              'ENTREPRISE': 'Entreprise',
            },
            onChanged: (v) => notifier.update((s) => s.copyWith(type: v)),
          ),
          const SizedBox(width: 10),
          _FilterPill(
            label: 'KYC',
            selected: filters.kycStatus,
            options: const {
              '': 'Tous',
              'pending': 'En attente',
              'in_review': 'En revue',
              'approved': 'Approuvé',
              'rejected': 'Rejeté',
              'expired': 'Expiré',
            },
            onChanged: (v) => notifier.update((s) => s.copyWith(kycStatus: v)),
          ),
          const SizedBox(width: 10),
          _FilterPill(
            label: 'Risque',
            selected: filters.riskLevel,
            options: const {
              '': 'Tous',
              'low': 'Faible',
              'normal': 'Normal',
              'elevated': 'Élevé',
              'high': 'Élevé+',
            },
            onChanged: (v) => notifier.update((s) => s.copyWith(riskLevel: v)),
          ),
          const SizedBox(width: 10),
          _BlacklistPill(
            selected: filters.isBlacklisted,
            onChanged: (v) =>
                notifier.update((s) => s.copyWith(isBlacklisted: v)),
          ),
        ],
      ),
    );
  }
}

class _FilterPill extends StatelessWidget {
  const _FilterPill({
    required this.label,
    required this.selected,
    required this.options,
    required this.onChanged,
  });

  final String label;
  final String selected;
  final Map<String, String> options;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final current = options[selected] ?? options.values.first;
    final isActive = selected.isNotEmpty;
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: () async {
        final chosen = await showModalBottomSheet<String>(
          context: context,
          builder: (_) => SafeArea(
            child: ListView(
              shrinkWrap: true,
              children: [
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(label,
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 14)),
                ),
                for (final e in options.entries)
                  ListTile(
                    leading: Icon(
                      selected == e.key
                          ? Icons.radio_button_checked
                          : Icons.radio_button_off,
                      color: selected == e.key
                          ? const Color(0xFF6366F1)
                          : Colors.black45,
                    ),
                    title: Text(e.value),
                    onTap: () => Navigator.of(context).pop(e.key),
                  ),
              ],
            ),
          ),
        );
        if (chosen != null) onChanged(chosen);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isActive ? const Color(0xFF6366F1) : Colors.white,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
              color: isActive ? Colors.transparent : Theme.of(context).dividerColor),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '$label · $current',
              style: TextStyle(
                color: isActive ? Colors.white : Colors.black87,
                fontWeight: FontWeight.w700,
                fontSize: 12.5,
              ),
            ),
            const SizedBox(width: 6),
            Icon(Icons.arrow_drop_down,
                size: 18, color: isActive ? Colors.white : Colors.black45),
          ],
        ),
      ),
    );
  }
}

class _BlacklistPill extends StatelessWidget {
  const _BlacklistPill({required this.selected, required this.onChanged});
  final bool? selected;
  final ValueChanged<bool?> onChanged;

  @override
  Widget build(BuildContext context) {
    final label = selected == null
        ? 'Blacklist · Tous'
        : selected == true
            ? 'Blacklist · Blacklistés'
            : 'Blacklist · Actifs';
    final isActive = selected != null;
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: () async {
        final v = await showModalBottomSheet<Object?>(
          context: context,
          builder: (_) => SafeArea(
            child: ListView(
              shrinkWrap: true,
              children: [
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: Text('Blacklist',
                      style: TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 14)),
                ),
                ListTile(
                  leading: Icon(selected == null
                      ? Icons.radio_button_checked
                      : Icons.radio_button_off),
                  title: const Text('Tous'),
                  onTap: () => Navigator.of(context).pop(_sentinelAny),
                ),
                ListTile(
                  leading: Icon(selected == false
                      ? Icons.radio_button_checked
                      : Icons.radio_button_off),
                  title: const Text('Actifs'),
                  onTap: () => Navigator.of(context).pop(false),
                ),
                ListTile(
                  leading: Icon(selected == true
                      ? Icons.radio_button_checked
                      : Icons.radio_button_off),
                  title: const Text('Blacklistés'),
                  onTap: () => Navigator.of(context).pop(true),
                ),
              ],
            ),
          ),
        );
        if (v == null) return;
        if (identical(v, _sentinelAny)) {
          onChanged(null);
        } else {
          onChanged(v as bool);
        }
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: isActive ? const Color(0xFF6366F1) : Colors.white,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
              color: isActive ? Colors.transparent : Theme.of(context).dividerColor),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: isActive ? Colors.white : Colors.black87,
            fontWeight: FontWeight.w700,
            fontSize: 12.5,
          ),
        ),
      ),
    );
  }
}

const _sentinelAny = Object();

class _CustomerCard extends StatelessWidget {
  const _CustomerCard({required this.c});
  final CustomerDto c;

  @override
  Widget build(BuildContext context) {
    return ModuleCard(
      onTap: () => Navigator.of(context).push(MaterialPageRoute(
          builder: (_) => CustomerDetailScreen(id: c.id))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    colors: [Color(0xFF4F46E5), Color(0xFF7C3AED)],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(c.isCompany ? Icons.business : Icons.person,
                    color: Colors.white, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(c.displayName ?? '—',
                              style: const TextStyle(
                                  fontWeight: FontWeight.w800, fontSize: 15)),
                        ),
                        if (c.isBlacklisted) ...[
                          const SizedBox(width: 6),
                          const ModuleStatusChip(
                              label: 'BLACKLIST',
                              tone: ModuleStatusTone.danger),
                        ],
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '${c.code} · ${c.isCompany ? 'Entreprise' : 'Particulier'}',
                      style: const TextStyle(
                          fontSize: 11.5, color: Colors.black45),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              if (c.kycStatus != null)
                ModuleStatusChip(
                  label: kKycStatusFr[c.kycStatus!] ?? c.kycStatus!,
                  tone: _kycTone(c.kycStatus!),
                ),
              if (c.riskLevel != null)
                ModuleStatusChip(
                  label: 'Risque ${kRiskLevelFr[c.riskLevel!] ?? c.riskLevel!}',
                  tone: _riskTone(c.riskLevel!),
                ),
              if (c.status != null)
                ModuleStatusChip(
                  label:
                      kCustomerStatusFr[c.status!] ?? c.status!,
                  tone: _statusTone(c.status!),
                ),
            ],
          ),
        ],
      ),
    );
  }

  ModuleStatusTone _kycTone(String k) {
    return switch (k) {
      'approved' => ModuleStatusTone.ok,
      'rejected' || 'expired' => ModuleStatusTone.danger,
      _ => ModuleStatusTone.warning,
    };
  }

  ModuleStatusTone _riskTone(String r) {
    return switch (r) {
      'low' || 'normal' => ModuleStatusTone.ok,
      'elevated' => ModuleStatusTone.warning,
      'high' => ModuleStatusTone.danger,
      _ => ModuleStatusTone.neutral,
    };
  }

  ModuleStatusTone _statusTone(String s) {
    return switch (s) {
      'active' => ModuleStatusTone.ok,
      'suspended' => ModuleStatusTone.danger,
      _ => ModuleStatusTone.neutral,
    };
  }
}

