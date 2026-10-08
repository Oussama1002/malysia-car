import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/widgets/module_scaffold.dart';
import '../../documents/data/entity_documents_repo.dart';
import '../../documents/presentation/document_viewer_screen.dart';
import '../data/customer_detail_dto.dart';
import '../data/customer_dossier_dto.dart';
import '../data/customer_dto.dart';
import '../data/customers_repo.dart';

/// Fiche client complète — même structure que le web : 9 onglets scrollables
/// (Identité, KYC, Contrats, Paiements, Portefeuille, Documents, Notes,
/// Risque, Audit). Le dossier arrive en un seul appel au serveur.
class CustomerDetailScreen extends ConsumerStatefulWidget {
  const CustomerDetailScreen({super.key, required this.id});
  final String id;

  @override
  ConsumerState<CustomerDetailScreen> createState() =>
      _CustomerDetailScreenState();
}

class _CustomerDetailScreenState extends ConsumerState<CustomerDetailScreen>
    with TickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 9, vsync: this);

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(customerDossierProvider(widget.id));
    return Scaffold(
      appBar: AppBar(
        title: const Text('Dossier client'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(customerDossierProvider(widget.id)),
          ),
        ],
      ),
      body: ModuleBackground(
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ModuleErrorView(message: '$e'),
          data: (dossier) => Column(
            children: [
              _HeaderCard(dossier: dossier),
              TabBar(
                controller: _tabs,
                isScrollable: true,
                tabAlignment: TabAlignment.start,
                labelColor: const Color(0xFF4F46E5),
                unselectedLabelColor: Colors.black54,
                indicatorColor: const Color(0xFF4F46E5),
                labelStyle: const TextStyle(
                    fontWeight: FontWeight.w800, fontSize: 13),
                tabs: [
                  const Tab(text: 'Identité'),
                  Tab(text: 'KYC (${dossier.kycCases.length})'),
                  Tab(text: 'Contrats (${dossier.contracts.length})'),
                  Tab(text: 'Paiements (${dossier.payments.length})'),
                  const Tab(text: 'Portefeuille'),
                  Tab(text: 'Documents (${dossier.documentsCount})'),
                  Tab(text: 'Notes (${dossier.notes.length})'),
                  const Tab(text: 'Risque'),
                  const Tab(text: 'Audit'),
                ],
              ),
              Expanded(
                child: TabBarView(
                  controller: _tabs,
                  children: [
                    _IdentityTab(dossier: dossier),
                    _KycTab(cases: dossier.kycCases),
                    _ContractsTab(contracts: dossier.contracts),
                    _PaymentsTab(payments: dossier.payments),
                    const _WalletTab(),
                    _DocumentsTab(
                        customerId: widget.id, cases: dossier.kycCases),
                    _NotesTab(
                      customerId: widget.id,
                      notes: dossier.notes,
                    ),
                    _RiskTab(
                      risk: dossier.risk,
                      blacklist: dossier.blacklist,
                    ),
                    const _AuditTab(),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.dossier});
  final CustomerDossierDto dossier;

  @override
  Widget build(BuildContext context) {
    final c = dossier.customer;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
      child: ModuleCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [Color(0xFF4F46E5), Color(0xFF7C3AED)],
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(c.isCompany ? Icons.business : Icons.person,
                      color: Colors.white, size: 24),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(c.displayName ?? '—',
                          style: const TextStyle(
                              fontSize: 20, fontWeight: FontWeight.w900)),
                      Text('${c.code} · ${c.isCompany ? 'Entreprise' : 'Particulier'}',
                          style: const TextStyle(
                              fontSize: 12, color: Colors.black45)),
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
                    label: 'KYC ${kKycStatusFr[c.kycStatus!] ?? c.kycStatus!}',
                    tone: _kycTone(c.kycStatus!),
                  ),
                if (c.riskLevel != null)
                  ModuleStatusChip(
                    label:
                        'Risque ${kRiskLevelFr[c.riskLevel!] ?? c.riskLevel!}',
                    tone: _riskTone(c.riskLevel!),
                  ),
                if (c.status != null)
                  ModuleStatusChip(
                    label: kCustomerStatusFr[c.status!] ?? c.status!,
                    tone: _statusTone(c.status!),
                  ),
                if (c.isBlacklisted)
                  const ModuleStatusChip(
                      label: 'BLACKLIST', tone: ModuleStatusTone.danger),
              ],
            ),
          ],
        ),
      ),
    );
  }

  ModuleStatusTone _kycTone(String k) => switch (k) {
        'approved' => ModuleStatusTone.ok,
        'rejected' || 'expired' => ModuleStatusTone.danger,
        _ => ModuleStatusTone.warning,
      };
  ModuleStatusTone _riskTone(String r) => switch (r) {
        'low' || 'normal' => ModuleStatusTone.ok,
        'elevated' => ModuleStatusTone.warning,
        'high' => ModuleStatusTone.danger,
        _ => ModuleStatusTone.neutral,
      };
  ModuleStatusTone _statusTone(String s) => switch (s) {
        'active' => ModuleStatusTone.ok,
        'suspended' => ModuleStatusTone.danger,
        _ => ModuleStatusTone.neutral,
      };
}

