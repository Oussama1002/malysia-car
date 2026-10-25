import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:intl/intl.dart';

import '../../../core/auth/user_repo.dart';
import '../../../core/router/modules.dart';
import '../../../core/theme/theme_mode_provider.dart';
import '../../customers/presentation/new_customer_screen.dart';
import '../../reservations/presentation/new_contract_from_reservation_screen.dart';
import '../../reservations/presentation/new_reservation_screen.dart';
import '../../vehicles/presentation/new_vehicle_screen.dart';
import '../../notifications/data/notification_dto.dart';
import '../../notifications/data/notifications_repo.dart';
import '../../notifications/presentation/notification_navigation.dart';
import '../../notifications/presentation/notifications_screen.dart';

/// Shell persistant : garde la top bar et la bottom bar visibles autour du
/// module courant. Le `child` est l'écran de la route active (fourni par
/// go_router) ; chaque module ayant son propre chemin, l'URL de la version
/// web change quand on navigue.
class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key, required this.location, required this.child});

  final String location;
  final Widget child;

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  final _scaffoldKey = GlobalKey<ScaffoldState>();

  /// Index de l'onglet actif déduit du chemin courant. Les modules ouverts
  /// depuis l'accueil gardent l'onglet Accueil surligné.
  ///
  /// Le MISSIONNAIRE (agent terrain) n'a que deux onglets : Missions + Profil.
  int _tabFor(bool missionnaireOnly) {
    if (missionnaireOnly) {
      return widget.location == '/profil' ? 1 : 0;
    }
    return switch (widget.location) {
      '/missions' => 1,
      '/discussions' => 3,
      '/profil' => 4,
      _ => 0,
    };
  }

  void _select(int i, bool missionnaireOnly) {
    if (missionnaireOnly) {
      // Barre réduite : 0 = Missions, 1 = Profil. Rien d'autre.
      context.go(i == 1 ? '/profil' : '/missions');
      return;
    }
    switch (i) {
      case 0:
        context.go('/');
        break;
      case 1:
        context.go('/missions');
        break;
      case 2:
        // Bouton d'action rapide : ouvre le dropup, pas de navigation.
        _openQuickAdd();
        break;
      case 3:
        context.go('/discussions');
        break;
      case 4:
        context.go('/profil');
        break;
    }
  }

  /// Dropup des creations rapides : nouvelle reservation / client / contrat.
  Future<void> _openQuickAdd() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => const _QuickAddSheet(),
    );
    if (choice == null || !mounted) return;
    Widget? target = switch (choice) {
      'reservation' => const NewReservationScreen(),
      'customer' => const NewCustomerScreen(),
      'contract' => const NewContractFromReservationScreen(),
      'vehicle' => const NewVehicleScreen(),
      _ => null,
    };
    if (target != null) {
      final page = target;
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));
    }
  }

  @override
  Widget build(BuildContext context) {
    // Rôle courant : le MISSIONNAIRE (agent terrain) n'a droit qu'aux
    // missions — pas de grille modules, pas de drawer, pas de création
    // rapide, pas de chat. Les autres rôles gardent la barre complète.
    final role =
        ref.watch(currentUserProvider).valueOrNull?.role?.toUpperCase();
    final missionnaireOnly = role == 'MISSIONNAIRE';
    return Scaffold(
      key: _scaffoldKey,
      drawer: missionnaireOnly ? null : const _ModulesDrawer(),
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _PersistentTopBar(
              onMenu: () => _scaffoldKey.currentState?.openDrawer(),
              showMenu: !missionnaireOnly,
            ),
            Expanded(child: widget.child),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        // L'index 2 est le bouton d'action rapide (pas un ecran) : on
        // ne le selectionne jamais, donc on reporte sur un autre onglet.
        selectedIndex: _tabFor(missionnaireOnly),
        onDestinationSelected: (i) => _select(i, missionnaireOnly),
        destinations: missionnaireOnly
            ? const [
                NavigationDestination(
                    icon: Icon(Icons.map_outlined),
                    selectedIcon: Icon(Icons.map),
                    label: 'Missions'),
                NavigationDestination(
                    icon: Icon(Icons.person_outline),
                    selectedIcon: Icon(Icons.person),
                    label: 'Profil'),
              ]
            : const [
                NavigationDestination(
                    icon: Icon(Icons.home_outlined),
                    selectedIcon: Icon(Icons.home),
                    label: 'Accueil'),
                NavigationDestination(
                    icon: Icon(Icons.map_outlined),
                    selectedIcon: Icon(Icons.map),
                    label: 'Missions'),
                // Bouton d'action rapide central — n'ouvre pas d'ecran, mais
                // un dropup de creations (reservation / client / contrat).
                // L'index 2 est intercepte dans _select().
                NavigationDestination(
                  icon: _QuickAddIcon(),
                  selectedIcon: _QuickAddIcon(),
                  label: 'Nouveau',
                ),
                NavigationDestination(
                    icon: Icon(Icons.chat_bubble_outline),
                    selectedIcon: Icon(Icons.chat_bubble),
                    label: 'Chat'),
                NavigationDestination(
                    icon: Icon(Icons.person_outline),
                    selectedIcon: Icon(Icons.person),
                    label: 'Profil'),
              ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Drawer latéral — tous les modules de l'accueil
// ---------------------------------------------------------------------------

class _ModulesDrawer extends StatelessWidget {
  const _ModulesDrawer();

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Drawer(
      backgroundColor: cs.surface,
      child: SafeArea(
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
              decoration: BoxDecoration(
                color: cs.surface,
                border: Border(bottom: BorderSide(color: Theme.of(context).dividerColor)),
              ),
              child: Row(
                children: [
                  Container(
                    width: 42,
                    height: 42,
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: cs.surface,
                      borderRadius: BorderRadius.circular(12),
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
                        Text('Modules',
                            style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w900,
                                color: cs.onSurface)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(vertical: 8),
                itemCount: kModules.length,
                separatorBuilder: (_, __) => const SizedBox(height: 2),
                itemBuilder: (ctx, i) {
                  final m = kModules[i];
                  return ListTile(
                    leading: Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        color: m.color,
                        borderRadius: BorderRadius.circular(10),
                        boxShadow: [
                          BoxShadow(
                            color: m.color.withOpacity(0.35),
                            blurRadius: 8,
                            offset: const Offset(0, 3),
                          ),
                        ],
                      ),
                      child: Icon(m.icon, color: Colors.white, size: 20),
                    ),
                    title: Text(m.label,
                        style: TextStyle(
                            fontWeight: FontWeight.w800,
                            fontSize: 13.5,
                            color: cs.onSurface)),
                    trailing: Icon(Icons.chevron_right,
                        color: cs.onSurface.withOpacity(0.38), size: 20),
                    onTap: () {
                      Navigator.of(ctx).pop(); // referme le Drawer
                      ctx.go(m.path);
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Top bar persistant
// ---------------------------------------------------------------------------

class _PersistentTopBar extends ConsumerStatefulWidget {
  const _PersistentTopBar({required this.onMenu, this.showMenu = true});
  final VoidCallback onMenu;
  // Masqué pour le MISSIONNAIRE : il n'a pas de drawer de modules.
  final bool showMenu;

  @override
  ConsumerState<_PersistentTopBar> createState() => _PersistentTopBarState();
}

class _PersistentTopBarState extends ConsumerState<_PersistentTopBar> {
  bool _searching = false;
  final _searchCtrl = TextEditingController();
  final _focus = FocusNode();

  @override
  void dispose() {
    _searchCtrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _openSearch() {
    setState(() => _searching = true);
    WidgetsBinding.instance.addPostFrameCallback((_) => _focus.requestFocus());
  }

  void _closeSearch() {
    _searchCtrl.clear();
    _focus.unfocus();
    setState(() => _searching = false);
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: cs.surface,
        border: Border(bottom: BorderSide(color: Theme.of(context).dividerColor)),
      ),
      child: SizedBox(
        height: 52,
        child: _searching ? _buildSearchBar() : _buildStandardBar(),
      ),
    );
  }

  Widget _buildStandardBar() {
    final cs = Theme.of(context).colorScheme;
    return Row(
      children: [
        if (widget.showMenu) _TopIcon(icon: Icons.menu, onTap: widget.onMenu),
        const SizedBox(width: 4),
        Expanded(
          child: Row(
            children: [
              Text('Opérations',
                  style: TextStyle(
                      color: cs.onSurface.withOpacity(0.6),
                      fontSize: 13,
                      fontWeight: FontWeight.w600)),
              Icon(Icons.chevron_right,
                  size: 18, color: cs.onSurface.withOpacity(0.3)),
              Flexible(
                child: Text('DriveFlow',
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: cs.onSurface)),
              ),
            ],
          ),
        ),
        _TopIcon(
          icon: ref.watch(themeModeProvider) == ThemeMode.dark
              ? Icons.light_mode_outlined
              : Icons.dark_mode_outlined,
          onTap: () => ref.read(themeModeProvider.notifier).toggle(),
        ),
        _TopIcon(icon: Icons.search, onTap: _openSearch),
        const _NotificationsBell(),
        _TopIcon(icon: Icons.open_in_new, onTap: () {}),
        const SizedBox(width: 6),
      ],
    );
  }

  Widget _buildSearchBar() {
    final cs = Theme.of(context).colorScheme;
    return Row(
      children: [
        IconButton(
          onPressed: _closeSearch,
          icon: Icon(Icons.arrow_back, size: 22, color: cs.onSurface),
          visualDensity: VisualDensity.compact,
        ),
        Expanded(
          child: TextField(
            controller: _searchCtrl,
            focusNode: _focus,
            textInputAction: TextInputAction.search,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              hintText: 'Rechercher…',
              hintStyle: TextStyle(
                  color: cs.onSurface.withOpacity(0.4), fontSize: 14),
              border: InputBorder.none,
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(horizontal: 4),
            ),
            style: TextStyle(fontSize: 14, color: cs.onSurface),
          ),
        ),
        if (_searchCtrl.text.isNotEmpty)
          IconButton(
            onPressed: () => setState(() => _searchCtrl.clear()),
            icon: Icon(Icons.close,
                size: 20, color: cs.onSurface.withOpacity(0.6)),
            visualDensity: VisualDensity.compact,
          ),
        const SizedBox(width: 4),
      ],
    );
  }
}

class _TopIcon extends StatelessWidget {
  const _TopIcon({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return IconButton(
      onPressed: onTap,
      icon: Icon(icon,
          size: 22, color: Theme.of(context).colorScheme.onSurface),
      visualDensity: VisualDensity.compact,
    );
  }
}

/// Cloche des notifications — reproduit le comportement du bouton web :
/// badge avec le vrai nombre de non-lues (polling 20 s), tap ouvre un
/// bottom-sheet avec les 6 dernières + bouton « Voir toutes ».
class _NotificationsBell extends ConsumerStatefulWidget {
  const _NotificationsBell();

  @override
  ConsumerState<_NotificationsBell> createState() =>
      _NotificationsBellState();
}

class _NotificationsBellState extends ConsumerState<_NotificationsBell> {
  @override
  Widget build(BuildContext context) {
    final unread = ref.watch(notificationsUnreadProvider).valueOrNull ?? 0;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        _TopIcon(
          icon: Icons.notifications_none,
          onTap: () => _openPreview(context),
        ),
        if (unread > 0)
          Positioned(
            right: 2,
            top: 4,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1.5),
              decoration: BoxDecoration(
                color: Colors.red.shade500,
                borderRadius: BorderRadius.circular(999),
              ),
              constraints: const BoxConstraints(minWidth: 20),
              child: Text(
                unread > 99 ? '99+' : '$unread',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 9,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ),
      ],
    );
  }

  Future<void> _openPreview(BuildContext context) async {
    ref.invalidate(notificationsPreviewProvider);
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (sheetCtx) => Consumer(builder: (_, sheetRef, __) {
        final async = sheetRef.watch(notificationsPreviewProvider);
        return _NotificationsSheet(
          async: async,
          onViewAll: () {
            Navigator.of(sheetCtx).pop();
            Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => const NotificationsScreen(),
            ));
          },
          onOpen: (n) {
            final dest = notificationDestination(n);
            Navigator.of(sheetCtx).pop();
            if (n.isUnread) {
              sheetRef.read(notificationsRepoProvider).markRead(n.id).then((_) {
                sheetRef.invalidate(notificationsPreviewProvider);
                sheetRef.invalidate(notificationsListProvider);
                sheetRef.invalidate(notificationsUnreadProvider);
              }).catchError((_) {});
            }
            if (dest != null && context.mounted) {
              Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => dest));
            }
          },
        );
      }),
    );
  }
}

class _NotificationsSheet extends StatelessWidget {
  const _NotificationsSheet({
    required this.async,
    required this.onViewAll,
    required this.onOpen,
  });
  final AsyncValue<List<NotificationDto>> async;
  final VoidCallback onViewAll;
  final void Function(NotificationDto n) onOpen;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return SafeArea(
      top: false,
      child: Container(
        padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
        decoration: BoxDecoration(
          color: cs.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                  color: cs.onSurface.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(999)),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: Text('NOTIFICATIONS',
                      style: TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w900,
                          color: cs.onSurface.withOpacity(0.55),
                          letterSpacing: 1.4)),
                ),
                TextButton(
                  onPressed: onViewAll,
                  style: TextButton.styleFrom(
                    foregroundColor: const Color(0xFFB8933F),
                    textStyle: const TextStyle(
                        fontWeight: FontWeight.w900, fontSize: 11.5),
                  ),
                  child: const Text('Voir toutes les notif'),
                ),
              ],
            ),
            const SizedBox(height: 4),
            ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.of(context).size.height * 0.55,
              ),
              child: async.when(
                loading: () => const Padding(
                  padding: EdgeInsets.symmetric(vertical: 24),
                  child: Center(child: CircularProgressIndicator()),
                ),
                error: (e, _) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 20),
                  child: Text('Erreur : $e',
                      style: const TextStyle(color: Colors.redAccent)),
                ),
                data: (items) {
                  if (items.isEmpty) {
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 28),
                      child: Center(
                        child: Text('Aucune notification.',
                            style: TextStyle(
                                color: cs.onSurface.withOpacity(0.55),
                                fontSize: 12.5)),
                      ),
                    );
                  }
                  return ListView.separated(
                    shrinkWrap: true,
                    padding: const EdgeInsets.only(bottom: 8, top: 4),
                    itemCount: items.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 4),
                    itemBuilder: (_, i) {
                      final n = items[i];
                      final dateFmt = DateFormat('dd/MM/yyyy HH:mm', 'fr');
                      final unread = n.isUnread;
                      return InkWell(
                        onTap: () => onOpen(n),
                        borderRadius: BorderRadius.circular(12),
                        child: Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: unread
                                ? cs.primary.withOpacity(0.10)
                                : cs.surface,
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(
                              color: unread
                                  ? cs.primary.withOpacity(0.35)
                                  : Theme.of(context).dividerColor,
                            ),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              if (unread)
                                Container(
                                  margin:
                                      const EdgeInsets.only(top: 4, right: 7),
                                  width: 8,
                                  height: 8,
                                  decoration: BoxDecoration(
                                      color: cs.primary,
                                      shape: BoxShape.circle),
                                ),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment:
                                      CrossAxisAlignment.start,
                                  children: [
                                    Text(n.title,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                            fontWeight: unread
                                                ? FontWeight.w900
                                                : FontWeight.w700,
                                            fontSize: 12.5,
                                            color: cs.onSurface)),
                                    if (n.body != null && n.body!.isNotEmpty)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 2),
                                        child: Text(
                                          n.body!,
                                          maxLines: 2,
                                          overflow: TextOverflow.ellipsis,
                                          style: TextStyle(
                                              fontSize: 11,
                                              color: cs.onSurface
                                                  .withOpacity(0.6)),
                                        ),
                                      ),
                                    if (n.createdAt != null)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 3),
                                        child: Text(dateFmt.format(n.createdAt!),
                                            style: TextStyle(
                                                fontSize: 10,
                                                color: cs.onSurface
                                                    .withOpacity(0.55))),
                                      ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Onglet « Mes missions » — placeholder en attendant le module terrain.
