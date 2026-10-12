import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../core/auth/auth_notifier.dart';
import '../../../core/auth/user_dto.dart';
import '../../../core/auth/user_repo.dart';
import '../../../core/router/modules.dart';
import '../../../core/theme/theme_mode_provider.dart';
import '../../chat/data/chat_repo.dart';
import '../../notifications/data/notifications_repo.dart';

/// Onglet Accueil : en-tête, bannière violette, grille de modules.
/// Monté dans le Navigator imbriqué de l'onglet Accueil par `AppShell`,
/// pour que la bottom bar reste visible quand on ouvre un module.
class HomeTab extends ConsumerWidget {
  const HomeTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          const _HomeHeader(),
          const SizedBox(height: 12),
          const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: _HeroBanner()),
          const SizedBox(height: 24),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Text('MODULES',
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: cs.onSurface.withOpacity(0.55),
                    letterSpacing: 1.6)),
          ),
          const SizedBox(height: 12),
          const Padding(
              padding: EdgeInsets.symmetric(horizontal: 12),
              child: _ModulesGrid()),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _HomeHeader extends ConsumerWidget {
  const _HomeHeader();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final name = switch (auth) {
      AuthReady(:final email) => _nameFrom(email),
      _ => '',
    };
    final cs = Theme.of(context).colorScheme;
    return Container(
      color: cs.surface,
      padding: const EdgeInsets.fromLTRB(16, 12, 12, 14),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: cs.surface,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Theme.of(context).dividerColor),
            ),
            child: Image.asset('assets/logo.png', fit: BoxFit.contain),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('DRIVEFLOW',
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 2,
                        color: cs.onSurface.withOpacity(0.55))),
                const SizedBox(height: 2),
                Text('Bonjour $name 👋',
                    style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.w800,
                        color: cs.onSurface)),
              ],
            ),
          ),
          IconButton(
            onPressed: () {},
            icon: Icon(Icons.notifications_none, color: cs.onSurface),
            style: IconButton.styleFrom(
              backgroundColor: cs.surfaceContainerHighest.withOpacity(0.5),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              minimumSize: const Size(46, 46),
            ),
          ),
        ],
      ),
    );
  }

  String _nameFrom(String email) {
    final local = email.split('@').first;
    final first = local.split(RegExp(r'[._-]')).first;
    if (first.isEmpty) return '';
    return first[0].toUpperCase() + first.substring(1).toLowerCase();
  }
}

class _HeroBanner extends ConsumerWidget {
  const _HeroBanner();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Compteurs live : notifications non lues + messages chat non lus.
    final notifUnread =
        ref.watch(notificationsUnreadProvider).valueOrNull ?? 0;
    final chatUnread = ref.watch(chatUnreadProvider).valueOrNull ?? 0;
    String fmt(int n) => n > 99 ? '99+' : '$n';
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 18, 20, 20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF4F46E5), Color(0xFF7C3AED)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF4F46E5).withOpacity(0.25),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('OPÉRATIONS TERRAIN',
              style: TextStyle(
                  color: Colors.white70,
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.4)),
          const SizedBox(height: 8),
          const Text('Toute la CRM\ndans votre poche',
              style: TextStyle(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  height: 1.15)),
          const SizedBox(height: 16),
          Row(
            children: [
              _HeroPill(
                  icon: Icons.notifications_none,
                  label: '${fmt(notifUnread)} notif.'),
              const SizedBox(width: 8),
              _HeroPill(
                  icon: Icons.chat_bubble_outline,
                  label: '${fmt(chatUnread)} messages'),
            ],
          ),
        ],
      ),
    );
  }
}

class _HeroPill extends StatelessWidget {
  const _HeroPill({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.18),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: Colors.white, size: 15),
          const SizedBox(width: 6),
          Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12)),
        ],
      ),
    );
  }
}

class _ModulesGrid extends StatelessWidget {
  const _ModulesGrid();

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    const modules = kModules;

    return Container(
      decoration: BoxDecoration(
        color: cs.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark
              ? cs.onSurface.withOpacity(0.08)
              : Colors.black.withOpacity(0.06),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(isDark ? 0.2 : 0.03),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Column(
          children: [
            for (int i = 0; i < modules.length; i++) ...[
              _ModuleRow(entry: modules[i]),
              if (i < modules.length - 1)
                Divider(
                  height: 0,
                  thickness: 1,
                  color: isDark
                      ? cs.onSurface.withOpacity(0.06)
                      : Colors.black.withOpacity(0.04),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ModuleRow extends StatelessWidget {
  const _ModuleRow({required this.entry});
  final ModuleDescriptor entry;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: () => context.go(entry.path),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: entry.color,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(entry.icon, color: Colors.white, size: 20),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Text(
                  entry.label,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                    color: cs.onSurface,
                  ),
                ),
              ),
              Icon(Icons.chevron_right,
                  color: cs.onSurface.withOpacity(0.3), size: 22),
            ],
          ),
        ),
      ),
    );
  }
}

