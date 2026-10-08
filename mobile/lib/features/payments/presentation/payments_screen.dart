import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/widgets/module_scaffold.dart';
import '../data/payment_dto.dart';
import '../data/payments_repo.dart';
import 'payment_detail_screen.dart';

/// Paiements — reproduit `PaymentsPage.tsx` du web : header + bouton
/// « Nouveau paiement », barre de filtres (recherche + statut + mode),
/// cartes paiement avec montant, non alloué, bouton « Allouer ».
class PaymentsScreen extends ConsumerStatefulWidget {
  const PaymentsScreen({super.key});

  @override
  ConsumerState<PaymentsScreen> createState() => _PaymentsScreenState();
}

class _PaymentsScreenState extends ConsumerState<PaymentsScreen> {
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _searchCtrl.text = ref.read(paymentFiltersProvider).search;
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(paymentsListProvider);
    final filters = ref.watch(paymentFiltersProvider);
    return Scaffold(
      body: ModuleBackground(
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: () async => ref.invalidate(paymentsListProvider),
            child: ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                ModuleHeader(
                  title: 'Paiements',
                  subtitle: 'Encaissements clients et allocations.',
                  onBack: () => Navigator.of(context).maybePop(),
                ),
                const SizedBox(height: 10),
                _FilterCard(
                  controller: _searchCtrl,
                  filters: filters,
                  onFiltersChanged: (f) =>
                      ref.read(paymentFiltersProvider.notifier).state = f,
                ),
                const SizedBox(height: 12),
                async.when(
                  loading: () => const Padding(
                    padding: EdgeInsets.symmetric(vertical: 40),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                  error: (e, _) => ModuleErrorView(message: '$e'),
                  data: (payments) {
                    if (payments.isEmpty) {
                      return const ModuleEmptyView(
                          icon: Icons.attach_money,
                          message: 'Aucun paiement enregistré.');
                    }
                    return Column(
                      children: [
                        for (final p in payments)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                            child: _PaymentCard(p: p),
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

class _FilterCard extends StatelessWidget {
  const _FilterCard({
    required this.controller,
    required this.filters,
    required this.onFiltersChanged,
  });
  final TextEditingController controller;
  final PaymentFilters filters;
  final ValueChanged<PaymentFilters> onFiltersChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: ModuleCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: controller,
              textInputAction: TextInputAction.search,
              onSubmitted: (v) =>
                  onFiltersChanged(filters.copyWith(search: v.trim())),
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search),
                hintText: 'Rechercher (numéro, référence)…',
                isDense: true,
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: filters.status.isEmpty ? '' : filters.status,
                    isExpanded: true,
                    decoration: _dec(label: 'Statut'),
                    items: [
                      const DropdownMenuItem(
                          value: '', child: Text('Tous')),
                      for (final e in kPaymentStatusLabel.entries)
                        DropdownMenuItem(value: e.key, child: Text(e.value)),
                    ],
                    onChanged: (v) =>
                        onFiltersChanged(filters.copyWith(status: v ?? '')),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: filters.method.isEmpty ? '' : filters.method,
                    isExpanded: true,
                    decoration: _dec(label: 'Mode'),
                    items: [
                      const DropdownMenuItem(
                          value: '', child: Text('Tous')),
                      for (final e in kPaymentMethodLabel.entries)
                        DropdownMenuItem(value: e.key, child: Text(e.value)),
                    ],
                    onChanged: (v) =>
                        onFiltersChanged(filters.copyWith(method: v ?? '')),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PaymentCard extends StatelessWidget {
  const _PaymentCard({required this.p});
  final PaymentDto p;

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.decimalPattern('fr');
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return ModuleCard(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => PaymentDetailScreen(id: p.id)),
      ),
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
                    Text(p.number,
                        style: const TextStyle(
                            fontWeight: FontWeight.w900,
                            fontSize: 13,
                            fontFamily: 'monospace',
                            color: Color(0xFF1F2937))),
                    if (p.externalReference != null &&
                        p.externalReference!.isNotEmpty)
                      Text(p.externalReference!,
                          style: const TextStyle(
                              fontSize: 11, color: Colors.black45)),
                  ],
                ),
              ),
              _StatusPill(status: p.status),
            ],
          ),
          const SizedBox(height: 6),
          Text(p.customerName ?? p.customerCode ?? '—',
              style:
                  const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
          if (p.vehicleLabel != null && p.vehicleLabel!.isNotEmpty) ...[
            const SizedBox(height: 2),
            Row(
              children: [
                const Icon(Icons.directions_car,
                    size: 13, color: Color(0xFF4F46E5)),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(p.vehicleLabel!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          color: Color(0xFF4338CA),
                          fontWeight: FontWeight.w700,
                          fontSize: 11.5,
                          fontFamily: 'monospace')),
                ),
              ],
            ),
          ],
          const SizedBox(height: 4),
          Text(
            [
              paymentMethodFr(p.method),
              if (p.paymentType != null) paymentTypeFr(p.paymentType!),
              if (p.paymentDate != null) dateFmt.format(p.paymentDate!),
            ].join(' · '),
            style: const TextStyle(color: Colors.black54, fontSize: 11.5),
          ),
          const SizedBox(height: 10),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('MONTANT',
                        style: TextStyle(
                            color: Colors.black45,
                            fontSize: 9.5,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1)),
                    Text('${money.format(p.amount)} ${p.currency}',
                        style: const TextStyle(
                            fontWeight: FontWeight.w900, fontSize: 15)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  const Text('NON ALLOUÉ',
                      style: TextStyle(
                          color: Colors.black45,
                          fontSize: 9.5,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 1)),
                  Text(
                    p.amountUnallocated > 0
                        ? '${money.format(p.amountUnallocated)} ${p.currency}'
                        : '0',
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 13.5,
                      color: p.amountUnallocated > 0
                          ? const Color(0xFFB45309)
                          : const Color(0xFF059669),
                    ),
                  ),
                ],
              ),
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
      'allocated' => (
        const Color(0xFFDCFCE7),
        const Color(0xFF166534)
      ),
      'received' => (
        const Color(0xFFDBEAFE),
        const Color(0xFF1E40AF)
      ),
      'refunded' => (
        const Color(0xFFFEF3C7),
        const Color(0xFF92400E)
      ),
      'reversed' => (
        const Color(0xFFFEE2E2),
        const Color(0xFFB91C1C)
      ),
      _ => (const Color(0xFFF1F5F9), const Color(0xFF475569)),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(paymentStatusFr(status).toUpperCase(),
          style: TextStyle(
              color: fg,
              fontSize: 10,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.5)),
    );
  }
}

InputDecoration _dec({String? label, String? hint}) {
  return InputDecoration(
    labelText: label,
    hintText: hint,
    isDense: true,
    contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
  );
}
