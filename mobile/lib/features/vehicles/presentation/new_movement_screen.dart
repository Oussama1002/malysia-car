import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/widgets/module_scaffold.dart';
import '../data/vehicles_repo.dart';

/// Nouveau mouvement : sortie, retour, transfert… saisis par l'agent sur le
/// parking avec le kilométrage et le niveau de carburant.
class NewMovementScreen extends ConsumerStatefulWidget {
  const NewMovementScreen({
    super.key,
    required this.vehicleId,
    this.lastOdometer,
  });

  final String vehicleId;
  final int? lastOdometer;

  @override
  ConsumerState<NewMovementScreen> createState() => _NewMovementScreenState();
}

class _NewMovementScreenState extends ConsumerState<NewMovementScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _odometer =
      TextEditingController(text: widget.lastOdometer?.toString() ?? '');
  final _fuel = TextEditingController();
  final _notes = TextEditingController();

  String _type = 'exit';
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _odometer.dispose();
    _fuel.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      await ref.read(vehiclesRepoProvider).createMovement(
            vehicleId: widget.vehicleId,
            type: _type,
            odometerKm: int.tryParse(_odometer.text),
            fuelLevel: double.tryParse(_fuel.text),
            notes: _notes.text.trim(),
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
      if (code == 403) return 'Vous n\'avez pas la permission d\'enregistrer un mouvement.';
    }
    return 'Enregistrement impossible pour le moment.';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Nouveau mouvement')),
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
                      const Text('Type de mouvement',
                          style: TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 10),
                      _TypeRow(
                        selected: _type,
                        onChanged: (t) => setState(() => _type = t),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                ModuleCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Mesures',
                          style: TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 10),
                      TextFormField(
                        controller: _odometer,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Kilométrage *',
                          suffixText: 'km',
                        ),
                        validator: (v) {
                          if (v == null || v.isEmpty) return 'Kilométrage requis';
                          if (int.tryParse(v) == null) return 'Nombre entier';
                          return null;
                        },
                      ),
                      const SizedBox(height: 10),
                      TextFormField(
                        controller: _fuel,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Niveau de carburant',
                          suffixText: '%',
                          hintText: '0 à 100',
                        ),
                        validator: (v) {
                          if (v == null || v.isEmpty) return null;
                          final d = double.tryParse(v);
                          if (d == null || d < 0 || d > 100) {
                            return 'Entre 0 et 100';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _notes,
                        maxLines: 3,
                        decoration: const InputDecoration(
                          labelText: 'État et remarques (optionnel)',
                          hintText: 'Rayures, propreté, pneus…',
                        ),
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

class _TypeRow extends StatelessWidget {
  const _TypeRow({required this.selected, required this.onChanged});
  final String selected;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    const options = [
      ('exit', 'Sortie', Icons.logout),
      ('return', 'Retour', Icons.login),
      ('transfer', 'Transfert', Icons.sync_alt),
    ];
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: options.map((o) {
        final isSelected = selected == o.$1;
        return InkWell(
          onTap: () => onChanged(o.$1),
          borderRadius: BorderRadius.circular(14),
          child: Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            decoration: BoxDecoration(
              color: isSelected ? const Color(0xFF6366F1) : Colors.white,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: isSelected ? Colors.transparent : Colors.grey.shade300,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(o.$3,
                    size: 16,
                    color: isSelected ? Colors.white : Colors.black54),
                const SizedBox(width: 6),
                Text(o.$2,
                    style: TextStyle(
                      color: isSelected ? Colors.white : Colors.black87,
                      fontWeight: FontWeight.w700,
                      fontSize: 13,
                    )),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }
}
