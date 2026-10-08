import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/widgets/module_scaffold.dart';
import '../data/document_reader_dto.dart';
import '../data/document_reader_repo.dart';
import 'document_reader_detail_screen.dart';

/// Softnovation Document Reader — version mobile.
///
/// Reprend le flux exact du web `DocumentReaderPage.tsx` :
/// 1) Choix d'un type attendu + bouton Caméra / Galerie
/// 2) Upload → l'app lance automatiquement l'OCR → poll jusqu'à `extracted`
/// 3) Ouvre la fiche de validation (fichier + texte brut + champs éditables
///    + rattachement à une entité + Valider / Supprimer / Réessayer).
class DocumentReaderScreen extends ConsumerStatefulWidget {
  const DocumentReaderScreen({super.key});

  @override
  ConsumerState<DocumentReaderScreen> createState() =>
      _DocumentReaderScreenState();
}

class _DocumentReaderScreenState extends ConsumerState<DocumentReaderScreen> {
  String _hintedType = 'cin';
  bool _busy = false;
  String? _busyLabel;
  String? _error;

  Future<void> _pick(ImageSource source) async {
    try {
      final picker = ImagePicker();
      final x = await picker.pickImage(source: source, imageQuality: 90);
      if (x == null) return;
      await _upload(File(x.path));
    } catch (e) {
      setState(() => _error = '$e');
    }
  }

  Future<void> _upload(File file) async {
    setState(() {
      _busy = true;
      _busyLabel = 'Téléversement…';
      _error = null;
    });
    try {
      final repo = ref.read(documentReaderRepoProvider);
      final uploaded =
          await repo.upload(file: file, documentType: _hintedType);
      ref.invalidate(documentReaderListProvider);
      setState(() => _busyLabel = 'OCR en cours…');
      await repo.extract(id: uploaded.id, documentType: _hintedType);
      final finalDoc = await repo.pollUntilDone(uploaded.id);
      ref.invalidate(documentReaderListProvider);
      ref.invalidate(documentReaderDetailProvider(uploaded.id));
      if (!mounted) return;
      Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => DocumentReaderDetailScreen(id: finalDoc.id),
      ));
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) {
        setState(() {
          _busy = false;
          _busyLabel = null;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(documentReaderListProvider);
    return Scaffold(
      body: ModuleBackground(
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: () async =>
                ref.invalidate(documentReaderListProvider),
            child: ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                ModuleHeader(
                  title: 'Softnovation Document Reader',
                  subtitle:
                      'Numérisation, OCR (Tesseract) et extraction automatique des champs. L\'admin valide avant enregistrement.',
                  onBack: () => Navigator.of(context).maybePop(),
                ),
                const SizedBox(height: 12),
                _UploadCard(
                  hintedType: _hintedType,
                  onTypeChanged: (v) => setState(() => _hintedType = v),
                  onGallery: () => _pick(ImageSource.gallery),
                  onCamera: () => _pick(ImageSource.camera),
                  busy: _busy,
                  busyLabel: _busyLabel,
                  error: _error,
                ),
                const SizedBox(height: 14),
                _ListCard(async: async),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Upload card
// ---------------------------------------------------------------------------

class _UploadCard extends StatelessWidget {
  const _UploadCard({
    required this.hintedType,
    required this.onTypeChanged,
    required this.onGallery,
    required this.onCamera,
    required this.busy,
    required this.busyLabel,
    required this.error,
  });

  final String hintedType;
  final ValueChanged<String> onTypeChanged;
  final VoidCallback onGallery;
  final VoidCallback onCamera;
  final bool busy;
  final String? busyLabel;
  final String? error;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: ModuleCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('NOUVEAU DOCUMENT',
                style: TextStyle(
                    color: Colors.black45,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.3)),
            const SizedBox(height: 10),
            const Text('Type attendu',
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: Colors.black54)),
            const SizedBox(height: 6),
            DropdownButtonFormField<String>(
              value: hintedType,
              isExpanded: true,
              decoration: _dec(),
              items: [
                for (final e in kReaderTypeLabels.entries)
                  DropdownMenuItem(value: e.key, child: Text(e.value)),
              ],
              onChanged: busy ? null : (v) => onTypeChanged(v ?? 'cin'),
            ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: const Color(0xFFCBD5E1),
                  style: BorderStyle.solid,
                  width: 1.5,
                ),
              ),
              child: Column(
                children: [
                  const Icon(Icons.cloud_upload_outlined,
                      size: 36, color: Color(0xFF4F46E5)),
                  const SizedBox(height: 6),
                  const Text('Choisissez un fichier à analyser',
                      style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 13,
                          color: Color(0xFF334155))),
                  const SizedBox(height: 2),
                  const Text(
                    'Formats acceptés : JPG, JPEG, PNG · 15 Mo max',
                    style:
                        TextStyle(fontSize: 11, color: Colors.black45),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    alignment: WrapAlignment.center,
                    children: [
                      FilledButton.icon(
                        onPressed: busy ? null : onGallery,
                        icon: const Icon(Icons.photo_library_outlined,
                            size: 16),
                        label: const Text('Choisir une image'),
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF4F46E5),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 10),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10)),
                          textStyle: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 11.5),
                        ),
                      ),
                      OutlinedButton.icon(
                        onPressed: busy ? null : onCamera,
                        icon: const Icon(Icons.photo_camera_outlined,
                            size: 16),
                        label: const Text('Prendre une photo'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: const Color(0xFF334155),
                          padding: const EdgeInsets.symmetric(
                              horizontal: 14, vertical: 10),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10)),
                          side: const BorderSide(color: Color(0xFFCBD5E1)),
                          textStyle: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 11.5),
                        ),
                      ),
                    ],
                  ),
                  if (busy) ...[
                    const SizedBox(height: 10),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(strokeWidth: 2)),
                        const SizedBox(width: 8),
                        Text(busyLabel ?? 'En cours…',
                            style: const TextStyle(
                                color: Color(0xFF4F46E5),
                                fontSize: 11.5,
                                fontWeight: FontWeight.w800)),
                      ],
                    ),
                  ],
                  if (error != null) ...[
                    const SizedBox(height: 10),
                    Text(error!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            color: Color(0xFFE11D48),
                            fontSize: 11.5,
                            fontWeight: FontWeight.w700)),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Documents list
