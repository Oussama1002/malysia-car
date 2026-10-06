import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/widgets/module_scaffold.dart';
import '../data/website_lead_dto.dart';
import '../data/website_leads_repo.dart';

/// Demandes du site — reproduit à l'identique la page web `WebsiteLeadsPage` :
/// titre, badge compteur, recherche + filtre statut, cartes complètes (avec
/// infos de prise en charge) et actions de qualification.
class WebsiteLeadsScreen extends ConsumerStatefulWidget {
  const WebsiteLeadsScreen({super.key});

  @override
  ConsumerState<WebsiteLeadsScreen> createState() =>
      _WebsiteLeadsScreenState();
}

class _WebsiteLeadsScreenState extends ConsumerState<WebsiteLeadsScreen> {
  late final TextEditingController _search =
      TextEditingController(text: ref.read(websiteLeadsFiltersProvider).search);
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _onSearchChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      ref
          .read(websiteLeadsFiltersProvider.notifier)
          .update((s) => s.copyWith(search: value));
    });
  }

  Future<void> _update(String id, String status) async {
    try {
      await ref.read(websiteLeadsRepoProvider).updateStatus(id, status);
      ref.invalidate(websiteLeadsListProvider);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Mise à jour impossible.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(websiteLeadsListProvider);
    final filters = ref.watch(websiteLeadsFiltersProvider);
    return Scaffold(
      body: ModuleBackground(
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: () async => ref.invalidate(websiteLeadsListProvider),
            child: ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                _TopBar(
                  onBack: () => Navigator.of(context).maybePop(),
                  newCount: async.value?.newCount ?? 0,
                ),
                const SizedBox(height: 10),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 20),
                  child: Text('Demandes du site',
                      style: TextStyle(
                          fontSize: 28, fontWeight: FontWeight.w900)),
                ),
                const SizedBox(height: 4),
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 20),
                  child: Text(
                    'Les réservations demandées depuis le site public. Rappelez le client, puis créez sa fiche et sa réservation.',
                    style: TextStyle(
                        color: Colors.black54, fontSize: 13, height: 1.4),
                  ),
                ),
                const SizedBox(height: 16),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: ModuleSearchField(
                    controller: _search,
                    hint: 'Rechercher (nom, téléphone, email)…',
                    onChanged: _onSearchChanged,
                  ),
                ),
                const SizedBox(height: 12),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: _StatusDropdown(
                    selected: filters.status,
                    onChanged: (v) => ref
                        .read(websiteLeadsFiltersProvider.notifier)
                        .update((s) => s.copyWith(status: v)),
                  ),
                ),
                const SizedBox(height: 16),
                async.when(
                  loading: () => const Padding(
                    padding: EdgeInsets.symmetric(vertical: 40),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                  error: (e, _) => ModuleErrorView(message: '$e'),
                  data: (page) {
                    if (page.leads.isEmpty) {
                      return const Padding(
                        padding: EdgeInsets.symmetric(horizontal: 20),
                        child: _EmptyLeadsCard(),
                      );
                    }
                    return Column(
                      children: [
                        for (final l in page.leads)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                            child: _LeadCard(
                              lead: l,
                              onUpdate: _update,
                            ),
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

class _TopBar extends StatelessWidget {
  const _TopBar({required this.onBack, required this.newCount});
  final VoidCallback onBack;
  final int newCount;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 20, 0),
      child: Row(
        children: [
          IconButton(onPressed: onBack, icon: const Icon(Icons.arrow_back)),
          const Text('Opérations',
              style: TextStyle(color: Colors.black54, fontSize: 14)),
          const Icon(Icons.chevron_right, color: Colors.black26, size: 18),
          const Flexible(
            child: Text('Demandes du site',
                overflow: TextOverflow.ellipsis,
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
          ),
          const Spacer(),
          if (newCount > 0)
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.red.shade100,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                '$newCount demande${newCount > 1 ? 's' : ''} à traiter',
                style: TextStyle(
                    color: Colors.red.shade700,
                    fontWeight: FontWeight.w800,
                    fontSize: 11.5),
              ),
            ),
        ],
      ),
    );
  }
}

class _StatusDropdown extends StatelessWidget {
  const _StatusDropdown({required this.selected, required this.onChanged});
  final String selected;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final currentLabel = selected.isEmpty
        ? 'Tous les statuts'
        : kLeadStatusFr[selected] ?? selected;
    return InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: () async {
        final chosen = await showModalBottomSheet<String>(
          context: context,
          builder: (_) => SafeArea(
            child: ListView(
              shrinkWrap: true,
              children: [
                const Padding(
                  padding: EdgeInsets.all(16),
                  child: Text('Statut',
                      style: TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 14)),
                ),
                _StatusOption(
                  label: 'Tous les statuts',
                  value: '',
                  selected: selected.isEmpty,
                ),
                for (final e in kLeadStatusFr.entries)
                  _StatusOption(
                    label: e.value,
                    value: e.key,
                    selected: selected == e.key,
                  ),
              ],
            ),
          ),
        );
        if (chosen != null) onChanged(chosen);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.grey.shade200),
        ),
        child: Row(
          children: [
            const Icon(Icons.filter_list, color: Colors.black45, size: 18),
            const SizedBox(width: 10),
            Expanded(
              child: Text(currentLabel,
                  style: const TextStyle(
                      fontWeight: FontWeight.w700, fontSize: 13.5)),
            ),
            const Icon(Icons.arrow_drop_down, color: Colors.black45),
          ],
        ),
      ),
    );
  }
}

