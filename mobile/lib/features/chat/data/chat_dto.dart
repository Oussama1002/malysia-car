/// Collègue listé dans « Nouveau ».
class ChatUserDto {
  const ChatUserDto({required this.id, required this.name, this.role, this.avatar});
  final String id;
  final String name;
  final String? role;
  final String? avatar;

  factory ChatUserDto.fromJson(Map<String, dynamic> j) => ChatUserDto(
        id: j['id']?.toString() ?? '',
        name: j['name']?.toString() ?? '—',
        role: j['role']?.toString(),
        avatar: j['avatar']?.toString(),
      );
}

/// Ligne de la liste « Discussions ».
class ChatConversationDto {
  const ChatConversationDto({
    required this.userId,
    required this.name,
    required this.lastMessage,
    required this.unread,
    required this.lastFromMe,
    this.role,
    this.avatar,
    this.lastAt,
  });

  final String userId;
  final String name;
  final String? role;
  final String? avatar;
  final String lastMessage;
  final DateTime? lastAt;
  final bool lastFromMe;
  final int unread;

  factory ChatConversationDto.fromJson(Map<String, dynamic> j) =>
      ChatConversationDto(
        userId: j['user_id']?.toString() ?? '',
        name: j['name']?.toString() ?? '—',
        role: j['role']?.toString(),
        avatar: j['avatar']?.toString(),
        lastMessage: j['last_message']?.toString() ?? '',
        lastAt: _date(j['last_at']),
        lastFromMe: j['last_from_me'] == true,
        unread: int.tryParse(j['unread']?.toString() ?? '0') ?? 0,
      );
}

class ChatAttachmentDto {
  const ChatAttachmentDto({
    required this.name,
    required this.mime,
    required this.url,
    this.isImage = false,
    this.isAudio = false,
    this.duration,
  });
  final String name;
  final String mime;
  final String url;
  final bool isImage;
  final bool isAudio;
  final int? duration;

  factory ChatAttachmentDto.fromJson(Map<String, dynamic> j) =>
      ChatAttachmentDto(
        name: j['name']?.toString() ?? '',
        mime: j['mime']?.toString() ?? '',
        url: j['url']?.toString() ?? '',
        isImage: j['is_image'] == true,
        isAudio: j['is_audio'] == true,
        duration: int.tryParse(j['duration']?.toString() ?? ''),
      );
}

class ChatMessageDto {
  const ChatMessageDto({
    required this.id,
    required this.fromMe,
    this.body,
    this.createdAt,
    this.readAt,
    this.attachment,
  });
  final String id;
  final String? body;
  final bool fromMe;
  final DateTime? createdAt;
  final DateTime? readAt;
  final ChatAttachmentDto? attachment;

  factory ChatMessageDto.fromJson(Map<String, dynamic> j) {
    final a = j['attachment'];
    return ChatMessageDto(
      id: j['id']?.toString() ?? '',
      body: j['body']?.toString(),
      fromMe: j['from_me'] == true,
      createdAt: _date(j['created_at']),
      readAt: _date(j['read_at']),
      attachment: a is Map
          ? ChatAttachmentDto.fromJson(
              a is Map<String, dynamic>
                  ? a
                  : a.map((k, v) => MapEntry(k.toString(), v)),
            )
          : null,
    );
  }
}

DateTime? _date(dynamic v) {
  if (v == null) return null;
  return DateTime.tryParse(v.toString());
}

String initialsOf(String name) {
  final parts = name.split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  final letters = parts.take(2).map((p) => p[0].toUpperCase()).join();
  return letters.isEmpty ? '?' : letters;
}

String timeAgo(DateTime? at) {
  if (at == null) return '';
  final diff = DateTime.now().difference(at);
  final m = diff.inMinutes;
  if (m < 1) return "à l'instant";
  if (m < 60) return 'il y a $m min';
  final h = diff.inHours;
  if (h < 24) return 'il y a $h h';
  return '${at.day.toString().padLeft(2, '0')}/${at.month.toString().padLeft(2, '0')}';
}
