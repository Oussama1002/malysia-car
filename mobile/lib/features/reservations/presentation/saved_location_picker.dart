import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../data/saved_locations_repo.dart';

/// Pendant mobile de `SavedLocationPicker.tsx` : choisir un lieu Google Maps
/// dans la bibliothèque partagée ou en ajouter un (titre + lien collé +
/// adresse facultative). Affiche un aperçu carte OSM (flutter_map, sans clé
/// API) + un bouton « Ouvrir dans Google Maps ». Les lieux persistent et
/// réapparaissent sur chaque formulaire mission.
class SavedLocationPicker extends ConsumerStatefulWidget {
  const SavedLocationPicker({
    super.key,
    required this.value,
    required this.onChanged,
  });

  final String? value;
  final ValueChanged<SavedLocation?> onChanged;

  @override
  ConsumerState<SavedLocationPicker> createState() => _SavedLocationPickerState();
}

class _SavedLocationPickerState extends ConsumerState<SavedLocationPicker> {
  bool _adding = false;
  bool _saving = false;
  String? _formError;
  final _title = TextEditingController();
  final _mapsUrl = TextEditingController();
  final _address = TextEditingController();

  @override
  void dispose() {
    _title.dispose();
    _mapsUrl.dispose();
    _address.dispose();
    super.dispose();
  }

  bool get _canSave =>
      _title.text.trim().isNotEmpty &&
      RegExp(r'^https?://', caseSensitive: false).hasMatch(_mapsUrl.text.trim());

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _formError = null;
    });
    try {
      final created = await ref.read(savedLocationsRepoProvider).create(
            title: _title.text.trim(),
            mapsUrl: _mapsUrl.text.trim(),
            address: _address.text.trim(),
          );
      ref.invalidate(savedLocationsProvider);
      if (!mounted) return;
      widget.onChanged(created);
      setState(() {
        _adding = false;
        _saving = false;
        _title.clear();
        _mapsUrl.clear();
        _address.clear();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _formError = "Impossible d'enregistrer le lieu.";
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(savedLocationsProvider);
    final locations = async.asData?.value ?? const <SavedLocation>[];
    final loading = async.isLoading;
    SavedLocation? selected;
    for (final l in locations) {
      if (l.id == widget.value) {
        selected = l;
        break;
      }
    }

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFFF5F6FB),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: widget.value,
                  isExpanded: true,
                  decoration: _dec(label: 'Lieu enregistré (Google Maps)'),
                  hint: Text(loading ? 'Chargement…' : '— Aucun —'),
                  items: [
                    const DropdownMenuItem<String>(value: null, child: Text('— Aucun —')),
                    for (final l in locations)
                      DropdownMenuItem(value: l.id, child: Text(l.title, overflow: TextOverflow.ellipsis)),
                  ],
                  onChanged: (id) {
                    SavedLocation? match;
                    for (final l in locations) {
                      if (l.id == id) {
                        match = l;
                        break;
                      }
                    }
                    widget.onChanged(match);
                  },
                ),
              ),
              const SizedBox(width: 8),
              OutlinedButton(
                onPressed: () => setState(() {
                  _adding = !_adding;
                  _formError = null;
                }),
                child: Text(_adding ? 'Fermer' : '+ Lieu'),
              ),
            ],
          ),

          // Formulaire d'ajout
          if (_adding) ...[
            const SizedBox(height: 10),
            TextField(controller: _title, decoration: _dec(label: 'Titre du lieu *'), onChanged: (_) => setState(() {})),
            const SizedBox(height: 8),
            TextField(
              controller: _mapsUrl,
              keyboardType: TextInputType.url,
              decoration: _dec(label: 'Lien Google Maps *', hint: 'https://maps.app.goo.gl/…'),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 8),
            TextField(controller: _address, decoration: _dec(label: 'Adresse (facultatif)')),
            if (_formError != null) ...[
              const SizedBox(height: 6),
              Text(_formError!, style: const TextStyle(fontSize: 11.5, color: Color(0xFFB91C1C), fontWeight: FontWeight.w700)),
            ],
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: FilledButton(
                onPressed: (!_canSave || _saving) ? null : _save,
                style: FilledButton.styleFrom(backgroundColor: const Color(0xFFB8933F)),
                child: Text(_saving ? 'Enregistrement…' : 'Enregistrer le lieu'),
              ),
            ),
          ],

          // Aperçu du lieu sélectionné
          if (selected != null && !_adding) ...[
            const SizedBox(height: 10),
            _LocationPreview(location: selected),
          ],
        ],
      ),
    );
  }
}

class _LocationPreview extends StatelessWidget {
  const _LocationPreview({required this.location});
  final SavedLocation location;

  Future<void> _open() async {
    final uri = Uri.tryParse(location.mapsUrl);
    if (uri != null) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final coords = location.coords;
    return ClipRRect(
      borderRadius: BorderRadius.circular(10),
      child: Container(
        color: Colors.white,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.all(10),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(location.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
                        if (location.address != null && location.address!.isNotEmpty)
                          Text(location.address!,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(fontSize: 11, color: Colors.black54)),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  TextButton.icon(
                    onPressed: _open,
                    icon: const Icon(Icons.open_in_new, size: 16),
                    label: const Text('Google Maps'),
                  ),
                ],
              ),
            ),
            if (coords != null)
              SizedBox(
                height: 170,
                child: FlutterMap(
                  options: MapOptions(
                    initialCenter: coords,
                    initialZoom: 15,
                    interactionOptions: const InteractionOptions(flags: InteractiveFlag.none),
                  ),
                  children: [
                    TileLayer(
                      urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'com.driveflow.mobile',
                      maxZoom: 19,
                    ),
                    MarkerLayer(
                      markers: [
                        Marker(
                          point: coords,
                          width: 36,
                          height: 36,
                          child: const Icon(Icons.location_on, color: Color(0xFFB91C1C), size: 34),
                        ),
                      ],
                    ),
                  ],
                ),
              )
            else
              const Padding(
                padding: EdgeInsets.fromLTRB(10, 0, 10, 12),
                child: Text('Aperçu indisponible — ouvrez le lien pour voir la carte.',
                    style: TextStyle(fontSize: 11.5, color: Colors.black45)),
              ),
          ],
        ),
      ),
    );
  }
}

InputDecoration _dec({String? label, String? hint}) {
  return InputDecoration(
    labelText: label,
    hintText: hint,
    isDense: true,
    border: const OutlineInputBorder(),
    contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
  );
}
