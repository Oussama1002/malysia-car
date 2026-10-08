import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/widgets/module_scaffold.dart';
import '../data/sub_rental_dto.dart';
import '../data/sub_rentals_repo.dart';

/// Détail d'un contrat de sous-location — reproduit la page web avec son
/// bandeau d'actions (Activer / Paiement / Retour / Clôturer), ses badges
/// (statut, paiement, retard) et ses 6 onglets.
class SubRentalDetailScreen extends ConsumerStatefulWidget {
  const SubRentalDetailScreen({super.key, required this.id});
  final String id;

  @override
  ConsumerState<SubRentalDetailScreen> createState() =>
      _SubRentalDetailScreenState();
}

enum _Tab { overview, vehicle, supplier, payments, profitability, returnReport }

class _SubRentalDetailScreenState
    extends ConsumerState<SubRentalDetailScreen> {
  _Tab _tab = _Tab.overview;

  Future<void> _run(Future<void> Function() action, {String? success}) async {
    try {
      await action();
      ref.invalidate(subRentalDetailProvider(widget.id));
      ref.invalidate(subRentalPaymentsProvider(widget.id));
      ref.invalidate(subRentalsListProvider);
      ref.invalidate(subRentalsDashboardProvider);
      if (success != null && mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(success)));
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Erreur : $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(subRentalDetailProvider(widget.id));
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return Scaffold(
      body: ModuleBackground(
        child: SafeArea(
          child: async.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) =>
                ModuleErrorView(message: 'Contrat introuvable.\n$e'),
            data: (c) {
              return ListView(
                padding: const EdgeInsets.only(bottom: 24),
                children: [
                  _TopHeader(contract: c, dateFmt: dateFmt),
                  const SizedBox(height: 12),
                  _ActionButtons(
                    contract: c,
                    onActivate: () => _run(
                      () => ref
                          .read(subRentalsRepoProvider)
                          .activate(c.id),
                      success: 'Contrat activé.',
                    ),
                    onPayment: () => _openPaymentModal(c),
                    onReturn: () => _openReturnModal(c),
                    onClose: () => _confirmClose(c),
                  ),
                  const SizedBox(height: 10),
                  _StatusRow(contract: c),
                  const SizedBox(height: 14),
                  _TabsBar(current: _tab, onChanged: (t) => setState(() => _tab = t)),
                  const SizedBox(height: 10),
                  _TabContent(
                    tab: _tab,
                    contract: c,
                    onOpenReturn: () => _openReturnModal(c),
                    onOpenPayment: () => _openPaymentModal(c),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Future<void> _confirmClose(SubRentalDetailDto c) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Clôturer ce contrat ?'),
        content: const Text(
            'Cette action verrouille le contrat. Les paiements doivent être à jour.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Annuler')),
          FilledButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Clôturer')),
        ],
      ),
    );
    if (ok == true) {
      _run(() => ref.read(subRentalsRepoProvider).close(c.id),
          success: 'Contrat clôturé.');
    }
  }

  Future<void> _openReturnModal(SubRentalDetailDto c) async {
    final payload = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _ReturnSheet(),
    );
    if (payload != null) {
      _run(
          () =>
              ref.read(subRentalsRepoProvider).returnToSupplier(c.id, payload),
          success: 'Retour enregistré.');
    }
  }

  Future<void> _openPaymentModal(SubRentalDetailDto c) async {
    final payload = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _PaymentSheet(),
    );
    if (payload != null) {
      _run(() => ref.read(subRentalsRepoProvider).addPayment(c.id, payload),
          success: 'Paiement enregistré.');
    }
  }
}

// ---------------------------------------------------------------------------
// Header + actions
// ---------------------------------------------------------------------------

class _TopHeader extends StatelessWidget {
  const _TopHeader({required this.contract, required this.dateFmt});
  final SubRentalDetailDto contract;
  final DateFormat dateFmt;

