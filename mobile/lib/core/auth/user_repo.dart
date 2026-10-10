import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/api_client.dart';
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

final currentUserProvider =
    FutureProvider<UserDto>((ref) => ref.watch(userRepoProvider).me());
