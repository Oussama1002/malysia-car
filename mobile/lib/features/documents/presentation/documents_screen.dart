import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/widgets/module_scaffold.dart';
import '../data/document_dto.dart';
import '../data/documents_repo.dart';

/// Centre documentaire — reproduit `DocumentsCenterPage.tsx` du web :
/// bandeau filtres, cockpit expiration (30 j), repository central.
class DocumentsScreen extends ConsumerStatefulWidget {
  const DocumentsScreen({super.key});

  @override
  ConsumerState<DocumentsScreen> createState() => _DocumentsScreenState();
}

class _DocumentsScreenState extends ConsumerState<DocumentsScreen> {
  @override
  Widget build(BuildContext context) {
    final listAsync = ref.watch(documentsListProvider);
    final expiringAsync = ref.watch(documentsExpiringProvider);
    return Scaffold(
      body: ModuleBackground(
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(documentsListProvider);
              ref.invalidate(documentsExpiringProvider);
            },
            child: ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                ModuleHeader(
                  title: 'Centre documentaire',
                  subtitle:
                      'Référentiel unique des pièces KYC, flotte, sinistres, missions et PDFs générés.',
                  onBack: () => Navigator.of(context).maybePop(),
                ),
                const SizedBox(height: 14),
                const _FiltersCard(),
                const SizedBox(height: 14),
                _ExpiringCard(async: expiringAsync),
                const SizedBox(height: 14),
                _RepositoryCard(async: listAsync),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Carte Filtres
// ---------------------------------------------------------------------------

class _FiltersCard extends ConsumerStatefulWidget {
  const _FiltersCard();

  @override
  ConsumerState<_FiltersCard> createState() => _FiltersCardState();
}

class _FiltersCardState extends ConsumerState<_FiltersCard> {
  late final TextEditingController _category;
  late final TextEditingController _owner;

  @override
  void initState() {
    super.initState();
    final f = ref.read(documentFiltersProvider);
    _category = TextEditingController(text: f.category);
    _owner = TextEditingController(text: f.uploadedBy);
  }

  @override
  void dispose() {
    _category.dispose();
    _owner.dispose();
    super.dispose();
  }

  void _update(DocumentFilters Function(DocumentFilters) f) {
    ref.read(documentFiltersProvider.notifier).update(f);
  }

  @override
  Widget build(BuildContext context) {
    final filters = ref.watch(documentFiltersProvider);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: ModuleCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('FILTRES',
                style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    color: Colors.black45,
                    letterSpacing: 1.3)),
            const SizedBox(height: 10),
            _DropdownRow(
              label: 'Type entité',
              value: filters.entityType,
              options: kDocumentEntityTypeFr,
              onChanged: (v) => _update((s) => s.copyWith(entityType: v)),
            ),
            _TextRow(
              label: 'Catégorie',
              controller: _category,
              hint: 'ex. assurance',
              onSubmit: (v) => _update((s) => s.copyWith(category: v.trim())),
            ),
            _DropdownRow(
              label: 'Statut expiration',
              value: filters.expiryStatus,
              options: kDocumentExpiryStatusFr,
              onChanged: (v) => _update((s) => s.copyWith(expiryStatus: v)),
            ),
            _TextRow(
              label: 'Owner (ID utilisateur)',
              controller: _owner,
              hint: 'uuid',
              onSubmit: (v) => _update((s) => s.copyWith(uploadedBy: v.trim())),
            ),
            _DateRow(
              label: 'Date début',
              value: filters.dateFrom,
              onChanged: (v) => _update((s) => s.copyWith(dateFrom: v)),
            ),
            _DateRow(
              label: 'Date fin',
              value: filters.dateTo,
              onChanged: (v) => _update((s) => s.copyWith(dateTo: v)),
            ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: () {
                  _category.clear();
                  _owner.clear();
                  ref.read(documentFiltersProvider.notifier).state =
                      const DocumentFilters();
                },
                icon: const Icon(Icons.filter_alt_off, size: 16),
                label: const Text('Réinitialiser'),
                style: TextButton.styleFrom(
                  foregroundColor: const Color(0xFF4F46E5),
                  textStyle: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 12),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DropdownRow extends StatelessWidget {
  const _DropdownRow({
    required this.label,
    required this.value,
    required this.options,
    required this.onChanged,
  });
  final String label;
  final String value;
  final Map<String, String> options;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(),
              style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  color: Colors.black45,
                  letterSpacing: 1.1)),
          const SizedBox(height: 6),
          DropdownButtonFormField<String>(
            value: value,
            isExpanded: true,
            decoration: _dec(),
            items: [
              for (final e in options.entries)
                DropdownMenuItem(value: e.key, child: Text(e.value)),
            ],
            onChanged: (v) => onChanged(v ?? ''),
          ),
        ],
      ),
    );
  }
}

