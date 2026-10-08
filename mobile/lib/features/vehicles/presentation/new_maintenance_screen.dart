import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../../core/widgets/module_scaffold.dart';
import '../data/vehicle_detail_dto.dart';
import '../data/vehicles_repo.dart';

/// Enregistrer un entretien depuis le terrain : type, titre, date, coût,
/// prestataire, kilométrage, et surtout la photo du justificatif. L'agent
/// pouvant être devant le garage, l'appareil photo est accessible en un geste.
class NewMaintenanceScreen extends ConsumerStatefulWidget {
  const NewMaintenanceScreen({super.key, required this.vehicleId});
  final String vehicleId;

  @override
  ConsumerState<NewMaintenanceScreen> createState() =>
      _NewMaintenanceScreenState();
}

class _NewMaintenanceScreenState extends ConsumerState<NewMaintenanceScreen> {
  final _formKey = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _vendor = TextEditingController();
  final _cost = TextEditingController();
  final _odometer = TextEditingController();
  final _description = TextEditingController();

  String _type = 'OIL_CHANGE';
  DateTime _performedAt = DateTime.now();
  String? _proofPath;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    _vendor.dispose();
    _cost.dispose();
    _odometer.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _performedAt,
      firstDate: DateTime(2000),
      lastDate: DateTime.now().add(const Duration(days: 1)),
      locale: const Locale('fr'),
    );
    if (picked != null) setState(() => _performedAt = picked);
  }

  Future<void> _pickPhoto({required ImageSource source}) async {
    try {
      final picker = ImagePicker();
      final f = await picker.pickImage(
        source: source,
        maxWidth: 1600,
        imageQuality: 80,
      );
      if (f != null) setState(() => _proofPath = f.path);
    } catch (e) {
      setState(() => _error = 'Impossible d\'ouvrir l\'appareil photo.');
    }
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref.read(vehiclesRepoProvider).createMaintenance(
            vehicleId: widget.vehicleId,
            type: _type,
            title: _title.text.trim(),
            description: _description.text.trim(),
            performedAt: _performedAt,
            odometerKm: int.tryParse(_odometer.text),
            vendor: _vendor.text.trim(),
            costMad: double.tryParse(_cost.text),
            proofPath: _proofPath,
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } catch (e) {
      setState(() => _error = _friendly(e));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  String _friendly(Object e) {
    final msg = e.toString();
    final match = RegExp(r'status code of (\d+)').firstMatch(msg);
    if (match != null) {
      final code = int.parse(match[1]!);
      if (code == 422) return 'Les informations saisies ne sont pas valides.';
      if (code == 403) return 'Vous n\'avez pas la permission d\'enregistrer un entretien.';
    }
    return 'Enregistrement impossible pour le moment.';
  }

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('EEE d MMMM yyyy', 'fr');
    return Scaffold(
      appBar: AppBar(title: const Text('Enregistrer un entretien')),
      body: ModuleBackground(
        child: SafeArea(
          child: Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                ModuleCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Type d\'entretien',
                          style: TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: kMaintenanceTypeFr.entries.map((e) {
                          final selected = _type == e.key;
                          return ChoiceChip(
                            label: Text(e.value),
                            selected: selected,
                            onSelected: (_) => setState(() => _type = e.key),
                            selectedColor: const Color(0xFF6366F1),
                            labelStyle: TextStyle(
                              color: selected ? Colors.white : Colors.black87,
                              fontWeight: FontWeight.w700,
                              fontSize: 12,
                            ),
                            backgroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                              side: BorderSide(
                                  color: selected
                                      ? Colors.transparent
                                      : Theme.of(context).dividerColor),
                            ),
                          );
                        }).toList(),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                ModuleCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Informations',
                          style: TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 10),
                      TextFormField(
                        controller: _title,
                        decoration: const InputDecoration(
                          labelText: 'Titre *',
                          hintText: 'Vidange 10 000 km',
                        ),
                        validator: (v) => v == null || v.trim().isEmpty
                            ? 'Titre requis'
                            : null,
                      ),
                      const SizedBox(height: 10),
                      InkWell(
                        onTap: _pickDate,
                        child: InputDecorator(
                          decoration: const InputDecoration(
                            labelText: 'Date de l\'entretien',
                            suffixIcon: Icon(Icons.event),
                          ),
                          child: Text(dateFmt.format(_performedAt)),
                        ),
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: TextFormField(
                              controller: _cost,
                              keyboardType: TextInputType.number,
                              decoration: const InputDecoration(
                                labelText: 'Coût (MAD)',
                              ),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: TextFormField(
                              controller: _odometer,
                              keyboardType: TextInputType.number,
                              decoration: const InputDecoration(
                                labelText: 'Kilométrage',
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      TextFormField(
                        controller: _vendor,
                        decoration: const InputDecoration(
                          labelText: 'Prestataire',
                          hintText: 'Garage, concession…',
                        ),
                      ),
                      const SizedBox(height: 10),
                      TextFormField(
                        controller: _description,
                        maxLines: 2,
                        decoration: const InputDecoration(
                          labelText: 'Description (optionnel)',
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                ModuleCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Preuve (facture, photo)',
                          style: TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 10),
                      if (_proofPath != null)
                        Stack(
                          alignment: Alignment.topRight,
                          children: [
                            ClipRRect(
                              borderRadius: BorderRadius.circular(12),
                              child: AspectRatio(
                                aspectRatio: 16 / 10,
                                child: Image.file(File(_proofPath!),
                                    fit: BoxFit.cover),
                              ),
                            ),
                            Padding(
                              padding: const EdgeInsets.all(6),
                              child: Material(
                                color: Colors.red,
                                shape: const CircleBorder(),
                                child: InkWell(
                                  onTap: () =>
                                      setState(() => _proofPath = null),
                                  customBorder: const CircleBorder(),
                                  child: const Padding(
                                    padding: EdgeInsets.all(4),
                                    child: Icon(Icons.close,
                                        size: 16, color: Colors.white),
                                  ),
                                ),
                              ),
                            ),
                          ],
                        )
                      else
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: () =>
                                    _pickPhoto(source: ImageSource.camera),
                                icon: const Icon(Icons.photo_camera),
                                label: const Text('Photo'),
                                style: OutlinedButton.styleFrom(
                                  minimumSize: const Size.fromHeight(46),
                                ),
                              ),
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: OutlinedButton.icon(
                                onPressed: () =>
                                    _pickPhoto(source: ImageSource.gallery),
                                icon: const Icon(Icons.photo_library_outlined),
                                label: const Text('Galerie'),
                                style: OutlinedButton.styleFrom(
                                  minimumSize: const Size.fromHeight(46),
                                ),
                              ),
                            ),
                          ],
                        ),
                    ],
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: Colors.red.shade200),
                    ),
                    child: Text(_error!,
                        style: TextStyle(color: Colors.red.shade800)),
                  ),
                ],
                const SizedBox(height: 20),
                FilledButton(
                  onPressed: _submitting ? null : _submit,
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF6366F1),
                    minimumSize: const Size.fromHeight(52),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14)),
                  ),
                  child: _submitting
                      ? const SizedBox(
                          height: 22,
                          width: 22,
                          child: CircularProgressIndicator(
                              strokeWidth: 2.5, color: Colors.white),
                        )
                      : const Text('Enregistrer',
                          style: TextStyle(
                              fontWeight: FontWeight.w800, fontSize: 15)),
                ),
                const SizedBox(height: 20),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

