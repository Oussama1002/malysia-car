import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/module_scaffold.dart';
import '../../../core/router/back_nav.dart';
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
  // Notification « documents manquants » : repliée par défaut, l'agent la
  // déplie pour voir la liste et sauter dans un dossier.
  bool _missingDocsOpen = false;

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
        backgroundColor: const Color(0xFFB8933F),
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
                final missing = items
                    .where((c) =>
                        !c.isCompany &&
                        !c.isBlacklisted &&
                        (!c.hasIdentityDocument || !c.hasDrivingLicense))
                    .toList();
                return ListView(
                  padding: const EdgeInsets.only(bottom: 100),
                  children: [
                    ModuleHeader(
                      title: 'Clients',
                      subtitle:
                          'Particuliers et entreprises — KYC, risque, blacklist.',
                      onBack: () => goBackOrHome(context),
                    ),
                    if (missing.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 20),
                        child: _MissingDocsBanner(
                          clients: missing,
                          open: _missingDocsOpen,
                          onToggle: () => setState(
                              () => _missingDocsOpen = !_missingDocsOpen),
                        ),
                      ),
                    ],
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

class _MissingDocsBanner extends StatelessWidget {
  const _MissingDocsBanner({
    required this.clients,
    required this.open,
    required this.onToggle,
  });

  final List<CustomerDto> clients;
  final bool open;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final n = clients.length;
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFFFF4D9),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFF2D27A)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          InkWell(
            onTap: onToggle,
            borderRadius: BorderRadius.circular(14),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Row(
                children: [
                  const Icon(Icons.notifications_active_outlined,
                      color: Color(0xFF8A6B16)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '$n client${n > 1 ? 's' : ''} sans pièce d\'identité ou permis',
                          style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 13.5,
                              color: Color(0xFF8A6B16)),
                        ),
                        const SizedBox(height: 2),
                        const Text(
                          'CIN / passeport et permis sont requis avant toute remise des clés.',
                          style: TextStyle(
                              fontSize: 11.5, color: Color(0xFF6B5312)),
                        ),
                      ],
                    ),
                  ),
                  Icon(open ? Icons.expand_less : Icons.expand_more,
                      color: const Color(0xFF8A6B16)),
                ],
              ),
            ),
          ),
          if (open)
            Container(
              decoration: const BoxDecoration(
                color: Colors.white,
                borderRadius:
                    BorderRadius.vertical(bottom: Radius.circular(14)),
              ),
              child: Column(
                children: [
                  for (final c in clients.take(50))
                    InkWell(
                      onTap: () => Navigator.of(context).push(
                        MaterialPageRoute(
                            builder: (_) => CustomerDetailScreen(id: c.id)),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 10),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(c.displayName ?? c.code,
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w800,
                                          fontSize: 13)),
                                  const SizedBox(height: 1),
                                  Text(
                                    [
                                      c.code,
                                      if (c.phone != null && c.phone!.isNotEmpty) c.phone,
                                    ].whereType<String>().join(' · '),
                                    style: const TextStyle(
                                        fontSize: 11, color: Colors.black54),
                                  ),
                                ],
                              ),
                            ),
                            Wrap(
                              spacing: 4,
                              children: [
                                if (!c.hasIdentityDocument)
                                  const _MissingChip(
                                      label: 'CIN / Passeport',
                                      color: Color(0xFFDC2626)),
                                if (!c.hasDrivingLicense)
                                  const _MissingChip(
                                      label: 'Permis',
                                      color: Color(0xFFB8933F)),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ),
                  if (clients.length > 50)
                    Padding(
                      padding: const EdgeInsets.all(10),
                      child: Text(
                        '… et ${clients.length - 50} autre${clients.length - 50 > 1 ? 's' : ''}.',
                        style:
                            const TextStyle(fontSize: 11, color: Colors.black54),
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

class _MissingChip extends StatelessWidget {
  const _MissingChip({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
            color: color, fontWeight: FontWeight.w800, fontSize: 10),
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
                          ? const Color(0xFFB8933F)
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
          color: isActive ? const Color(0xFFB8933F) : Colors.white,
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
          color: isActive ? const Color(0xFFB8933F) : Colors.white,
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
                    colors: [Color(0xFFB8933F), Color(0xFF9A7B2E)],
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
                  // Blacklisté → jamais "Actif". La base peut encore porter
                  // 'active' sur des lignes historiques, on l'écrase ici.
                  label: c.isBlacklisted
                      ? (kCustomerStatusFr['suspended'] ?? 'Suspendu')
                      : (kCustomerStatusFr[c.status!] ?? c.status!),
                  tone: c.isBlacklisted
                      ? ModuleStatusTone.danger
                      : _statusTone(c.status!),
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

