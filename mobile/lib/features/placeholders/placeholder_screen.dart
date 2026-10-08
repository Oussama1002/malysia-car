import 'package:flutter/material.dart';

/// Un écran minimal, servi aux modules pas encore construits : titre dans la
/// barre, grosse icône, phrase claire. Mieux qu'une page blanche ou qu'une
/// erreur de navigation.
class PlaceholderScreen extends StatelessWidget {
  const PlaceholderScreen({super.key, required this.title, required this.icon});

  final String title;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 88, color: Colors.black26),
            const SizedBox(height: 18),
            const Text('Bientôt disponible',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
            const SizedBox(height: 6),
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 32),
              child: Text(
                'Cet écran arrive dans un prochain lot. Pour l’instant, utilisez la version web.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.black54),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
