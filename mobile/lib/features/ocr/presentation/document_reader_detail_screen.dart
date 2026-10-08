import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/module_scaffold.dart';
import '../data/document_reader_dto.dart';
import '../data/document_reader_repo.dart';
import 'document_reader_screen.dart' show statusChipFor;

/// Fiche d'un document OCR : aperçu + texte brut + champs éditables +
/// rattachement + boutons Valider / Supprimer / Réessayer, exactement
/// comme la vue détail du web `DocumentReaderPage.tsx`.
class DocumentReaderDetailScreen extends ConsumerStatefulWidget {
  const DocumentReaderDetailScreen({super.key, required this.id});
  final String id;

  @override
  ConsumerState<DocumentReaderDetailScreen> createState() =>
      _DocumentReaderDetailScreenState();
}

class _DocumentReaderDetailScreenState
    extends ConsumerState<DocumentReaderDetailScreen> {
  final Map<String, TextEditingController> _controllers = {};
  String _lastInitKey = '';
  String _linkType = '';
  final _linkId = TextEditingController();
  bool _busy = false;
  String? _busyLabel;

  @override
  void dispose() {
    for (final c in _controllers.values) {
      c.dispose();
    }
    _linkId.dispose();
    super.dispose();
  }

  void _syncControllers(ReaderDocumentDto doc) {
    final fields = kReaderFieldsByType[doc.documentType] ?? const [];
    final src = doc.extraction?.sourceData ?? const {};
    final key = '${doc.id}:${doc.extraction?.id ?? ''}:${src.hashCode}';
    if (key == _lastInitKey && _controllers.length == fields.length) return;
    _lastInitKey = key;

    for (final c in _controllers.values) {
      c.dispose();
    }
    _controllers.clear();
    for (final f in fields) {
      _controllers[f] =
          TextEditingController(text: stringifyValue(src[f]));
    }
    _linkType = doc.linkedEntityType ?? '';
    _linkId.text = doc.linkedEntityId ?? '';
  }

  Future<void> _reExtract(ReaderDocumentDto doc) async {
    setState(() {
      _busy = true;
      _busyLabel = 'Nouvelle extraction…';
    });
    try {
      final repo = ref.read(documentReaderRepoProvider);
      await repo.extract(id: doc.id, documentType: doc.documentType);
      final latest = await repo.pollUntilDone(doc.id);
      ref.invalidate(documentReaderDetailProvider(doc.id));
      ref.invalidate(documentReaderListProvider);
      // Force la resynchro des contrôleurs à partir des nouvelles données.
      _lastInitKey = '';
      _syncControllers(latest);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Erreur : $e')));
      }
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _busyLabel = null;
        });
      }
    }
  }

  Future<void> _save(ReaderDocumentDto doc) async {
    setState(() {
      _busy = true;
      _busyLabel = 'Enregistrement…';
    });
    try {
      final data = <String, dynamic>{};
      for (final e in _controllers.entries) {
        data[e.key] = e.value.text;
      }
      await ref.read(documentReaderRepoProvider).validate(
            id: doc.id,
            validatedData: data,
            entityType: _linkType.isEmpty ? null : _linkType,
            entityId: _linkId.text.trim().isEmpty ? null : _linkId.text.trim(),
          );
      ref.invalidate(documentReaderDetailProvider(doc.id));
      ref.invalidate(documentReaderListProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Document validé.')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Erreur : $e')));
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _busyLabel = null;
        });
      }
    }
  }

  Future<void> _delete(ReaderDocumentDto doc) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Supprimer ce document ?'),
        content: const Text('Cette action est définitive.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Annuler')),
          FilledButton(
              style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFFE11D48)),
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Supprimer')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ref.read(documentReaderRepoProvider).remove(doc.id);
      ref.invalidate(documentReaderListProvider);
      if (!mounted) return;
      Navigator.of(context).maybePop();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Erreur : $e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(documentReaderDetailProvider(widget.id));
    return Scaffold(
      body: ModuleBackground(
        child: SafeArea(
          child: async.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => ModuleErrorView(message: '$e'),
            data: (doc) {
              _syncControllers(doc);
              return ListView(
                padding: const EdgeInsets.only(bottom: 24),
                children: [
                  _Header(doc: doc, onBack: () => Navigator.of(context).maybePop()),
                  _SummaryCard(
                    doc: doc,
                    busy: _busy,
                    busyLabel: _busyLabel,
                    onReExtract: () => _reExtract(doc),
                    onDelete: () => _delete(doc),
                  ),
                  const SizedBox(height: 12),
                  _PreviewCard(doc: doc),
                  const SizedBox(height: 12),
                  _RawTextCard(doc: doc),
                  const SizedBox(height: 12),
                  _FieldsCard(
                    doc: doc,
                    controllers: _controllers,
                    linkType: _linkType,
                    onLinkTypeChanged: (v) => setState(() => _linkType = v),
                    linkIdController: _linkId,
                    busy: _busy,
                    onSave: () => _save(doc),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

class _Header extends StatelessWidget {
  const _Header({required this.doc, required this.onBack});
  final ReaderDocumentDto doc;
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
                const Text('← Document Reader',
                    style:
                        TextStyle(color: Colors.black45, fontSize: 11.5)),
                Text(doc.fileName,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontWeight: FontWeight.w900, fontSize: 17)),
              ],
            ),
          ),
          statusChipFor(doc.status),
        ],
      ),
    );
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.doc,
    required this.busy,
    required this.busyLabel,
    required this.onReExtract,
    required this.onDelete,
  });

  final ReaderDocumentDto doc;
  final bool busy;
  final String? busyLabel;
  final VoidCallback onReExtract;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final conf = doc.extraction?.confidenceScore;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: ModuleCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              '${readerTypeLabel(doc.documentType)} · ${doc.status}${conf != null ? ' · confiance $conf' : ''}',
              style: const TextStyle(color: Colors.black54, fontSize: 12),
            ),
            if (doc.errorMessage != null && doc.errorMessage!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(doc.errorMessage!,
                  style: const TextStyle(
                      color: Color(0xFFE11D48),
                      fontSize: 12,
                      fontWeight: FontWeight.w700)),
            ],
            const SizedBox(height: 10),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                OutlinedButton.icon(
                  onPressed: busy ? null : onReExtract,
                  icon: const Icon(Icons.replay, size: 15),
                  label: Text(busy && busyLabel != null
                      ? busyLabel!
                      : 'Réessayer l\'extraction'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF334155),
                    side: const BorderSide(color: Color(0xFFCBD5E1)),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 6),
                    minimumSize: const Size(0, 36),
                    textStyle: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 11.5),
                  ),
                ),
                OutlinedButton.icon(
                  onPressed: busy ? null : onDelete,
                  icon: const Icon(Icons.delete_outline, size: 15),
                  label: const Text('Supprimer'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFFB91C1C),
                    side: const BorderSide(color: Color(0xFFFECACA)),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 6),
                    minimumSize: const Size(0, 36),
                    textStyle: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 11.5),
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

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

