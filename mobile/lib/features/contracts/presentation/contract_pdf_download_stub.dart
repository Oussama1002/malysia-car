import 'dart:typed_data';

/// Native fallback. Native builds (APK/IPA) require path_provider + share_plus
/// to actually land the bytes somewhere a user can find — not wired yet, so
/// we throw and let the caller surface a snack rather than silently drop the
/// click. See contract_pdf_download_web.dart for the Flutter-web path.
void saveBytesAsFile(Uint8List bytes, String fileName) {
  throw UnimplementedError(
    'Native file save not wired yet — add path_provider + share_plus to pub '
    'and route through them. Flutter-web uses the dart:html implementation.',
  );
}
