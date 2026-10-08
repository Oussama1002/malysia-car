import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/widgets/module_scaffold.dart';
import '../../contracts/data/contract_dto.dart';
import '../../contracts/data/contracts_repo.dart';
import '../../contracts/presentation/contract_detail_screen.dart';
import '../../reservations/data/reservation_dto.dart';
import '../../reservations/data/reservations_repo.dart';
import '../../reservations/presentation/reservation_detail_screen.dart';
import '../../vehicles/data/vehicle_dto.dart';
import '../../vehicles/data/vehicles_repo.dart';
import '../../vehicles/presentation/vehicle_detail_screen.dart';
import '../data/payment_dto.dart';
import '../data/payments_repo.dart';

/// Détail d'un paiement — reproduit la vue web : header + badges statut,
/// 3 onglets (Résumé, Allocations, Métadonnées).
class PaymentDetailScreen extends ConsumerStatefulWidget {
  const PaymentDetailScreen({super.key, required this.id});
  final String id;

  @override
  ConsumerState<PaymentDetailScreen> createState() =>
      _PaymentDetailScreenState();
}

enum _Tab { summary, allocations, metadata }

const _tabLabels = {
  _Tab.summary: 'Résumé',
  _Tab.allocations: 'Allocations',
  _Tab.metadata: 'Métadonnées',
};

