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
              ref.invalidate(contractEntityAuditProvider(widget.id));
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
                      _HistoryTab(contractId: widget.id, detail: detail),
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

/// Onglet « Détails » — reproduit la version web (`ContractDetailPage.tsx`) :
/// trois cartes seulement (Période, Parties/véhicule, Paiement). Les montants
/// financiers (mensualité, caution, premier loyer, VR, taux, km/an) sont
/// couverts par l'onglet « Échéancier » et n'apparaissent plus ici.
class _DetailsTab extends StatelessWidget {
  const _DetailsTab({required this.detail});
  final ContractDetailDto detail;

  @override
  Widget build(BuildContext context) {
    final c = detail.contract;
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _SectionCard(
          title: 'Période',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '${c.startDate != null ? dateFmt.format(c.startDate!) : '—'}'
                ' → '
                '${c.endDate != null ? dateFmt.format(c.endDate!) : '—'}',
                style:
                    const TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
              ),
              if (detail.durationMonths != null) ...[
                const SizedBox(height: 4),
                Text('${detail.durationMonths} mois',
                    style: const TextStyle(
                        color: Colors.black54, fontSize: 12)),
              ],
            ],
          ),
        ),
        const SizedBox(height: 12),
        _SectionCard(
          title: 'Parties / véhicule',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _LinePair(
                label: 'Client',
                value: c.customerName ?? '—',
                emphasis: c.customerName != null,
              ),
              const SizedBox(height: 4),
              _LinePair(
                label: 'Véhicule',
                value: c.vehicleLabel ?? '—',
                emphasis: c.vehicleLabel != null,
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        _SectionCard(
          title: 'Paiement',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _LinePair(
                  label: 'Mode',
                  value: _paymentMethodFr(detail.paymentMethod) ?? '—'),
              const SizedBox(height: 4),
              _LinePair(
                  label: 'Échéance jour',
                  value: detail.expectedPaymentDay?.toString() ?? '—'),
              const SizedBox(height: 4),
              _LinePair(
                  label: 'Conditions',
                  value: detail.paymentTerms ?? '—'),
              const SizedBox(height: 4),
              _LinePair(
                  label: 'Réf. virement',
                  value: detail.bankReference ?? '—'),
              const SizedBox(height: 4),
              _LinePair(
                  label: 'N° chèque',
                  value: detail.chequeNumber ?? '—'),
            ],
          ),
        ),
      ],
    );
  }
}

const Map<String, String> _kPaymentMethodFr = {
  'virement': 'Virement bancaire',
  'bank_transfer': 'Virement bancaire',
  'cheque': 'Chèque',
  'check': 'Chèque',
  'espece': 'Espèce',
  'cash': 'Espèce',
  'carte': 'Carte bancaire',
  'card': 'Carte bancaire',
  'autre': 'Autre',
  'other': 'Autre',
};

String? _paymentMethodFr(String? raw) {
  if (raw == null || raw.isEmpty) return null;
  return _kPaymentMethodFr[raw.toLowerCase()] ?? raw;
}

/// Carte au bord fin, titre en haut en petite capitale — comme les cartes
/// `rounded-2xl` + `text-xs uppercase tracking-widest` du web.
class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.child});
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title.toUpperCase(),
            style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w900,
              color: Colors.black45,
              letterSpacing: 1.3,
            ),
          ),
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }
}

/// Ligne « Label: valeur » utilisée dans la carte Paiement — le label est
/// gris, la valeur en gras, séparés par un espace flexible.
class _LinePair extends StatelessWidget {
  const _LinePair({
    required this.label,
    required this.value,
    this.emphasis = false,
  });
  final String label;
  final String value;
  final bool emphasis;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('$label  ',
            style: const TextStyle(color: Colors.black45, fontSize: 12.5)),
        Expanded(
          child: Text(
            value,
            style: TextStyle(
              fontWeight: emphasis ? FontWeight.w800 : FontWeight.w700,
              fontSize: 13,
              color: emphasis
                  ? const Color(0xFF3730A3)
                  : Theme.of(context).textTheme.bodyLarge?.color,
            ),
          ),
        ),
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

/// Onglet « Historique » — comme la version web, en deux sections :
///   1. Audit & traçabilité — journal d'audit (`/entities/contract/{id}/audit`)
///   2. Historique métier — évènements renvoyés sous `history` du GET du
///      contrat (changements de statut, création, signature, etc.)
class _HistoryTab extends ConsumerWidget {
  const _HistoryTab({required this.contractId, required this.detail});
  final String contractId;
  final ContractDetailDto detail;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auditAsync = ref.watch(contractEntityAuditProvider(contractId));
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        _SectionCard(
          title: 'Audit & traçabilité',
          child: auditAsync.when(
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text('Chargement de l\'historique…',
                  style: TextStyle(color: Colors.black45, fontSize: 12)),
            ),
            error: (e, _) => Text('Erreur : $e',
                style: const TextStyle(color: Colors.redAccent, fontSize: 12)),
            data: (rows) {
              if (rows.isEmpty) {
                return const Text(
                    'Aucune action enregistrée pour cette entité.',
                    style: TextStyle(color: Colors.black45, fontSize: 12));
              }
              return Column(
                children: [
                  for (final r in rows) _AuditTile(entry: r),
                ],
              );
            },
          ),
        ),
        const SizedBox(height: 12),
        _SectionCard(
          title: 'Historique métier',
          child: _BusinessHistoryList(history: detail.history),
        ),
      ],
    );
  }
}

