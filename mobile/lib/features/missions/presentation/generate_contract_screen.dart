import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../contracts/presentation/contract_pdf_preview_screen.dart';
import '../data/mission_dto.dart';
import '../data/missions_repo.dart';

const _brand = Color(0xFFB8933F);

/// Type de contrat visible par défaut (§5.4 d'AGENTS.md) : LLD + LCD.
const _contractTypes = <String, String>{
  'LOCATION_COURTE': 'Location courte durée (LCD)',
  'LLD': 'Location longue durée (LLD)',
};

/// Modes d'encaissement du loyer (enum `payment_method` backend).
const _rentMethods = <String, String>{
  'cash': 'Espèces',
  'bank_transfer': 'Virement',
  'check': 'Chèque',
  'card': 'Carte',
};

/// Modes de la franchise d'assurance. On garde la paire (deposit_method pour le
/// contrat, payment_method pour l'encaissement `caution`) — les deux enums
/// diffèrent côté backend (cheque vs check).
const _franchiseMethods = <String, ({String deposit, String payment, String label})>{
  'cash': (deposit: 'cash', payment: 'cash', label: 'Espèces'),
  'cheque': (deposit: 'cheque', payment: 'check', label: 'Chèque'),
  'bank_transfer': (deposit: 'bank_transfer', payment: 'bank_transfer', label: 'Virement'),
  'card': (deposit: 'card', payment: 'card', label: 'Carte'),
};

/// Écran de génération de contrat depuis une mission. Capture les champs requis
/// (Loyer, Franchise d'assurance, dates) puis lance la séquence du wizard web
/// et bascule sur l'aperçu PDF.
class GenerateContractScreen extends ConsumerStatefulWidget {
  const GenerateContractScreen({super.key, required this.mission});
  final MissionDto mission;

  @override
  ConsumerState<GenerateContractScreen> createState() =>
      _GenerateContractScreenState();
}