class _StatusOption extends StatelessWidget {
  const _StatusOption({
    required this.label,
    required this.value,
    required this.selected,
  });

  final String label;
  final String value;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(
        selected ? Icons.radio_button_checked : Icons.radio_button_off,
        color: selected ? const Color(0xFF6366F1) : Colors.black45,
      ),
      title: Text(label),
      onTap: () => Navigator.of(context).pop(value),
    );
  }
}

class _EmptyLeadsCard extends StatelessWidget {
  const _EmptyLeadsCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(40),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.grey.shade200, style: BorderStyle.solid),
      ),
      child: const Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.inbox_outlined, size: 56, color: Colors.black26),
          SizedBox(height: 12),
          Text("Aucune demande pour l'instant.",
              style: TextStyle(color: Colors.black45, fontSize: 13.5)),
        ],
      ),
    );
  }
}

class _LeadCard extends StatelessWidget {
  const _LeadCard({required this.lead, required this.onUpdate});
  final WebsiteLeadDto lead;
  final Future<void> Function(String id, String status) onUpdate;

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    final dateTimeFmt = DateFormat('dd/MM/yyyy HH:mm', 'fr');
    return ModuleCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Nom + statut en haut, date reçue à droite.
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        Text(lead.fullName,
                            style: const TextStyle(
                                fontWeight: FontWeight.w900, fontSize: 15.5)),
                        _StatusPill(status: lead.status),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 12,
                      runSpacing: 4,
                      children: [
                        InkWell(
                          onTap: () =>
                              launchUrl(Uri.parse('tel:${lead.phone}')),
                          child: Text(lead.phone,
                              style: const TextStyle(
                                  color: Color(0xFF4F46E5),
                                  fontWeight: FontWeight.w700,
                                  fontSize: 13.5)),
                        ),
                        if (lead.email != null && lead.email!.isNotEmpty)
                          InkWell(
                            onTap: () =>
                                launchUrl(Uri.parse('mailto:${lead.email}')),
                            child: Text(lead.email!,
                                style: const TextStyle(
                                    color: Colors.black54,
                                    fontSize: 13)),
                          ),
                        if (lead.city != null && lead.city!.isNotEmpty)
                          Text(lead.city!,
                              style: const TextStyle(
                                  color: Colors.black54, fontSize: 13)),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 10),
              Text(
                lead.createdAt != null
                    ? 'Reçue le ${dateTimeFmt.format(lead.createdAt!)}'
                    : '',
                textAlign: TextAlign.right,
                style: const TextStyle(fontSize: 10.5, color: Colors.black38),
              ),
            ],
          ),
          const SizedBox(height: 14),

          // Grille 3 colonnes : véhicule, départ, retour.
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _InfoBlock(
                  label: 'Véhicule souhaité',
                  value: (lead.vehicleLabel == null ||
                          lead.vehicleLabel!.isEmpty)
                      ? 'Peu importe'
                      : lead.vehicleLabel!,
                ),
              ),
              Expanded(
                child: _InfoBlock(
                  label: 'Départ',
                  value: lead.pickupAt != null
                      ? dateFmt.format(lead.pickupAt!)
                      : '—',
                ),
              ),
              Expanded(
                child: _InfoBlock(
                  label: 'Retour',
                  value: lead.returnAt != null
                      ? dateFmt.format(lead.returnAt!)
                      : '—',
                ),
              ),
            ],
          ),

          if (lead.message != null && lead.message!.isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFFF5F6FB),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(lead.message!,
                  style: const TextStyle(
                      fontSize: 13, color: Colors.black87)),
            ),
          ],

          // Carte « Pris en charge par » quand le statut n'est pas Nouvelle.
          if (lead.status != 'new' && lead.handler != null) ...[
            const SizedBox(height: 12),
            _HandlerCard(
                handler: lead.handler!,
                handledAt: lead.handledAt,
                fmt: dateTimeFmt),
          ],

          const SizedBox(height: 12),
          _ActionButtons(lead: lead, onUpdate: onUpdate),
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
      'new' => (Colors.red.shade100, Colors.red.shade700),
      'contacted' => (Colors.amber.shade100, Colors.amber.shade800),
      'converted' => (Colors.green.shade100, Colors.green.shade700),
      'rejected' => (Colors.grey.shade200, Colors.grey.shade600),
      _ => (Colors.blueGrey.shade100, Colors.blueGrey.shade700),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        leadStatusFr(status),
        style: TextStyle(
            color: fg,
            fontSize: 10.5,
            fontWeight: FontWeight.w900,
            letterSpacing: 0.3),
      ),
    );
  }
}