class _AuditTile extends StatefulWidget {
  const _AuditTile({required this.entry});
  final EntityAuditEntryDto entry;

  @override
  State<_AuditTile> createState() => _AuditTileState();
}

class _AuditTileState extends State<_AuditTile> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final entry = widget.entry;
    final dateFmt = DateFormat('dd/MM/yyyy HH:mm', 'fr');
    final title = _auditActionFr[entry.action] ??
        entry.actionLabel ??
        entry.action;
    final diffs = _summarizeChanges(entry.beforeData, entry.afterData);
    final hasDiffs = diffs.isNotEmpty;

    return GestureDetector(
      onTap: hasDiffs ? () => setState(() => _expanded = !_expanded) : null,
      child: Container(
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
            Row(
              children: [
                Container(
                  width: 10,
                  height: 10,
                  margin: const EdgeInsets.only(right: 8),
                  decoration: BoxDecoration(
                    color: entry.legalSignificance
                        ? const Color(0xFFF59E0B)
                        : const Color(0xFF6366F1),
                    shape: BoxShape.circle,
                  ),
                ),
                Expanded(
                  child: Text(title,
                      style: const TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 13)),
                ),
                if (entry.occurredAt != null)
                  Text(dateFmt.format(entry.occurredAt!),
                      style: const TextStyle(
                          color: Colors.black45, fontSize: 10.5)),
              ],
            ),
            const SizedBox(height: 4),
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  child: Text.rich(
                    TextSpan(children: [
                      TextSpan(
                        text: entry.actorName ?? entry.actorEmail ?? 'Système',
                        style: const TextStyle(
                            color: Colors.black54, fontSize: 11.5),
                      ),
                      if (entry.ipAddress != null)
                        TextSpan(
                          text: ' · ${entry.ipAddress}',
                          style: const TextStyle(
                              color: Colors.black38,
                              fontSize: 10.5,
                              fontFamily: 'monospace'),
                        ),
                    ]),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (entry.legalSignificance)
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFEF3C7),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: const Text('LÉGAL',
                        style: TextStyle(
                            color: Color(0xFF92400E),
                            fontSize: 9,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1)),
                  ),
              ],
            ),
            if (hasDiffs) ...[
              const SizedBox(height: 6),
              Row(
                children: [
                  Icon(
                    _expanded ? Icons.expand_less : Icons.expand_more,
                    size: 16,
                    color: const Color(0xFF4F46E5),
                  ),
                  const SizedBox(width: 4),
                  Text(
                    'Voir les changements (${diffs.length})',
                    style: const TextStyle(
                      color: Color(0xFF4F46E5),
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ],
              ),
              if (_expanded) ...[
                const SizedBox(height: 8),
                Container(
                  decoration: BoxDecoration(
                    color: const Color(0xFFF8FAFC),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: const Color(0xFFE2E8F0)),
                  ),
                  child: Column(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 6),
                        decoration: const BoxDecoration(
                          border: Border(
                            bottom: BorderSide(color: Color(0xFFE2E8F0)),
                          ),
                        ),
                        child: const Row(
                          children: [
                            Expanded(
                              flex: 3,
                              child: Text('Champ',
                                  style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w900,
                                      color: Colors.black45)),
                            ),
                            Expanded(
                              flex: 3,
                              child: Text('Avant',
                                  style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w900,
                                      color: Colors.black45)),
                            ),
                            Expanded(
                              flex: 3,
                              child: Text('Après',
                                  style: TextStyle(
                                      fontSize: 10,
                                      fontWeight: FontWeight.w900,
                                      color: Colors.black45)),
                            ),
                          ],
                        ),
                      ),
                      for (final d in diffs)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 5),
                          decoration: const BoxDecoration(
                            border: Border(
                              bottom: BorderSide(color: Color(0xFFF1F5F9)),
                            ),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                flex: 3,
                                child: Text(d.label,
                                    style: const TextStyle(
                                        fontSize: 10.5,
                                        fontWeight: FontWeight.w700,
                                        color: Color(0xFF475569))),
                              ),
                              Expanded(
                                flex: 3,
                                child: Text(d.before,
                                    style: const TextStyle(
                                        fontSize: 10.5,
                                        color: Colors.black38,
                                        fontFamily: 'monospace')),
                              ),
                              Expanded(
                                flex: 3,
                                child: Text(d.after,
                                    style: const TextStyle(
                                        fontSize: 10.5,
                                        fontWeight: FontWeight.w800,
                                        color: Color(0xFF1E293B),
                                        fontFamily: 'monospace')),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ],
          ],
        ),
      ),
    );
  }
}

