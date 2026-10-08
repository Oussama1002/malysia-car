import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import 'notification_dto.dart';

class NotificationsRepo {
  NotificationsRepo(this._api);
  final ApiClient _api;

  Future<List<NotificationDto>> list({int perPage = 20, bool unreadOnly = false}) async {
    final q = <String, dynamic>{'per_page': perPage};
    if (unreadOnly) q['unread_only'] = 1;
    final data = await _api.getData('/notifications', query: q);
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((m) => NotificationDto.fromJson(
            m.map((k, v) => MapEntry(k.toString(), v))))
        .toList();
  }

  Future<int> unreadCount() async {
    try {
      final data = await _api.getData('/notifications/unread-count');
      if (data is Map) {
        return int.tryParse(data['unread']?.toString() ?? '0') ??
            int.tryParse(data['count']?.toString() ?? '0') ??
            0;
      }
      return int.tryParse(data?.toString() ?? '0') ?? 0;
    } catch (_) {
      return 0;
    }
  }

  Future<void> markRead(String id) async {
    await _api.raw.post('/notifications/$id/mark-read');
  }

  Future<void> markAllRead() async {
    await _api.raw.post('/notifications/mark-all-read');
  }
}

final notificationsRepoProvider = Provider<NotificationsRepo>(
    (ref) => NotificationsRepo(ref.watch(apiClientProvider)));

final notificationsListProvider = FutureProvider<List<NotificationDto>>(
    (ref) => ref.watch(notificationsRepoProvider).list(perPage: 50));

final notificationsPreviewProvider = FutureProvider<List<NotificationDto>>(
    (ref) => ref.watch(notificationsRepoProvider).list(perPage: 6));

final notificationsUnreadProvider =
    FutureProvider<int>((ref) => ref.watch(notificationsRepoProvider).unreadCount());
