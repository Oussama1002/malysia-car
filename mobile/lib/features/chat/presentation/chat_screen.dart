import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/module_scaffold.dart';
import '../data/chat_dto.dart';
import '../data/chat_repo.dart';
import 'chat_thread_screen.dart';

/// Discussion interne — liste des conversations + bouton « + Nouveau » qui
/// affiche la liste de collègues (comme `ChatPage.tsx` côté web).
class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  bool _showNew = false;
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _openPeer(String id, String name) {
    setState(() => _showNew = false);
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ChatThreadScreen(peerId: id, peerName: name),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final convsAsync = ref.watch(chatConversationsProvider);
    final usersAsync = ref.watch(chatUsersProvider);
    return Scaffold(
      body: ModuleBackground(
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(chatConversationsProvider);
              ref.invalidate(chatUsersProvider);
            },
            child: ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                ModuleHeader(
                  title: 'Discussion interne',
                  subtitle:
                      'Messagerie 1-à-1 avec vos collègues de l\'entreprise.',
                  onBack: () => Navigator.of(context).maybePop(),
                ),
                const SizedBox(height: 10),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Row(
                    children: [
                      const Expanded(
                        child: Text('Discussions',
                            style: TextStyle(
                                fontWeight: FontWeight.w900, fontSize: 15)),
                      ),
                      FilledButton.tonal(
                        onPressed: () => setState(() => _showNew = !_showNew),
                        style: FilledButton.styleFrom(
                          backgroundColor: const Color(0xFF4F46E5),
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 6),
                          minimumSize: const Size(0, 34),
                          textStyle: const TextStyle(
                              fontWeight: FontWeight.w900, fontSize: 12),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(10)),
                        ),
                        child: Text(_showNew ? 'Retour' : '+ Nouveau'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 10),
                if (_showNew) ...[
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: ModuleSearchField(
                      controller: _search,
                      hint: 'Rechercher un collègue…',
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
                  const SizedBox(height: 10),
                  usersAsync.when(
                    loading: () => const Padding(
                      padding: EdgeInsets.symmetric(vertical: 24),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                    error: (e, _) => ModuleErrorView(message: '$e'),
                    data: (users) {
                      final q = _search.text.trim().toLowerCase();
                      final filtered = q.isEmpty
                          ? users
                          : users
                              .where((u) => u.name.toLowerCase().contains(q))
                              .toList();
                      if (filtered.isEmpty) {
                        return const ModuleEmptyView(
                          icon: Icons.person_outline,
                          message: 'Aucun collègue trouvé.',
                        );
                      }
                      return Column(
                        children: [
                          for (final u in filtered)
                            _UserTile(
                                user: u,
                                onTap: () => _openPeer(u.id, u.name)),
                        ],
                      );
                    },
                  ),
                ] else
                  convsAsync.when(
                    loading: () => const Padding(
                      padding: EdgeInsets.symmetric(vertical: 24),
                      child: Center(child: CircularProgressIndicator()),
                    ),
                    error: (e, _) => ModuleErrorView(message: '$e'),
                    data: (convs) {
                      if (convs.isEmpty) {
                        return const ModuleEmptyView(
                          icon: Icons.chat_bubble_outline,
                          message:
                              'Aucune discussion. Appuyez sur « + Nouveau » pour écrire à un collègue.',
                        );
                      }
                      return Column(
                        children: [
                          for (final c in convs)
                            _ConversationTile(
                              conv: c,
                              onTap: () => _openPeer(c.userId, c.name),
                            ),
                        ],
                      );
                    },
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({required this.conv, required this.onTap});
  final ChatConversationDto conv;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                _Avatar(name: conv.name),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(conv.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800,
                                    fontSize: 13.5)),
                          ),
                          Text(timeAgo(conv.lastAt),
                              style: const TextStyle(
                                  fontSize: 10.5, color: Colors.black45)),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              '${conv.lastFromMe ? "Vous : " : ""}${conv.lastMessage}',
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  color: Colors.black54, fontSize: 12),
                            ),
                          ),
                          if (conv.unread > 0) ...[
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 7, vertical: 1),
                              decoration: BoxDecoration(
                                color: const Color(0xFFE11D48),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text('${conv.unread}',
                                  style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 10,
                                      fontWeight: FontWeight.w900)),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _UserTile extends StatelessWidget {
  const _UserTile({required this.user, required this.onTap});
  final ChatUserDto user;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                _Avatar(name: user.name),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(user.name,
                          style: const TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 13.5)),
                      if (user.role != null && user.role!.isNotEmpty)
                        Text(user.role!.replaceAll('_', ' '),
                            style: const TextStyle(
                                color: Colors.black45, fontSize: 11)),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right, color: Colors.black38),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Avatar extends StatelessWidget {
  const _Avatar({required this.name});
  final String name;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        color: const Color(0xFF4F46E5).withOpacity(0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      alignment: Alignment.center,
      child: Text(initialsOf(name),
          style: const TextStyle(
              color: Color(0xFF4F46E5),
              fontSize: 11,
              fontWeight: FontWeight.w900)),
    );
  }
}
