import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:latlong2/latlong.dart';

import '../../../core/widgets/module_scaffold.dart';
import '../data/gps_dto.dart';
import '../data/gps_repo.dart';

/// Flotte & géolocalisation — reproduit `GpsDashboardPage.tsx` du web :
/// 4 KPIs, carte interactive (OSM tiles via flutter_map) avec marqueurs
/// véhicule et cercle de géofences, recherche + 5 filtres par statut,
/// bottom-sheet d'infos véhicule (photo, statut, vitesse, carburant, km),
/// liste des véhicules et liste des alertes récentes.
class GpsScreen extends ConsumerStatefulWidget {
  const GpsScreen({super.key});

  @override
  ConsumerState<GpsScreen> createState() => _GpsScreenState();
}

class _GpsScreenState extends ConsumerState<GpsScreen> {
  final _search = TextEditingController();
  String _filter = 'all';
  String? _selectedId;
  final _mapController = MapController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  List<FleetVehicleDto> _applyFilter(List<FleetVehicleDto> all) {
    final grp = kGpsFilterGroups.firstWhere((g) => g.key == _filter,
        orElse: () => kGpsFilterGroups.first);
    final base =
        grp.match.isEmpty ? all : all.where((v) => grp.match.contains(v.status)).toList();
    final q = _search.text.trim().toLowerCase();
    if (q.isEmpty) return base;
    return base
        .where((v) =>
            v.registration.toLowerCase().contains(q) ||
            v.brand.toLowerCase().contains(q) ||
            v.model.toLowerCase().contains(q))
        .toList();
  }

