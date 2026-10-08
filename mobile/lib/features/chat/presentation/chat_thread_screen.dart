import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:url_launcher/url_launcher.dart';

import '../data/chat_dto.dart';
import '../data/chat_repo.dart';

/// Fil de discussion 1-à-1 : bulles alignées (bleues à droite si envoyées
/// par l'utilisateur) + composer avec texte, galerie et appareil photo.
/// Rafraîchit le thread toutes les 5 secondes comme le web.
class ChatThreadScreen extends ConsumerStatefulWidget {
  const ChatThreadScreen({
    super.key,
    required this.peerId,
    required this.peerName,
  });

  final String peerId;
  final String peerName;

  @override
  ConsumerState<ChatThreadScreen> createState() => _ChatThreadScreenState();
}

class _ChatThreadScreenState extends ConsumerState<ChatThreadScreen> {
  final _draft = TextEditingController();
  final _scroll = ScrollController();
  Timer? _poll;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _poll = Timer.periodic(const Duration(seconds: 5), (_) {
      ref.invalidate(chatMessagesProvider(widget.peerId));
    });
  }

  @override
  void dispose() {
    _poll?.cancel();
    _draft.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _send({String? body, File? file}) async {
    if ((body == null || body.trim().isEmpty) && file == null) return;
    setState(() => _sending = true);
    try {
      await ref.read(chatRepoProvider).send(
            recipientId: widget.peerId,
            body: body,
            file: file,
          );
      _draft.clear();
      ref.invalidate(chatMessagesProvider(widget.peerId));
      ref.invalidate(chatConversationsProvider);
      ref.invalidate(chatUnreadProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Envoi échoué : $e')));
      }
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _pickImage(ImageSource source) async {
    try {
      final picker = ImagePicker();
      final x = await picker.pickImage(source: source, imageQuality: 85);
      if (x == null) return;
      await _send(file: File(x.path));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Image : $e')));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final msgsAsync = ref.watch(chatMessagesProvider(widget.peerId));
    // Scroll to bottom when new messages arrive.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            _Avatar(name: widget.peerName),
            const SizedBox(width: 10),
            Flexible(
              child: Text(widget.peerName,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontWeight: FontWeight.w900, fontSize: 15.5)),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: msgsAsync.when(
              loading: () =>
                  const Center(child: CircularProgressIndicator()),
              error: (e, _) => Center(
                  child: Text('Erreur: $e',
                      style:
                          const TextStyle(color: Colors.redAccent))),
              data: (msgs) {
                if (msgs.isEmpty) {
                  return const Center(
                    child: Text('Aucun message. Dites bonjour 👋',
                        style:
                            TextStyle(color: Colors.black45, fontSize: 13)),
                  );
                }
                return ListView.builder(
                  controller: _scroll,
                  padding: const EdgeInsets.all(12),
                  itemCount: msgs.length,
                  itemBuilder: (_, i) => _Bubble(message: msgs[i]),
                );
              },
            ),
          ),
          _Composer(
            controller: _draft,
            sending: _sending,
            onSend: () => _send(body: _draft.text),
            onPickGallery: () => _pickImage(ImageSource.gallery),
            onPickCamera: () => _pickImage(ImageSource.camera),
          ),
        ],
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.message});
  final ChatMessageDto message;

  @override
  Widget build(BuildContext context) {
    final mine = message.fromMe;
    final bg = mine ? const Color(0xFF4F46E5) : Colors.white;
    final fg = mine ? Colors.white : const Color(0xFF1F2937);
    final subFg = mine ? Colors.white70 : Colors.black45;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.78,
        ),
        margin: const EdgeInsets.symmetric(vertical: 3),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(mine ? 16 : 4),
            bottomRight: Radius.circular(mine ? 4 : 16),
          ),
          boxShadow: [
            if (!mine)
              BoxShadow(
                color: Colors.black.withOpacity(0.04),
                blurRadius: 8,
                offset: const Offset(0, 2),
              ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (message.attachment != null) _Attachment(att: message.attachment!, mine: mine),
            if (message.body != null && message.body!.isNotEmpty) ...[
              if (message.attachment != null) const SizedBox(height: 6),
              Text(message.body!,
                  style: TextStyle(color: fg, fontSize: 13.5, height: 1.3)),
            ],
            const SizedBox(height: 3),
            Text(_clock(message.createdAt),
                style: TextStyle(color: subFg, fontSize: 10)),
          ],
        ),
      ),
    );
  }

  String _clock(DateTime? at) {
    if (at == null) return '';
    final hh = at.hour.toString().padLeft(2, '0');
    final mm = at.minute.toString().padLeft(2, '0');
    return '$hh:$mm';
  }
}

