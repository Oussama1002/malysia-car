import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../auth/auth_notifier.dart';
import '../auth/user_repo.dart';
import '../../features/auth/presentation/login_screen.dart';
import '../../features/chat/presentation/chat_screen.dart';
import '../../features/contracts/presentation/contracts_screen.dart';
import '../../features/customers/presentation/customers_screen.dart';
import '../../features/documents/presentation/documents_screen.dart';
import '../../features/gps/presentation/gps_screen.dart';
import '../../features/home/presentation/app_shell.dart';
import '../../features/home/presentation/home_screen.dart';
import '../../features/ocr/presentation/document_reader_screen.dart';
import '../../features/payments/presentation/payments_screen.dart';
import '../../features/reservations/presentation/reservations_screen.dart';
import '../../features/sub_rentals/presentation/sub_rentals_screen.dart';
import '../../features/used_cars/presentation/used_cars_screen.dart';
import '../../features/vehicles/presentation/vehicles_screen.dart';
import '../../features/website_leads/presentation/website_leads_screen.dart';

/// Routeur unique de l'app. Chaque module a désormais son propre chemin
/// (`/flotte`, `/reservations`, …) pour que l'URL de la version web change
/// quand on ouvre un module et qu'un lien direct fonctionne.
/// Chemins autorisés pour le MISSIONNAIRE (agent terrain) : missions + profil.
const _missionnairePaths = {'/missions', '/profil'};

final goRouterProvider = Provider<GoRouter>((ref) {
  // Pont entre l'état Riverpod et go_router : tout changement d'auth OU du
  // profil courant (donc du rôle) rafraîchit les redirections.
  final refresh = _RouterRefresh(ref);
  ref.onDispose(refresh.dispose);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: refresh,
    redirect: (context, state) {
      final loggedIn = ref.read(authProvider) is AuthReady;
      final loggingIn = state.matchedLocation == '/login';
      if (!loggedIn) return loggingIn ? null : '/login';
      if (loggingIn) return '/';

      // Le MISSIONNAIRE n'accède qu'aux missions : tout autre chemin (y
      // compris l'accueil « / ») le ramène sur /missions. Tant que le profil
      // n'est pas chargé (rôle inconnu), on laisse passer — l'UI du shell
      // masque déjà les affordances et la redirection se rejoue au chargement.
      final role =
          ref.read(currentUserProvider).valueOrNull?.role?.toUpperCase();
      if (role == 'MISSIONNAIRE' &&
          !_missionnairePaths.contains(state.matchedLocation)) {
        return '/missions';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      ShellRoute(
        builder: (context, state, child) =>
            AppShell(location: state.matchedLocation, child: child),
        routes: [
          GoRoute(path: '/', builder: (_, __) => const HomeTab()),
          GoRoute(path: '/missions', builder: (_, __) => const MissionsScreen()),
          GoRoute(path: '/profil', builder: (_, __) => const ProfilTab()),
          GoRoute(
              path: '/reservations',
              builder: (_, __) => const ReservationsScreen()),
          GoRoute(
              path: '/clients', builder: (_, __) => const CustomersScreen()),
          GoRoute(path: '/flotte', builder: (_, __) => const VehiclesScreen()),
          GoRoute(
              path: '/contrats', builder: (_, __) => const ContractsScreen()),
          GoRoute(
              path: '/paiements', builder: (_, __) => const PaymentsScreen()),
          GoRoute(
              path: '/documents', builder: (_, __) => const DocumentsScreen()),
          GoRoute(
              path: '/scanner',
              builder: (_, __) => const DocumentReaderScreen()),
          GoRoute(path: '/gps', builder: (_, __) => const GpsScreen()),
          GoRoute(path: '/discussions', builder: (_, __) => const ChatScreen()),
          GoRoute(
              path: '/sous-location',
              builder: (_, __) => const SubRentalsScreen()),
          GoRoute(path: '/occasion', builder: (_, __) => const UsedCarsScreen()),
          GoRoute(
              path: '/demandes',
              builder: (_, __) => const WebsiteLeadsScreen()),
        ],
      ),
    ],
  );
});

/// Rejoue les redirections de go_router quand l'auth OU le profil courant
/// change. On écoute les deux : le rôle (donc la restriction MISSIONNAIRE)
/// n'arrive qu'une fois `/auth/me` résolu, après la connexion.
class _RouterRefresh extends ChangeNotifier {
  _RouterRefresh(Ref ref) {
    ref.listen<AuthState>(authProvider, (_, __) => notifyListeners());
    ref.listen(currentUserProvider, (_, __) => notifyListeners());
  }
}
