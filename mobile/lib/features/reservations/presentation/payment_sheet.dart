import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../payments/data/payments_repo.dart';

/// Nouveau paiement client (encaissement) — bottom sheet qui reproduit
/// le PaymentForm du web côté mobile. Appelle POST `/payments` avec le
/// customer_id, reservation_id et éventuellement invoice_id en
/// allocation. L'agent y règle le loyer, un acompte, un solde ou une
/// Franchise d'assurance.
class PaymentSheet extends ConsumerStatefulWidget {
  const PaymentSheet({
    super.key,
    required this.customerId,
    this.reservationId,
    this.vehicleId,
    this.invoiceId,
    this.reservationBalance,
    this.onDone,
  });

  final String customerId;
  final String? reservationId;
  final String? vehicleId;
  final String? invoiceId;
  final double? reservationBalance;
  final VoidCallback? onDone;

  static Future<void> show(
    BuildContext context, {
    required String customerId,
    String? reservationId,
    String? vehicleId,
    String? invoiceId,
    double? reservationBalance,
    VoidCallback? onDone,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      useSafeArea: true,
      builder: (_) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
        child: PaymentSheet(
          customerId: customerId,
          reservationId: reservationId,
          vehicleId: vehicleId,
          invoiceId: invoiceId,
          reservationBalance: reservationBalance,
          onDone: onDone,
        ),
      ),
    );
  }

  @override
  ConsumerState<PaymentSheet> createState() => _PaymentSheetState();
}

const _methods = <MapEntry<String, String>>[
  MapEntry('cash', 'Espèces'),
  MapEntry('bank_transfer', 'Virement'),
  MapEntry('check', 'Chèque'),
  MapEntry('card', 'Carte'),
  MapEntry('compensation', 'Compensation'),
];

const _types = <MapEntry<String, String>>[
  MapEntry('paiement_location', 'Paiement location'),
  MapEntry('avance', 'Avance'),
  MapEntry('solde', 'Solde'),
  MapEntry('caution', "Franchise d'assurance"),
  MapEntry('penalite', 'Pénalité'),
];