class _BusinessHistoryList extends StatelessWidget {
  const _BusinessHistoryList({required this.history});
  final List<ContractHistoryEntryDto> history;

  @override
  Widget build(BuildContext context) {
    if (history.isEmpty) {
      return const Text('Aucun évènement métier enregistré.',
          style: TextStyle(color: Colors.black45, fontSize: 12));
    }
    final dateFmt = DateFormat('dd/MM/yyyy HH:mm', 'fr');
    return Column(
      children: [
        for (final h in history)
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
                Row(
                  children: [
                    Container(
                      width: 10,
                      height: 10,
                      margin: const EdgeInsets.only(right: 8),
                      decoration: BoxDecoration(
                        color: _toneFor(h.action),
                        shape: BoxShape.circle,
                      ),
                    ),
                    Expanded(
                      child: Text(_businessActionFr[h.action] ?? h.action,
                          style: const TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 13)),
                    ),
                    if (h.at != null)
                      Text(dateFmt.format(h.at!),
                          style: const TextStyle(
                              color: Colors.black45, fontSize: 10.5)),
                  ],
                ),
                if (h.fromStatus != null || h.toStatus != null) ...[
                  const SizedBox(height: 4),
                  Text(
                    '${contractStatusFr(h.fromStatus ?? '—')} → ${contractStatusFr(h.toStatus ?? '—')}',
                    style: const TextStyle(
                        color: Colors.black54, fontSize: 11.5),
                  ),
                ],
              ],
            ),
          ),
      ],
    );
  }

  Color _toneFor(String action) {
    switch (action) {
      case 'activated':
      case 'approved':
      case 'signed':
        return const Color(0xFF059669);
      case 'terminated':
      case 'cancelled':
      case 'rejected':
        return const Color(0xFFDC2626);
      default:
        return const Color(0xFF6366F1);
    }
  }
}

const Map<String, String> _auditActionFr = {
  'created': 'Création',
  'updated': 'Modification',
  'deleted': 'Suppression',
  'status_changed': 'Changement de statut',
  'approved': 'Approbation',
  'rejected': 'Rejet',
  'activated': 'Activation',
  'terminated': 'Résiliation',
  'signed': 'Signature',
  'sent_for_signature': 'Envoi pour signature',
  'schedule_generated': 'Échéancier généré',
  'pdf_generated': 'PDF généré',
  'payment_recorded': 'Paiement enregistré',
  'confirmed': 'Confirmation',
  'cancelled': 'Annulation',
  'handed_over': 'Remise véhicule',
  'returned': 'Retour véhicule',
  'extended': 'Prolongation',
  'damage_reported': 'Dommage signalé',
  'billing_closed': 'Facturation clôturée',
  'wallet_credited': 'Crédit portefeuille',
  'wallet_debited': 'Débit portefeuille',
  'wallet_adjusted': 'Ajustement portefeuille',
  'vehicle_swap_approved_instant': 'Changement de véhicule (instantané)',
  'vehicle_swap_approved': 'Changement de véhicule approuvé',
  'vehicle_swap_requested': 'Changement de véhicule demandé',
  'vehicle_swap_rejected': 'Changement de véhicule refusé',
  'kyc_submitted': 'KYC soumis',
  'kyc_approved': 'KYC approuvé',
  'kyc_rejected': 'KYC rejeté',
  'document_uploaded': 'Document téléversé',
  'document_validated': 'Document validé',
  'financial_action': 'Action financière',
  'login': 'Connexion',
  'logout': 'Déconnexion',
};