  @override
  Widget build(BuildContext context) {
    final period =
        '${contract.startDate != null ? dateFmt.format(contract.startDate!) : '—'} → '
        '${contract.endDate != null ? dateFmt.format(contract.endDate!) : '—'}';
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 20, 0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).maybePop(),
            icon: const Icon(Icons.arrow_back),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('← Sous-locations',
                    style: TextStyle(color: Colors.black45, fontSize: 12)),
                const SizedBox(height: 2),
                Text(contract.number,
                    style: const TextStyle(
                        fontSize: 22, fontWeight: FontWeight.w900)),
                const SizedBox(height: 2),
                Text(
                  '${contract.supplier?.name ?? '—'} · $period',
                  style: const TextStyle(color: Colors.black54, fontSize: 12.5),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionButtons extends StatelessWidget {
  const _ActionButtons({
    required this.contract,
    required this.onActivate,
    required this.onPayment,
    required this.onReturn,
    required this.onClose,
  });
  final SubRentalDetailDto contract;
  final VoidCallback onActivate;
  final VoidCallback onPayment;
  final VoidCallback onReturn;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final buttons = <Widget>[];
    if (contract.isDraft) {
      buttons.add(_PrimaryAction(
          label: 'Activer',
          color: const Color(0xFF059669),
          onTap: onActivate));
    }
    if (contract.isActive) {
      buttons
        ..add(_GhostAction(
            label: '+ Paiement fournisseur',
            borderColor: const Color(0xFF818CF8),
            textColor: const Color(0xFF4338CA),
            onTap: onPayment))
        ..add(_PrimaryAction(
            label: 'Retourner au fournisseur',
            color: const Color(0xFFEA580C),
            onTap: onReturn));
    }
    if ((contract.isReturned || contract.isActive) && !contract.isClosed) {
      buttons.add(_PrimaryAction(
          label: 'Clôturer',
          color: const Color(0xFF374151),
          onTap: onClose));
    }
    if (buttons.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Wrap(spacing: 8, runSpacing: 8, children: buttons),
    );
  }
}

class _PrimaryAction extends StatelessWidget {
  const _PrimaryAction(
      {required this.label, required this.color, required this.onTap});
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: onTap,
      style: FilledButton.styleFrom(
        backgroundColor: color,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 11.5),
        minimumSize: const Size(0, 38),
      ),
      child: Text(label),
    );
  }
}

class _GhostAction extends StatelessWidget {
  const _GhostAction({
    required this.label,
    required this.borderColor,
    required this.textColor,
    required this.onTap,
  });
  final String label;
  final Color borderColor;
  final Color textColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(
      onPressed: onTap,
      style: OutlinedButton.styleFrom(
        foregroundColor: textColor,
        side: BorderSide(color: borderColor),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 11.5),
        minimumSize: const Size(0, 38),
        backgroundColor: textColor.withOpacity(0.06),
      ),
      child: Text(label),
    );
  }
}

// ---------------------------------------------------------------------------
// Status badges
// ---------------------------------------------------------------------------

class _StatusRow extends StatelessWidget {
  const _StatusRow({required this.contract});
  final SubRentalDetailDto contract;

  @override
  Widget build(BuildContext context) {
    final (sBg, sFg) = switch (contract.status) {
      'draft' => (const Color(0xFFF1F5F9), const Color(0xFF475569)),
      'active' => (const Color(0xFFDCFCE7), const Color(0xFF065F46)),
      'returned' => (const Color(0xFFDBEAFE), const Color(0xFF1E40AF)),
      'closed' => (const Color(0xFFE9D5FF), const Color(0xFF6B21A8)),
      _ => (const Color(0xFFFEE2E2), const Color(0xFFB91C1C)),
    };
    final (pBg, pFg) = switch (contract.paymentStatus) {
      'paid' => (const Color(0xFFDCFCE7), const Color(0xFF166534)),
      'partial' => (const Color(0xFFFEF3C7), const Color(0xFF92400E)),
      _ => (const Color(0xFFFEE2E2), const Color(0xFFB91C1C)),
    };
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Wrap(
        spacing: 8,
        runSpacing: 6,
        children: [
          _Pill(label: subRentalStatusFr(contract.status), bg: sBg, fg: sFg),
          _Pill(
              label: subRentalPaymentStatusFr(contract.paymentStatus),
              bg: pBg,
              fg: pFg),
          if (contract.isOverdue)
            const _Pill(
                label: 'EN RETARD',
                bg: Color(0xFFDC2626),
                fg: Colors.white),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.label, required this.bg, required this.fg});
  final String label;
  final Color bg;
  final Color fg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(label,
          style: TextStyle(
              color: fg, fontSize: 10.5, fontWeight: FontWeight.w900)),
    );
  }
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

