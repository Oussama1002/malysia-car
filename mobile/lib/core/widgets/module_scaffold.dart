import 'package:flutter/material.dart';

/// Un fond dégradé commun aux écrans d'un module, pour qu'ils se ressemblent
/// tous : lavande en haut qui s'éclaircit en bas, comme la version web mobile.
class ModuleBackground extends StatelessWidget {
  const ModuleBackground({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [Color(0xFFEEF0FB), Color(0xFFF7F8FD)],
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
        ),
      ),
      child: child,
    );
  }
}

/// Un en-tête de module : fil d'Ariane, titre et sous-titre, dans le style de
/// la maquette.
class ModuleHeader extends StatelessWidget {
  const ModuleHeader({
    super.key,
    required this.title,
    required this.subtitle,
    required this.onBack,
  });

  final String title;
  final String subtitle;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
          child: Row(
            children: [
              IconButton(onPressed: onBack, icon: const Icon(Icons.arrow_back)),
              const Text('Opérations',
                  style: TextStyle(color: Colors.black54, fontSize: 14)),
              const Icon(Icons.chevron_right,
                  color: Colors.black26, size: 18),
              Text(title,
                  style:
                      const TextStyle(fontWeight: FontWeight.w800, fontSize: 14)),
            ],
          ),
        ),
        const SizedBox(height: 10),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Text(title,
              style:
                  const TextStyle(fontSize: 30, fontWeight: FontWeight.w900)),
        ),
        const SizedBox(height: 6),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20),
          child: Text(
            subtitle,
            style: const TextStyle(
                color: Colors.black54, fontSize: 14, height: 1.4),
          ),
        ),
      ],
    );
  }
}

/// Un champ de recherche local, du même style que celui de Réservations.
class ModuleSearchField extends StatelessWidget {
  const ModuleSearchField({
    super.key,
    required this.controller,
    required this.hint,
    required this.onChanged,
  });

  final TextEditingController controller;
  final String hint;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      onChanged: onChanged,
      decoration: InputDecoration(
        prefixIcon: const Icon(Icons.search, color: Colors.black45),
        hintText: hint,
        hintStyle: const TextStyle(color: Colors.black45),
        filled: true,
        fillColor: Colors.white,
        contentPadding:
            const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: Colors.grey.shade200),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: BorderSide(color: Colors.grey.shade200),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: Color(0xFF6366F1), width: 1.4),
        ),
      ),
    );
  }
}

/// Une carte blanche aux coins arrondis, utilisée pour les cartes de liste et
/// les sections des fiches détail.
class ModuleCard extends StatelessWidget {
  const ModuleCard({super.key, required this.child, this.onTap});

  final Widget child;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final decoration = BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: Colors.grey.shade200),
      boxShadow: [
        BoxShadow(
          color: Colors.black.withOpacity(0.03),
          blurRadius: 10,
          offset: const Offset(0, 2),
        ),
      ],
    );
    if (onTap == null) {
      return Container(
        padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
        decoration: decoration,
        child: child,
      );
    }
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(18, 16, 18, 16),
          decoration: decoration,
          child: child,
        ),
      ),
    );
  }
}

/// Une puce de statut colorée. Vert = « tout va bien », rouge = annulé /
/// refusé, orange = en transition, gris = brouillon.
class ModuleStatusChip extends StatelessWidget {
  const ModuleStatusChip({
    super.key,
    required this.label,
    required this.tone,
  });

  final String label;
  final ModuleStatusTone tone;

  @override
  Widget build(BuildContext context) {
    final color = switch (tone) {
      ModuleStatusTone.ok => Colors.green,
      ModuleStatusTone.danger => Colors.red,
      ModuleStatusTone.warning => Colors.orange,
      ModuleStatusTone.neutral => Colors.blueGrey,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withOpacity(0.35)),
      ),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(
          color: color.shade800,
          fontSize: 11,
          fontWeight: FontWeight.w800,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

enum ModuleStatusTone { ok, danger, warning, neutral }

/// Vue d'erreur commune aux écrans.
class ModuleErrorView extends StatelessWidget {
  const ModuleErrorView({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 60),
        const Icon(Icons.cloud_off, size: 56, color: Colors.black26),
        const SizedBox(height: 12),
        const Center(
          child: Text('Données indisponibles.',
              style: TextStyle(fontWeight: FontWeight.w600)),
        ),
        const SizedBox(height: 8),
        Center(
          child: Text(message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.black54, fontSize: 12)),
        ),
      ],
    );
  }
}

/// Vue vide : grosse icône, phrase courte.
class ModuleEmptyView extends StatelessWidget {
  const ModuleEmptyView({
    super.key,
    required this.icon,
    required this.message,
  });

  final IconData icon;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 48),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 56, color: Colors.black26),
            const SizedBox(height: 12),
            Text(message, style: const TextStyle(color: Colors.black54)),
          ],
        ),
      ),
    );
  }
}

/// Une ligne « étiquette : valeur » pour les fiches détail.
class ModuleKV extends StatelessWidget {
  const ModuleKV({super.key, required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 2,
            child: Text(label,
                style:
                    const TextStyle(fontSize: 13, color: Colors.black54)),
          ),
          Expanded(
            flex: 3,
            child: Text(value,
                textAlign: TextAlign.right,
                style: const TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}