class _IdentityTab extends StatelessWidget {
  const _IdentityTab({required this.dossier});
  final CustomerDossierDto dossier;

  @override
  Widget build(BuildContext context) {
    final c = dossier.customer;
    // Combine téléphones et emails de toutes les sources.
    final phones = <String>{};
    final emails = <String>{};
    if (c.phone != null && c.phone!.isNotEmpty) phones.add(c.phone!);
    if (c.email != null && c.email!.isNotEmpty) emails.add(c.email!);
    for (final co in dossier.contacts) {
      if (co.type == 'phone') phones.add(co.value);
      if (co.type == 'email') emails.add(co.value);
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        ModuleCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Identité',
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              if (c.isCompany)
                ModuleKV(label: 'ICE', value: c.ice ?? '—')
              else
                ModuleKV(label: 'CIN', value: c.nationalId ?? '—'),
              ModuleKV(label: 'Code', value: c.code),
              if (c.branchName != null)
                ModuleKV(label: 'Agence', value: c.branchName!),
            ],
          ),
        ),
        if (phones.isNotEmpty || emails.isNotEmpty) ...[
          const SizedBox(height: 12),
          ModuleCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Contact',
                    style:
                        TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                const SizedBox(height: 10),
                for (final p in phones)
                  _ActionRow(
                    icon: Icons.phone,
                    value: p,
                    action: 'Appeler',
                    onTap: () => launchUrl(Uri.parse('tel:$p')),
                  ),
                for (final e in emails)
                  _ActionRow(
                    icon: Icons.email_outlined,
                    value: e,
                    action: 'Écrire',
                    onTap: () => launchUrl(Uri.parse('mailto:$e')),
                  ),
              ],
            ),
          ),
        ],
        if (dossier.addresses.isNotEmpty) ...[
          const SizedBox(height: 12),
          ModuleCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Adresses',
                    style:
                        TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                const SizedBox(height: 10),
                for (final a in dossier.addresses)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.place,
                            size: 16, color: Colors.black45),
                        const SizedBox(width: 8),
                        Expanded(
                            child: Text(
                                a.formatted.isEmpty ? '—' : a.formatted,
                                style: const TextStyle(fontSize: 13))),
                        if (a.isDefault)
                          const ModuleStatusChip(
                              label: 'PRINCIPALE',
                              tone: ModuleStatusTone.ok),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
        if (dossier.bankAccounts.isNotEmpty) ...[
          const SizedBox(height: 12),
          ModuleCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Comptes bancaires',
                    style:
                        TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                const SizedBox(height: 10),
                for (final b in dossier.bankAccounts)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      children: [
                        const Icon(Icons.account_balance,
                            size: 16, color: Colors.black45),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(b.bankName ?? 'Banque',
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 13)),
                              if (b.rib != null || b.iban != null)
                                Text(b.rib ?? b.iban ?? '',
                                    style: const TextStyle(
                                        fontFamily: 'monospace',
                                        fontSize: 11,
                                        color: Colors.black54)),
                            ],
                          ),
                        ),
                        if (b.isDefault)
                          const ModuleStatusChip(
                              label: 'PRINCIPAL',
                              tone: ModuleStatusTone.ok),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _ActionRow extends StatelessWidget {
  const _ActionRow({
    required this.icon,
    required this.value,
    required this.action,
    required this.onTap,
  });
  final IconData icon;
  final String value;
  final String action;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
        child: Row(
          children: [
            Icon(icon, size: 18, color: const Color(0xFF4F46E5)),
            const SizedBox(width: 12),
            Expanded(
              child: Text(value,
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 14)),
            ),
            Text(action,
                style: const TextStyle(
                    color: Color(0xFF4F46E5),
                    fontWeight: FontWeight.w700,
                    fontSize: 12)),
          ],
        ),
      ),
    );
  }
}