class _Attachment extends StatelessWidget {
  const _Attachment({required this.att, required this.mine});
  final ChatAttachmentDto att;
  final bool mine;

  @override
  Widget build(BuildContext context) {
    final labelBg = mine ? Colors.white24 : const Color(0xFFF3F4F6);
    final labelFg = mine ? Colors.white : const Color(0xFF374151);
    if (att.isImage) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          onTap: () => launchUrl(Uri.parse(att.url),
              mode: LaunchMode.externalApplication),
          child: Image.network(
            att.url,
            width: 220,
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => Container(
              width: 220,
              height: 160,
              color: Colors.black12,
              child: const Icon(Icons.broken_image, color: Colors.black38),
            ),
          ),
        ),
      );
    }
    if (att.isAudio) {
      return InkWell(
        onTap: () => launchUrl(Uri.parse(att.url),
            mode: LaunchMode.externalApplication),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
              color: labelBg, borderRadius: BorderRadius.circular(10)),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.play_arrow, color: labelFg, size: 18),
              const SizedBox(width: 6),
              Text('Message vocal',
                  style: TextStyle(
                      color: labelFg,
                      fontSize: 12,
                      fontWeight: FontWeight.w800)),
              if (att.duration != null) ...[
                const SizedBox(width: 6),
                Text('${att.duration}s',
                    style: TextStyle(
                        color: labelFg.withOpacity(0.75), fontSize: 11)),
              ],
            ],
          ),
        ),
      );
    }
    return InkWell(
      onTap: () => launchUrl(Uri.parse(att.url),
          mode: LaunchMode.externalApplication),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
            color: labelBg, borderRadius: BorderRadius.circular(10)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.insert_drive_file_outlined, color: labelFg, size: 16),
            const SizedBox(width: 6),
            Flexible(
              child: Text(att.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      color: labelFg,
                      fontSize: 12,
                      fontWeight: FontWeight.w800)),
            ),
          ],
        ),
      ),
    );
  }
}

class _Composer extends StatelessWidget {
  const _Composer({
    required this.controller,
    required this.sending,
    required this.onSend,
    required this.onPickGallery,
    required this.onPickCamera,
  });

  final TextEditingController controller;
  final bool sending;
  final VoidCallback onSend;
  final VoidCallback onPickGallery;
  final VoidCallback onPickCamera;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.only(
        left: 8,
        right: 8,
        top: 6,
        bottom: 6 + MediaQuery.of(context).padding.bottom,
      ),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(top: BorderSide(color: Theme.of(context).dividerColor)),
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: sending ? null : onPickGallery,
            icon: const Icon(Icons.attach_file),
            tooltip: 'Joindre une image',
            visualDensity: VisualDensity.compact,
          ),
          IconButton(
            onPressed: sending ? null : onPickCamera,
            icon: const Icon(Icons.photo_camera_outlined),
            tooltip: 'Prendre une photo',
            visualDensity: VisualDensity.compact,
          ),
          Expanded(
            child: TextField(
              controller: controller,
              textInputAction: TextInputAction.send,
              onSubmitted: (_) => onSend(),
              minLines: 1,
              maxLines: 4,
              decoration: InputDecoration(
                hintText: 'Écrire un message…',
                filled: true,
                fillColor: const Color(0xFFF3F4F6),
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(
                    horizontal: 14, vertical: 10),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(22),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
          ),
          const SizedBox(width: 4),
          FilledButton(
            onPressed: sending ? null : onSend,
            style: FilledButton.styleFrom(
              backgroundColor: const Color(0xFF4F46E5),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              shape:
                  RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              minimumSize: const Size(0, 44),
            ),
            child: Text(sending ? '…' : 'Envoyer',
                style: const TextStyle(
                    fontWeight: FontWeight.w900, fontSize: 12)),
          ),
        ],
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
      width: 32,
      height: 32,
      decoration: BoxDecoration(
          color: const Color(0xFF4F46E5).withOpacity(0.12),
          borderRadius: BorderRadius.circular(999)),
      alignment: Alignment.center,
      child: Text(initialsOf(name),
          style: const TextStyle(
              color: Color(0xFF4F46E5),
              fontSize: 11,
              fontWeight: FontWeight.w900)),
    );
  }
}


