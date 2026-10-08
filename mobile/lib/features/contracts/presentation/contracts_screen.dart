import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/widgets/module_scaffold.dart';
import '../../placeholders/placeholder_screen.dart';
import '../data/contract_dto.dart';
import '../data/contracts_repo.dart';
import 'contract_detail_screen.dart';

/// Liste des contrats — même structure que l'écran web : titre + sous-titre,
/// recherche, filtres Type / Statut, bouton de création, puis les cartes.
class ContractsScreen extends ConsumerStatefulWidget {
  const ContractsScreen({super.key});

  @override
  ConsumerState<ContractsScreen> createState() => _ContractsScreenState();
}

class _ContractsScreenState extends ConsumerState<ContractsScreen> {
  final _search = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<ContractDto> _filter(List<ContractDto> items) {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return items;
    return items.where((c) {
      return c.number.toLowerCase().contains(q) ||
          (c.customerName ?? '').toLowerCase().contains(q) ||
          (c.vehicleLabel ?? '').toLowerCase().contains(q) ||
          c.type.toLowerCase().contains(q) ||
          c.status.toLowerCase().contains(q);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(contractsListProvider);
    final filters = ref.watch(contractListFiltersProvider);
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          Navigator.of(context).push(MaterialPageRoute(
            builder: (_) => const PlaceholderScreen(
              title: 'Nouveau contrat',
              icon: Icons.description_outlined,
            ),
          ));
        },
        icon: const Icon(Icons.add),
        label: const Text('Nouveau contrat'),
        backgroundColor: const Color(0xFF6366F1),
        foregroundColor: Colors.white,
      ),
      body: ModuleBackground(
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: () async => ref.invalidate(contractsListProvider),
            child: async.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ModuleErrorView(message: '$e'),
              data: (items) {
                final list = _filter(items);
                return ListView(
                  padding: const EdgeInsets.only(bottom: 100),
                  children: [
                    ModuleHeader(
                      title: 'Contrats',
                      subtitle:
                          'LLD, LOA, crédit auto, vente VO — liste.',
                      onBack: () => Navigator.of(context).maybePop(),
                    ),
                    const SizedBox(height: 18),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                      child: ModuleSearchField(
                        controller: _search,
                        hint: 'Filtrer (référence, type, statut)…',
                        onChanged: (v) => setState(() => _query = v),
                      ),
                    ),
                    const SizedBox(height: 12),
                    _FilterRow(
                      filters: filters,
                      onType: (t) => ref
                          .read(contractListFiltersProvider.notifier)
                          .update((s) => s.copyWith(type: t)),
                      onStatus: (st) => ref
                          .read(contractListFiltersProvider.notifier)
                          .update((s) => s.copyWith(status: st)),
                    ),
                    const SizedBox(height: 16),
                    if (list.isEmpty)
                      const ModuleEmptyView(
                        icon: Icons.description_outlined,
                        message: 'Aucun contrat.',
                      )
                    else
                      ...list.map((c) => Padding(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                            child: _ContractCard(c: c),
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

class _FilterRow extends StatelessWidget {
  const _FilterRow({
    required this.filters,
    required this.onType,
    required this.onStatus,
  });

  final ContractListFilters filters;
  final ValueChanged<String> onType;
  final ValueChanged<String> onStatus;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        children: [
          _FilterDropdown(
            label: 'Type',
            selected: filters.type,
            options: const {
              '': 'Tous types',
              'LLD': 'LLD',
              'LOA': 'LOA',
              'CREDIT_AUTO': 'Crédit',
              'VENTE_VO': 'VO',
              'LOCATION_COURTE': 'Courte durée',
            },
            onChanged: onType,
          ),
          const SizedBox(width: 10),
          _FilterDropdown(
            label: 'Statut',
            selected: filters.status,
            options: const {
              '': 'Tous statuts',
              'draft': 'Brouillon',
              'pending': 'En attente',
              'approved': 'Approuvé',
              'active': 'Actif',
              'suspended': 'Suspendu',
              'closed': 'Clôturé',
              'terminated': 'Résilié',
              'expired': 'Expiré',
            },
            onChanged: onStatus,
          ),
        ],
      ),
    );
  }
}

class _FilterDropdown extends StatelessWidget {
  const _FilterDropdown({
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

class _ContractCard extends StatelessWidget {
  const _ContractCard({required this.c});
  final ContractDto c;

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    final money = NumberFormat.currency(locale: 'fr', symbol: 'MAD');
    return ModuleCard(
      onTap: () => Navigator.of(context).push(
          MaterialPageRoute(builder: (_) => ContractDetailScreen(id: c.id))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(c.number,
                  style: const TextStyle(
                      fontFamily: 'monospace',
                      color: Colors.black45,
                      fontWeight: FontWeight.w800,
                      fontSize: 12,
                      letterSpacing: 1.1)),
              const SizedBox(width: 10),
              if (c.type.isNotEmpty)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: const Color(0xFFEEF0FB),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(contractTypeFr(c.type),
                      style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          color: Color(0xFF4F46E5))),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(c.customerName ?? 'Client inconnu',
              style:
                  const TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
          if (c.vehicleLabel != null) ...[
            const SizedBox(height: 2),
            Text(c.vehicleLabel!,
                style: const TextStyle(color: Colors.black54, fontSize: 13)),
          ],
          const SizedBox(height: 8),
          Row(
            children: [
              Icon(Icons.event, size: 14, color: Colors.black45),
              const SizedBox(width: 4),
              Text(
                '${c.startDate != null ? dateFmt.format(c.startDate!) : '—'}'
                '  →  '
                '${c.endDate != null ? dateFmt.format(c.endDate!) : '—'}',
                style: const TextStyle(color: Colors.black54, fontSize: 12.5),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              ModuleStatusChip(
                label: contractStatusFr(c.status),
                tone: _tone(c.status),
              ),
              const Spacer(),
              if (c.baseAmount != null && c.baseAmount! > 0)
                Text(money.format(c.baseAmount),
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 14)),
            ],
          ),
        ],
      ),
    );
  }

  ModuleStatusTone _tone(String s) {
    return switch (s.toLowerCase()) {
      'active' || 'approved' => ModuleStatusTone.ok,
      'draft' || 'pending' || 'suspended' => ModuleStatusTone.warning,
      'cancelled' || 'rejected' || 'terminated' || 'expired' =>
        ModuleStatusTone.danger,
      _ => ModuleStatusTone.neutral,
    };
  }
}