class _KycTab extends StatelessWidget {
  const _KycTab({required this.cases});
  final List<KycCaseDto> cases;

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    if (cases.isEmpty) {
      return const ModuleEmptyView(
        icon: Icons.verified_user_outlined,
        message: 'Aucun dossier KYC pour ce client.',
      );
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        for (final k in cases)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: ModuleCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Dossier ${k.verificationLevel ?? 'basic'}',
                          style: const TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 14),
                        ),
                      ),
                      ModuleStatusChip(
                        label: kKycStatusFr[k.status] ?? k.status,
                        tone: _kycTone(k.status),
                      ),
                    ],
                  ),
                  if (k.reviewedAt != null) ...[
                    const SizedBox(height: 4),
                    Text('Revu le ${dateFmt.format(k.reviewedAt!)}',
                        style: const TextStyle(
                            fontSize: 11, color: Colors.black54)),
                  ],
                  if (k.rejectionReason != null) ...[
                    const SizedBox(height: 6),
                    Text('Motif : ${k.rejectionReason}',
                        style: const TextStyle(
                            fontSize: 12, color: Colors.red)),
                  ],
                  if (k.documents.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    const Divider(height: 1),
                    const SizedBox(height: 10),
                    for (final d in k.documents)
                      Padding(
                        padding: const EdgeInsets.symmetric(vertical: 4),
                        child: Row(
                          children: [
                            const Icon(Icons.description_outlined,
                                size: 16, color: Colors.black45),
                            const SizedBox(width: 10),
                            Expanded(
                                child: Text(documentTypeFr(d.type),
                                    style: const TextStyle(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w700))),
                            // Si le dossier KYC parent est approuvé, chaque
                            // document hérite de l'état « Vérifié » même si
                            // son propre `verification_status` est encore
                            // à `pending` — c'est ce que fait le backend
                            // lorsqu'un cas est approuvé.
                            Builder(builder: (_) {
                              final effective = (k.status == 'approved' &&
                                      d.status == 'pending')
                                  ? 'verified'
                                  : d.status;
                              return ModuleStatusChip(
                                label:
                                    kDocStatusFr[effective] ?? effective,
                                tone: switch (effective) {
                                  'verified' => ModuleStatusTone.ok,
                                  'rejected' => ModuleStatusTone.danger,
                                  _ => ModuleStatusTone.warning,
                                },
                              );
                            }),
                          ],
                        ),
                      ),
                  ],
                ],
              ),
            ),
          ),
      ],
    );
  }

  ModuleStatusTone _kycTone(String k) => switch (k) {
        'approved' => ModuleStatusTone.ok,
        'rejected' || 'expired' => ModuleStatusTone.danger,
        _ => ModuleStatusTone.warning,
      };
}