class _TabsBar extends StatelessWidget {
  const _TabsBar({required this.current, required this.onChanged});
  final _Tab current;
  final ValueChanged<_Tab> onChanged;

  @override
  Widget build(BuildContext context) {
    final items = [
      (_Tab.overview, 'Vue générale'),
      (_Tab.vehicle, 'Véhicule'),
      (_Tab.supplier, 'Fournisseur'),
      (_Tab.payments, 'Paiements'),
      (_Tab.profitability, 'Rentabilité'),
      (_Tab.returnReport, 'Rapport retour'),
    ];
    return Container(
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: Theme.of(context).dividerColor)),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        child: Row(
          children: [
            for (final it in items)
              InkWell(
                onTap: () => onChanged(it.$1),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    border: Border(
                      bottom: BorderSide(
                        width: 2,
                        color: current == it.$1
                            ? const Color(0xFF4F46E5)
                            : Colors.transparent,
                      ),
                    ),
                  ),
                  child: Text(
                    it.$2,
                    style: TextStyle(
                        color: current == it.$1
                            ? const Color(0xFF4338CA)
                            : Colors.black54,
                        fontWeight: FontWeight.w700,
                        fontSize: 12.5),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _TabContent extends ConsumerWidget {
  const _TabContent({
    required this.tab,
    required this.contract,
    required this.onOpenReturn,
    required this.onOpenPayment,
  });
  final _Tab tab;
  final SubRentalDetailDto contract;
  final VoidCallback onOpenReturn;
  final VoidCallback onOpenPayment;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    Widget body;
    switch (tab) {
      case _Tab.overview:
        body = _OverviewTab(c: contract);
        break;
      case _Tab.vehicle:
        body = _VehicleTab(c: contract);
        break;
      case _Tab.supplier:
        body = _SupplierTab(c: contract);
        break;
      case _Tab.payments:
        body = _PaymentsTab(
            c: contract,
            onAdd: contract.isActive ? onOpenPayment : null);
        break;
      case _Tab.profitability:
        body = _ProfitabilityTab(c: contract);
        break;
      case _Tab.returnReport:
        body = _ReturnReportTab(c: contract, onStart: onOpenReturn);
        break;
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: ModuleCard(child: body),
    );
  }
}

// ---------------------------------------------------------------------------
// Tab bodies
// ---------------------------------------------------------------------------

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});
  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(label,
                style: const TextStyle(
                    color: Colors.black54,
                    fontSize: 11.5,
                    fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              value == null || value!.isEmpty ? '—' : value!,
              textAlign: TextAlign.right,
              style: const TextStyle(
                  fontSize: 13, fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6, top: 2),
      child: Text(text.toUpperCase(),
          style: const TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w800,
              color: Colors.black45,
              letterSpacing: 1.2)),
    );
  }
}

