import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'home_screen.dart';

/// Shell persistant : garde la bottom bar visible sur toutes les pages.
///
/// Chaque onglet a son propre `Navigator` imbriqué. Les `push` déclenchés
/// depuis un module n'écrasent plus le `Scaffold` racine, donc la barre
/// reste affichée au-dessus de la pile de l'onglet actif.
class AppShell extends ConsumerStatefulWidget {
  const AppShell({super.key});

  @override
  ConsumerState<AppShell> createState() => _AppShellState();
}

class _AppShellState extends ConsumerState<AppShell> {
  int _tab = 0;
  final _navKeys =
      List<GlobalKey<NavigatorState>>.generate(5, (_) => GlobalKey<NavigatorState>());

  Future<bool> _handlePop() async {
    final nav = _navKeys[_tab].currentState;
    if (nav != null && nav.canPop()) {
      nav.pop();
      return false;
    }
    if (_tab != 0) {
      setState(() => _tab = 0);
      return false;
    }
    return true;
  }

  void _select(int i) {
    if (i == _tab) {
      _navKeys[i]
          .currentState
          ?.popUntil((r) => r.isFirst);
    } else {
      setState(() => _tab = i);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvoked: (didPop) async {
        if (didPop) return;
        final shouldPop = await _handlePop();
        if (shouldPop && mounted) {
          Navigator.of(context).pop();
        }
      },
      child: Scaffold(
        backgroundColor: const Color(0xFFF5F6FB),
        body: SafeArea(
          bottom: false,
          child: IndexedStack(
            index: _tab,
            children: [
              _TabNavigator(navigatorKey: _navKeys[0], child: const HomeTab()),
              _TabNavigator(
                  navigatorKey: _navKeys[1],
                  child: const _StubTab(
                      label: 'Mes missions', icon: Icons.map_outlined)),
              _TabNavigator(
                  navigatorKey: _navKeys[2],
                  child: const _StubTab(
                      label: 'Scanner un document',
                      icon: Icons.qr_code_scanner)),
              _TabNavigator(
                  navigatorKey: _navKeys[3],
                  child: const _StubTab(
                      label: 'Discussion interne',
                      icon: Icons.chat_bubble_outline)),
              _TabNavigator(
                  navigatorKey: _navKeys[4], child: const ProfilTab()),
            ],
          ),
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: _select,
          destinations: const [
            NavigationDestination(
                icon: Icon(Icons.home_outlined),
                selectedIcon: Icon(Icons.home),
                label: 'Accueil'),
            NavigationDestination(
                icon: Icon(Icons.map_outlined),
                selectedIcon: Icon(Icons.map),
                label: 'Missions'),
            NavigationDestination(
                icon: Icon(Icons.qr_code_scanner), label: 'Scanner'),
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
      ),
    );
  }
}

class _TabNavigator extends StatelessWidget {
  const _TabNavigator({required this.navigatorKey, required this.child});
  final GlobalKey<NavigatorState> navigatorKey;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Navigator(
      key: navigatorKey,
      onGenerateRoute: (settings) => MaterialPageRoute(
        settings: settings,
        builder: (_) => child,
      ),
    );
  }
}

class _StubTab extends StatelessWidget {
  const _StubTab({required this.label, required this.icon});
  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F6FB),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 72, color: Colors.black26),
            const SizedBox(height: 16),
            Text(label,
                style: const TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 18)),
            const SizedBox(height: 6),
            const Text('Bientôt disponible.',
                style: TextStyle(color: Colors.black54)),
          ],
        ),
      ),
    );
  }
}