class _ContractsTab extends StatelessWidget {
  const _ContractsTab({required this.contracts});
  final List<CustomerContractRefDto> contracts;

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    final money = NumberFormat.currency(locale: 'fr', symbol: 'MAD');
    if (contracts.isEmpty) {
      return const ModuleEmptyView(
        icon: Icons.description_outlined,
        message: 'Aucun contrat enregistré pour ce client.',
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: contracts.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) {
        final c = contracts[i];
        return ModuleCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(c.number,
                      style: const TextStyle(
                          fontFamily: 'monospace',
                          color: Colors.black45,
                          fontSize: 12,
                          fontWeight: FontWeight.w800)),
                  const SizedBox(width: 8),
                  if (c.type != null)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: const Color(0xFFEEF0FB),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(c.type!,
                          style: const TextStyle(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF4F46E5))),
                    ),
                ],
              ),
              const SizedBox(height: 6),
              if (c.vehicleLabel != null)
                Text(c.vehicleLabel!,
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 14)),
              const SizedBox(height: 6),
              Text(
                '${c.startDate != null ? dateFmt.format(c.startDate!) : '—'}  →  '
                '${c.endDate != null ? dateFmt.format(c.endDate!) : '—'}',
                style: const TextStyle(color: Colors.black54, fontSize: 12.5),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  ModuleStatusChip(label: c.status, tone: ModuleStatusTone.neutral),
                  const Spacer(),
                  if (c.amount != null && c.amount! > 0)
                    Text(money.format(c.amount),
                        style: const TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 13)),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}

