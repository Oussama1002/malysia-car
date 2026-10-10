import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import '../config/app_config.dart';
import 'auth_storage.dart';

/// L'état de connexion : jamais connecté, connexion en cours, connecté, ou en
/// échec avec un message.
sealed class AuthState {
  const AuthState();
}

class AuthUnknown extends AuthState {
  const AuthUnknown();
}

class AuthLoading extends AuthState {
  const AuthLoading();
}

class AuthReady extends AuthState {
  const AuthReady(this.email);
  final String email;
}

class AuthFailed extends AuthState {
  const AuthFailed(this.message);
  final String message;
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._api, this._storage) : super(const AuthUnknown()) {
    _restore();
  }

  final ApiClient _api;
  final AuthStorage _storage;

  /// À l'ouverture de l'app, on regarde si un jeton est déjà en Keystore ;
  /// si oui, l'utilisateur n'a pas à retaper son mot de passe.
  Future<void> _restore() async {
    try {
      final token = await _storage.readToken();
      final email = await _storage.readEmail();
      if (token != null && email != null) {
        state = AuthReady(email);
      }
    } catch (e, st) {
      // ignore: avoid_print
      print('auth restore error: $e\n$st');
      // On ne bloque pas l'app : l'ecran de login s'affiche.
    }
  }

  Future<void> signIn({required String email, required String password}) async {
    state = const AuthLoading();
    try {
      final data = await _api.postData('/auth/login', body: {
        'email': email,
        'password': password,
        'device_name': AppConfig.deviceName,
      });
      // L'API renvoie {"data": {"token": "...", "user": {...}}}.
      final token = (data as Map)['token'] as String?;
      if (token == null || token.isEmpty) {
        state = const AuthFailed('Réponse du serveur sans jeton.');
        return;
      }
      await _storage.save(token, email);
      state = AuthReady(email);
    } on DioException catch (e) {
      state = AuthFailed(_messageFrom(e));
    } catch (e, st) {
      // Pour debug web : on surface le vrai message dans l'UI au lieu
      // du generique « Impossible de contacter le serveur ».
      // ignore: avoid_print
      print('signIn error: $e\n$st');
      state = AuthFailed('Erreur locale : $e');
    }
  }

  Future<void> signOut() async {
    await _storage.clear();
    state = const AuthUnknown();
  }

  /// Traduit l'erreur HTTP en une phrase lisible pour un agent au comptoir.
  String _messageFrom(DioException e) {
    final status = e.response?.statusCode;
    if (status == 401 || status == 422) {
      return 'Email ou mot de passe incorrect.';
    }
    if (status == 429) {
      return 'Trop de tentatives. Patientez une minute.';
    }
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return 'Le serveur ne répond pas. Vérifiez la connexion.';
    }
    return 'Connexion impossible pour le moment.';
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref.watch(apiClientProvider), ref.watch(authStorageProvider));
});
