import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/widgets/module_scaffold.dart';
import '../../documents/data/entity_documents_repo.dart';
import '../../documents/presentation/document_viewer_screen.dart';
import '../../payments/data/payment_dto.dart';
import '../../payments/data/payments_repo.dart';
import '../../payments/presentation/payment_detail_screen.dart';
import '../data/contract_arrears_repo.dart';
import '../data/contract_detail_dto.dart';
import '../data/contract_dto.dart';
import '../data/contracts_repo.dart';

/// Fiche contrat : en-tête + onglets glissants (Détails, Échéancier, Paiements,
/// Documents, Historique, Actions) comme la version web — mais empaquetés
/// pour un pouce et un écran étroit.
class ContractDetailScreen extends ConsumerStatefulWidget {
  const ContractDetailScreen({super.key, required this.id});
  final String id;

  @override
  ConsumerState<ContractDetailScreen> createState() =>
      _ContractDetailScreenState();
}

class _ContractDetailScreenState extends ConsumerState<ContractDetailScreen>
    with TickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 7, vsync: this);

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(contractDetailProvider(widget.id));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Contrat'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () {
              ref.invalidate(contractDetailProvider(widget.id));
              ref.invalidate(contractInstallmentsProvider(widget.id));
              ref.invalidate(contractAuditProvider(widget.id));
            },
          ),
        ],
      ),
      body: ModuleBackground(
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ModuleErrorView(message: '$e'),
          data: (detail) {
            return Column(
              children: [
                _HeaderCard(detail: detail),
                TabBar(
                  controller: _tabs,
                  isScrollable: true,
                  tabAlignment: TabAlignment.start,
                  labelColor: const Color(0xFF4F46E5),
                  unselectedLabelColor: Colors.black54,
                  indicatorColor: const Color(0xFF4F46E5),
                  labelStyle: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 13),
                  tabs: const [
                    Tab(text: 'Détails'),
                    Tab(text: 'Échéancier'),
                    Tab(text: 'Paiements'),
                    Tab(text: 'Contentieux'),
                    Tab(text: 'Documents'),
                    Tab(text: 'Historique'),
                    Tab(text: 'Actions'),
                  ],
                ),
                Expanded(
                  child: TabBarView(
                    controller: _tabs,
                    children: [
                      _DetailsTab(detail: detail),
                      _ScheduleTab(contractId: widget.id),
                      _PaymentsTab(contractId: widget.id),
                      _LegalTab(contractId: widget.id),
                      _DocumentsTab(contractId: widget.id),
                      _HistoryTab(contractId: widget.id),
                      _ActionsTab(contractId: widget.id, contract: detail.contract),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.detail});
  final ContractDetailDto detail;

  @override
  Widget build(BuildContext context) {
    final c = detail.contract;
    final money = NumberFormat.currency(locale: 'fr', symbol: 'MAD');
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
      child: ModuleCard(
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
            Text(c.customerName ?? '—',
                style: const TextStyle(
                    fontSize: 20, fontWeight: FontWeight.w900)),
            if (c.vehicleLabel != null) ...[
              const SizedBox(height: 4),
              Text(c.vehicleLabel!,
                  style: const TextStyle(color: Colors.black54, fontSize: 13)),
            ],
            const SizedBox(height: 10),
            Row(
              children: [
                ModuleStatusChip(
                    label: contractStatusFr(c.status),
                    tone: _tone(c.status)),
                const Spacer(),
                if (c.baseAmount != null && c.baseAmount! > 0)
                  Text(money.format(c.baseAmount),
                      style: const TextStyle(
                          color: Color(0xFF4F46E5),
                          fontWeight: FontWeight.w900,
                          fontSize: 18)),
              ],
            ),
          ],
        ),
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

class _DetailsTab extends StatelessWidget {
  const _DetailsTab({required this.detail});
  final ContractDetailDto detail;

  @override
  Widget build(BuildContext context) {
    final c = detail.contract;
    final money = NumberFormat.currency(locale: 'fr', symbol: 'MAD');
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        ModuleCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Période',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              ModuleKV(
                  label: 'Début',
                  value: c.startDate != null
                      ? dateFmt.format(c.startDate!)
                      : '—'),
              ModuleKV(
                  label: 'Fin',
                  value:
                      c.endDate != null ? dateFmt.format(c.endDate!) : '—'),
              if (detail.durationMonths != null)
                ModuleKV(
                    label: 'Durée',
                    value: '${detail.durationMonths} mois'),
            ],
          ),
        ),
        const SizedBox(height: 12),
        ModuleCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Financier',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              if (c.baseAmount != null)
                ModuleKV(
                    label: 'Montant',
                    value: money.format(c.baseAmount)),
              if (detail.monthlyAmount != null)
                ModuleKV(
                    label: 'Mensualité',
                    value: money.format(detail.monthlyAmount)),
              if (detail.deposit != null)
                ModuleKV(label: 'Caution', value: money.format(detail.deposit)),
              if (detail.firstRent != null)
                ModuleKV(
                    label: 'Premier loyer',
                    value: money.format(detail.firstRent)),
              if (detail.residualValue != null)
                ModuleKV(
                    label: 'Valeur résiduelle',
                    value: money.format(detail.residualValue)),
              if (detail.rate != null)
                ModuleKV(
                    label: 'Taux',
                    value: '${detail.rate!.toStringAsFixed(2)} %'),
              if (detail.kmPerYear != null)
                ModuleKV(
                    label: 'Km / an',
                    value: NumberFormat.decimalPattern('fr')
                        .format(detail.kmPerYear)),
            ],
          ),
        ),
        if (detail.clientPhone != null || detail.clientEmail != null) ...[
          const SizedBox(height: 12),
          ModuleCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Partenaires',
                    style: TextStyle(
                        fontSize: 13, fontWeight: FontWeight.w700)),
                const SizedBox(height: 10),
                if (c.customerName != null)
                  ModuleKV(label: 'Client', value: c.customerName!),
                if (detail.clientPhone != null)
                  ModuleKV(label: 'Téléphone', value: detail.clientPhone!),
                if (detail.clientEmail != null)
                  ModuleKV(label: 'Email', value: detail.clientEmail!),
                if (c.vehicleLabel != null)
                  ModuleKV(label: 'Véhicule', value: c.vehicleLabel!),
              ],
            ),
          ),
        ],
        if (detail.notes != null && detail.notes!.isNotEmpty) ...[
          const SizedBox(height: 12),
          ModuleCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Notes',
                    style: TextStyle(
                        fontSize: 13, fontWeight: FontWeight.w700)),
                const SizedBox(height: 8),
                Text(detail.notes!,
                    style: const TextStyle(fontSize: 13)),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _ScheduleTab extends ConsumerWidget {
  const _ScheduleTab({required this.contractId});
  final String contractId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(contractInstallmentsProvider(contractId));
    final money = NumberFormat.currency(locale: 'fr', symbol: 'MAD');
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ModuleErrorView(message: '$e'),
      data: (items) {
        if (items.isEmpty) {
          return const ModuleEmptyView(
            icon: Icons.event_note_outlined,
            message: 'Aucune échéance pour ce contrat.',
          );
        }
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: items.length,
          separatorBuilder: (_, __) => const SizedBox(height: 8),
          itemBuilder: (_, i) {
            final it = items[i];
            return ModuleCard(
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: const Color(0xFFEEF0FB),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    alignment: Alignment.center,
                    child: Text('${it.number}',
                        style: const TextStyle(
                            fontWeight: FontWeight.w800,
                            color: Color(0xFF4F46E5))),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(money.format(it.amount),
                            style: const TextStyle(
                                fontWeight: FontWeight.w800, fontSize: 14)),
                        if (it.dueDate != null)
                          Text('Échéance ${dateFmt.format(it.dueDate!)}',
                              style: const TextStyle(
                                  color: Colors.black54, fontSize: 12)),
                      ],
                    ),
                  ),
                  ModuleStatusChip(
                    label: installmentStatusFr(it.status),
                    tone: _tone(it.status),
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  ModuleStatusTone _tone(String s) {
    return switch (s.toLowerCase()) {
      'paid' => ModuleStatusTone.ok,
      'overdue' => ModuleStatusTone.danger,
      'partial' => ModuleStatusTone.warning,
      'cancelled' => ModuleStatusTone.neutral,
      _ => ModuleStatusTone.warning,
    };
  }
}

/// Onglet Paiements — liste les paiements rattachés au contrat
/// (via `GET /payments?contract_id=`), avec totaux Reçu / Alloué /
/// Non alloué. Tap sur un paiement ouvre la fiche PaymentDetailScreen.
class _PaymentsTab extends ConsumerWidget {
  const _PaymentsTab({required this.contractId});
  final String contractId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(contractPaymentsProvider(contractId));
    final money = NumberFormat.decimalPattern('fr');
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ModuleErrorView(message: '$e'),
      data: (payments) {
        final totalReceived = payments
            .where((p) => p.status != 'reversed')
            .fold<double>(0, (s, p) => s + p.amount);
        final totalAllocated =
            payments.fold<double>(0, (s, p) => s + p.amountAllocated);
        final totalUnallocated =
            payments.fold<double>(0, (s, p) => s + p.amountUnallocated);
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Row(
              children: [
                _MiniStat(
                    label: 'Reçu',
                    value: '${money.format(totalReceived)} MAD',
                    bg: const Color(0xFFF8FAFC),
                    fg: const Color(0xFF1F2937)),
                _MiniStat(
                    label: 'Alloué',
                    value: '${money.format(totalAllocated)} MAD',
                    bg: const Color(0xFFECFDF5),
                    fg: const Color(0xFF065F46)),
                _MiniStat(
                    label: 'Non alloué',
                    value: '${money.format(totalUnallocated)} MAD',
                    bg: totalUnallocated > 0
                        ? const Color(0xFFFFFBEB)
                        : const Color(0xFFECFDF5),
                    fg: totalUnallocated > 0
                        ? const Color(0xFFB45309)
                        : const Color(0xFF059669)),
              ],
            ),
            const SizedBox(height: 12),
            if (payments.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Center(
                  child: Text('Aucun paiement rattaché à ce contrat.',
                      style: TextStyle(color: Colors.black45, fontSize: 13)),
                ),
              )
            else
              for (final p in payments)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: ModuleCard(
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => PaymentDetailScreen(id: p.id))),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(p.number,
                                  style: const TextStyle(
                                      fontFamily: 'monospace',
                                      fontWeight: FontWeight.w900,
                                      fontSize: 12.5,
                                      color: Color(0xFF1F2937))),
                            ),
                            _PaymentStatusChip(status: p.status),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          [
                            paymentMethodFr(p.method),
                            if (p.paymentType != null) paymentTypeFr(p.paymentType!),
                            if (p.paymentDate != null) dateFmt.format(p.paymentDate!),
                          ].join(' · '),
                          style: const TextStyle(
                              color: Colors.black54, fontSize: 11.5),
                        ),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            Text('${money.format(p.amount)} ${p.currency}',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w900, fontSize: 14)),
                            const Spacer(),
                            if (p.amountUnallocated > 0)
                              Text(
                                  'Reste ${money.format(p.amountUnallocated)}',
                                  style: const TextStyle(
                                      color: Color(0xFFB45309),
                                      fontWeight: FontWeight.w800,
                                      fontSize: 11)),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
          ],
        );
      },
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({
    required this.label,
    required this.value,
    required this.bg,
    required this.fg,
  });
  final String label;
  final String value;
  final Color bg;
  final Color fg;
  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
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
                    fontWeight: FontWeight.w800,
                    color: fg.withOpacity(0.75),
                    letterSpacing: 1)),
            const SizedBox(height: 2),
            Text(value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                    color: fg,
                    fontSize: 12.5,
                    fontWeight: FontWeight.w900)),
          ],
        ),
      ),
    );
  }
}