class _OverviewTab extends StatelessWidget {
  const _OverviewTab({required this.c});
  final SubRentalDetailDto c;

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    final money = NumberFormat.decimalPattern('fr');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionTitle('Contrat'),
        _InfoRow(label: 'Numéro', value: c.number),
        _InfoRow(label: 'Statut', value: subRentalStatusFr(c.status)),
        _InfoRow(
            label: 'Date de début',
            value: c.startDate != null ? dateFmt.format(c.startDate!) : null),
        _InfoRow(
            label: 'Date de fin',
            value: c.endDate != null ? dateFmt.format(c.endDate!) : null),
        _InfoRow(label: 'Jours', value: '${c.daysCount}'),
        const SizedBox(height: 12),
        const _SectionTitle('Coûts'),
        _InfoRow(
            label: 'Coût journalier',
            value:
                c.dailyCost != null ? '${money.format(c.dailyCost)} MAD' : null),
        _InfoRow(
            label: 'Coût total',
            value:
                c.totalCost != null ? '${money.format(c.totalCost)} MAD' : null),
        _InfoRow(
            label: 'Caution',
            value: c.depositAmount != null
                ? '${money.format(c.depositAmount)} MAD'
                : null),
        _InfoRow(
            label: 'Mode de paiement',
            value: c.paymentMethod != null
                ? subRentalPaymentMethodFr(c.paymentMethod!)
                : null),
        _InfoRow(
            label: 'Statut paiement',
            value: subRentalPaymentStatusFr(c.paymentStatus)),
        if (c.notes != null && c.notes!.isNotEmpty) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
                color: const Color(0xFFF5F6FB),
                borderRadius: BorderRadius.circular(10)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SectionTitle('Notes'),
                Text(c.notes!, style: const TextStyle(fontSize: 13)),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _VehicleTab extends StatelessWidget {
  const _VehicleTab({required this.c});
  final SubRentalDetailDto c;

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.decimalPattern('fr');
    if (c.vehicle != null) {
      final v = c.vehicle!;
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionTitle('Véhicule'),
          _InfoRow(label: 'Immatriculation', value: v.registration),
          _InfoRow(label: 'Marque', value: v.brandName),
          _InfoRow(label: 'Modèle', value: v.modelName),
          _InfoRow(label: 'Année', value: v.year?.toString()),
          _InfoRow(label: 'Couleur', value: v.color),
          _InfoRow(
              label: 'Kilométrage',
              value: v.mileage != null ? '${money.format(v.mileage)} km' : null),
          _InfoRow(label: 'Statut propriété', value: v.ownershipStatus),
        ],
      );
    }
    final ext = c.externalVehicle;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionTitle('Véhicule'),
        const Padding(
          padding: EdgeInsets.only(bottom: 8),
          child: Text('Aucun véhicule lié (véhicule externe)',
              style: TextStyle(
                  color: Color(0xFFB45309),
                  fontSize: 12,
                  fontWeight: FontWeight.w700)),
        ),
        if (ext != null) ...[
          _InfoRow(label: 'Immatriculation', value: ext.registration),
          _InfoRow(label: 'Marque', value: ext.brandName),
          _InfoRow(label: 'Modèle', value: ext.modelName),
          _InfoRow(label: 'Année', value: ext.year?.toString()),
          _InfoRow(label: 'Couleur', value: ext.color),
          _InfoRow(
              label: 'Kilométrage initial',
              value: ext.mileage != null
                  ? '${money.format(ext.mileage)} km'
                  : null),
        ] else
          const Text('Aucune info véhicule externe.',
              style: TextStyle(color: Colors.black45, fontSize: 12.5)),
      ],
    );
  }
}

class _SupplierTab extends StatelessWidget {
  const _SupplierTab({required this.c});
  final SubRentalDetailDto c;

  @override
  Widget build(BuildContext context) {
    final s = c.supplier;
    if (s == null) {
      return const Text('Aucune agence liée.',
          style: TextStyle(color: Colors.black45, fontSize: 13));
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionTitle('Agence fournisseur'),
        _InfoRow(label: 'Nom', value: s.name),
        _InfoRow(label: 'Contact', value: s.contactPerson),
        _InfoRow(label: 'Téléphone', value: s.phone),
        _InfoRow(label: 'Email', value: s.email),
        _InfoRow(label: 'Ville', value: s.city),
        _InfoRow(label: 'ICE', value: s.ice),
        _InfoRow(label: 'RC', value: s.rc),
        _InfoRow(label: 'Statut', value: s.status),
      ],
    );
  }
}

