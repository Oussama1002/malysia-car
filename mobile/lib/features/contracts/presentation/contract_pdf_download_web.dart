import 'dart:html' as html;
import 'dart:typed_data';

/// Flutter-web download: Blob + hidden <a download> trigger. Same pattern the
/// web React wizard uses, so the two paths produce identical behaviour.
void saveBytesAsFile(Uint8List bytes, String fileName) {
  final blob = html.Blob(<Uint8List>[bytes], 'application/pdf');
  final url = html.Url.createObjectUrlFromBlob(blob);
  final anchor = html.AnchorElement(href: url)
    ..download = fileName
    ..style.display = 'none';
  html.document.body?.append(anchor);
  anchor.click();
  // Keep the blob URL around for a minute so Chrome / Edge don't abort the
  // transfer when the blob is revoked synchronously — same race fix we had
  // to apply on the React web wizard.
  Future.delayed(const Duration(seconds: 60), () {
    anchor.remove();
    html.Url.revokeObjectUrl(url);
  });
}