class _PaymentStatusChip extends StatelessWidget {
  const _PaymentStatusChip({required this.status});
  final String status;
  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (status) {
      'allocated' => (const Color(0xFFDCFCE7), const Color(0xFF166534)),
      'received' => (const Color(0xFFDBEAFE), const Color(0xFF1E40AF)),
      'refunded' => (const Color(0xFFFEF3C7), const Color(0xFF92400E)),
      'reversed' => (const Color(0xFFFEE2E2), const Color(0xFFB91C1C)),
      _ => (const Color(0xFFF1F5F9), const Color(0xFF475569)),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(paymentStatusFr(status).toUpperCase(),
          style: TextStyle(
              color: fg,
              fontSize: 9.5,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.3)),
    );
  }
}

/// Onglet Contentieux — dossiers d'arriérés (`/arrears/cases?contract_id=`).
class _LegalTab extends ConsumerWidget {
  const _LegalTab({required this.contractId});
  final String contractId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(contractArrearsProvider(contractId));
    final money = NumberFormat.decimalPattern('fr');
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ModuleErrorView(message: '$e'),
      data: (cases) {
        if (cases.isEmpty) {
          return Padding(
            padding: const EdgeInsets.all(16),
            child: Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: const Color(0xFFECFDF5),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: const Color(0xFFBBF7D0)),
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('✓ Aucun contentieux pour ce contrat.',
                      style: TextStyle(
                          color: Color(0xFF065F46),
                          fontWeight: FontWeight.w900,
                          fontSize: 13.5)),
                  SizedBox(height: 4),
                  Text(
                      "Le client est à jour de ses paiements, aucun dossier n'a été ouvert.",
                      style:
                          TextStyle(color: Color(0xFF065F46), fontSize: 12)),
                ],
              ),
            ),
          );
        }
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            for (final a in cases)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: ModuleCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(a.caseNumber ?? 'Dossier ${a.id.substring(0, 8)}',
                                style: const TextStyle(
                                    fontFamily: 'monospace',
                                    fontWeight: FontWeight.w900,
                                    fontSize: 12.5)),
                          ),
                          _ArrearsStatusChip(status: a.status),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Row(
                        children: [
                          const Icon(Icons.gavel,
                              size: 14, color: Color(0xFF4F46E5)),
                          const SizedBox(width: 4),
                          Text(arrearsPhaseFr(a.phase),
                              style: const TextStyle(
                                  color: Color(0xFF4338CA),
                                  fontWeight: FontWeight.w800,
                                  fontSize: 12)),
                        ],
                      ),
                      const SizedBox(height: 8),
                      if (a.totalOverdue != null)
                        Text(
                          'Impayé : ${money.format(a.totalOverdue)} MAD'
                          '${a.daysOverdue != null ? '  ·  ${a.daysOverdue} j de retard' : ''}',
                          style: const TextStyle(
                              fontWeight: FontWeight.w900,
                              fontSize: 13,
                              color: Color(0xFFB91C1C)),
                        ),
                      if (a.assignedTo != null) ...[
                        const SizedBox(height: 4),
                        Text('Attribué à : ${a.assignedTo}',
                            style: const TextStyle(
                                color: Colors.black54, fontSize: 11.5)),
                      ],
                      if (a.openedAt != null)
                        Text('Ouvert le ${dateFmt.format(a.openedAt!)}',
                            style: const TextStyle(
                                color: Colors.black45, fontSize: 11)),
                      if (a.notes != null && a.notes!.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                              color: const Color(0xFFF8FAFC),
                              borderRadius: BorderRadius.circular(8)),
                          child: Text(a.notes!,
                              style: const TextStyle(fontSize: 12)),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _ArrearsStatusChip extends StatelessWidget {
  const _ArrearsStatusChip({required this.status});
  final String status;
  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (status.toLowerCase()) {
      'resolved' || 'closed' => (
        const Color(0xFFDCFCE7),
        const Color(0xFF166534)
      ),
      'legal' || 'escalated' => (
        const Color(0xFFFEE2E2),
        const Color(0xFFB91C1C)
      ),
      'in_progress' => (
        const Color(0xFFFEF3C7),
        const Color(0xFF92400E)
      ),
      _ => (const Color(0xFFDBEAFE), const Color(0xFF1E40AF)),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(arrearsStatusFr(status).toUpperCase(),
          style: TextStyle(
              color: fg,
              fontSize: 9.5,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.3)),
    );
  }
}

