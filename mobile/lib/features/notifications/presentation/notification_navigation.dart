import 'package:flutter/material.dart';

import '../../contracts/presentation/contract_detail_screen.dart';
import '../../customers/presentation/customer_detail_screen.dart';
import '../../payments/presentation/payment_detail_screen.dart';
import '../../reservations/presentation/reservation_detail_screen.dart';
import '../../sub_rentals/presentation/sub_rental_detail_screen.dart';
import '../../vehicles/presentation/vehicle_detail_screen.dart';
import '../data/notification_dto.dart';

/// Écran de destination d'une notification — équivalent mobile de
/// `resolveNotificationRoute` du web (frontend/modules/notifications/
/// NotificationsPage.tsx). Retourne `null` si la notification ne pointe vers
/// aucune fiche connue (on se contente alors de la marquer lue).
Widget? notificationDestination(NotificationDto n) {
  final id = n.entityId;
  final type = (n.entityType ?? '').toLowerCase();

  if (id != null && id.isNotEmpty) {
    if (type.contains('reservation')) return ReservationDetailScreen(id: id);
    if (type.contains('contract') && !type.contains('subrental')) {
      return ContractDetailScreen(id: id);
    }
    if (type.contains('subrental') || type.contains('sub_rental')) {
      return SubRentalDetailScreen(id: id);
    }
    if (type.contains('customer') || type.contains('kyccase')) {
      return CustomerDetailScreen(id: id);
    }
    if (type.contains('vehicle') && !type.contains('accident')) {
      return VehicleDetailScreen(id: id);
    }
    if (type.contains('payment') || type.contains('invoice')) {
      return PaymentDetailScreen(id: id);
    }
  }
  return _fromLink(n.linkUrl);
}

/// Dernier recours : déduit la fiche à partir d'un `link_url` du type
/// `/reservations/{id}` fourni par le backend.
Widget? _fromLink(String? link) {
  if (link == null || link.isEmpty) return null;
  final segments = link
      .split('?')
      .first
      .split('/')
      .where((s) => s.isNotEmpty)
      .toList();
  if (segments.length < 2) return null;
  final id = segments.last;
  final head = segments[segments.length - 2].toLowerCase();
  switch (head) {
    case 'reservations':
      return ReservationDetailScreen(id: id);
    case 'contracts':
      return ContractDetailScreen(id: id);
    case 'customers':
      return CustomerDetailScreen(id: id);
    case 'fleet':
    case 'vehicles':
      return VehicleDetailScreen(id: id);
    case 'payments':
    case 'invoices':
      return PaymentDetailScreen(id: id);
    case 'sub-rentals':
    case 'sub_rentals':
      return SubRentalDetailScreen(id: id);
  }
  return null;
}
