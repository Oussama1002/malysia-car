import 'package:flutter/material.dart';

/// Descripteur d'un module : son chemin d'URL, son libellé et son style.
/// Partagé par la grille de l'accueil et le drawer pour garantir que les
/// deux listes restent identiques et pointent vers les mêmes routes.
class ModuleDescriptor {
  const ModuleDescriptor({
    required this.path,
    required this.label,
    required this.icon,
    required this.color,
  });

  final String path;
  final String label;
  final IconData icon;
  final Color color;
}

const List<ModuleDescriptor> kModules = [
  ModuleDescriptor(
      path: '/reservations',
      label: 'Réservations',
      icon: Icons.event,
      color: Color(0xFFB8933F)),
  ModuleDescriptor(
      path: '/clients',
      label: 'Clients',
      icon: Icons.people_outline,
      color: Color(0xFF10B981)),
  ModuleDescriptor(
      path: '/flotte',
      label: 'Flotte',
      icon: Icons.directions_car,
      color: Color(0xFFF59E0B)),
  ModuleDescriptor(
      path: '/contrats',
      label: 'Contrats',
      icon: Icons.description_outlined,
      color: Color(0xFF14B8A6)),
  ModuleDescriptor(
      path: '/paiements',
      label: 'Paiements',
      icon: Icons.attach_money,
      color: Color(0xFF22C55E)),
  ModuleDescriptor(
      path: '/documents',
      label: 'Documents',
      icon: Icons.folder_open,
      color: Color(0xFF8B5CF6)),
  ModuleDescriptor(
      path: '/scanner',
      label: 'Scanner',
      icon: Icons.qr_code_scanner,
      color: Color(0xFFEC4899)),
  ModuleDescriptor(
      path: '/gps',
      label: 'GPS',
      icon: Icons.map_outlined,
      color: Color(0xFF3B82F6)),
  ModuleDescriptor(
      path: '/discussions',
      label: 'Discussions',
      icon: Icons.chat_bubble_outline,
      color: Color(0xFF0EA5E9)),
  ModuleDescriptor(
      path: '/sous-location',
      label: 'Sous-location',
      icon: Icons.vpn_key_outlined,
      color: Color(0xFFEF4444)),
  ModuleDescriptor(
      path: '/occasion',
      label: 'Occasion',
      icon: Icons.sell_outlined,
      color: Color(0xFF2563EB)),
  ModuleDescriptor(
      path: '/demandes',
      label: 'Demandes',
      icon: Icons.public,
      color: Color(0xFF64748B)),
];
