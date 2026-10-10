/// L'URL de l'API DriveFlow, en un seul endroit du code.
///
/// Pour pointer vers un autre environnement, modifier cette valeur et relancer.
/// Un jour, elle viendra d'une variable d'environnement — pour l'instant, elle
/// vit ici, c'est suffisant pour développer.
class AppConfig {
  static const String apiBaseUrl = 'http://79.143.180.186:8080/api/v1';

  /// Le nom envoyé à /auth/login : il nomme le jeton côté serveur, pour qu'un
  /// admin puisse le révoquer appareil par appareil.
  static const String deviceName = 'android-mobile';

  /// Préremplis pour le développement. À retirer avant la mise en production.
  static const String devEmail = 'admin@driveflow.local';
  static const String devPassword = 'Driveflow!2026#Admin';
}
