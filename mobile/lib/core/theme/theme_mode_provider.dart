import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Préférence thème persistée (clair / sombre / système).
///
/// On stocke le choix dans le même `FlutterSecureStorage` que le jeton :
/// ça marche dès le démarrage sans dépendance SharedPreferences, et c'est
/// réécrit silencieusement quand l'utilisateur bascule.
class ThemeModeNotifier extends StateNotifier<ThemeMode> {
  ThemeModeNotifier(this._storage) : super(ThemeMode.light) {
    _load();
  }

  static const _key = 'app.theme_mode';
  final FlutterSecureStorage _storage;

  Future<void> _load() async {
    try {
      final raw = await _storage.read(key: _key);
      if (raw == null) return;
      state = switch (raw) {
        'dark' => ThemeMode.dark,
        'light' => ThemeMode.light,
        _ => ThemeMode.system,
      };
    } catch (_) {
      // En cas de probleme de stockage, on garde le mode par defaut.
    }
  }

  Future<void> toggle() async {
    final next = state == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    state = next;
    try {
      await _storage.write(key: _key, value: next == ThemeMode.dark ? 'dark' : 'light');
    } catch (_) {}
  }

  Future<void> set(ThemeMode mode) async {
    state = mode;
    try {
      await _storage.write(
        key: _key,
        value: mode == ThemeMode.dark ? 'dark' : mode == ThemeMode.light ? 'light' : 'system',
      );
    } catch (_) {}
  }
}

final _secureStorageProvider =
    Provider<FlutterSecureStorage>((_) => const FlutterSecureStorage());

final themeModeProvider =
    StateNotifierProvider<ThemeModeNotifier, ThemeMode>((ref) {
  return ThemeModeNotifier(ref.watch(_secureStorageProvider));
});
