import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pdfx/pdfx.dart';

import '../../../core/api/api_client.dart';

/// Visualiseur de document centralisé. Récupère les octets via Dio
/// (en-tête Bearer) depuis `/documents/{id}/preview`, puis affiche :
///   - une image zoomable (InteractiveViewer) si le MIME est une image
///     ou si la signature des octets correspond à PNG/JPG/GIF/WEBP ;
///   - un rendu PDF inline (pdfx) sinon.
/// Aucune ouverture externe : tout se consulte depuis l'app.
class DocumentViewerScreen extends ConsumerStatefulWidget {
  const DocumentViewerScreen({
    super.key,
    required this.id,
    this.title,
    this.mimeType,
  });

  final String id;
  final String? title;
  final String? mimeType;

  @override
  ConsumerState<DocumentViewerScreen> createState() =>
      _DocumentViewerScreenState();
}

class _DocumentViewerScreenState extends ConsumerState<DocumentViewerScreen> {
  Uint8List? _bytes;
  PdfController? _pdfController;
  String? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _pdfController?.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final api = ref.read(apiClientProvider);
      final res = await api.raw.get(
        '/documents/${widget.id}/preview',
        options: Options(responseType: ResponseType.bytes),
      );
      if (!mounted) return;
      final data = res.data;
      if (data is! List<int>) {
        setState(() {
          _error = 'Format inattendu.';
          _loading = false;
        });
        return;
      }
      final bytes = Uint8List.fromList(data);
      // Si c'est un PDF, prépare le controller pdfx. Sinon on affiche
      // directement les octets en image (le build detecte la signature).
      if (_isPdf(bytes)) {
        _pdfController = PdfController(
          document: PdfDocument.openData(bytes),
        );
      }
      setState(() {
        _bytes = bytes;
        _loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = '$e';
          _loading = false;
        });
      }
    }
  }

  bool _isPdf(Uint8List b) {
    final mime = widget.mimeType?.toLowerCase() ?? '';
    if (mime == 'application/pdf') return true;
    // Signature magique PDF : "%PDF"
    return b.length >= 4 &&
        b[0] == 0x25 &&
        b[1] == 0x50 &&
        b[2] == 0x44 &&
        b[3] == 0x46;
  }

  bool _isImage(Uint8List b) {
    final mime = widget.mimeType?.toLowerCase() ?? '';
    if (mime.startsWith('image/')) return true;
    if (b.length < 4) return false;
    // PNG
    if (b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47) return true;
    // JPEG
    if (b[0] == 0xFF && b[1] == 0xD8) return true;
    // GIF
    if (b[0] == 0x47 && b[1] == 0x49 && b[2] == 0x46) return true;
    // WEBP (RIFF....WEBP)
    if (b.length > 11 &&
        b[0] == 0x52 &&
        b[1] == 0x49 &&
        b[2] == 0x46 &&
        b[3] == 0x46 &&
        b[8] == 0x57 &&
        b[9] == 0x45 &&
        b[10] == 0x42 &&
        b[11] == 0x50) return true;
    return false;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(widget.title ?? 'Document',
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(
        child: CircularProgressIndicator(color: Colors.white),
      );
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: Colors.white, size: 48),
              const SizedBox(height: 10),
              const Text('Impossible de charger le document.',
                  style: TextStyle(color: Colors.white, fontSize: 14)),
              const SizedBox(height: 4),
              Text(_error!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white54, fontSize: 11)),
            ],
          ),
        ),
      );
    }
    if (_bytes == null) {
      return const Center(
          child: Text('Fichier vide.',
              style: TextStyle(color: Colors.white54)));
    }
    if (_pdfController != null) {
      // Rendu PDF inline, swipe horizontal entre les pages. Fond blanc pour
      // la lisibilité, barre basse qui montre la pagination.
      return Column(
        children: [
          Expanded(
            child: PdfView(
              controller: _pdfController!,
              scrollDirection: Axis.vertical,
              builders: PdfViewBuilders<DefaultBuilderOptions>(
                options: const DefaultBuilderOptions(),
                documentLoaderBuilder: (_) => const Center(
                  child: CircularProgressIndicator(color: Colors.white),
                ),
                pageLoaderBuilder: (_) => const Center(
                  child: CircularProgressIndicator(color: Colors.white),
                ),
                errorBuilder: (_, error) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Text('Erreur de rendu PDF : $error',
                        textAlign: TextAlign.center,
                        style: const TextStyle(
                            color: Colors.white70, fontSize: 12)),
                  ),
                ),
              ),
            ),
          ),
          _PdfPagination(controller: _pdfController!),
        ],
      );
    }
    if (_isImage(_bytes!)) {
      return InteractiveViewer(
        maxScale: 5,
        child: Center(child: Image.memory(_bytes!, fit: BoxFit.contain)),
      );
    }
    // Format inconnu : on affiche quand même les métadonnées en message
    // sans aucun lien externe.
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.insert_drive_file_outlined,
                color: Colors.white54, size: 56),
            const SizedBox(height: 10),
            Text(
              widget.mimeType ?? 'Document',
              style: const TextStyle(color: Colors.white70, fontSize: 12),
            ),
            const SizedBox(height: 4),
            const Text(
              "L'aperçu de ce format n'est pas supporté dans l'app.",
              style: TextStyle(color: Colors.white60, fontSize: 11.5),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

/// Barre inférieure du PDF : page courante / total + flèches pour naviguer.
class _PdfPagination extends StatefulWidget {
  const _PdfPagination({required this.controller});
  final PdfController controller;

  @override
  State<_PdfPagination> createState() => _PdfPaginationState();
}

class _PdfPaginationState extends State<_PdfPagination> {
  int _page = 1;
  int _total = 0;

  @override
  void initState() {
    super.initState();
    widget.controller.document.then((d) {
      if (mounted) setState(() => _total = d.pagesCount);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      color: Colors.black,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          IconButton(
            onPressed: _page > 1
                ? () {
                    widget.controller.previousPage(
                        duration: const Duration(milliseconds: 180),
                        curve: Curves.easeOut);
                    setState(() => _page--);
                  }
                : null,
            icon: const Icon(Icons.chevron_left, color: Colors.white),
            disabledColor: Colors.white24,
          ),
          Text(_total > 0 ? 'Page $_page / $_total' : 'Page $_page',
              style: const TextStyle(
                  color: Colors.white, fontWeight: FontWeight.w700)),
          IconButton(
            onPressed: _total == 0 || _page < _total
                ? () {
                    widget.controller.nextPage(
                        duration: const Duration(milliseconds: 180),
                        curve: Curves.easeOut);
                    setState(() => _page++);
                  }
                : null,
            icon: const Icon(Icons.chevron_right, color: Colors.white),
            disabledColor: Colors.white24,
          ),
        ],
      ),
    );
  }
}
