import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:pdfx/pdfx.dart';

import '../../../core/api/api_client.dart';
import 'contract_pdf_download_stub.dart'
    if (dart.library.html) 'contract_pdf_download_web.dart';

/// Après la finalisation d'un contrat, on affiche le PDF plein écran avec
/// un bouton Télécharger. L'écran s'ouvre tout seul depuis le wizard mobile
/// une fois les paiements enregistrés et l'activation tentée — même rôle
/// que le téléchargement automatique côté web.
///
/// Flux :
///   1. POST /contracts/{id}/generate-pdf → renvoie l'id du document généré.
///   2. GET /generated-documents/{docId}/download (Bearer) → octets.
///   3. pdfx affiche les octets ; en Flutter web, le bouton Télécharger les
///      pousse via dart:html Blob + AnchorElement. En natif, le bouton reste
///      caché le temps que path_provider/share_plus soient ajoutés au pub.
class ContractPdfPreviewScreen extends ConsumerStatefulWidget {
  const ContractPdfPreviewScreen({
    super.key,
    required this.contractId,
    this.contractNumber,
  });

  final String contractId;
  final String? contractNumber;

  @override
  ConsumerState<ContractPdfPreviewScreen> createState() =>
      _ContractPdfPreviewScreenState();
}

class _ContractPdfPreviewScreenState
    extends ConsumerState<ContractPdfPreviewScreen> {
  Uint8List? _bytes;
  PdfController? _controller;
  String? _error;
  bool _loading = true;

  String get _fileName => widget.contractNumber != null
      ? 'contrat-${widget.contractNumber}.pdf'
      : 'contrat-${widget.contractId.substring(0, widget.contractId.length < 8 ? widget.contractId.length : 8)}.pdf';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final api = ref.read(apiClientProvider);
      // 1. Génération côté serveur. On accepte un corps JSON vide : la route
      //    pioche la mise en page par défaut (facsimilé) et renvoie l'id du
      //    GeneratedDocument créé.
      final gen = await api.postData(
        '/contracts/${widget.contractId}/generate-pdf',
        body: const {},
      );
      String? docId;
      if (gen is Map) {
        docId = (gen['id'] ?? gen['document']?['id'] ?? gen['data']?['id'])
            ?.toString();
      }
      if (docId == null || docId.isEmpty) {
        throw Exception('Document généré sans id — réponse serveur inattendue.');
      }

      // 2. Téléchargement authentifié des octets. responseType bytes pour que
      //    Dio ne tente pas de les décoder en texte UTF-8.
      final res = await api.raw.get(
        '/generated-documents/$docId/download',
        options: Options(responseType: ResponseType.bytes),
      );
      final data = res.data;
      if (data is! List<int>) {
        throw Exception('Téléchargement : format octets inattendu.');
      }
      final bytes = Uint8List.fromList(data);
      _controller = PdfController(document: PdfDocument.openData(bytes));
      if (!mounted) return;
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

  void _downloadLocal() {
    final bytes = _bytes;
    if (bytes == null) return;
    // Le téléchargement natif (vers Downloads sur Android / Documents sur iOS)
    // demande path_provider + share_plus — à ajouter au pub quand on construira
    // l'APK/IPA. Sur Flutter Web (la cible de /mobile-web/) le stub
    // dart:html marche directement.
    try {
      saveBytesAsFile(bytes, _fileName);
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text(
                'Téléchargement natif indisponible pour l\'instant — ouvert dans l\'app.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final showDownload = kIsWeb && _bytes != null;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.contractNumber != null
            ? 'Contrat ${widget.contractNumber}'
            : 'Aperçu du contrat'),
        actions: [
          if (showDownload)
            IconButton(
              tooltip: 'Télécharger le PDF',
              icon: const Icon(Icons.download_outlined),
              onPressed: _downloadLocal,
            ),
          IconButton(
            tooltip: 'Fermer',
            icon: const Icon(Icons.close),
            onPressed: () => Navigator.of(context).maybePop(),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Padding(
                  padding: const EdgeInsets.all(24),
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.error_outline,
                            size: 48, color: Colors.redAccent),
                        const SizedBox(height: 12),
                        const Text(
                          'Impossible de charger le PDF du contrat.',
                          style: TextStyle(fontWeight: FontWeight.w800),
                        ),
                        const SizedBox(height: 6),
                        Text(_error!, textAlign: TextAlign.center),
                        const SizedBox(height: 16),
                        OutlinedButton(
                          onPressed: () {
                            setState(() {
                              _loading = true;
                              _error = null;
                            });
                            _load();
                          },
                          child: const Text('Réessayer'),
                        ),
                      ],
                    ),
                  ),
                )
              : PdfView(controller: _controller!),
      floatingActionButton: showDownload
          ? FloatingActionButton.extended(
              onPressed: _downloadLocal,
              icon: const Icon(Icons.download),
              label: const Text('Télécharger'),
            )
          : null,
    );
  }
}