class _PaymentsTab extends StatelessWidget {
  const _PaymentsTab({required this.payments});
  final List<CustomerPaymentRefDto> payments;

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    final money = NumberFormat.currency(locale: 'fr', symbol: 'MAD');
    if (payments.isEmpty) {
      return const ModuleEmptyView(
        icon: Icons.payments_outlined,
        message: 'Aucun paiement enregistré.',
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: payments.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) {
        final p = payments[i];
        return ModuleCard(
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(p.number,
                        style: const TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 11,
                            color: Colors.black45,
                            fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text(
                      money.format(p.amount),
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        decoration: p.isReversed
                            ? TextDecoration.lineThrough
                            : null,
                        color: p.isReversed ? Colors.black38 : null,
                      ),
                    ),
                    Text(
                      [
                        p.method,
                        if (p.type != null) p.type!,
                        if (p.paymentDate != null)
                          dateFmt.format(p.paymentDate!),
                        if (p.isReversed) 'Refusé',
                      ].join(' · '),
                      style: TextStyle(
                        fontSize: 11,
                        color: p.isReversed
                            ? Colors.red.shade700
                            : Colors.black54,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _WalletTab extends StatelessWidget {
  const _WalletTab();
  @override
  Widget build(BuildContext context) {
    return const ModuleEmptyView(
      icon: Icons.account_balance_wallet_outlined,
      message:
          'Portefeuille : crédits et usages — à venir dans un prochain lot.',
    );
  }
}

class _DocumentsTab extends ConsumerWidget {
  const _DocumentsTab({required this.customerId, required this.cases});
  final String customerId;
  final List<KycCaseDto> cases;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // On liste les vrais documents centralisés (entity attachments +
    // générés) pour que chaque ligne porte un ID téléchargeable via
    // `DocumentViewerScreen`.
    final async = ref.watch(entityDocumentsProvider(('customer', customerId)));
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ModuleErrorView(message: '$e'),
      data: (docs) {
        if (docs.isEmpty) {
          return const ModuleEmptyView(
            icon: Icons.folder_outlined,
            message: 'Aucun document attaché.',
          );
        }
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: docs.length,
          separatorBuilder: (_, __) => const SizedBox(height: 8),
          itemBuilder: (_, i) {
            final d = docs[i];
            return ModuleCard(
              onTap: () => Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => DocumentViewerScreen(
                    id: d.id,
                    title: d.title,
                    mimeType: d.mimeType,
                  ),
                ),
              ),
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
                                fontWeight: FontWeight.w800, fontSize: 14)),
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

class _NotesTab extends ConsumerStatefulWidget {
  const _NotesTab({required this.customerId, required this.notes});
  final String customerId;
  final List<CustomerNoteDto> notes;

  @override
  ConsumerState<_NotesTab> createState() => _NotesTabState();
}

class _NotesTabState extends ConsumerState<_NotesTab> {
  final _body = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _body.dispose();
    super.dispose();
  }

  Future<void> _add() async {
    if (_body.text.trim().isEmpty) return;
    setState(() => _busy = true);
    try {
      await ref
          .read(customersRepoProvider)
          .addNote(widget.customerId, _body.text.trim());
      _body.clear();
      ref.invalidate(customerDossierProvider(widget.customerId));
    } catch (_) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Ajout impossible pour le moment.')),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd/MM/yyyy HH:mm', 'fr');
    return Column(
      children: [
        Expanded(
          child: widget.notes.isEmpty
              ? const ModuleEmptyView(
                  icon: Icons.sticky_note_2_outlined,
                  message: 'Aucune note pour ce client.',
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(16),
                  itemCount: widget.notes.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (_, i) {
                    final n = widget.notes[i];
                    return ModuleCard(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(n.body,
                              style: const TextStyle(fontSize: 13.5)),
                          const SizedBox(height: 6),
                          Row(
                            children: [
                              if (n.authorName != null)
                                Text(n.authorName!,
                                    style: const TextStyle(
                                        fontSize: 11,
                                        color: Colors.black45,
                                        fontWeight: FontWeight.w600)),
                              const Spacer(),
                              if (n.createdAt != null)
                                Text(dateFmt.format(n.createdAt!),
                                    style: const TextStyle(
                                        fontSize: 11, color: Colors.black45)),
                            ],
                          ),
                        ],
                      ),
                    );
                  },
                ),
        ),
        Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
          child: SafeArea(
            top: false,
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _body,
                    decoration: InputDecoration(
                      hintText: 'Ajouter une note…',
                      filled: true,
                      fillColor: const Color(0xFFF5F6FB),
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(14),
                        borderSide: BorderSide.none,
                      ),
                    ),
                    onSubmitted: (_) => _busy ? null : _add(),
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filled(
                  onPressed: _busy ? null : _add,
                  icon: _busy
                      ? const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : const Icon(Icons.send),
                  style: IconButton.styleFrom(
                    backgroundColor: const Color(0xFF6366F1),
                    foregroundColor: Colors.white,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _RiskTab extends StatelessWidget {
  const _RiskTab({required this.risk, required this.blacklist});
  final RiskProfileDto? risk;
  final List<BlacklistEntryDto> blacklist;

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        ModuleCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Profil de risque',
                  style:
                      TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              ModuleKV(
                label: 'Niveau',
                value: risk?.level != null
                    ? (kRiskLevelFr[risk!.level] ?? risk!.level)
                    : '—',
              ),
              if (risk?.score != null)
                ModuleKV(
                    label: 'Score',
                    value: risk!.score!.toStringAsFixed(2)),
              ModuleKV(
                label: 'Blacklisté',
                value: (risk?.isBlacklisted ?? false) ? 'Oui' : 'Non',
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        ModuleCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Historique blacklist',
                  style:
                      TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
              const SizedBox(height: 10),
              if (blacklist.isEmpty)
                const Text('Aucune entrée.',
                    style: TextStyle(color: Colors.black54, fontSize: 13))
              else
                for (final b in blacklist)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.block, size: 16, color: Colors.red),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (b.severity != null)
                                Text(
                                    kBlacklistSeverityFr[b.severity!] ??
                                        b.severity!,
                                    style: const TextStyle(
                                        fontWeight: FontWeight.w800,
                                        fontSize: 12)),
                              if (b.reason != null)
                                Text(b.reason!,
                                    style:
                                        const TextStyle(fontSize: 12.5)),
                              if (b.addedAt != null)
                                Text(
                                  'Ajouté le ${dateFmt.format(b.addedAt!)}',
                                  style: const TextStyle(
                                      fontSize: 11, color: Colors.black45),
                                ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
            ],
          ),
        ),
      ],
    );
  }
}

class _AuditTab extends StatelessWidget {
  const _AuditTab();
  @override
  Widget build(BuildContext context) {
    return const ModuleEmptyView(
      icon: Icons.history,
      message: 'Journal d\'audit du client — à venir dans un prochain lot.',
    );
  }
}
