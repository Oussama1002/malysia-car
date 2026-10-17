import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';

/// Pad de signature électronique léger, sans dépendance externe.
///
/// L'agent dessine à l'intérieur du cadre ; le widget stocke les traits
/// (list de list d'Offset) et peut les rendre en PNG via [exportPng].
/// Les traits sont lisses (quadratic bezier via Path.lineTo) et noirs.
class SignaturePad extends StatefulWidget {
  const SignaturePad({
    super.key,
    this.height = 160,
    this.onChanged,
  });

  final double height;

  /// Appelé à chaque trait terminé avec le nombre de traits et un flag
  /// `empty` pour que le parent puisse gérer "Signé / vide".
  final void Function(bool hasStrokes)? onChanged;

  @override
  State<SignaturePad> createState() => SignaturePadState();
}

class SignaturePadState extends State<SignaturePad> {
  final List<List<Offset>> _strokes = [];
  final GlobalKey _boundaryKey = GlobalKey();

  bool get hasStrokes =>
      _strokes.isNotEmpty && _strokes.any((s) => s.length > 1);

  void clear() {
    setState(_strokes.clear);
    widget.onChanged?.call(false);
  }

  /// Convertit le dessin en PNG (via RepaintBoundary → Image → PNG).
  /// Retourne null si rien n'a été dessiné.
  Future<Uint8List?> exportPng() async {
    if (!hasStrokes) return null;
    final boundary = _boundaryKey.currentContext?.findRenderObject()
        as RenderRepaintBoundary?;
    if (boundary == null) return null;
    final image = await boundary.toImage(pixelRatio: 2.5);
    final byteData = await image.toByteData(format: ui.ImageByteFormat.png);
    return byteData?.buffer.asUint8List();
  }

  @override
  Widget build(BuildContext context) {
    return RepaintBoundary(
      key: _boundaryKey,
      child: Container(
        height: widget.height,
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Colors.black26, width: 1.5),
        ),
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onPanStart: (d) {
            setState(() => _strokes.add(<Offset>[d.localPosition]));
          },
          onPanUpdate: (d) {
            if (_strokes.isEmpty) return;
            setState(() => _strokes.last.add(d.localPosition));
          },
          onPanEnd: (_) => widget.onChanged?.call(hasStrokes),
          child: CustomPaint(
            size: Size.infinite,
            painter: _SignaturePainter(_strokes),
            child: hasStrokes
                ? null
                : const Center(
                    child: Text(
                      'Signez ici',
                      style: TextStyle(color: Colors.black26, fontSize: 12),
                    ),
                  ),
          ),
        ),
      ),
    );
  }
}

class _SignaturePainter extends CustomPainter {
  _SignaturePainter(this.strokes);
  final List<List<Offset>> strokes;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = const Color(0xFF0F172A)
      ..strokeWidth = 2.2
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;
    for (final stroke in strokes) {
      if (stroke.length < 2) continue;
      final path = Path()..moveTo(stroke.first.dx, stroke.first.dy);
      for (var i = 1; i < stroke.length; i++) {
        path.lineTo(stroke[i].dx, stroke[i].dy);
      }
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _SignaturePainter old) =>
      !identical(old.strokes, strokes) || old.strokes.length != strokes.length;
}