class _PaymentsTab extends ConsumerWidget {
  const _PaymentsTab({required this.c, required this.onAdd});
  final SubRentalDetailDto c;
  final VoidCallback? onAdd;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(subRentalPaymentsProvider(c.id));
    final money = NumberFormat.decimalPattern('fr');
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(child: _SectionTitle('Paiements fournisseur')),
            if (onAdd != null)
              TextButton.icon(
                onPressed: onAdd,
                icon: const Icon(Icons.add, size: 16),
                label: const Text('Paiement'),
                style: TextButton.styleFrom(
                  foregroundColor: const Color(0xFF4F46E5),
                  textStyle: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 12),
                ),
              ),
          ],
        ),
        const SizedBox(height: 6),
        async.when(
          loading: () => const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Center(child: CircularProgressIndicator()),
          ),
          error: (e, _) => Text('Erreur: $e',
              style: const TextStyle(color: Colors.redAccent, fontSize: 12)),
          data: (p) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _MiniSummary(
                        label: 'Coût total',
                        value: '${money.format(c.totalCost ?? 0)} MAD',
                        bg: Colors.white,
                        fg: const Color(0xFF1F2937),
                        border: const Color(0xFFE2E8F0)),
                    _MiniSummary(
                        label: 'Payé',
                        value: '${money.format(p.totalPaid)} MAD',
                        bg: const Color(0xFFF0FDF4),
                        fg: const Color(0xFF166534),
                        border: const Color(0xFFBBF7D0)),
                    _MiniSummary(
                        label: 'Solde',
                        value: '${money.format(p.remainingBalance)} MAD',
                        bg: const Color(0xFFFEF2F2),
                        fg: const Color(0xFFB91C1C),
                        border: const Color(0xFFFECACA)),
                  ],
                ),
                const SizedBox(height: 10),
                if (p.payments.isEmpty)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Text('Aucun paiement enregistré.',
                        style: TextStyle(color: Colors.black45, fontSize: 12.5)),
                  )
                else
                  Column(
                    children: [
                      for (final pay in p.payments)
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: Row(
                            children: [
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      pay.paymentDate != null
                                          ? dateFmt.format(pay.paymentDate!)
                                          : '—',
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w800,
                                          fontSize: 12.5),
                                    ),
                                    Text(
                                      '${subRentalPaymentMethodFr(pay.paymentMethod)}${pay.reference != null && pay.reference!.isNotEmpty ? ' · ${pay.reference!}' : ''}',
                                      style: const TextStyle(
                                          color: Colors.black54,
                                          fontSize: 11.5),
                                    ),
                                  ],
                                ),
                              ),
                              Text('${money.format(pay.amount)} MAD',
                                  style: const TextStyle(
                                      fontFamily: 'monospace',
                                      fontWeight: FontWeight.w800,
                                      fontSize: 13)),
                            ],
                          ),
                        ),
                    ],
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _MiniSummary extends StatelessWidget {
  const _MiniSummary({
    required this.label,
    required this.value,
    required this.bg,
    required this.fg,
    required this.border,
  });
  final String label;
  final String value;
  final Color bg;
  final Color fg;
  final Color border;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 3),
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label.toUpperCase(),
                style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w800,
                    color: fg.withOpacity(0.75),
                    letterSpacing: 1)),
            const SizedBox(height: 2),
            Text(value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    fontSize: 13.5, fontWeight: FontWeight.w900, color: fg)),
          ],
        ),
      ),
    );
  }
}

