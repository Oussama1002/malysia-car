import 'dart:typed_data' show Uint8List;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import '../../../core/config/app_config.dart';

/// Aperçu du contrat (pendant mobile de `ContractPaperPreview.tsx` du web).
///
/// Charge la carte des coordonnées depuis `/v1/contract-form-layout`, puis
/// pose les valeurs du wizard aux mêmes emplacements millimétrés que le PDF
/// final (`config/contract_form.php`). Comme le web, on ne peut pas diverger
/// du papier parce que les deux lisent la même config.
class ContractPaperPreview extends ConsumerWidget {
  const ContractPaperPreview({
    super.key,
    required this.values,
    this.papers,
    this.signaturePng,
  });

  final Map<String, String?> values;
  final Map<String, bool>? papers;

  /// PNG bytes de la signature client. Posés à l'emplacement
  /// "Signature du Locataire" du formulaire (coordonnées en millimètres
  /// relatives au format A4).
  final Uint8List? signaturePng;

  static const double _a4WidthMm = 210;
  static const double _a4HeightMm = 297;

  // Zone "Signature du Locataire" du modèle papier (approximation
  // visuelle du tableau du bas). Si le backend finit par exposer ses
  // propres coordonnées, remplacer ici.
  static const double _signXmm = 60;
  static const double _signYmm = 253;
  static const double _signWmm = 50;
  static const double _signHmm = 14;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final layoutAsync = ref.watch(_contractFormLayoutProvider);
    return layoutAsync.when(
      loading: () => _frame(child: const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: CircularProgressIndicator(),
        ),
      )),
      error: (e, _) => _frame(child: Padding(
        padding: const EdgeInsets.all(16),
        child: Text("Impossible de charger l'aperçu : $e",
            style: const TextStyle(fontSize: 12, color: Colors.redAccent)),
      )),
      data: (layout) => _render(context, layout),
    );
  }

  Widget _render(BuildContext context, _FormLayout layout) {
    final dx = layout.offsetX;
    final dy = layout.offsetY;

    final marks = <_Mark>[];
    layout.fields.forEach((key, spot) {
      String? text;
      if (key.startsWith('papers_')) {
        final parts = key.split('_');
        if (parts.length >= 3) {
          final name = parts[1];
          final answer = parts[2];
          final ok = papers?[name];
          if (ok != null) {
            if ((ok && answer == 'yes') || (!ok && answer == 'no')) {
              text = 'X';
            }
          }
        }
      } else {
        final raw = values[key];
        if (raw != null && raw.trim().isNotEmpty) text = raw;
      }
      if (text != null) {
        marks.add(_Mark(
          text: text,
          xMm: spot.x + dx,
          // Léger décalage vers le bas (-2 → -0.5 mm) demandé pour que les
          // valeurs retombent dans les lignes imprimées des blocs
          // « LOCATAIRE » et « INFORMATION SUR VEHICULE ».
          yMm: spot.y + dy - 0.5,
          sizeMm: (spot.size ?? layout.fontSize) * 1.15,
          bold: spot.bold,
        ));
      }
    });

    return _frame(
      child: LayoutBuilder(
        builder: (context, constraints) {
          final maxW = constraints.maxWidth.clamp(0.0, 820.0);
          final pageWidth = maxW;
          final pageHeight = pageWidth * (_a4HeightMm / _a4WidthMm);
          final mmToPx = pageWidth / _a4WidthMm;
          return SizedBox(
            width: pageWidth,
            height: pageHeight,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Container(
                color: Colors.white,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Image.network(
                      _formImageUrl(),
                      fit: BoxFit.fill,
                      errorBuilder: (_, __, ___) => const ColoredBox(
                        color: Color(0xFFF8FAFC),
                        child: Center(
                          child: Text(
                            "Fond du contrat indisponible\n(/contract-form.jpg)",
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 11, color: Colors.black45),
                          ),
                        ),
                      ),
                    ),
                    if (signaturePng != null)
                      Positioned(
                        left: (_signXmm / _a4WidthMm) * pageWidth,
                        top: (_signYmm / _a4HeightMm) * pageHeight,
                        width: (_signWmm / _a4WidthMm) * pageWidth,
                        height: (_signHmm / _a4HeightMm) * pageHeight,
                        child: Image.memory(
                          signaturePng!,
                          fit: BoxFit.contain,
                        ),
                      ),
                    for (final m in marks)
                      Positioned(
                        left: (m.xMm / _a4WidthMm) * pageWidth,
                        top: (m.yMm / _a4HeightMm) * pageHeight,
                        child: Text(
                          m.text,
                          softWrap: false,
                          style: TextStyle(
                            // Même formule que la version web
                            // (`ContractPaperPreview.tsx` : size * 0.3528 * mmToPx).
                            // Sans le facteur 0.3528 (mm → pt), le texte sortait
                            // ~2,83× trop grand sur mobile et dépassait les
                            // cases du formulaire.
                            fontSize: m.sizeMm * 0.3528 * mmToPx,
                            fontWeight: m.bold ? FontWeight.w900 : FontWeight.w700,
                            // Gris anthracite (comme un stylo gris) plutôt que
                            // noir pur, pour mieux se détacher du fond pré-
                            // imprimé du contrat sur mobile.
                            color: const Color(0xFF4B5563),
                            height: 1.0,
                            letterSpacing: 0.2,
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _frame({required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Padding(
            padding: EdgeInsets.only(left: 2, bottom: 6),
            child: Text(
              "Aperçu du contrat — exactement comme le PDF à télécharger",
              style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: Colors.black54),
            ),
          ),
          child,
          const Padding(
            padding: EdgeInsets.only(top: 6, left: 2),
            child: Text(
              "À l'impression sur le formulaire pré-imprimé, seules les valeurs sont envoyées à l'imprimante.",
              style: TextStyle(fontSize: 10, color: Colors.black45),
            ),
          ),
        ],
      ),
    );
  }

  /// L'image du formulaire est servie par nginx à la racine de l'host (hors
  /// `/api/`). On déduit l'host en retirant le suffixe `/api/v1` de
  /// `AppConfig.apiBaseUrl`.
  static String _formImageUrl() {
    final base = AppConfig.apiBaseUrl;
    final host = base.replaceAll(RegExp(r'/api(/v\d+)?/?$'), '');
    return '$host/contract-form.jpg';
  }
}

class _Mark {
  _Mark({
    required this.text,
    required this.xMm,
    required this.yMm,
    required this.sizeMm,
    required this.bold,
  });
  final String text;
  final double xMm;
  final double yMm;
  final double sizeMm;
  final bool bold;
}

class _FormSpot {
  _FormSpot({required this.x, required this.y, this.size, this.bold = false});
  final double x;
  final double y;
  final double? size;
  final bool bold;

  factory _FormSpot.fromJson(Map<String, dynamic> j) => _FormSpot(
        x: _d(j['x']) ?? 0,
        y: _d(j['y']) ?? 0,
        size: _d(j['size']),
        bold: j['bold'] == true,
      );
}

class _FormLayout {
  _FormLayout({
    required this.fields,
    required this.offsetX,
    required this.offsetY,
    required this.fontSize,
  });
  final Map<String, _FormSpot> fields;
  final double offsetX;
  final double offsetY;
  final double fontSize;
}

double? _d(dynamic v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString());
}

final _contractFormLayoutProvider =
    FutureProvider<_FormLayout>((ref) async {
  final api = ref.watch(apiClientProvider);
  final data = await api.getData('/contract-form-layout');
  if (data is! Map) {
    return _FormLayout(
      fields: const {},
      offsetX: 0,
      offsetY: 0,
      fontSize: 8.5,
    );
  }
  final rawFields = data['fields'];
  final fields = <String, _FormSpot>{};
  if (rawFields is Map) {
    rawFields.forEach((k, v) {
      if (v is Map) {
        fields[k.toString()] = _FormSpot.fromJson(
            v.map((kk, vv) => MapEntry(kk.toString(), vv)));
      }
    });
  }
  return _FormLayout(
    fields: fields,
    offsetX: _d(data['offset_x']) ?? 0,
    offsetY: _d(data['offset_y']) ?? 0,
    fontSize: _d(data['font_size']) ?? 8.5,
  );
});