class ProfilTab extends ConsumerWidget {
  const ProfilTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(currentUserProvider);
    final themeMode = ref.watch(themeModeProvider);
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(currentUserProvider),
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const SizedBox(height: 40),
              Icon(Icons.error_outline,
                  size: 56, color: cs.onSurface.withOpacity(0.25)),
              const SizedBox(height: 10),
              Center(
                  child: Text('Impossible de charger le profil.\n$e',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: cs.onSurface.withOpacity(0.6),
                          fontSize: 12))),
              const SizedBox(height: 20),
              _logoutButton(ref),
            ],
          ),
          data: (u) {
            final dateFmt = DateFormat('dd/MM/yyyy HH:mm', 'fr');
            return ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                _ProfileHeader(user: u),
                const SizedBox(height: 14),
                _InfoCard(
                  title: 'IDENTITÉ',
                  rows: [
                    _InfoRow(label: 'Nom complet', value: u.displayName),
                    _InfoRow(label: 'Email', value: u.email),
                    if (u.phone != null && u.phone!.isNotEmpty)
                      _InfoRow(label: 'Téléphone', value: u.phone!),
                    _InfoRow(label: 'Rôle', value: roleFr(u.role)),
                    if (u.status != null)
                      _InfoRow(
                          label: 'Statut',
                          value: u.status == 'active'
                              ? 'Actif'
                              : u.status!),
                    _InfoRow(label: 'Langue', value: u.locale ?? 'fr'),
                  ],
                ),
                if (u.roles.isNotEmpty)
                  _InfoCard(
                    title: 'RÔLES (${u.roles.length})',
                    rows: [
                      for (final r in u.roles)
                        _InfoRow(
                          label: r.name.isNotEmpty ? r.name : r.code,
                          value: r.code,
                        ),
                    ],
                  ),
                if (u.branches.isNotEmpty)
                  _InfoCard(
                    title: 'AGENCES (${u.branches.length})',
                    rows: [
                      for (final b in u.branches)
                        _InfoRow(
                          label: b.name +
                              (b.isPrimary ? '  (principale)' : ''),
                          value: b.code ?? '—',
                        ),
                    ],
                  ),
                _InfoCard(
                  title: 'ACTIVITÉ',
                  rows: [
                    if (u.lastLoginAt != null)
                      _InfoRow(
                          label: 'Dernière connexion',
                          value: dateFmt.format(u.lastLoginAt!)),
                    if (u.createdAt != null)
                      _InfoRow(
                          label: 'Compte créé le',
                          value: dateFmt.format(u.createdAt!)),
                  ],
                ),
                // Préférence thème — même toggle que la top bar, mais ici
                // en interrupteur explicite pour le reglage.
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 10),
                    margin: const EdgeInsets.only(bottom: 10),
                    decoration: BoxDecoration(
                      color: cs.surface,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: Theme.of(context).dividerColor),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          themeMode == ThemeMode.dark
                              ? Icons.dark_mode
                              : Icons.light_mode,
                          color: cs.primary,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text('Mode sombre',
                              style: TextStyle(
                                  fontWeight: FontWeight.w800,
                                  fontSize: 14,
                                  color: cs.onSurface)),
                        ),
                        Switch(
                          value: themeMode == ThemeMode.dark,
                          activeColor: cs.primary,
                          onChanged: (_) => ref
                              .read(themeModeProvider.notifier)
                              .toggle(),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 10),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: _logoutButton(ref),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _logoutButton(WidgetRef ref) {
    return FilledButton.tonalIcon(
      onPressed: () => ref.read(authProvider.notifier).signOut(),
      icon: const Icon(Icons.logout),
      label: const Text('Déconnexion'),
      style: FilledButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        backgroundColor: Colors.red.shade50,
        foregroundColor: Colors.red.shade700,
      ),
    );
  }
}

class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader({required this.user});
  final UserDto user;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.all(16),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF4F46E5), Color(0xFF7C3AED)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(22),
      ),
      child: Column(
        children: [
          CircleAvatar(
            radius: 44,
            backgroundColor: Colors.white,
            backgroundImage:
                user.avatar != null && user.avatar!.isNotEmpty
                    ? NetworkImage(user.avatar!)
                    : null,
            child: (user.avatar == null || user.avatar!.isEmpty)
                ? Text(user.initials,
                    style: const TextStyle(
                        color: Color(0xFF4F46E5),
                        fontSize: 28,
                        fontWeight: FontWeight.w900))
                : null,
          ),
          const SizedBox(height: 12),
          Text(user.displayName,
              style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w900,
                  fontSize: 18)),
          const SizedBox(height: 2),
          Text(user.email,
              style: const TextStyle(
                  color: Colors.white70, fontSize: 13)),
          const SizedBox(height: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.18),
                borderRadius: BorderRadius.circular(999)),
            child: Text(roleFr(user.role),
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.5)),
          ),
        ],
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.title, required this.rows});
  final String title;
  final List<_InfoRow> rows;

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) return const SizedBox.shrink();
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
        decoration: BoxDecoration(
          color: cs.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Theme.of(context).dividerColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title,
                style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w900,
                    color: cs.onSurface.withOpacity(0.55),
                    letterSpacing: 1.3)),
            const SizedBox(height: 6),
            ...rows,
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(label,
                style: TextStyle(
                    fontSize: 12, color: cs.onSurface.withOpacity(0.6))),
          ),
          const SizedBox(width: 10),
          Flexible(
            child: Text(value,
                textAlign: TextAlign.right,
                style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w800,
                    color: cs.onSurface)),
          ),
        ],
      ),
    );
  }
}

