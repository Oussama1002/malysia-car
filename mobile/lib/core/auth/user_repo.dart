import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
import 'auth_notifier.dart';
import 'user_dto.dart';

class UserRepo {
  UserRepo(this._api);
  final ApiClient _api;

  /// GET /auth/me — profil complet, rôles, agences, dernière connexion.
  Future<UserDto> me() async {
    final data = await _api.getData('/auth/me');
    final map = data is Map
        ? data.map((k, v) => MapEntry(k.toString(), v))
        : <String, dynamic>{};
    final user = map['user'];
    final userMap = user is Map
        ? user.map((k, v) => MapEntry(k.toString(), v))
        : <String, dynamic>{};
    final perms = map['permissions'];
    if (perms is List) {
      userMap['permissions'] = perms;
    }
    return UserDto.fromJson(userMap);
  }
}

final userRepoProvider =
    Provider<UserRepo>((ref) => UserRepo(ref.watch(apiClientProvider)));

/// Profil de l'utilisateur connecté. On observe `authProvider` pour que le
/// profil (et donc le rôle) soit refetché à chaque connexion / déconnexion —
/// sinon un premier appel avant login mettrait le provider en erreur en cache
/// et le rôle ne serait jamais résolu après la connexion.
final currentUserProvider = FutureProvider<UserDto>((ref) {
  ref.watch(authProvider);
  return ref.watch(userRepoProvider).me();
});