  void _select(FleetVehicleDto v) {
    setState(() => _selectedId = v.id);
    final pos = fakeCoordsFor(v.id);
    _mapController.move(pos, 15);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (_) => _VehicleInfoSheet(vehicle: v),
    ).whenComplete(() {
      if (mounted) setState(() => _selectedId = null);
    });
  }

  @override
  Widget build(BuildContext context) {
    final vehiclesAsync = ref.watch(fleetVehiclesProvider);
    final alertsAsync = ref.watch(gpsAlertsProvider);
    final geofencesAsync = ref.watch(gpsGeofencesProvider);
    final dateFmt = DateFormat('dd MMMM yyyy', 'fr');

    return Scaffold(
      body: ModuleBackground(
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: () async {
              ref.invalidate(fleetVehiclesProvider);
              ref.invalidate(gpsAlertsProvider);
              ref.invalidate(gpsGeofencesProvider);
            },
            child: ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                _Header(dateLabel: dateFmt.format(DateTime.now()),
                    onBack: () => Navigator.of(context).maybePop()),
                const SizedBox(height: 10),
                _KpiRow(
                  vehicles: vehiclesAsync,
                  alerts: alertsAsync,
                  geofences: geofencesAsync,
                ),
                const SizedBox(height: 14),
                _FilterChips(
                    current: _filter,
                    onChanged: (k) => setState(() => _filter = k)),
                const SizedBox(height: 12),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: ModuleSearchField(
                    controller: _search,
                    hint: 'Rechercher une immatriculation…',
                    onChanged: (_) => setState(() {}),
                  ),
                ),
                const SizedBox(height: 12),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(20),
                    child: SizedBox(
                      height: 360,
                      child: _MapView(
                        controller: _mapController,
                        vehicles: _applyFilter(vehiclesAsync.asData?.value ?? const []),
                        geofences:
                            geofencesAsync.asData?.value ?? const [],
                        selectedId: _selectedId,
                        onTap: _select,
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                _LegendRow(),
                const SizedBox(height: 14),
                _VehicleListCard(
                  async: vehiclesAsync,
                  filtered: _applyFilter(vehiclesAsync.asData?.value ?? const []),
                  selectedId: _selectedId,
                  onSelect: _select,
                ),
                const SizedBox(height: 14),
                _AlertsCard(async: alertsAsync),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Header + KPIs
// ---------------------------------------------------------------------------

class _Header extends StatelessWidget {
  const _Header({required this.dateLabel, required this.onBack});
  final String dateLabel;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 20, 0),
      child: Row(
        children: [
          IconButton(onPressed: onBack, icon: const Icon(Icons.arrow_back)),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                        color: Color(0xFF10B981),
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'FLUX GPS TEMPS RÉEL · ${dateLabel.toUpperCase()}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.3,
                            color: Colors.black45),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                const Text('Flotte & géolocalisation',
                    style: TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                const Text('Suivi en temps réel, trajets, géofences et alertes.',
                    style:
                        TextStyle(color: Colors.black54, fontSize: 12, height: 1.3)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _KpiRow extends StatelessWidget {
  const _KpiRow({
    required this.vehicles,
    required this.alerts,
    required this.geofences,
  });
  final AsyncValue<List<FleetVehicleDto>> vehicles;
  final AsyncValue<List<GpsAlertDto>> alerts;
  final AsyncValue<List<GeofenceDto>> geofences;

  @override
  Widget build(BuildContext context) {
    final all = vehicles.asData?.value ?? const <FleetVehicleDto>[];
    final live = all
        .where((v) => const ['RENTED', 'UNDER_LOA', 'UNDER_CREDIT', 'IN_DELIVERY']
            .contains(v.status))
        .length;
    final al = alerts.asData?.value ?? const <GpsAlertDto>[];
    final crit = al.where((a) => a.severity == 'CRITICAL').length;
    final gf = geofences.asData?.value.length ?? 0;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          _KpiBox(
            label: 'Véhicules suivis',
            value: '${all.length}',
            hint: 'Dispositifs GPS',
            icon: Icons.directions_car_outlined,
            color: const Color(0xFF4F46E5),
          ),
          _KpiBox(
            label: 'En circulation',
            value: '$live',
            hint: 'Clients / livraison',
            icon: Icons.wifi_tethering,
            color: const Color(0xFF22D3EE),
          ),
          _KpiBox(
            label: 'Alertes',
            value: '${al.length}',
            hint: '$crit critiques',
            icon: Icons.warning_amber_rounded,
            color: crit > 0
                ? const Color(0xFFEF4444)
                : const Color(0xFFF59E0B),
          ),
          _KpiBox(
            label: 'Géofences',
            value: '$gf',
            hint: 'Zones actives',
            icon: Icons.pin_drop_outlined,
            color: const Color(0xFF10B981),
          ),
        ],
      ),
    );
  }
}

class _KpiBox extends StatelessWidget {
  const _KpiBox({
    required this.label,
    required this.value,
    required this.hint,
    required this.icon,
    required this.color,
  });
  final String label;
  final String value;
  final String hint;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 3),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: color, size: 16),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(label.toUpperCase(),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          color: Colors.black45,
                          letterSpacing: 1)),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(value,
                style: TextStyle(
                    color: color,
                    fontSize: 18,
                    fontWeight: FontWeight.w900)),
            Text(hint,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 10, color: Colors.black45)),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Filter chips
// ---------------------------------------------------------------------------

class _FilterChips extends StatelessWidget {
  const _FilterChips({required this.current, required this.onChanged});
  final String current;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          for (final g in kGpsFilterGroups) ...[
            InkWell(
              onTap: () => onChanged(g.key),
              borderRadius: BorderRadius.circular(999),
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
                decoration: BoxDecoration(
                  color: current == g.key
                      ? const Color(0xFF4F46E5)
                      : const Color(0xFFF1F5F9),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(g.label,
                    style: TextStyle(
                      color: current == g.key
                          ? Colors.white
                          : const Color(0xFF475569),
                      fontWeight: FontWeight.w800,
                      fontSize: 11.5,
                    )),
              ),
            ),
            const SizedBox(width: 8),
          ],
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

class _MapView extends StatelessWidget {
  const _MapView({
    required this.controller,
    required this.vehicles,
    required this.geofences,
    required this.selectedId,
    required this.onTap,
  });
  final MapController controller;
  final List<FleetVehicleDto> vehicles;
  final List<GeofenceDto> geofences;
  final String? selectedId;
  final ValueChanged<FleetVehicleDto> onTap;

  @override
  Widget build(BuildContext context) {
    // On place jusqu'à 3 géofences factices autour de Casablanca pour que
    // la carte reflète la couche "zones" du web tant que l'API n'expose
    // pas encore la géométrie des périmètres.
    final gfOverlays = <CircleMarker>[];
    for (var i = 0; i < geofences.length && i < 3; i++) {
      gfOverlays.add(CircleMarker(
        point: LatLng(
          kCasablancaCenter.latitude + (i - 1) * 0.02,
          kCasablancaCenter.longitude + (i - 1) * 0.02,
        ),
        radius: 900,
        useRadiusInMeter: true,
        color: const Color(0xFF4F46E5).withOpacity(0.08),
        borderColor: const Color(0xFF4F46E5),
        borderStrokeWidth: 1.4,
      ));
    }
    return FlutterMap(
      mapController: controller,
      options: const MapOptions(
        initialCenter: kCasablancaCenter,
        initialZoom: 12,
        interactionOptions: InteractionOptions(
          flags: InteractiveFlag.all & ~InteractiveFlag.rotate,
        ),
      ),
      children: [
        TileLayer(
          // Tuiles OSM standard : fonctionnent partout (Android, iOS, Web)
          // sans configuration CORS supplémentaire. On abandonne les tuiles
          // Carto car `{r}` (retina) n'est pas interpolé par flutter_map 7
          // et provoquait des 404 → carte vide.
          urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
          userAgentPackageName: 'com.driveflow.mobile',
          maxZoom: 19,
        ),
        if (gfOverlays.isNotEmpty) CircleLayer(circles: gfOverlays),
        MarkerLayer(
          markers: [
            for (final v in vehicles)
              Marker(
                point: fakeCoordsFor(v.id),
                width: 32,
                height: 32,
                child: _VehicleMarker(
                  vehicle: v,
                  selected: selectedId == v.id,
                  onTap: () => onTap(v),
                ),
              ),
          ],
        ),
      ],
    );
  }
}

class _VehicleMarker extends StatelessWidget {
  const _VehicleMarker({
    required this.vehicle,
    required this.selected,
    required this.onTap,
  });
  final FleetVehicleDto vehicle;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final meta = vehicleMeta(vehicle.status);
    final color = selected ? const Color(0xFF5B5BF4) : Color(meta.color);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: color.withOpacity(0.5),
              blurRadius: 10,
              spreadRadius: 1,
            ),
          ],
          border: Border.all(color: Colors.white, width: 2),
        ),
        child: const Icon(Icons.directions_car,
            size: 15, color: Colors.white),
      ),
    );
  }
}