class _InfoBlock extends StatelessWidget {
  const _InfoBlock({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(),
            style: const TextStyle(
                fontSize: 9.5,
                fontWeight: FontWeight.w800,
                color: Colors.black45,
                letterSpacing: 1.2)),
        const SizedBox(height: 2),
        Text(value,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
                fontSize: 12.5, fontWeight: FontWeight.w700)),
      ],
    );
  }
}

class _HandlerCard extends StatelessWidget {
  const _HandlerCard({
    required this.handler,
    required this.handledAt,
    required this.fmt,
  });

  final WebsiteLeadHandlerDto handler;
  final DateTime? handledAt;
  final DateFormat fmt;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.amber.shade50,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.amber.shade100),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 20,
            backgroundColor: Colors.amber.shade600,
            child: Text(
              handler.initials,
              style: const TextStyle(
                  color: Colors.white, fontWeight: FontWeight.w900, fontSize: 13),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('PRIS EN CHARGE PAR',
                    style: TextStyle(
                        fontSize: 9.5,
                        fontWeight: FontWeight.w900,
                        color: Colors.amber.shade800,
                        letterSpacing: 1.2)),
                const SizedBox(height: 2),
                Text(handler.displayName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 13.5)),
                if (handler.email != null && handler.email!.isNotEmpty)
                  InkWell(
                    onTap: () =>
                        launchUrl(Uri.parse('mailto:${handler.email}')),
                    child: Text(
                      handler.email!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                          fontSize: 11,
                          color: Colors.amber.shade800,
                          decoration: TextDecoration.underline),
                    ),
                  ),
              ],
            ),
          ),
          if (handledAt != null)
            Text(fmt.format(handledAt!),
                textAlign: TextAlign.right,
                style: TextStyle(
                    fontSize: 10.5, color: Colors.amber.shade800)),
        ],
      ),
    );
  }
}

class _ActionButtons extends StatelessWidget {
  const _ActionButtons({required this.lead, required this.onUpdate});
  final WebsiteLeadDto lead;
  final Future<void> Function(String, String) onUpdate;

  @override
  Widget build(BuildContext context) {
    final buttons = <Widget>[];
    if (lead.status != 'contacted') {
      buttons.add(_GhostAction(
        label: 'Client contacté',
        onTap: () => onUpdate(lead.id, 'contacted'),
      ));
    }
    if (lead.status != 'converted') {
      buttons.add(_PrimaryAction(
        label: 'Transformée en réservation',
        onTap: () => onUpdate(lead.id, 'converted'),
      ));
    }
    if (lead.status != 'rejected') {
      buttons.add(_GhostAction(
        label: 'Sans suite',
        onTap: () => onUpdate(lead.id, 'rejected'),
        destructive: true,
      ));
    }
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: buttons,
    );
  }
}

class _GhostAction extends StatelessWidget {
  const _GhostAction({
    required this.label,
    required this.onTap,
    this.destructive = false,
  });
  final String label;
  final VoidCallback onTap;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final color = destructive ? Colors.red.shade700 : Colors.black87;
    return OutlinedButton(
      onPressed: onTap,
      style: OutlinedButton.styleFrom(
        foregroundColor: color,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        side: BorderSide(color: destructive ? Colors.red.shade200 : Colors.grey.shade300),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 11.5),
        minimumSize: const Size(0, 36),
      ),
      child: Text(label),
    );
  }
}

class _PrimaryAction extends StatelessWidget {
  const _PrimaryAction({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: onTap,
      style: FilledButton.styleFrom(
        backgroundColor: const Color(0xFF6366F1),
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 11.5),
        minimumSize: const Size(0, 36),
      ),
      child: Text(label),
    );
  }
}
