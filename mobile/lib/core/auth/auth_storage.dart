import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'auth_storage_io.dart'
    if (dart.library.html) 'auth_storage_web.dart' as kv;

/// Garde le jeton d'authentification dans le Keystore Android et le Keychain
/// iOS — jamais dans les préférences simples, où un autre processus pourrait
/// le lire. Sur le web (test depuis Safari / Chrome), on tombe sur
/// window.localStorage (via l'impl conditionnelle `auth_storage_web.dart`),
/// car flutter_secure_storage necessite window.crypto.subtle qui n'est
/// pas dispo en HTTP non-securise.
class AuthStorage {
  static const _tokenKey = 'df_token';
  static const _emailKey = 'df_email';

  final _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  Future<String?> readToken() async {
    if (kIsWeb) return kv.readKey(_tokenKey);
    return _storage.read(key: _tokenKey);
  }

  Future<String?> readEmail() async {
    if (kIsWeb) return kv.readKey(_emailKey);
    return _storage.read(key: _emailKey);
  }

  Future<void> save(String token, String email) async {
    if (kIsWeb) {
      kv.writeKey(_tokenKey, token);
      kv.writeKey(_emailKey, email);
      return;
    }
    await _storage.write(key: _tokenKey, value: token);
    await _storage.write(key: _emailKey, value: email);
  }

  Future<void> clear() async {
    if (kIsWeb) {
      kv.deleteKey(_tokenKey);
      kv.deleteKey(_emailKey);
      return;
    }
    await _storage.delete(key: _tokenKey);
    await _storage.delete(key: _emailKey);
  }
}

final authStorageProvider = Provider<AuthStorage>((ref) => AuthStorage());