class _LegendRow extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    const keys = ['AVAILABLE', 'RENTED', 'IN_DELIVERY', 'MAINTENANCE', 'BLOCKED'];
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          for (final s in keys) ...[
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: Theme.of(context).dividerColor),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: Color(vehicleMeta(s).color),
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 5),
                  Text(vehicleMeta(s).label,
                      style: const TextStyle(
                          fontSize: 10.5,
                          fontWeight: FontWeight.w700,
                          color: Colors.black87)),
                ],
              ),
            ),
            const SizedBox(width: 6),
          ],
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Vehicle list
// ---------------------------------------------------------------------------

class _VehicleListCard extends StatelessWidget {
  const _VehicleListCard({
    required this.async,
    required this.filtered,
    required this.selectedId,
    required this.onSelect,
  });
  final AsyncValue<List<FleetVehicleDto>> async;
  final List<FleetVehicleDto> filtered;
  final String? selectedId;
  final ValueChanged<FleetVehicleDto> onSelect;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: ModuleCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text('VÉHICULES',
                      style: TextStyle(
                          color: Colors.black45,
                          fontSize: 10.5,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 1.3)),
                ),
                Text('${filtered.length}',
                    style: const TextStyle(
                        color: Colors.black45, fontSize: 11.5)),
              ],
            ),
            const SizedBox(height: 8),
            async.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 18),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => Text('Erreur: $e',
                  style: const TextStyle(color: Colors.redAccent)),
              data: (_) {
                if (filtered.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: 16),
                    child: Text('Aucun véhicule ne correspond.',
                        style: TextStyle(
                            color: Colors.black45, fontSize: 12.5)),
                  );
                }
                return Column(
                  children: [
                    for (final v in filtered)
                      _VehicleTile(
                        v: v,
                        selected: selectedId == v.id,
                        onTap: () => onSelect(v),
                      ),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _VehicleTile extends StatelessWidget {
  const _VehicleTile({
    required this.v,
    required this.selected,
    required this.onTap,
  });
  final FleetVehicleDto v;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final meta = vehicleMeta(v.status);
    final color = Color(meta.color);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        margin: const EdgeInsets.only(bottom: 6),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: selected ? const Color(0xFFEEF2FF) : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
              color: selected
                  ? const Color(0xFF818CF8)
                  : Theme.of(context).dividerColor),
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                  color: color.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(10)),
              alignment: Alignment.center,
              child: Icon(Icons.directions_car, color: color, size: 16),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${v.brand} ${v.model}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w800)),
                  Text(v.registration,
                      style: const TextStyle(
                          color: Colors.black54,
                          fontFamily: 'monospace',
                          fontSize: 11.5)),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: color.withOpacity(0.12),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(meta.label,
                  style: TextStyle(
                      color: color,
                      fontSize: 10,
                      fontWeight: FontWeight.w900)),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