class _PreviewCard extends ConsumerWidget {
  const _PreviewCard({required this.doc});
  final ReaderDocumentDto doc;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final url = ref.read(documentReaderRepoProvider).previewUrl(doc.id);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: ModuleCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('APERÇU',
                style: TextStyle(
                    color: Colors.black45,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.3)),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: doc.isImage
                  ? Image.network(
                      url,
                      fit: BoxFit.contain,
                      errorBuilder: (_, __, ___) => _previewFallback(doc),
                    )
                  : _previewFallback(doc),
            ),
          ],
        ),
      ),
    );
  }

  Widget _previewFallback(ReaderDocumentDto doc) {
    return Container(
      height: 160,
      color: const Color(0xFFF1F5F9),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              doc.isPdf ? Icons.picture_as_pdf : Icons.insert_drive_file,
              size: 36,
              color: Colors.black45,
            ),
            const SizedBox(height: 6),
            Text(
              doc.isPdf ? 'PDF (aperçu non supporté ici)' : 'Aperçu indisponible',
              style:
                  const TextStyle(color: Colors.black54, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Raw OCR text
// ---------------------------------------------------------------------------

class _RawTextCard extends StatelessWidget {
  const _RawTextCard({required this.doc});
  final ReaderDocumentDto doc;

  @override
  Widget build(BuildContext context) {
    final raw = doc.extraction?.rawText ?? '';
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: ModuleCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('TEXTE OCR BRUT',
                style: TextStyle(
                    color: Colors.black45,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.3)),
            const SizedBox(height: 8),
            Container(
              height: 200,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: SingleChildScrollView(
                child: Text(
                  raw.isEmpty
                      ? (doc.status == 'failed'
                          ? 'Échec OCR — réessayez.'
                          : 'Aucun texte extrait pour le moment.')
                      : raw,
                  style: const TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 11,
                      color: Color(0xFF334155)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Editable fields + rattachement + Valider
// ---------------------------------------------------------------------------

class _FieldsCard extends StatelessWidget {
  const _FieldsCard({
    required this.doc,
    required this.controllers,
    required this.linkType,
    required this.onLinkTypeChanged,
    required this.linkIdController,
    required this.busy,
    required this.onSave,
  });

  final ReaderDocumentDto doc;
  final Map<String, TextEditingController> controllers;
  final String linkType;
  final ValueChanged<String> onLinkTypeChanged;
  final TextEditingController linkIdController;
  final bool busy;
  final VoidCallback onSave;

  @override
  Widget build(BuildContext context) {
    final fields = kReaderFieldsByType[doc.documentType] ?? const [];
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: ModuleCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: const [
                Expanded(
                  child: Text('CHAMPS EXTRAITS',
                      style: TextStyle(
                          color: Colors.black45,
                          fontSize: 10.5,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.3)),
                ),
              ],
            ),
            const SizedBox(height: 4),
            const Text(
              'Modifiez librement avant validation. Rien n\'est enregistré automatiquement.',
              style: TextStyle(color: Colors.black45, fontSize: 11),
            ),
            const SizedBox(height: 10),
            if (fields.isEmpty)
              const Text(
                'Pas de schéma de champs prédéfini pour ce type. Consultez le texte brut.',
                style: TextStyle(color: Colors.black45, fontSize: 11.5),
              )
            else
              Column(
                children: [
                  for (final f in fields)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(readerFieldLabel(f),
                              style: const TextStyle(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.black54)),
                          const SizedBox(height: 4),
                          TextField(
                            controller: controllers[f],
                            decoration: _dec(),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            const SizedBox(height: 10),
            const Text('RATTACHER À',
                style: TextStyle(
                    color: Colors.black45,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.3)),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              value: linkType,
              isExpanded: true,
              decoration: _dec(),
              items: [
                for (final o in kReaderLinkEntities)
                  DropdownMenuItem(
                      value: o['value'], child: Text(o['label']!)),
              ],
              onChanged: busy ? null : (v) => onLinkTypeChanged(v ?? ''),
            ),
            const SizedBox(height: 10),
            const Text('IDENTIFIANT (UUID)',
                style: TextStyle(
                    color: Colors.black45,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.3)),
            const SizedBox(height: 6),
            TextField(
              controller: linkIdController,
              enabled: linkType.isNotEmpty && !busy,
              decoration: _dec(hint: 'ex: 9b0d2c…'),
            ),
            const SizedBox(height: 14),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton.icon(
                onPressed: (busy ||
                        doc.status == 'failed' ||
                        doc.extraction == null)
                    ? null
                    : onSave,
                icon: const Icon(Icons.check_circle_outline, size: 16),
                label: Text(busy ? 'Enregistrement…' : 'Valider et enregistrer'),
                style: FilledButton.styleFrom(
                  backgroundColor: const Color(0xFF10B981),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 10),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
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

InputDecoration _dec({String? hint}) {
  return InputDecoration(
    hintText: hint,
    isDense: true,
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: const BorderSide(color: Color(0x33888888)),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: const BorderSide(color: Color(0x33888888)),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(10),
      borderSide: const BorderSide(color: Color(0xFF4F46E5), width: 1.5),
    ),
  );
}