class _PaymentSheetState extends ConsumerState<PaymentSheet> {
  final _amount = TextEditingController();
  final _reference = TextEditingController();
  final _notes = TextEditingController();
  final _checkNumber = TextEditingController();
  final _checkBank = TextEditingController();
  String _method = 'cash';
  String? _type = 'paiement_location';
  DateTime _date = DateTime.now();
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Volontairement : on NE pré-remplit PAS le Montant avec le solde
    // restant. Pour une réservation d'un jour sans paiement, le solde vaut
    // le tarif journalier, et l'agent lit alors "la machine affirme un
    // paiement de X MAD alors que rien n'a été encaissé". Le "Reste à
    // payer" reste visible juste au-dessus en indication — l'agent tape
    // le montant réellement reçu.
  }

  @override
  void dispose() {
    _amount.dispose();
    _reference.dispose();
    _notes.dispose();
    _checkNumber.dispose();
    _checkBank.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final amount = double.tryParse(_amount.text.trim().replaceAll(',', '.'));
    if (amount == null || amount <= 0) {
      setState(() => _error = 'Renseignez un montant valide.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final iso = DateFormat('yyyy-MM-dd').format(_date);
      final payload = <String, dynamic>{
        'customer_id': widget.customerId,
        'payment_method': _method,
        'payment_direction': 'incoming',
        'amount': amount,
        'payment_date': iso,
        if (_type != null) 'payment_type': _type,
        if (widget.reservationId != null) 'reservation_id': widget.reservationId,
        if (widget.vehicleId != null) 'vehicle_id': widget.vehicleId,
        if (_reference.text.trim().isNotEmpty)
          'external_reference': _reference.text.trim(),
        if (_notes.text.trim().isNotEmpty) 'notes': _notes.text.trim(),
        if (_method == 'check') ...{
          if (_checkNumber.text.trim().isNotEmpty)
            'cheque_number': _checkNumber.text.trim(),
          if (_checkBank.text.trim().isNotEmpty)
            'cheque_bank': _checkBank.text.trim(),
        },
        if (widget.invoiceId != null)
          'allocations': [
            {'invoice_id': widget.invoiceId, 'amount_allocated': amount}
          ],
      };
      await ref.read(paymentsRepoProvider).create(payload);
      if (!mounted) return;
      Navigator.of(context).pop();
      widget.onDone?.call();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Paiement enregistré.')),
      );
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final maxH = MediaQuery.of(context).size.height * 0.9;
    final money = NumberFormat.decimalPattern('fr');
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: maxH),
      child: Container(
        decoration: const BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 16),
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 10),
                  decoration: BoxDecoration(
                    color: Colors.black12,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              Row(
                children: [
                  const Icon(Icons.payments_outlined,
                      color: Color(0xFF8B5CF6), size: 20),
                  const SizedBox(width: 8),
                  const Text('Nouveau paiement client',
                      style: TextStyle(
                          fontWeight: FontWeight.w900, fontSize: 15)),
                  const Spacer(),
                  IconButton(
                    icon: const Icon(Icons.close, size: 20),
                    onPressed:
                        _busy ? null : () => Navigator.of(context).pop(),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              if (widget.reservationBalance != null)
                Text(
                  'Reste à payer : ${money.format(widget.reservationBalance)} MAD',
                  style: const TextStyle(fontSize: 11.5, color: Colors.black54),
                ),
              const SizedBox(height: 12),
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      TextField(
                        controller: _amount,
                        keyboardType: const TextInputType.numberWithOptions(
                            decimal: true),
                        decoration: const InputDecoration(
                          labelText: 'Montant (MAD) *',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                      const SizedBox(height: 10),
                      DropdownButtonFormField<String>(
                        value: _type,
                        decoration: const InputDecoration(
                          labelText: 'Type',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                        items: [
                          for (final t in _types)
                            DropdownMenuItem(value: t.key, child: Text(t.value)),
                        ],
                        onChanged: (v) => setState(() => _type = v),
                      ),
                      const SizedBox(height: 10),
                      DropdownButtonFormField<String>(
                        value: _method,
                        decoration: const InputDecoration(
                          labelText: 'Mode *',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                        items: [
                          for (final m in _methods)
                            DropdownMenuItem(value: m.key, child: Text(m.value)),
                        ],
                        onChanged: (v) => setState(() => _method = v ?? 'cash'),
                      ),
                      if (_method == 'check') ...[
                        const SizedBox(height: 10),
                        TextField(
                          controller: _checkNumber,
                          decoration: const InputDecoration(
                            labelText: 'N° chèque',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                        const SizedBox(height: 10),
                        TextField(
                          controller: _checkBank,
                          decoration: const InputDecoration(
                            labelText: 'Banque',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                        ),
                      ],
                      const SizedBox(height: 10),
                      InkWell(
                        onTap: () async {
                          final picked = await showDatePicker(
                            context: context,
                            initialDate: _date,
                            firstDate: DateTime(2000),
                            lastDate: DateTime(2100),
                            locale: const Locale('fr'),
                          );
                          if (picked != null) setState(() => _date = picked);
                        },
                        child: InputDecorator(
                          decoration: const InputDecoration(
                            labelText: 'Date du paiement *',
                            border: OutlineInputBorder(),
                            isDense: true,
                          ),
                          child: Row(
                            children: [
                              Expanded(child: Text(dateFmt.format(_date))),
                              const Icon(Icons.calendar_today,
                                  size: 16, color: Colors.black54),
                            ],
                          ),
                        ),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _reference,
                        decoration: const InputDecoration(
                          labelText: 'Référence externe',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _notes,
                        maxLines: 2,
                        decoration: const InputDecoration(
                          labelText: 'Notes',
                          border: OutlineInputBorder(),
                          isDense: true,
                        ),
                      ),
                      if (_error != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(_error!,
                              style: const TextStyle(
                                  color: Colors.redAccent, fontSize: 12)),
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  OutlinedButton(
                    onPressed:
                        _busy ? null : () => Navigator.of(context).pop(),
                    child: const Text('Annuler'),
                  ),
                  const Spacer(),
                  FilledButton(
                    onPressed: _busy ? null : _submit,
                    style: FilledButton.styleFrom(
                        backgroundColor: const Color(0xFF8B5CF6)),
                    child: _busy
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white))
                        : const Text('Enregistrer le paiement'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
