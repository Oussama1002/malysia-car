class NotificationDto {
  const NotificationDto({
    required this.id,
    required this.title,
    this.body,
    this.priority,
    this.category,
    this.module,
    this.readAt,
    this.createdAt,
    this.linkUrl,
    this.entityType,
    this.entityId,
  });

  final String id;
  final String title;
  final String? body;
  final String? priority;
  final String? category;
  final String? module;
  final DateTime? readAt;
  final DateTime? createdAt;
  final String? linkUrl;
  final String? entityType;
  final String? entityId;

  bool get isUnread => readAt == null;

  factory NotificationDto.fromJson(Map<String, dynamic> j) => NotificationDto(
        id: j['id']?.toString() ?? '',
        title: j['title']?.toString() ?? '—',
        body: j['body']?.toString(),
        priority: j['priority']?.toString(),
        category: j['category']?.toString(),
        module: j['module']?.toString(),
        readAt: _date(j['read_at']),
        createdAt: _date(j['created_at']),
        linkUrl: j['link_url']?.toString(),
        entityType: j['entity_type']?.toString(),
        entityId: j['entity_id']?.toString(),
      );
}

DateTime? _date(dynamic v) {
  if (v == null) return null;
  return DateTime.tryParse(v.toString());
}