const Map<String, String> _businessActionFr = {
  'created': 'Création',
  'updated': 'Modification',
  'deleted': 'Suppression',
  'status_changed': 'Changement de statut',
  'approved': 'Approbation',
  'activated': 'Activation',
  'terminated': 'Résiliation',
  'signed': 'Signature',
  'sent_for_signature': 'Envoi pour signature',
  'cancelled': 'Annulation',
  'rejected': 'Rejet',
  'confirmed': 'Confirmation',
  'handed_over': 'Remise véhicule',
  'returned': 'Retour véhicule',
  'extended': 'Prolongation',
  'damage_reported': 'Dommage signalé',
  'billing_closed': 'Facturation clôturée',
  'schedule_generated': 'Échéancier généré',
  'pdf_generated': 'PDF généré',
  'payment_recorded': 'Paiement enregistré',
};

// ---------------------------------------------------------------------------
// Diff helpers — mirrors EntityAuditTimeline.tsx on the web
// ---------------------------------------------------------------------------

const _hiddenAuditFields = <String>{
  'id', 'company_id', 'branch_id', 'created_at', 'updated_at', 'deleted_at',
  'sha256', 'storage_path', 'disk', 'password', 'remember_token',
  'two_factor_secret',
};

const _fieldLabels = <String, String>{
  'status': 'Statut',
  'customer_id': 'Client',
  'vehicle_id': 'Véhicule',
  'contract_id': 'Contrat',
  'reservation_id': 'Réservation',
  'document_id': 'Document',
  'invoice_id': 'Facture',
  'user_id': 'Utilisateur',
  'assigned_user_id': 'Assigné à',
  'start_date': 'Date de début',
  'end_date': 'Date de fin',
  'desired_start_at': 'Début souhaité',
  'desired_end_at': 'Fin souhaitée',
  'activation_date': "Date d'activation",
  'closure_date': 'Date de clôture',
  'signed_at': 'Signé le',
  'terminated_reason': 'Motif résiliation',
  'monthly_payment': 'Mensualité',
  'base_amount': 'Montant de base',
  'down_payment_amount': 'Apport',
  'deposit_amount': 'Caution',
  'duration_months': 'Durée (mois)',
  'allowed_km': 'Km autorisés',
  'excess_km_rate': 'Tarif km excédent',
  'payment_method': 'Mode de paiement',
  'payment_terms': 'Conditions paiement',
  'bank_reference': 'Réf. virement',
  'cheque_number': 'N° chèque',
  'notes': 'Notes',
  'legal_status': 'Statut légal',
  'signature_status': 'Statut signature',
  'estimated_price': 'Prix estimé',
  'reservation_type': 'Type réservation',
  'handover_type': 'Type remise',
  'fuel_level': 'Niveau carburant',
  'odometer': 'Kilométrage',
  'condition_notes': 'État / observations',
  'daily_rental_price': 'Tarif / jour',
  'monthly_rental_price': 'Tarif / mois',
  'registration': 'Immatriculation',
  'brand_name': 'Marque',
  'model_name': 'Modèle',
  'fuel_type': 'Carburant',
  'mileage_current': 'Kilométrage',
  'insurance_expiry': 'Exp. assurance',
  'tech_control_expiry': 'Exp. visite technique',
  'vignette_expiry': 'Exp. vignette',
};