class _TextRow extends StatelessWidget {
  const _TextRow({
    required this.label,
    required this.controller,
    required this.onSubmit,
    this.hint,
  });
  final String label;
  final TextEditingController controller;
  final String? hint;
  final ValueChanged<String> onSubmit;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(),
              style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  color: Colors.black45,
                  letterSpacing: 1.1)),
          const SizedBox(height: 6),
          TextFormField(
            controller: controller,
            decoration: _dec(hint: hint),
            onFieldSubmitted: onSubmit,
            onEditingComplete: () {
              onSubmit(controller.text);
              FocusScope.of(context).unfocus();
            },
          ),
        ],
      ),
    );
  }
}

class _DateRow extends StatelessWidget {
  const _DateRow({
    required this.label,
    required this.value,
    required this.onChanged,
  });
  final String label;
  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('yyyy-MM-dd');
    final display = value.isEmpty
        ? '—'
        : DateFormat('dd/MM/yyyy', 'fr').format(DateTime.parse(value));
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(),
              style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  color: Colors.black45,
                  letterSpacing: 1.1)),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: InkWell(
                  onTap: () async {
                    final d = await showDatePicker(
                      context: context,
                      initialDate: value.isEmpty
                          ? DateTime.now()
                          : DateTime.parse(value),
                      firstDate: DateTime(2015),
                      lastDate: DateTime(2100),
                    );
                    if (d != null) onChanged(dateFmt.format(d));
                  },
                  child: InputDecorator(
                    decoration: _dec(),
                    child: Text(display),
                  ),
                ),
              ),
              if (value.isNotEmpty)
                IconButton(
                  onPressed: () => onChanged(''),
                  icon: const Icon(Icons.close, size: 18),
                  tooltip: 'Effacer',
                ),
            ],
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Cockpit expiration (bandeau ambre)
// ---------------------------------------------------------------------------