class _GenerateContractScreenState
    extends ConsumerState<GenerateContractScreen> {
  final _formKey = GlobalKey<FormState>();
  final _loyer = TextEditingController();
  final _franchise = TextEditingController();

  String _type = 'LOCATION_COURTE';
  String _rentMethod = 'cash';
  String _franchiseMethod = 'cash';
  bool _collectFranchiseNow = true;
  DateTime? _start;
  DateTime? _end;
  bool _submitting = false;

  final _fmt = DateFormat('dd/MM/yyyy', 'fr');

  @override
  void initState() {
    super.initState();
    _start = DateTime.now();
  }

  @override
  void dispose() {
    _loyer.dispose();
    _franchise.dispose();
    super.dispose();
  }

  Future<void> _pickDate({required bool isStart}) async {
    final now = DateTime.now();
    final initial = isStart ? (_start ?? now) : (_end ?? _start ?? now);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(now.year - 1),
      lastDate: DateTime(now.year + 5),
      locale: const Locale('fr'),
    );
    if (picked == null) return;
    setState(() {
      if (isStart) {
        _start = picked;
        if (_end != null && _end!.isBefore(picked)) _end = null;
      } else {
        _end = picked;
      }
    });
  }

  double _num(TextEditingController c) =>
      double.tryParse(c.text.trim().replaceAll(',', '.')) ?? 0;

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_start == null || _end == null) {
      _snack('Renseignez les dates de début et de fin.');
      return;
    }
    if (_end!.isBefore(_start!)) {
      _snack('La date de fin doit suivre la date de début.');
      return;
    }
    setState(() => _submitting = true);
    final fm = _franchiseMethods[_franchiseMethod]!;
    try {
      final result =
          await ref.read(missionsRepoProvider).generateContractForMission(
                mission: widget.mission,
                input: ContractGenInput(
                  contractType: _type,
                  startDate: _start!.toIso8601String().substring(0, 10),
                  endDate: _end!.toIso8601String().substring(0, 10),
                  loyer: _num(_loyer),
                  franchiseAmount: _num(_franchise),
                  franchiseMethod: fm.deposit,
                  collectFranchiseNow: _collectFranchiseNow,
                  rentMethod: _rentMethod,
                  franchisePaymentMethod: fm.payment,
                ),
              );
      // Rafraîchit la mission (contract_id désormais rattaché) et la liste.
      ref.invalidate(missionDetailProvider(widget.mission.id));
      ref.invalidate(myMissionsProvider);
      if (!mounted) return;
      // Bascule sur l'aperçu PDF (génère + télécharge), en remplaçant ce form.
      Navigator.of(context).pushReplacement(MaterialPageRoute(
        builder: (_) => ContractPdfPreviewScreen(
          contractId: result.contractId,
          contractNumber: result.contractNumber,
        ),
      ));
    } catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      _snack(friendlyError(e));
    }
  }

  void _snack(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final m = widget.mission;
    return Scaffold(
      appBar: AppBar(title: const Text('Générer le contrat')),
      body: AbsorbPointer(
        absorbing: _submitting,
        child: Form(
          key: _formKey,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
            children: [
              _contextCard(m),
              const SizedBox(height: 16),
              _label('Type de contrat'),
              _TypeDropdown(
                value: _type,
                items: _contractTypes,
                onChanged: (v) => setState(() => _type = v),
              ),
              const SizedBox(height: 16),
              Row(children: [
                Expanded(
                    child: _dateField('Date de début *', _start, () => _pickDate(isStart: true))),
                const SizedBox(width: 12),
                Expanded(
                    child: _dateField('Date de fin *', _end, () => _pickDate(isStart: false))),
              ]),
              const SizedBox(height: 16),
              _label('Loyer / Mensualité (MAD) *'),
              _amountField(_loyer, 'Ex. 3500'),
              const SizedBox(height: 16),
              _label("Franchise d'assurance (MAD) *"),
              _amountField(_franchise, 'Ex. 5000'),
              const SizedBox(height: 10),
              _TypeDropdown(
                value: _franchiseMethod,
                items: {
                  for (final e in _franchiseMethods.entries) e.key: e.value.label
                },
                onChanged: (v) => setState(() => _franchiseMethod = v),
              ),
              SwitchListTile.adaptive(
                contentPadding: EdgeInsets.zero,
                activeColor: _brand,
                value: _collectFranchiseNow,
                onChanged: (v) => setState(() => _collectFranchiseNow = v),
                title: const Text('Encaisser la franchise maintenant',
                    style: TextStyle(fontSize: 13.5, fontWeight: FontWeight.w700)),
                subtitle: const Text(
                    'Enregistre un paiement « franchise » à la génération.',
                    style: TextStyle(fontSize: 11.5)),
              ),
              const SizedBox(height: 8),
              _label('Mode de règlement du loyer'),
              _TypeDropdown(
                value: _rentMethod,
                items: _rentMethods,
                onChanged: (v) => setState(() => _rentMethod = v),
              ),
              const SizedBox(height: 24),
              FilledButton.icon(
                onPressed: _submitting ? null : _submit,
                style: FilledButton.styleFrom(
                  backgroundColor: _brand,
                  minimumSize: const Size.fromHeight(50),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                icon: _submitting
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.description_outlined),
                label: Text(_submitting
                    ? 'Génération en cours…'
                    : 'Générer et imprimer le contrat'),
              ),
              const SizedBox(height: 12),
              const Text(
                'Le contrat est créé à partir de la réservation, le loyer et la '
                'franchise sont encaissés, puis le PDF s\'ouvre pour impression.',
                style: TextStyle(color: Colors.black45, fontSize: 11.5, height: 1.4),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _contextCard(MissionDto m) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFF5F6FB),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (m.reservationNumber != null)
            Text('Réservation ${m.reservationNumber}',
                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
          if (m.vehicleLabel != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(m.vehicleLabel!,
                  style: const TextStyle(fontSize: 12.5, color: Colors.black87)),
            ),
          if (m.clientLabel != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(m.clientLabel!,
                  style: const TextStyle(fontSize: 12.5, color: Colors.black87)),
            ),
        ],
      ),
    );
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text,
            style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13)),
      );

  Widget _amountField(TextEditingController c, String hint) => TextFormField(
        controller: c,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        inputFormatters: [
          FilteringTextInputFormatter.allow(RegExp(r'[0-9.,]')),
        ],
        decoration: _dec(hint),
        validator: (v) {
          final n = double.tryParse((v ?? '').trim().replaceAll(',', '.'));
          if (n == null || n <= 0) return 'Requis pour continuer.';
          return null;
        },
      );

  Widget _dateField(String label, DateTime? value, VoidCallback onTap) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _label(label),
        InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: InputDecorator(
            decoration: _dec('jj/mm/aaaa'),
            child: Text(
              value == null ? 'jj/mm/aaaa' : _fmt.format(value),
              style: TextStyle(
                fontSize: 14,
                color: value == null ? Colors.black38 : Colors.black87,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
      ],
    );
  }

  InputDecoration _dec(String hint) => InputDecoration(
        hintText: hint,
        isDense: true,
        filled: true,
        fillColor: Colors.white,
        contentPadding:
            const EdgeInsets.symmetric(vertical: 14, horizontal: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.grey.shade300),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.grey.shade300),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: _brand, width: 1.4),
        ),
      );
}

class _TypeDropdown extends StatelessWidget {
  const _TypeDropdown({
    required this.value,
    required this.items,
    required this.onChanged,
  });
  final String value;
  final Map<String, String> items;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey.shade300),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: items.containsKey(value) ? value : items.keys.first,
          isExpanded: true,
          items: [
            for (final e in items.entries)
              DropdownMenuItem(value: e.key, child: Text(e.value)),
          ],
          onChanged: (v) => v == null ? null : onChanged(v),
        ),
      ),
    );
  }
}
