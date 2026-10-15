import 'dart:html' as html;
import 'dart:typed_data';

/// Flutter-web download. Deux chemins :
///   1. `<a download>` masqué (Chrome / Edge / Firefox + Android) — fichier
///      poussé directement vers le dossier Téléchargements.
///   2. Si on détecte iOS/iPadOS Safari (incluant la PWA /mobile-web/), on
///      ouvre le Blob dans un nouvel onglet : WebKit ignore totalement
///      l'attribut `download` dans un contexte PWA, l'anchor.click() ne
///      produisait donc rien visible. L'utilisateur touche ensuite partage →
///      Enregistrer dans Fichiers.
void saveBytesAsFile(Uint8List bytes, String fileName) {
  final blob = html.Blob(<Uint8List>[bytes], 'application/pdf');
  final url = html.Url.createObjectUrlFromBlob(blob);

  final ua = html.window.navigator.userAgent;
  final isIosSafari =
      RegExp(r'iPhone|iPad|iPod', caseSensitive: false).hasMatch(ua) ||
          // iPadOS 13+ se présente comme Macintosh : on détecte le mode
          // tactile pour trancher.
          (ua.contains('Macintosh') &&
              (html.window.navigator.maxTouchPoints ?? 0) > 1); // ignore: unnecessary_null_comparison

  if (isIosSafari) {
    // Ouvrir dans un nouvel onglet : Safari affiche le PDF en lecture, le
    // bouton Partage permet l'enregistrement. Si window.open est bloqué
    // (pop-up), on retombe sur `location.assign` dans la même fenêtre.
    final opened = html.window.open(url, '_blank');
    if (opened == null) {
      html.window.location.assign(url);
    }
    Future.delayed(const Duration(seconds: 60), () {
      html.Url.revokeObjectUrl(url);
    });
    return;
  }

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