class _AlertsCard extends StatelessWidget {
  const _AlertsCard({required this.async});
  final AsyncValue<List<GpsAlertDto>> async;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: ModuleCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('ALERTES RÉCENTES',
                style: TextStyle(
                    color: Colors.black45,
                    fontSize: 10.5,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1.3)),
            const SizedBox(height: 10),
            async.when(
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 16),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => Text('Erreur: $e',
                  style: const TextStyle(color: Colors.redAccent)),
              data: (list) {
                if (list.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: 12),
                    child: Text('Aucune alerte en cours.',
                        style: TextStyle(
                            color: Colors.black45, fontSize: 12.5)),
                  );
                }
                return Column(
                  children: [
                    for (final a in list.take(5)) _AlertRow(a: a),
                  ],
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _AlertRow extends StatelessWidget {
  const _AlertRow({required this.a});
  final GpsAlertDto a;

  @override
  Widget build(BuildContext context) {
    final (bg, fg, icon) = switch (a.severity) {
      'CRITICAL' => (
        const Color(0xFFFEE2E2),
        const Color(0xFFB91C1C),
        Icons.warning_amber_rounded,
      ),
      'WARN' => (
        const Color(0xFFFEF3C7),
        const Color(0xFFB45309),
        Icons.warning_amber_rounded,
      ),
      _ => (
        const Color(0xFFE0F2FE),
        const Color(0xFF075985),
        Icons.notifications_none,
      ),
    };
    final hhmm = a.at != null
        ? '${a.at!.hour.toString().padLeft(2, '0')}:${a.at!.minute.toString().padLeft(2, '0')}'
        : '';
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 30,
            height: 30,
            decoration: BoxDecoration(
                color: bg, borderRadius: BorderRadius.circular(8)),
            alignment: Alignment.center,
            child: Icon(icon, color: fg, size: 15),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                          color: bg,
                          borderRadius: BorderRadius.circular(999)),
                      child: Text(a.type.toUpperCase(),
                          style: TextStyle(
                              color: fg,
                              fontSize: 9.5,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 0.5)),
                    ),
                    const Spacer(),
                    Text(hhmm,
                        style: const TextStyle(
                            color: Colors.black45, fontSize: 10.5)),
                  ],
                ),
                const SizedBox(height: 4),
                Text(a.message,
                    style:
                        const TextStyle(fontSize: 12, color: Color(0xFF334155))),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Vehicle info bottom sheet (équivalent du VehicleInfoCard web)
// ---------------------------------------------------------------------------

class _VehicleInfoSheet extends StatelessWidget {
  const _VehicleInfoSheet({required this.vehicle});
  final FleetVehicleDto vehicle;