class _ExpiringCard extends StatelessWidget {
  const _ExpiringCard({required this.async});
  final AsyncValue<List<DocumentDto>> async;

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFFFFFBEB),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: const Color(0xFFFDE68A)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: const [
                Icon(Icons.warning_amber_rounded,
                    color: Color(0xFFB45309), size: 18),
                SizedBox(width: 6),
                Expanded(
                  child: Text('Cockpit expiration (30 jours)',
                      style: TextStyle(
                          color: Color(0xFF78350F),
                          fontWeight: FontWeight.w900,
                          fontSize: 13.5)),
                ),
              ],
            ),
            const SizedBox(height: 10),
            async.when(
              loading: () => const Text('Chargement…',
                  style: TextStyle(
                      color: Color(0xFF92400E), fontSize: 12.5)),
              error: (e, _) => Text('Erreur: $e',
                  style: const TextStyle(
                      color: Color(0xFF92400E), fontSize: 12.5)),
              data: (items) {
                if (items.isEmpty) {
                  return const Text('Aucun document en alerte.',
                      style: TextStyle(
                          color: Color(0xFF92400E), fontSize: 12.5));
                }
                final slice = items.take(12).toList();
                return Column(
                  children: [
                    for (final d in slice)
                      Container(
                        margin: const EdgeInsets.only(bottom: 6),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 8),
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.surface,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: const Color(0xFFFDE68A)),
                        ),
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(d.title,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: const TextStyle(
                                          fontWeight: FontWeight.w800,
                                          fontSize: 13)),
                                  Text(
                                    '${docEntityLabel(d.entityType)} · ${d.expiryDate != null ? dateFmt.format(d.expiryDate!) : 'Sans échéance'}',
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: const TextStyle(
                                        color: Colors.black54,
                                        fontSize: 11.5),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Repository central (liste)
// ---------------------------------------------------------------------------

class _RepositoryCard extends ConsumerWidget {
  const _RepositoryCard({required this.async});
  final AsyncValue<List<DocumentDto>> async;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: ModuleCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text('Repository central',
                      style: TextStyle(
                          fontWeight: FontWeight.w900, fontSize: 14)),
                ),
                Text(
                  '${async.asData?.value.length ?? 0} élément(s)',
                  style: const TextStyle(
                      color: Colors.black45, fontSize: 11.5),
                ),
              ],
            ),
            const SizedBox(height: 10),
            async.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => Text('Erreur: $e',
                  style: const TextStyle(color: Colors.redAccent)),
              data: (rows) {
                if (rows.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: 20),
                    child: Center(
                      child: Text('Aucun document trouvé.',
                          style: TextStyle(
                              color: Colors.black45, fontSize: 13)),
                    ),
                  );
                }
                return Column(
                  children: [
                    for (final d in rows)
                      _DocumentLine(
                        doc: d,
                        onOpen: () async {
                          final url = ref
                              .read(documentsRepoProvider)
                              .downloadUrl(d.id);
                          final ok = await launchUrl(Uri.parse(url),
                              mode: LaunchMode.externalApplication);
                          if (!ok && context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                    content: Text(
                                        'Impossible d\'ouvrir le document.')));
                          }
                        },
                      ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _DocumentLine extends StatelessWidget {
  const _DocumentLine({required this.doc, required this.onOpen});
  final DocumentDto doc;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    final bucket = doc.expiryBucket;
    final (bucketLabel, bucketColor) = switch (bucket) {
      'expired' => ('Expiré', const Color(0xFFB91C1C)),
      'expiring_soon' => ('Expire bientôt', const Color(0xFFB45309)),
      'missing' => ('Sans échéance', const Color(0xFF64748B)),
      'ok' => ('OK', const Color(0xFF059669)),
      _ => (null, null),
    };
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Theme.of(context).dividerColor),
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
                    Text(doc.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 13.5)),
                    const SizedBox(height: 3),
                    Text(
                      '${doc.category ?? '—'} · ${docEntityLabel(doc.entityType)} #${doc.entityId ?? '—'} · ${doc.source}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          color: Colors.black54, fontSize: 11.5),
                    ),
                  ],
                ),
              ),
              _SourcePill(source: doc.source),
            ],
          ),
          const SizedBox(height: 10),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (doc.expiryDate != null)
                _MiniBadge(
                    label: 'Expire : ${dateFmt.format(doc.expiryDate!)}',
                    bg: const Color(0xFFF1F5F9),
                    fg: const Color(0xFF334155)),
              if (bucketLabel != null && bucketColor != null)
                _MiniBadge(
                    label: bucketLabel,
                    bg: bucketColor.withOpacity(0.12),
                    fg: bucketColor),
              const Spacer(),
              OutlinedButton.icon(
                onPressed: onOpen,
                icon: const Icon(Icons.open_in_new, size: 14),
                label: const Text('Ouvrir'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: const Color(0xFF4F46E5),
                  side: const BorderSide(color: Color(0xFFC7D2FE)),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 4),
                  minimumSize: const Size(0, 32),
                  textStyle: const TextStyle(
                      fontWeight: FontWeight.w800, fontSize: 11.5),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _SourcePill extends StatelessWidget {
  const _SourcePill({required this.source});
  final String source;

  @override
  Widget build(BuildContext context) {
    final isGenerated = source == 'generated';
    final bg = isGenerated
        ? const Color(0xFFEDE9FE)
        : const Color(0xFFE0E7FF);
    final fg = isGenerated
        ? const Color(0xFF6D28D9)
        : const Color(0xFF3730A3);
    final label = isGenerated ? 'Généré' : 'Uploadé';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(label,
          style: TextStyle(
              color: fg, fontSize: 9.5, fontWeight: FontWeight.w900)),
    );
  }
}

class _MiniBadge extends StatelessWidget {
  const _MiniBadge({required this.label, required this.bg, required this.fg});
  final String label;
  final Color bg;
  final Color fg;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(label,
          style: TextStyle(
              color: fg, fontSize: 10, fontWeight: FontWeight.w800)),
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