// ---------------------------------------------------------------------------

class _ListCard extends StatelessWidget {
  const _ListCard({required this.async});
  final AsyncValue<List<ReaderDocumentDto>> async;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: ModuleCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('DOCUMENTS RÉCENTS',
                style: TextStyle(
                    color: Colors.black45,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.3)),
            const SizedBox(height: 10),
            async.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 20),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => Text('Erreur: $e',
                  style: const TextStyle(color: Colors.redAccent)),
              data: (docs) {
                if (docs.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: 16),
                    child: Text('Aucun document pour le moment.',
                        style: TextStyle(
                            color: Colors.black45, fontSize: 12.5)),
                  );
                }
                return Column(
                  children: [
                    for (final d in docs)
                      _DocumentTile(
                        doc: d,
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) =>
                                DocumentReaderDetailScreen(id: d.id),
                          ),
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

class _DocumentTile extends StatelessWidget {
  const _DocumentTile({required this.doc, required this.onTap});
  final ReaderDocumentDto doc;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Theme.of(context).dividerColor),
          ),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(doc.fileName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 13)),
                    const SizedBox(height: 3),
                    Text(readerTypeLabel(doc.documentType),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            color: Colors.black54, fontSize: 11.5)),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              statusChipFor(doc.status),
            ],
          ),
        ),
      ),
    );
  }
}

/// Chip de statut (pending / processing / extracted / validated / failed).
Widget statusChipFor(String status) {
  final (bg, fg, label) = switch (status) {
    'processing' => (
      const Color(0xFFFEF3C7),
      const Color(0xFF92400E),
      'Traitement…'
    ),
    'extracted' => (
      const Color(0xFFDBEAFE),
      const Color(0xFF1E40AF),
      'Extrait'
    ),
    'validated' => (
      const Color(0xFFDCFCE7),
      const Color(0xFF166534),
      'Validé'
    ),
    'failed' => (
      const Color(0xFFFEE2E2),
      const Color(0xFFB91C1C),
      'Échec'
    ),
    _ => (
      const Color(0xFFF1F5F9),
      const Color(0xFF475569),
      'En attente'
    ),
  };
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
    decoration: BoxDecoration(
      color: bg,
      borderRadius: BorderRadius.circular(999),
    ),
    child: Text(label,
        style: TextStyle(
            color: fg,
            fontSize: 10,
            fontWeight: FontWeight.w900,
            letterSpacing: 0.3)),
  );
}

InputDecoration _dec() {
  return InputDecoration(
    isDense: true,
    contentPadding:
        const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
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