class _ProfitabilityTab extends ConsumerWidget {
  const _ProfitabilityTab({required this.c});
  final SubRentalDetailDto c;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final money = NumberFormat.decimalPattern('fr');
    final async = ref.watch(subRentalProfitabilityProvider(c.id));
    return async.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 16),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => Text('Impossible de calculer la rentabilité.\n$e',
          style: const TextStyle(fontSize: 12, color: Colors.redAccent)),
      data: (p) {
        final marginPositive = p.margin >= 0;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const _SectionTitle('Analyse de rentabilité'),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _ProfBox(
                  label: 'Coût fournisseur',
                  value: '${money.format(p.supplierCost)} MAD',
                  color: const Color(0xFFB91C1C),
                  bg: const Color(0xFFFEF2F2),
                ),
                _ProfBox(
                  label: 'Revenus client',
                  value: '${money.format(p.customerRevenue)} MAD',
                  color: const Color(0xFF166534),
                  bg: const Color(0xFFF0FDF4),
                ),
                _ProfBox(
                  label: 'Marge',
                  value: '${money.format(p.margin)} MAD',
                  color: marginPositive
                      ? const Color(0xFF047857)
                      : const Color(0xFFB91C1C),
                  bg: marginPositive
                      ? const Color(0xFFECFDF5)
                      : const Color(0xFFFEF2F2),
                ),
                _ProfBox(
                  label: 'Marge %',
                  value: '${p.marginPercentage.toStringAsFixed(1)} %',
                  color: marginPositive
                      ? const Color(0xFF047857)
                      : const Color(0xFFB91C1C),
                  bg: marginPositive
                      ? const Color(0xFFECFDF5)
                      : const Color(0xFFFEF2F2),
                ),
              ],
            ),
            const SizedBox(height: 12),
            _InfoRow(label: 'Jours loués', value: '${p.daysCount}'),
            _InfoRow(
                label: 'Coût/jour', value: '${money.format(p.dailyCost)} MAD'),
            _InfoRow(
                label: 'Montant payé',
                value: '${money.format(p.totalPaid)} MAD'),
            _InfoRow(
                label: 'Solde restant',
                value: '${money.format(p.remainingBalance)} MAD'),
          ],
        );
      },
    );
  }
}

class _ProfBox extends StatelessWidget {
  const _ProfBox({
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
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withOpacity(0.2))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  color: color.withOpacity(0.75),
                  letterSpacing: 0.8)),
          const SizedBox(height: 2),
          Text(value,
              style: TextStyle(
                  fontSize: 15.5,
                  fontWeight: FontWeight.w900,
                  color: color)),
        ],
      ),
    );
  }
}