/// Onglet Documents — attachments + générés sur l'entité `contract`.
class _DocumentsTab extends ConsumerWidget {
  const _DocumentsTab({required this.contractId});
  final String contractId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(entityDocumentsProvider(('contract', contractId)));
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ModuleErrorView(message: '$e'),
      data: (docs) {
        if (docs.isEmpty) {
          return const ModuleEmptyView(
            icon: Icons.folder_outlined,
            message: 'Aucun document attaché à ce contrat.',
          );
        }
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: docs.length,
          separatorBuilder: (_, __) => const SizedBox(height: 8),
          itemBuilder: (_, i) {
            final d = docs[i];
            return ModuleCard(
              onTap: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => DocumentViewerScreen(
                  id: d.id,
                  title: d.title,
                  mimeType: d.mimeType,
                ),
              )),
              child: Row(
                children: [
                  Icon(
                    (d.mimeType ?? '').startsWith('image/')
                        ? Icons.image_outlined
                        : d.mimeType == 'application/pdf'
                            ? Icons.picture_as_pdf
                            : Icons.description_outlined,
                    color: const Color(0xFF4F46E5),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(d.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontWeight: FontWeight.w800, fontSize: 13.5)),
                        const SizedBox(height: 2),
                        Text(
                          [
                            if (d.category != null) d.category!,
                            if (d.createdAt != null)
                              'Déposé le ${dateFmt.format(d.createdAt!)}',
                          ].join(' · '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                              fontSize: 11, color: Colors.black54),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.open_in_new,
                      color: Color(0xFF4F46E5), size: 18),
                ],
              ),
            );
          },
        );
      },
    );
  }
}

