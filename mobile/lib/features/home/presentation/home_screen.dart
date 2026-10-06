import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_notifier.dart';
import '../../placeholders/placeholder_screen.dart';
import '../../contracts/presentation/contracts_screen.dart';
import '../../customers/presentation/customers_screen.dart';
import '../../gps/presentation/gps_screen.dart';
import '../../sub_rentals/presentation/sub_rentals_screen.dart';
import '../../used_cars/presentation/used_cars_screen.dart';
import '../../vehicles/presentation/vehicles_screen.dart';
import '../../website_leads/presentation/website_leads_screen.dart';
import '../../reservations/presentation/reservations_screen.dart';

/// Onglet Accueil : en-tête, bannière violette, grille de modules.
/// Monté dans le Navigator imbriqué de l'onglet Accueil par `AppShell`,
/// pour que la bottom bar reste visible quand on ouvre un module.
class HomeTab extends ConsumerWidget {
  const HomeTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: const Color(0xFFF5F6FB),
      body: ListView(
        padding: EdgeInsets.zero,
        children: const [
          _HomeHeader(),
          SizedBox(height: 12),
          Padding(padding: EdgeInsets.symmetric(horizontal: 16), child: _HeroBanner()),
          SizedBox(height: 24),
          Padding(
            padding: EdgeInsets.symmetric(horizontal: 20),
            child: Text('MODULES',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: Colors.black45, letterSpacing: 1.6)),
          ),
          SizedBox(height: 12),
          Padding(padding: EdgeInsets.symmetric(horizontal: 12), child: _ModulesGrid()),
          SizedBox(height: 24),
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
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(16, 12, 12, 14),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: Colors.grey.shade200),
            ),
            child: Image.asset('assets/logo.png', fit: BoxFit.contain),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('DRIVEFLOW',
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, letterSpacing: 2, color: Colors.black45)),
                const SizedBox(height: 2),
                Text('Bonjour $name 👋',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
              ],
            ),
          ),
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.notifications_none),
            style: IconButton.styleFrom(
              backgroundColor: const Color(0xFFF3F4F8),
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

class _HeroBanner extends StatelessWidget {
  const _HeroBanner();

  @override
  Widget build(BuildContext context) {
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
        children: const [
          Text('OPÉRATIONS TERRAIN',
              style: TextStyle(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w800, letterSpacing: 1.4)),
          SizedBox(height: 8),
          Text('Toute la CRM\ndans votre poche',
              style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800, height: 1.15)),
          SizedBox(height: 16),
          Row(
            children: [
              _HeroPill(icon: Icons.notifications_none, label: '— notif.'),
              SizedBox(width: 8),
              _HeroPill(icon: Icons.chat_bubble_outline, label: '— messages'),
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
    final modules = _modules(context);
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      padding: EdgeInsets.zero,
      itemCount: modules.length,
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
        childAspectRatio: 0.90,
      ),
      itemBuilder: (_, i) => modules[i],
    );
  }

  List<Widget> _modules(BuildContext context) {
    void open(Widget target) {
      Navigator.of(context).push(MaterialPageRoute(builder: (_) => target));
    }

    PlaceholderScreen stub(String title, IconData icon) =>
        PlaceholderScreen(title: title, icon: icon);

    return [
      _ModuleTile(
        label: 'Réservations',
        icon: Icons.event,
        color: const Color(0xFF6366F1),
        onTap: () => open(const ReservationsScreen()),
      ),
      _ModuleTile(
        label: 'Clients',
        icon: Icons.people_outline,
        color: const Color(0xFF10B981),
        onTap: () => open(const CustomersScreen()),
      ),
      _ModuleTile(
        label: 'Flotte',
        icon: Icons.directions_car,
        color: const Color(0xFFF59E0B),
        onTap: () => open(const VehiclesScreen()),
      ),
      _ModuleTile(
        label: 'Contrats',
        icon: Icons.description_outlined,
        color: const Color(0xFF14B8A6),
        onTap: () => open(const ContractsScreen()),
      ),
      _ModuleTile(
        label: 'Paiements',
        icon: Icons.attach_money,
        color: const Color(0xFF22C55E),
        onTap: () => open(stub('Paiements', Icons.attach_money)),
      ),
      _ModuleTile(
        label: 'Documents',
        icon: Icons.folder_open,
        color: const Color(0xFF8B5CF6),
        onTap: () => open(stub('Documents', Icons.folder_open)),
      ),
      _ModuleTile(
        label: 'Scanner',
        icon: Icons.qr_code_scanner,
        color: const Color(0xFFEC4899),
        onTap: () => open(stub('Scanner', Icons.qr_code_scanner)),
      ),
      _ModuleTile(
        label: 'GPS',
        icon: Icons.map_outlined,
        color: const Color(0xFF3B82F6),
        onTap: () => open(const GpsScreen()),
      ),
      _ModuleTile(
        label: 'Discussions',
        icon: Icons.chat_bubble_outline,
        color: const Color(0xFF0EA5E9),
        onTap: () => open(stub('Discussions', Icons.chat_bubble_outline)),
      ),
      _ModuleTile(
        label: 'Sous-location',
        icon: Icons.vpn_key_outlined,
        color: const Color(0xFFEF4444),
        onTap: () => open(const SubRentalsScreen()),
      ),
      _ModuleTile(
        label: 'Occasion',
        icon: Icons.sell_outlined,
        color: const Color(0xFF2563EB),
        onTap: () => open(const UsedCarsScreen()),
      ),
      _ModuleTile(
        label: 'Demandes',
        icon: Icons.public,
        color: const Color(0xFF64748B),
        onTap: () => open(const WebsiteLeadsScreen()),
      ),
    ];
  }
}

class _ModuleTile extends StatelessWidget {
  const _ModuleTile({
    required this.label,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(18),
      elevation: 0,
      child: InkWell(
        borderRadius: BorderRadius.circular(18),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: Colors.black.withOpacity(0.04)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.04),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 54,
                height: 54,
                decoration: BoxDecoration(
                  color: color,
                  borderRadius: BorderRadius.circular(16),
                  boxShadow: [
                    BoxShadow(
                      color: color.withOpacity(0.35),
                      blurRadius: 10,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Icon(icon, color: Colors.white, size: 26),
              ),
              const SizedBox(height: 10),
              Text(
                label,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 12.5),
              ),
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
    final auth = ref.watch(authProvider);
    final email = switch (auth) {
      AuthReady(:final email) => email,
      _ => '',
    };
    return Scaffold(
      backgroundColor: const Color(0xFFF5F6FB),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const SizedBox(height: 24),
          const Icon(Icons.account_circle, size: 96, color: Colors.black26),
          const SizedBox(height: 10),
          Center(child: Text(email, style: const TextStyle(fontWeight: FontWeight.w700))),
          const SizedBox(height: 28),
          FilledButton.tonalIcon(
            onPressed: () => ref.read(authProvider.notifier).signOut(),
            icon: const Icon(Icons.logout),
            label: const Text('Déconnexion'),
            style: FilledButton.styleFrom(
              minimumSize: const Size.fromHeight(52),
              backgroundColor: Colors.red.shade50,
              foregroundColor: Colors.red.shade700,
            ),
          ),
        ],
      ),
    );
  }
}
