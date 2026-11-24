import 'dart:async';

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

/// Rôle "gaté" (COMPTABLE / ASSISTANT) : le serveur a créé une demande
/// d'approbation ; on affiche un écran d'attente pendant que l'ADMIN
/// valide depuis le web.
class AuthPendingApproval extends AuthState {
  const AuthPendingApproval({
    required this.requestId,
    required this.email,
    required this.expiresAt,
  });
  final String requestId;
  final String email;
  final DateTime expiresAt;
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._api, this._storage) : super(const AuthUnknown()) {
    _restore();
  }

  final ApiClient _api;
  final AuthStorage _storage;
  Timer? _approvalPoll;

  @override
  void dispose() {
    _approvalPoll?.cancel();
    super.dispose();
  }

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
    _approvalPoll?.cancel();
    state = const AuthLoading();
    try {
      final data = await _api.postData('/auth/login', body: {
        'email': email,
        'password': password,
        'device_name': AppConfig.deviceName,
      });
      final payload = (data as Map).cast<String, dynamic>();

      // Rôles COMPTABLE / ASSISTANT : le backend renvoie `pending: true`
      // et un identifiant à sonder jusqu'à ce qu'un ADMIN valide.
      if (payload['pending'] == true) {
        final rid = payload['request_id'] as String?;
        final exp = payload['expires_at'] as String?;
        if (rid == null || rid.isEmpty) {
          state = const AuthFailed('Réponse du serveur sans identifiant.');
          return;
        }
        final expires =
            DateTime.tryParse(exp ?? '') ?? DateTime.now().add(const Duration(minutes: 10));
        state = AuthPendingApproval(
          requestId: rid,
          email: email,
          expiresAt: expires,
        );
        _startApprovalPolling(rid, email);
        return;
      }

      // Rôle non gaté : connexion normale.
      final token = payload['token'] as String?;
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
    _approvalPoll?.cancel();
    await _storage.clear();
    state = const AuthUnknown();
  }

  /// Annule une demande d'approbation en cours et ramène l'UI à l'écran de
  /// connexion (le serveur laissera la demande expirer d'elle-même).
  void cancelPendingApproval() {
    _approvalPoll?.cancel();
    if (state is AuthPendingApproval) {
      state = const AuthUnknown();
    }
  }

  /// Sonde l'API toutes les 3 s. Approuvée → finit la connexion ; refusée
  /// ou expirée → ramène sur l'écran de login avec un message.
  void _startApprovalPolling(String requestId, String email) {
    _approvalPoll?.cancel();
    _approvalPoll = Timer.periodic(const Duration(seconds: 3), (t) async {
      if (state is! AuthPendingApproval) {
        t.cancel();
        return;
      }
      try {
        final data = await _api.getData('/auth/mobile-login/$requestId/status');
        final payload = (data as Map).cast<String, dynamic>();
        final status = payload['status'] as String?;
        if (status == 'approved') {
          t.cancel();
          final token = payload['token'] as String?;
          if (token == null || token.isEmpty) {
            state = const AuthFailed('Approbation sans jeton.');
            return;
          }
          await _storage.save(token, email);
          state = AuthReady(email);
        } else if (status == 'rejected') {
          t.cancel();
          state = const AuthFailed("Connexion refusée par l'administrateur.");
        } else if (status == 'expired') {
          t.cancel();
          state = const AuthFailed('Demande expirée. Réessayez.');
        }
        // 'pending' → on continue à sonder.
      } on DioException catch (_) {
        // Erreur réseau transitoire : on laisse le prochain tick réessayer.
      } catch (_) {}
    });
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