const _valueTranslations = <String, String>{
  'draft': 'Brouillon',
  'pending': 'En attente',
  'pending_approval': "En attente d'approbation",
  'pending_created': 'Créé · en attente',
  'approved': 'Approuvé',
  'active': 'Actif',
  'inactive': 'Inactif',
  'completed': 'Terminé',
  'cancelled': 'Annulé',
  'rejected': 'Rejeté',
  'expired': 'Expiré',
  'terminated': 'Résilié',
  'closed': 'Clôturé',
  'suspended': 'Suspendu',
  'blocked': 'Bloqué',
  'pending_signature': 'En attente de signature',
  'signed': 'Signé',
  'sent_for_signature': 'Envoyé pour signature',
  'reserved': 'Réservé',
  'confirmed': 'Confirmé',
  'pickup_scheduled': 'Remise planifiée',
  'handed_over': 'Remis',
  'extension_requested': 'Prolongation demandée',
  'return_scheduled': 'Retour planifié',
  'returned': 'Retourné',
  'inspection_pending': 'Inspection en attente',
  'damage_pending': 'Dommages en attente',
  'billing_pending': 'Facturation en attente',
  'under_review': 'En cours de vérification',
  'incomplete': 'Incomplet',
  'processing': 'Traitement en cours',
  'extracted': 'Extrait',
  'validated': 'Validé',
  'failed': 'Échoué',
  'true': 'Oui',
  'false': 'Non',
  '1': 'Oui',
  '0': 'Non',
  'LLD': 'Location Longue Durée',
  'LOA': "Location avec Option d'Achat",
  'CREDIT_AUTO': 'Crédit Automobile',
  'VENTE_VO': 'Vente VO',
  'LOCATION_COURTE': 'Location Courte Durée',
  'virement': 'Virement',
  'cheque': 'Chèque',
  'espece': 'Espèce',
  'cash': 'Espèce',
  'carte': 'Carte bancaire',
  'bank_transfer': 'Virement bancaire',
  'owned': 'Propriété',
  'leased': 'Loué',
  'sub_rented': 'Sous-location',
  'planned': 'Planifié',
  'in_progress': 'En cours',
  'done': 'Terminé',
  'open': 'Ouvert',
  'pickup': 'Remise',
  'return': 'Retour',
  'enabled': 'Activé',
  'disabled': 'Désactivé',
};

final _uuidRe = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    caseSensitive: false);
final _isoDateRe = RegExp(r'^\d{4}-\d{2}-\d{2}(T[\d:.Z+\-]+)?$');
final _hexHashRe = RegExp(r'^[0-9a-f]{32,}$', caseSensitive: false);

String _uuidPrefix(String key) {
  final k = key.toLowerCase();
  if (k.contains('customer')) return 'CLT';
  if (k.contains('vehicle')) return 'VHL';
  if (k.contains('contract')) return 'CTR';
  if (k.contains('reservation')) return 'RSV';
  if (k.contains('invoice')) return 'INV';
  if (k.contains('document')) return 'DOC';
  if (k.contains('user')) return 'USR';
  final clean = key.replaceAll(RegExp(r'_id$'), '');
  return clean.substring(0, clean.length.clamp(0, 3)).toUpperCase();
}

String _formatFieldLabel(String field) {
  return _fieldLabels[field] ??
      field
          .replaceAll('_', ' ')
          .replaceAllMapped(RegExp(r'\b\w'), (m) => m[0]!.toUpperCase());
}

String _formatValue(String key, dynamic raw) {
  if (raw == null || raw.toString().trim().isEmpty) return '—';
  final s = raw is Map || raw is List ? raw.toString() : raw.toString();

  if (_uuidRe.hasMatch(s.trim())) {
    final prefix = _uuidPrefix(key);
    return '$prefix-${s.replaceAll('-', '').substring(0, 8).toUpperCase()}';
  }
  if (_isoDateRe.hasMatch(s.trim())) {
    final d = DateTime.tryParse(s);
    if (d != null) {
      return s.contains('T') &&
              !s.endsWith('T00:00:00.000000Z') &&
              !s.endsWith('T00:00:00Z')
          ? DateFormat('dd/MM/yyyy HH:mm', 'fr').format(d)
          : DateFormat('dd/MM/yyyy', 'fr').format(d);
    }
  }
  if (_hexHashRe.hasMatch(s.trim()) && s.length > 20) {
    return '${s.substring(0, 12)}…';
  }
  return _valueTranslations[s] ?? _valueTranslations[s.toLowerCase()] ?? s;
}

class _DiffLine {
  const _DiffLine(this.label, this.before, this.after);
  final String label;
  final String before;
  final String after;
}

List<_DiffLine> _summarizeChanges(
    Map<String, dynamic>? beforeData, Map<String, dynamic>? afterData) {
  final before = beforeData ?? {};
  final after = afterData ?? {};
  final keys = <String>{...before.keys, ...after.keys};
  final lines = <_DiffLine>[];
  for (final key in keys) {
    if (_hiddenAuditFields.contains(key)) continue;
    final bStr = (before[key] ?? '').toString();
    final aStr = (after[key] ?? '').toString();
    if (bStr == aStr) continue;
    lines.add(_DiffLine(
      _formatFieldLabel(key),
      _formatValue(key, before[key]),
      _formatValue(key, after[key]),
    ));
    if (lines.length >= 10) break;
  }
  return lines;
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