class _PaymentDetailScreenState extends ConsumerState<PaymentDetailScreen> {
  _Tab _tab = _Tab.summary;

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(paymentDetailProvider(widget.id));
    final money = NumberFormat.decimalPattern('fr');
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return Scaffold(
      body: SafeArea(
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ModuleErrorView(message: '$e'),
          data: (p) => ListView(
            padding: const EdgeInsets.only(bottom: 24),
            children: [
              _Header(p: p, onBack: () => Navigator.of(context).maybePop()),
              _HeaderCard(p: p, money: money, dateFmt: dateFmt),
              const SizedBox(height: 10),
              _TabsBar(
                  current: _tab, onChanged: (t) => setState(() => _tab = t)),
              _TabContent(p: p, tab: _tab, money: money, dateFmt: dateFmt),
            ],
          ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.p, required this.onBack});
  final PaymentDto p;
  final VoidCallback onBack;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 20, 0),
      child: Row(
        children: [
          IconButton(onPressed: onBack, icon: const Icon(Icons.arrow_back)),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('← Paiements',
                    style:
                        TextStyle(color: Colors.black45, fontSize: 11.5)),
                Text(p.number,
                    style: const TextStyle(
                        fontWeight: FontWeight.w900, fontSize: 18)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _HeaderCard extends StatelessWidget {
  const _HeaderCard(
      {required this.p, required this.money, required this.dateFmt});
  final PaymentDto p;
  final NumberFormat money;
  final DateFormat dateFmt;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: ModuleCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _StatusPill(status: p.status),
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                      color: const Color(0xFFF1F5F9),
                      borderRadius: BorderRadius.circular(999)),
                  child: Text(paymentMethodFr(p.method).toUpperCase(),
                      style: const TextStyle(
                          color: Color(0xFF475569),
                          fontSize: 10,
                          fontWeight: FontWeight.w900,
                          letterSpacing: 0.3)),
                ),
              ],
            ),
            const SizedBox(height: 10),
            Text(p.customerName ?? p.customerCode ?? '—',
                style:
                    const TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
            if (p.paymentDate != null)
              Text(dateFmt.format(p.paymentDate!),
                  style: const TextStyle(
                      color: Colors.black54, fontSize: 11.5)),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: _MiniStat(
                    label: 'Montant',
                    value: '${money.format(p.amount)} ${p.currency}',
                    color: const Color(0xFF1F2937),
                    bg: const Color(0xFFF8FAFC),
                  ),
                ),
                Expanded(
                  child: _MiniStat(
                    label: 'Alloué',
                    value:
                        '${money.format(p.amountAllocated)} ${p.currency}',
                    color: const Color(0xFF065F46),
                    bg: const Color(0xFFECFDF5),
                  ),
                ),
                Expanded(
                  child: _MiniStat(
                    label: 'Non alloué',
                    value: p.amountUnallocated > 0
                        ? '${money.format(p.amountUnallocated)} ${p.currency}'
                        : '0',
                    color: p.amountUnallocated > 0
                        ? const Color(0xFFB45309)
                        : const Color(0xFF059669),
                    bg: p.amountUnallocated > 0
                        ? const Color(0xFFFFFBEB)
                        : const Color(0xFFECFDF5),
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

class _MiniStat extends StatelessWidget {
  const _MiniStat({
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
      margin: const EdgeInsets.symmetric(horizontal: 3),
      padding: const EdgeInsets.all(8),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(),
              style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w900,
                  color: color.withOpacity(0.75),
                  letterSpacing: 1)),
          const SizedBox(height: 2),
          Text(value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  color: color,
                  fontSize: 12.5,
                  fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }
}

class _TabsBar extends StatelessWidget {
  const _TabsBar({required this.current, required this.onChanged});
  final _Tab current;
  final ValueChanged<_Tab> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius:
            const BorderRadius.vertical(top: Radius.circular(14)),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: Row(
        children: [
          for (final t in _Tab.values)
            Expanded(
              child: InkWell(
                onTap: () => onChanged(t),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    border: Border(
                      bottom: BorderSide(
                        width: 2,
                        color: current == t
                            ? const Color(0xFF4F46E5)
                            : Colors.transparent,
                      ),
                    ),
                  ),
                  child: Text(_tabLabels[t]!,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: current == t
                            ? const Color(0xFF4338CA)
                            : Colors.black54,
                        fontWeight: FontWeight.w900,
                        fontSize: 12,
                      )),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _TabContent extends ConsumerWidget {
  const _TabContent({
    required this.p,
    required this.tab,
    required this.money,
    required this.dateFmt,
  });
  final PaymentDto p;
  final _Tab tab;
  final NumberFormat money;
  final DateFormat dateFmt;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final child = switch (tab) {
      _Tab.summary => _summary(context, ref),
      _Tab.allocations => _allocations(context),
      _Tab.metadata => _metadata(),
    };
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius:
            const BorderRadius.vertical(bottom: Radius.circular(14)),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: child,
    );
  }

  Widget _summary(BuildContext context, WidgetRef ref) {
    // Resolution client-side depuis les listes deja en cache : on retrouve
    // le contrat, la reservation et le vehicule lies au paiement pour les
    // afficher avec leur libelle plutot que leur UUID.
    final contracts =
        ref.watch(contractsListProvider).valueOrNull ?? const <ContractDto>[];
    final reservations =
        ref.watch(reservationsListProvider).valueOrNull ??
            const <ReservationDto>[];
    final vehicles =
        ref.watch(vehiclesListProvider).valueOrNull ?? const <VehicleDto>[];
    final contract = p.contractId == null
        ? null
        : contracts.where((c) => c.id == p.contractId).firstOrNull;
    final reservation = p.reservationId == null
        ? null
        : reservations
            .where((r) => r.id == p.reservationId)
            .firstOrNull;
    final vehicleId = contract?.vehicleId ?? reservation?.vehicleId;
    final vehicle = vehicleId == null
        ? null
        : vehicles.where((v) => v.id == vehicleId).firstOrNull;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _row('Numéro', p.number),
        _row('Client', p.customerName ?? p.customerCode ?? '—'),
        _row('Mode', paymentMethodFr(p.method)),
        if (p.paymentType != null)
          _row('Type', paymentTypeFr(p.paymentType!)),
        _row('Direction', p.direction == 'outgoing' ? 'Sortant' : 'Entrant'),
        _row('Date',
            p.paymentDate != null ? dateFmt.format(p.paymentDate!) : '—'),
        _row('Montant', '${money.format(p.amount)} ${p.currency}'),
        _row('Alloué', '${money.format(p.amountAllocated)} ${p.currency}'),
        _row('Non alloué',
            '${money.format(p.amountUnallocated)} ${p.currency}'),
        // Liens enrichis : chaque bloc est cliquable et ouvre la fiche
        // correspondante (contrat / reservation / vehicule / facture via
        // l'id). Si on n'a pas pu resoudre le label, on affiche quand meme
        // l'ID pour qu'on puisse chercher manuellement.
        if (p.contractId != null)
          _linkRow(
            context: context,
            icon: Icons.description_outlined,
            label: 'Contrat',
            value: contract?.number ?? p.contractId!,
            subtitle: contract != null
                ? '${contractTypeFr(contract.type)} · ${contractStatusFr(contract.status)}'
                : null,
            onTap: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => ContractDetailScreen(id: p.contractId!))),
          ),
        if (p.reservationId != null)
          _linkRow(
            context: context,
            icon: Icons.event_outlined,
            label: 'Réservation',
            value: reservation?.number ?? p.reservationId!,
            subtitle: reservation != null
                ? '${reservation.customerName ?? '—'} · ${frenchStatus(reservation.status)}'
                : null,
            onTap: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) =>
                    ReservationDetailScreen(id: p.reservationId!))),
          ),
        if (vehicle != null)
          _linkRow(
            context: context,
            icon: Icons.directions_car,
            label: 'Véhicule',
            value: '${vehicle.label} · ${vehicle.registration}',
            subtitle: vehicle.year?.toString(),
            onTap: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => VehicleDetailScreen(id: vehicle.id))),
          )
        else if (p.vehicleLabel != null && p.vehicleLabel!.isNotEmpty)
          // Fallback : le vehicule lie n'est pas dans le cache local
          // (listes paginees), mais le backend attache `vehicle_label`
          // (marque + modele + plaque). On l'affiche sans lien.
          _linkRow(
            context: context,
            icon: Icons.directions_car,
            label: 'Véhicule',
            value: p.vehicleLabel!,
            onTap: null,
          ),
        if (p.invoiceId != null)
          _linkRow(
            context: context,
            icon: Icons.receipt_long_outlined,
            label: 'Facture',
            value: p.invoiceId!,
            onTap: null, // Pas d'ecran facture mobile pour le moment.
          ),
        if (p.notes != null && p.notes!.isNotEmpty) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('NOTES',
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        color: Colors.black45,
                        letterSpacing: 1)),
                const SizedBox(height: 4),
                Text(p.notes!, style: const TextStyle(fontSize: 12.5)),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _linkRow({
    required BuildContext context,
    required IconData icon,
    required String label,
    required String value,
    String? subtitle,
    VoidCallback? onTap,
  }) {
    final isTappable = onTap != null;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: const Color(0xFFF8FAFC),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(
                color: isTappable
                    ? const Color(0xFFC7D2FE)
                    : Theme.of(context).dividerColor),
          ),
          child: Row(
            children: [
              Container(
                width: 32,
                height: 32,
                decoration: BoxDecoration(
                  color: isTappable
                      ? const Color(0xFFEEF2FF)
                      : Colors.grey.shade100,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Icon(icon,
                    color: isTappable
                        ? const Color(0xFF4F46E5)
                        : Colors.black45,
                    size: 16),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(label.toUpperCase(),
                        style: const TextStyle(
                            fontSize: 9.5,
                            fontWeight: FontWeight.w800,
                            color: Colors.black45,
                            letterSpacing: 1.1)),
                    const SizedBox(height: 2),
                    Text(value,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w900,
                            color: Color(0xFF1F2937),
                            fontFamily: 'monospace')),
                    if (subtitle != null)
                      Text(subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 11.5, color: Colors.black54)),
                  ],
                ),
              ),
              if (isTappable)
                const Icon(Icons.chevron_right,
                    color: Color(0xFF4F46E5), size: 20),
            ],
          ),
        ),
      ),
    );
  }

  Widget _allocations(BuildContext context) {
    if (p.allocations.isEmpty) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 20),
        child: Text('Aucune allocation pour ce paiement.',
            style: TextStyle(color: Colors.black45, fontSize: 12.5)),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final a in p.allocations)
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Theme.of(context).dividerColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  a.invoiceNumber != null
                      ? 'Facture ${a.invoiceNumber}'
                      : a.installmentNumber != null
                          ? 'Échéance n°${a.installmentNumber}'
                          : 'Allocation',
                  style: const TextStyle(
                      fontWeight: FontWeight.w900, fontSize: 12.5),
                ),
                const SizedBox(height: 2),
                Text(
                  [
                    '${money.format(a.amountAllocated)} ${p.currency}',
                    if (a.installmentDueDate != null)
                      'Échéance ${dateFmt.format(a.installmentDueDate!)}',
                    if (a.allocatedAt != null)
                      'Allouée le ${dateFmt.format(a.allocatedAt!)}',
                  ].join(' · '),
                  style:
                      const TextStyle(fontSize: 11.5, color: Colors.black54),
                ),
                if (a.notes != null && a.notes!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(a.notes!,
                        style: const TextStyle(
                            fontSize: 11.5, color: Colors.black87)),
                  ),
              ],
            ),
          ),
      ],
    );
  }

  Widget _metadata() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (p.externalReference != null && p.externalReference!.isNotEmpty)
          _row('Référence externe', p.externalReference!),
        if (p.checkNumber != null && p.checkNumber!.isNotEmpty)
          _row('N° chèque', p.checkNumber!),
        if (p.checkDate != null)
          _row('Date chèque', dateFmt.format(p.checkDate!)),
        if (p.checkBank != null && p.checkBank!.isNotEmpty)
          _row('Banque', p.checkBank!),
        if (p.bankAccountName != null && p.bankAccountName!.isNotEmpty)
          _row('Compte bancaire', p.bankAccountName!),
        if (p.contractId != null) _row('Contrat', p.contractId!),
        if (p.reservationId != null) _row('Réservation', p.reservationId!),
        if (p.invoiceId != null) _row('Facture', p.invoiceId!),
        _row('ID interne', p.id),
      ],
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(label,
                style:
                    const TextStyle(fontSize: 11.5, color: Colors.black54)),
          ),
          Flexible(
            child: Text(value,
                textAlign: TextAlign.right,
                style: const TextStyle(
                    fontSize: 12.5, fontWeight: FontWeight.w800)),
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



