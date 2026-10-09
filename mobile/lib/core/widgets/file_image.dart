import 'package:flutter/widgets.dart';

import 'file_image_io.dart'
    if (dart.library.html) 'file_image_web.dart' as impl;

/// Affiche une image depuis un chemin local sur mobile, ou une URL blob
/// sur le web. Les deux variantes exposent la meme signature pour que
/// l'appelant n'ait rien a brancher.
Widget fileImage(String pathOrUrl, {BoxFit fit = BoxFit.cover}) =>
    impl.fileImage(pathOrUrl, fit: fit);
