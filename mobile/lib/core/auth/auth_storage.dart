import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Garde le jeton d'authentification dans le Keystore Android et le Keychain
/// iOS — jamais dans les préférences simples, où un autre processus pourrait
/// le lire. Sur le web (test depuis Safari), on tombe sur SharedPreferences
/// qui utilise localStorage ; flutter_secure_storage necessite window.crypto
/// .subtle, indisponible en HTTP non-securise, et bloque le login sinon.
class AuthStorage {
  static const _tokenKey = 'df_token';
  static const _emailKey = 'df_email';

  final _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  Future<String?> readToken() async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString(_tokenKey);
    }
    return _storage.read(key: _tokenKey);
  }

  Future<String?> readEmail() async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString(_emailKey);
    }
    return _storage.read(key: _emailKey);
  }

  Future<void> save(String token, String email) async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_tokenKey, token);
      await prefs.setString(_emailKey, email);
      return;
    }
    await _storage.write(key: _tokenKey, value: token);
    await _storage.write(key: _emailKey, value: email);
  }

  /// À la déconnexion, tout part : plus aucune trace du précédent utilisateur.
  Future<void> clear() async {
    if (kIsWeb) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_tokenKey);
      await prefs.remove(_emailKey);
      return;
    }
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _emailKey);
  }
}

final authStorageProvider = Provider<AuthStorage>((ref) => AuthStorage());