class MissionsScreen extends StatelessWidget {
  const MissionsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.map_outlined,
                size: 72, color: cs.onSurface.withOpacity(0.25)),
            const SizedBox(height: 16),
            Text('Mes missions',
                style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 18,
                    color: cs.onSurface)),
            const SizedBox(height: 6),
            Text('Bientôt disponible.',
                style: TextStyle(color: cs.onSurface.withOpacity(0.6))),
          ],
        ),
      ),
    );
  }
}

/// Icone centrale de la bottom bar : pastille indigo "+" avec legere
/// ombre pour qu'elle ressorte comme un bouton d'action rapide.
class _QuickAddIcon extends StatelessWidget {
  const _QuickAddIcon();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 44,
      height: 44,
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFB8933F), Color(0xFF9A7B2E)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: const Color(0xFFB8933F).withOpacity(0.3),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: const Icon(Icons.add, color: Colors.white, size: 26),
    );
  }
}

/// Dropup "+" : propose 3 raccourcis de creation + annulation.
class _QuickAddSheet extends StatelessWidget {
  const _QuickAddSheet();

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return SafeArea(
      top: false,
      child: Container(
        margin: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: cs.surface,
          borderRadius: BorderRadius.circular(22),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.15),
              blurRadius: 24,
              offset: const Offset(0, 10),
            ),
          ],
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: cs.onSurface.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text('CRÉER',
                    style: TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w900,
                        color: cs.onSurface.withOpacity(0.55),
                        letterSpacing: 1.3)),
              ),
            ),
            _QuickAddTile(
              icon: Icons.event,
              color: const Color(0xFFB8933F),
              title: 'Nouvelle réservation',
              subtitle: 'Bloquer un véhicule pour un client',
              onTap: () => Navigator.of(context).pop('reservation'),
            ),
            _QuickAddTile(
              icon: Icons.person_add_alt_1,
              color: const Color(0xFF10B981),
              title: 'Nouveau client',
              subtitle: 'Particulier ou entreprise, avec KYC',
              onTap: () => Navigator.of(context).pop('customer'),
            ),
            _QuickAddTile(
              icon: Icons.description_outlined,
              color: const Color(0xFFF59E0B),
              title: 'Nouveau contrat',
              subtitle: 'LCD, LLD, LOA, crédit auto, vente VO',
              onTap: () => Navigator.of(context).pop('contract'),
            ),
            _QuickAddTile(
              icon: Icons.directions_car,
              color: const Color(0xFFB8933F),
              title: 'Nouveau véhicule',
              subtitle: 'Ajouter un véhicule à la flotte',
              onTap: () => Navigator.of(context).pop('vehicle'),
            ),
            const SizedBox(height: 6),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              child: SizedBox(
                width: double.infinity,
                child: OutlinedButton(
                  onPressed: () => Navigator.of(context).pop(),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: cs.onSurface.withOpacity(0.7),
                    side: BorderSide(color: Theme.of(context).dividerColor),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                    textStyle: const TextStyle(
                        fontWeight: FontWeight.w900, fontSize: 12.5),
                  ),
                  child: const Text('Annuler'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickAddTile extends StatelessWidget {
  const _QuickAddTile({
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: color.withOpacity(0.12),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: color, size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 14,
                          color: cs.onSurface)),
                  const SizedBox(height: 2),
                  Text(subtitle,
                      style: TextStyle(
                          color: cs.onSurface.withOpacity(0.6),
                          fontSize: 11.5)),
                ],
              ),
            ),
            Icon(Icons.chevron_right, color: cs.onSurface.withOpacity(0.3)),
          ],
        ),
      ),
    );
  }
}

