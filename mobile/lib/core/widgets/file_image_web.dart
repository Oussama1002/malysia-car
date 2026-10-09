import 'package:flutter/widgets.dart';

Widget fileImage(String url, {BoxFit fit = BoxFit.cover}) =>
    Image.network(url, fit: fit);