class _HistoryTab extends ConsumerWidget {
  const _HistoryTab({required this.contractId});
  final String contractId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(contractAuditProvider(contractId));
    final dateFmt = DateFormat('dd/MM/yyyy HH:mm', 'fr');
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ModuleErrorView(message: '$e'),
      data: (items) {
        if (items.isEmpty) {
          return const ModuleEmptyView(
            icon: Icons.history,
            message: 'Aucun événement enregistré pour ce contrat.',
          );
        }
        return ListView.builder(
          padding: const EdgeInsets.all(16),
          itemCount: items.length,
          itemBuilder: (_, i) {
            final e = items[i];
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: ModuleCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(e.action,
                              style: const TextStyle(
                                  fontWeight: FontWeight.w800, fontSize: 14)),
                        ),
                        if (e.createdAt != null)
                          Text(dateFmt.format(e.createdAt!),
                              style: const TextStyle(
                                  color: Colors.black45, fontSize: 11)),
                      ],
                    ),
                    if (e.detail != null && e.detail!.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(e.detail!,
                          style: const TextStyle(
                              color: Colors.black54, fontSize: 12.5)),
                    ],
                    if (e.actorName != null) ...[
                      const SizedBox(height: 4),
                      Text('Par ${e.actorName}',
                          style: const TextStyle(
                              color: Colors.black45, fontSize: 11)),
                    ],
                  ],
                ),
              ),
            );
          },
        );
      },
    );
  }
}

