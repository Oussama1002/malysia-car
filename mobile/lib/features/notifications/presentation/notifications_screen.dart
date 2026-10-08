import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../data/notification_dto.dart';
import '../data/notifications_repo.dart';

/// Centre notifications complet (ouvert depuis « Voir toutes » de la popover
/// de la top bar). Reproduit `NotificationsPage` du web : liste + bouton
/// « Tout marquer lu », tap sur une ligne la marque lue.
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(notificationsListProvider);
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _Header(onBack: () => Navigator.of(context).maybePop(), onMarkAll: () async {
              try {
                await ref.read(notificationsRepoProvider).markAllRead();
                ref.invalidate(notificationsListProvider);
                ref.invalidate(notificationsPreviewProvider);
                ref.invalidate(notificationsUnreadProvider);
              } catch (_) {}
            }),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () async {
                  ref.invalidate(notificationsListProvider);
                  ref.invalidate(notificationsPreviewProvider);
                  ref.invalidate(notificationsUnreadProvider);
                },
                child: async.when(
                  loading: () =>
                      const Center(child: CircularProgressIndicator()),
                  error: (e, _) => ListView(
                    children: [
                      const SizedBox(height: 80),
                      Center(
                          child: Text('Erreur : $e',
                              style: const TextStyle(color: Colors.redAccent))),
                    ],
                  ),
                  data: (items) {
                    if (items.isEmpty) {
                      return ListView(
                        children: const [
                          SizedBox(height: 80),
                          Icon(Icons.notifications_off_outlined,
                              size: 56, color: Colors.black26),
                          SizedBox(height: 10),
                          Center(
                            child: Text('Aucune notification.',
                                style: TextStyle(color: Colors.black45)),
                          ),
                        ],
                      );
                    }
                    return ListView.separated(
                      padding: const EdgeInsets.all(12),
                      itemCount: items.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 6),
                      itemBuilder: (_, i) => _Tile(
                        n: items[i],
                        onTap: () async {
                          if (items[i].isUnread) {
                            try {
                              await ref
                                  .read(notificationsRepoProvider)
                                  .markRead(items[i].id);
                              ref.invalidate(notificationsListProvider);
                              ref.invalidate(notificationsPreviewProvider);
                              ref.invalidate(notificationsUnreadProvider);
                            } catch (_) {}
                          }
                        },
                      ),
                    );
                  },
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.onBack, required this.onMarkAll});
  final VoidCallback onBack;
  final VoidCallback onMarkAll;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 10, 16, 10),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(bottom: BorderSide(color: Theme.of(context).dividerColor)),
      ),
      child: Row(
        children: [
          IconButton(onPressed: onBack, icon: const Icon(Icons.arrow_back)),
          const Expanded(
            child: Text('Notifications',
                style: TextStyle(fontWeight: FontWeight.w900, fontSize: 15)),
          ),
          TextButton.icon(
            onPressed: onMarkAll,
            icon: const Icon(Icons.done_all, size: 16),
            label: const Text('Tout marquer lu'),
            style: TextButton.styleFrom(
              foregroundColor: const Color(0xFF4F46E5),
              textStyle:
                  const TextStyle(fontWeight: FontWeight.w900, fontSize: 11.5),
            ),
          ),
        ],
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.n, required this.onTap});
  final NotificationDto n;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd/MM/yyyy HH:mm', 'fr');
    final unread = n.isUnread;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: unread ? const Color(0xFFEEF2FF) : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: unread
                ? const Color(0xFFC7D2FE)
                : Colors.grey.shade200,
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (unread)
              Container(
                margin: const EdgeInsets.only(top: 5, right: 8),
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                  color: Color(0xFF4F46E5),
                  shape: BoxShape.circle,
                ),
              ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(n.title,
                      style: TextStyle(
                          fontWeight:
                              unread ? FontWeight.w900 : FontWeight.w700,
                          fontSize: 13)),
                  if (n.body != null && n.body!.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Text(n.body!,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 12, color: Colors.black54)),
                  ],
                  const SizedBox(height: 4),
                  Text(
                    n.createdAt != null ? dateFmt.format(n.createdAt!) : '',
                    style: const TextStyle(
                        fontSize: 10.5, color: Colors.black38),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}


