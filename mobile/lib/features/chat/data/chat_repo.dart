import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import 'chat_dto.dart';

class ChatRepo {
  ChatRepo(this._api);
  final ApiClient _api;

  Future<List<ChatUserDto>> users() async {
    final data = await _api.getData('/chat/users');
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((m) =>
            ChatUserDto.fromJson(m.map((k, v) => MapEntry(k.toString(), v))))
        .toList();
  }

  Future<List<ChatConversationDto>> conversations() async {
    final data = await _api.getData('/chat/conversations');
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((m) => ChatConversationDto.fromJson(
            m.map((k, v) => MapEntry(k.toString(), v))))
        .toList();
  }

  Future<List<ChatMessageDto>> messages(String withUserId) async {
    final data = await _api.getData('/chat/messages',
        query: {'with': withUserId});
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((m) =>
            ChatMessageDto.fromJson(m.map((k, v) => MapEntry(k.toString(), v))))
        .toList();
  }

  /// Envoie un message texte, et optionnellement un fichier (image ou autre).
  /// Pour un envoi avec fichier, on passe en `multipart/form-data`.
  Future<ChatMessageDto> send({
    required String recipientId,
    String? body,
    File? file,
  }) async {
    if (file != null) {
      final form = FormData.fromMap({
        'recipient_id': recipientId,
        if (body != null && body.trim().isNotEmpty) 'body': body.trim(),
        'file': await MultipartFile.fromFile(file.path),
      });
      final res = await _api.raw.post('/chat/messages', data: form);
      final payload = res.data is Map && (res.data as Map).containsKey('data')
          ? (res.data as Map)['data']
          : res.data;
      final map = payload is Map
          ? payload.map((k, v) => MapEntry(k.toString(), v))
          : <String, dynamic>{};
      return ChatMessageDto.fromJson(map);
    }
    final res = await _api.raw.post('/chat/messages', data: {
      'recipient_id': recipientId,
      if (body != null) 'body': body,
    });
    final payload = res.data is Map && (res.data as Map).containsKey('data')
        ? (res.data as Map)['data']
        : res.data;
    final map = payload is Map
        ? payload.map((k, v) => MapEntry(k.toString(), v))
        : <String, dynamic>{};
    return ChatMessageDto.fromJson(map);
  }

  Future<int> unreadCount() async {
    final data = await _api.getData('/chat/unread-count');
    if (data is Map) {
      final n = int.tryParse(data['unread']?.toString() ?? '0') ?? 0;
      return n;
    }
    return 0;
  }
}

final chatRepoProvider =
    Provider<ChatRepo>((ref) => ChatRepo(ref.watch(apiClientProvider)));

final chatConversationsProvider = FutureProvider<List<ChatConversationDto>>(
    (ref) => ref.watch(chatRepoProvider).conversations());

final chatUsersProvider = FutureProvider<List<ChatUserDto>>(
    (ref) => ref.watch(chatRepoProvider).users());

final chatMessagesProvider =
    FutureProvider.family<List<ChatMessageDto>, String>(
        (ref, id) => ref.watch(chatRepoProvider).messages(id));

final chatUnreadProvider =
    FutureProvider<int>((ref) => ref.watch(chatRepoProvider).unreadCount());