class _ReturnReportTab extends StatelessWidget {
  const _ReturnReportTab({required this.c, required this.onStart});
  final SubRentalDetailDto c;
  final VoidCallback onStart;

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    final money = NumberFormat.decimalPattern('fr');
    final r = c.returnReport;
    if (r == null) {
      if (c.isActive) {
        return InkWell(
          onTap: onStart,
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 20),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: const [
                Text('Effectuer le retour au fournisseur →',
                    style: TextStyle(
                        color: Color(0xFF4F46E5),
                        fontWeight: FontWeight.w800,
                        fontSize: 13)),
              ],
            ),
          ),
        );
      }
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Text('Aucun rapport de retour.',
            style: TextStyle(color: Colors.black45, fontSize: 12.5)),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _SectionTitle('Rapport de retour'),
        _InfoRow(
            label: 'Date retour',
            value: r.returnedAt != null ? dateFmt.format(r.returnedAt!) : null),
        _InfoRow(
            label: 'Kilométrage',
            value: r.odometerKm != null
                ? '${money.format(r.odometerKm)} km'
                : null),
        _InfoRow(label: 'Niveau carburant', value: fuelLevelFr(r.fuelLevel)),
        _InfoRow(label: 'Signé par', value: r.signedBySupplier),
        if (r.conditionNotes != null && r.conditionNotes!.isNotEmpty) ...[
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
                color: const Color(0xFFF5F6FB),
                borderRadius: BorderRadius.circular(10)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SectionTitle('État'),
                Text(r.conditionNotes!, style: const TextStyle(fontSize: 13)),
              ],
            ),
          ),
        ],
        if (r.damageNotes != null && r.damageNotes!.isNotEmpty) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
                color: const Color(0xFFFEF2F2),
                borderRadius: BorderRadius.circular(10)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SectionTitle('Dommages'),
                Text(r.damageNotes!,
                    style: const TextStyle(
                        fontSize: 13, color: Color(0xFFB91C1C))),
              ],
            ),
          ),
        ],
        if (r.extraCharges != null) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
                color: const Color(0xFFFFFBEB),
                borderRadius: BorderRadius.circular(10)),
            child: Row(
              children: [
                const Expanded(
                  child: Text('FRAIS SUPPLÉMENTAIRES',
                      style: TextStyle(
                          color: Color(0xFFB45309),
                          fontSize: 10.5,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1)),
                ),
                Text('${money.format(r.extraCharges)} MAD',
                    style: const TextStyle(
                        color: Color(0xFF92400E),
                        fontSize: 14,
                        fontWeight: FontWeight.w900)),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Modales : retour fournisseur & paiement
// ---------------------------------------------------------------------------

class _ReturnSheet extends StatefulWidget {
  @override
  State<_ReturnSheet> createState() => _ReturnSheetState();
}

class _ReturnSheetState extends State<_ReturnSheet> {
  final _formKey = GlobalKey<FormState>();
  DateTime _returnedAt = DateTime.now();
  final _odometer = TextEditingController();
  String? _fuel;
  final _condition = TextEditingController();
  final _damage = TextEditingController();
  final _extra = TextEditingController();
  final _signedBy = TextEditingController();

  @override
  void dispose() {
    _odometer.dispose();
    _condition.dispose();
    _damage.dispose();
    _extra.dispose();
    _signedBy.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return _SheetFrame(
      title: 'Retour au fournisseur',
      submitLabel: 'Confirmer le retour',
      submitColor: const Color(0xFFEA580C),
      onSubmit: () {
        if (_formKey.currentState?.validate() != true) return;
        Navigator.pop(context, {
          'returned_at': _returnedAt.toIso8601String().split('T').first,
          if (_odometer.text.trim().isNotEmpty)
            'odometer_km': double.tryParse(_odometer.text.trim()),
          if (_fuel != null) 'fuel_level': _fuel,
          if (_condition.text.trim().isNotEmpty)
            'condition_notes': _condition.text.trim(),
          if (_damage.text.trim().isNotEmpty) 'damage_notes': _damage.text.trim(),
          if (_extra.text.trim().isNotEmpty)
            'extra_charges': double.tryParse(_extra.text.trim()),
          if (_signedBy.text.trim().isNotEmpty)
            'signed_by_supplier': _signedBy.text.trim(),
        });
      },
      child: Form(
        key: _formKey,
        child: Column(
          children: [
            _SheetField(
              label: 'Date retour',
              child: InkWell(
                onTap: () async {
                  final d = await showDatePicker(
                    context: context,
                    initialDate: _returnedAt,
                    firstDate: DateTime(2020),
                    lastDate: DateTime(2100),
                  );
                  if (d != null) setState(() => _returnedAt = d);
                },
                child: InputDecorator(
                  decoration: _dec(),
                  child: Text(dateFmt.format(_returnedAt)),
                ),
              ),
            ),
            _SheetField(
              label: 'Kilométrage',
              child: TextFormField(
                controller: _odometer,
                keyboardType: TextInputType.number,
                decoration: _dec(hint: 'ex. 120 000'),
              ),
            ),
            _SheetField(
              label: 'Niveau carburant',
              child: DropdownButtonFormField<String>(
                value: _fuel,
                decoration: _dec(),
                items: const [
                  DropdownMenuItem(value: null, child: Text('—')),
                  DropdownMenuItem(value: 'empty', child: Text('Vide')),
                  DropdownMenuItem(value: 'quarter', child: Text('1/4')),
                  DropdownMenuItem(value: 'half', child: Text('1/2')),
                  DropdownMenuItem(value: 'three_quarters', child: Text('3/4')),
                  DropdownMenuItem(value: 'full', child: Text('Plein')),
                ],
                onChanged: (v) => setState(() => _fuel = v),
              ),
            ),
            _SheetField(
              label: 'Frais supplémentaires',
              child: TextFormField(
                controller: _extra,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration: _dec(hint: '0.00'),
              ),
            ),
            _SheetField(
              label: 'État du véhicule',
              child: TextFormField(
                controller: _condition,
                maxLines: 2,
                decoration: _dec(),
              ),
            ),
            _SheetField(
              label: 'Dommages constatés',
              child: TextFormField(
                controller: _damage,
                maxLines: 2,
                decoration: _dec(),
              ),
            ),
            _SheetField(
              label: 'Signé par le fournisseur',
              child: TextFormField(
                controller: _signedBy,
                decoration: _dec(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PaymentSheet extends StatefulWidget {
  @override
  State<_PaymentSheet> createState() => _PaymentSheetState();
}

class _PaymentSheetState extends State<_PaymentSheet> {
  final _formKey = GlobalKey<FormState>();
  final _amount = TextEditingController();
  String _method = 'cash';
  DateTime _date = DateTime.now();
  final _reference = TextEditingController();
  final _notes = TextEditingController();

  @override
  void dispose() {
    _amount.dispose();
    _reference.dispose();
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return _SheetFrame(
      title: 'Paiement fournisseur',
      submitLabel: 'Enregistrer',
      submitColor: const Color(0xFF4F46E5),
      onSubmit: () {
        if (_formKey.currentState?.validate() != true) return;
        Navigator.pop(context, {
          'amount': double.parse(_amount.text.trim()),
          'payment_method': _method,
          'payment_date': _date.toIso8601String().split('T').first,
          if (_reference.text.trim().isNotEmpty)
            'reference': _reference.text.trim(),
          if (_notes.text.trim().isNotEmpty) 'notes': _notes.text.trim(),
        });
      },
      child: Form(
        key: _formKey,
        child: Column(
          children: [
            _SheetField(
              label: 'Montant (MAD) *',
              child: TextFormField(
                controller: _amount,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                validator: (v) {
                  final d = double.tryParse(v?.trim() ?? '');
                  if (d == null || d <= 0) return 'Montant invalide';
                  return null;
                },
                decoration: _dec(hint: '0.00'),
              ),
            ),
            _SheetField(
              label: 'Mode de paiement',
              child: DropdownButtonFormField<String>(
                value: _method,
                decoration: _dec(),
                items: const [
                  DropdownMenuItem(value: 'cash', child: Text('Espèces')),
                  DropdownMenuItem(
                      value: 'bank_transfer', child: Text('Virement')),
                  DropdownMenuItem(value: 'cheque', child: Text('Chèque')),
                  DropdownMenuItem(value: 'card', child: Text('Carte')),
                  DropdownMenuItem(value: 'other', child: Text('Autre')),
                ],
                onChanged: (v) => setState(() => _method = v ?? 'cash'),
              ),
            ),
            _SheetField(
              label: 'Date',
              child: InkWell(
                onTap: () async {
                  final d = await showDatePicker(
                    context: context,
                    initialDate: _date,
                    firstDate: DateTime(2020),
                    lastDate: DateTime(2100),
                  );
                  if (d != null) setState(() => _date = d);
                },
                child: InputDecorator(
                  decoration: _dec(),
                  child: Text(dateFmt.format(_date)),
                ),
              ),
            ),
            _SheetField(
              label: 'Référence',
              child: TextFormField(
                controller: _reference,
                decoration: _dec(),
              ),
            ),
            _SheetField(
              label: 'Notes',
              child: TextFormField(
                controller: _notes,
                maxLines: 2,
                decoration: _dec(),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SheetFrame extends StatelessWidget {
  const _SheetFrame({
    required this.title,
    required this.submitLabel,
    required this.submitColor,
    required this.onSubmit,
    required this.child,
  });
  final String title;
  final String submitLabel;
  final Color submitColor;
  final VoidCallback onSubmit;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        ),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(title,
                        style: const TextStyle(
                            fontWeight: FontWeight.w900, fontSize: 16)),
                  ),
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.close),
                  ),
                ],
              ),
              const Divider(),
              child,
              const SizedBox(height: 10),
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Annuler'),
                  ),
                  const SizedBox(width: 6),
                  FilledButton(
                    onPressed: onSubmit,
                    style:
                        FilledButton.styleFrom(backgroundColor: submitColor),
                    child: Text(submitLabel),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SheetField extends StatelessWidget {
  const _SheetField({required this.label, required this.child});
  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(),
              style: const TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w800,
                  color: Colors.black45,
                  letterSpacing: 1.1)),
          const SizedBox(height: 6),
          child,
        ],
      ),
    );
  }
}

InputDecoration _dec({String? hint}) {
  return InputDecoration(
    hintText: hint,
    isDense: true,
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: Color(0x33888888)),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: Color(0x33888888)),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: Color(0xFF4F46E5), width: 1.5),
    ),
  );
}