class _ActionsTab extends ConsumerStatefulWidget {
  const _ActionsTab({required this.contractId, required this.contract});
  final String contractId;
  final ContractDto contract;

  @override
  ConsumerState<_ActionsTab> createState() => _ActionsTabState();
}

class _ActionsTabState extends ConsumerState<_ActionsTab> {
  bool _busy = false;
  String? _msg;

  List<_Transition> _options() {
    final s = widget.contract.status.toLowerCase();
    return [
      _Transition('approved', 'Approuver', Icons.check_circle,
          allowed: ['draft', 'pending'].contains(s)),
      _Transition('active', 'Activer', Icons.play_circle,
          allowed: ['approved', 'pending', 'draft'].contains(s)),
      _Transition('suspended', 'Suspendre', Icons.pause_circle,
          allowed: s == 'active'),
      _Transition('closed', 'Clôturer', Icons.stop_circle,
          allowed: ['active', 'suspended'].contains(s)),
      _Transition('terminated', 'Résilier', Icons.cancel,
          allowed: ['active', 'suspended'].contains(s)),
    ].where((t) => t.allowed).toList();
  }

  Future<void> _apply(String status, String label) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: Text('Confirmer : $label'),
        content: Text(
            'Passer ce contrat au statut « ${contractStatusFr(status)} » ?'),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Annuler')),
          FilledButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Confirmer')),
        ],
      ),
    );
    if (ok != true) return;
    setState(() {
      _busy = true;
      _msg = null;
    });
    try {
      await ref
          .read(contractsRepoProvider)
          .changeStatus(widget.contractId, status);
      ref.invalidate(contractDetailProvider(widget.contractId));
      ref.invalidate(contractsListProvider);
      setState(() => _msg = 'Statut mis à jour.');
    } catch (e) {
      setState(() => _msg = 'Action impossible : ${_friendly(e)}');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String _friendly(Object e) {
    final match = RegExp(r'status code of (\d+)').firstMatch(e.toString());
    if (match == null) return 'erreur réseau.';
    final code = int.parse(match[1]!);
    if (code == 403) return "pas la permission.";
    if (code == 422) return 'transition non autorisée pour ce statut.';
    return 'code HTTP $code.';
  }

  @override
  Widget build(BuildContext context) {
    final transitions = _options();
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        ModuleCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Changer le statut',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
              const SizedBox(height: 6),
              const Text(
                'Les actions proposées dépendent du statut actuel du contrat.',
                style: TextStyle(color: Colors.black54, fontSize: 12),
              ),
              const SizedBox(height: 12),
              if (transitions.isEmpty)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Text(
                    'Aucune action disponible pour ce statut.',
                    style: TextStyle(color: Colors.black45, fontSize: 13),
                  ),
                )
              else
                for (final t in transitions) ...[
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: _busy ? null : () => _apply(t.status, t.label),
                      icon: Icon(t.icon),
                      label: Text(t.label),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(46),
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
              if (_msg != null) ...[
                const SizedBox(height: 8),
                Text(_msg!,
                    style: TextStyle(
                      color: _msg!.startsWith('Statut')
                          ? Colors.green.shade700
                          : Colors.red.shade700,
                      fontWeight: FontWeight.w700,
                      fontSize: 12.5,
                    )),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _Transition {
  const _Transition(this.status, this.label, this.icon, {required this.allowed});
  final String status;
  final String label;
  final IconData icon;
  final bool allowed;
}