  @override
  Widget build(BuildContext context) {
    final meta = vehicleMeta(vehicle.status);
    final color = Color(meta.color);
    final gps = fakeGpsFor(vehicle.id, vehicle.status);
    final fuelColor = gps.fuel >= 50
        ? const Color(0xFF10B981)
        : gps.fuel >= 25
            ? const Color(0xFFF59E0B)
            : const Color(0xFFEF4444);
    final numberFmt = NumberFormat.decimalPattern('fr');
    final clock =
        '${gps.lastUpdate.hour.toString().padLeft(2, '0')}:${gps.lastUpdate.minute.toString().padLeft(2, '0')}';

    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: Container(
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        ),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Header image + close + status badge.
              Stack(
                children: [
                  ClipRRect(
                    borderRadius: const BorderRadius.vertical(
                        top: Radius.circular(22)),
                    child: SizedBox(
                      height: 120,
                      width: double.infinity,
                      child: vehicle.image != null && vehicle.image!.isNotEmpty
                          ? Image.network(
                              vehicle.image!,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) =>
                                  _placeholderCar(),
                            )
                          : _placeholderCar(),
                    ),
                  ),
                  Positioned(
                    right: 10,
                    top: 10,
                    child: Material(
                      color: Colors.black45,
                      shape: const CircleBorder(),
                      child: IconButton(
                        tooltip: 'Fermer',
                        icon: const Icon(Icons.close,
                            color: Colors.white, size: 18),
                        onPressed: () => Navigator.pop(context),
                      ),
                    ),
                  ),
                  Positioned(
                    left: 12,
                    bottom: 10,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 3),
                      decoration: BoxDecoration(
                          color: color,
                          borderRadius: BorderRadius.circular(999)),
                      child: Text(meta.label.toUpperCase(),
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 10,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 0.6)),
                    ),
                  ),
                ],
              ),
              Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '${vehicle.brand} ${vehicle.model}${vehicle.version != null ? ' ${vehicle.version}' : ''}',
                      style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w900),
                    ),
                    Text(vehicle.registration,
                        style: const TextStyle(
                            fontFamily: 'monospace',
                            fontSize: 11.5,
                            fontWeight: FontWeight.w800,
                            color: Colors.black54)),
                    const SizedBox(height: 12),
                    _InfoLine(
                      icon: Icons.person_outline,
                      label: 'Client',
                      value: gps.clientName ?? '—',
                    ),
                    _InfoLine(
                      icon: Icons.pin_drop_outlined,
                      label: 'Position',
                      value: 'Casablanca — ${gps.neighborhood}',
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        _StatBox(
                          label: 'Vitesse',
                          value: '${gps.speed} km/h',
                          icon: Icons.flash_on_outlined,
                        ),
                        _StatBox(
                          label: 'Carburant',
                          valueWidget: Row(
                            children: [
                              Expanded(
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(4),
                                  child: LinearProgressIndicator(
                                    value: gps.fuel / 100,
                                    backgroundColor:
                                        const Color(0xFFE2E8F0),
                                    color: fuelColor,
                                    minHeight: 6,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 6),
                              Text('${gps.fuel}%',
                                  style: TextStyle(
                                      color: fuelColor,
                                      fontWeight: FontWeight.w900,
                                      fontSize: 11)),
                            ],
                          ),
                          icon: Icons.local_gas_station_outlined,
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        _StatBox(
                          label: 'Kilométrage',
                          value: vehicle.mileageKm != null
                              ? '${numberFmt.format(vehicle.mileageKm)} km'
                              : '—',
                          icon: Icons.speed,
                        ),
                        _StatBox(
                          label: 'Mise à jour',
                          value: clock,
                          icon: Icons.access_time,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _placeholderCar() {
    return Container(
      color: const Color(0xFFF1F5F9),
      alignment: Alignment.center,
      child: const Icon(Icons.directions_car,
          size: 48, color: Color(0xFF94A3B8)),
    );
  }
}

class _InfoLine extends StatelessWidget {
  const _InfoLine(
      {required this.icon, required this.label, required this.value});
  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          Icon(icon, color: const Color(0xFF64748B), size: 14),
          const SizedBox(width: 6),
          Text(label,
              style: const TextStyle(fontSize: 11, color: Color(0xFF64748B))),
          const Spacer(),
          Flexible(
            child: Text(value,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.right,
                style: const TextStyle(
                    fontSize: 11.5, fontWeight: FontWeight.w800)),
          ),
        ],
      ),
    );
  }
}

class _StatBox extends StatelessWidget {
  const _StatBox({
    required this.label,
    required this.icon,
    this.value,
    this.valueWidget,
  });
  final String label;
  final String? value;
  final Widget? valueWidget;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 3),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        decoration: BoxDecoration(
          color: const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          children: [
            Icon(icon, color: const Color(0xFF64748B), size: 14),
            const SizedBox(width: 6),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label.toUpperCase(),
                      style: const TextStyle(
                          color: Color(0xFF94A3B8),
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.6)),
                  if (valueWidget != null)
                    valueWidget!
                  else
                    Text(value ?? '—',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w900,
                            color: Color(0xFF1F2937))),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}



