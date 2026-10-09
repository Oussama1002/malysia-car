import 'dart:io' show File;

import 'package:flutter/widgets.dart';

Widget fileImage(String path, {BoxFit fit = BoxFit.cover}) =>
    Image.file(File(path), fit: fit);
