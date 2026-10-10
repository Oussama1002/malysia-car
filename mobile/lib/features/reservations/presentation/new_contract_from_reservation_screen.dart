import 'dart:io' show File;
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../../core/api/api_client.dart';
import '../../contracts/data/contracts_repo.dart';
import '../../customers/data/customer_dto.dart';
import '../../customers/data/customers_repo.dart';
import '../../vehicles/data/vehicle_dto.dart';
import '../../vehicles/data/vehicles_repo.dart';
import '../data/reservation_detail_dto.dart';
import '../data/reservations_repo.dart';

/// Wizard de création / génération de contrat — pendant mobile de
/// `ContractWizardPage.tsx` (web). 7 étapes identiques au web :
/// Client → Agent → Véhicule → Type → Conditions → Annexes → Validation.
/// Supporte le pré-remplissage depuis une réservation.
class NewContractFromReservationScreen extends ConsumerStatefulWidget {
  const NewContractFromReservationScreen({super.key, this.reservationId});
  final String? reservationId;

  @override
  ConsumerState<NewContractFromReservationScreen> createState() =>
      _NewContractFromReservationScreenState();
}

enum _Step { client, vehicle, type, terms, annex, review }

const _stepLabels = {
  _Step.client: 'Client',
  _Step.vehicle: 'Véhicule',
  _Step.type: 'Type',
  _Step.terms: 'Conditions',
  _Step.annex: 'Annexes',
  _Step.review: 'Validation',
};

const _contractTypes = {
  'LLD': ('Location Longue Durée',
      "Sans option d'achat · véhicule restitué au terme", Icons.vpn_key_outlined),
  'LOA': ("Location avec Option d'Achat",
      'Valeur résiduelle fixée au contrat', Icons.directions_car),
  'CREDIT_AUTO': ('Crédit Automobile',
      'Financement bancaire interne', Icons.credit_card_outlined),
  'VENTE_VO': ("Vente Véhicule d'Occasion",
      'Transfert de propriété immédiat', Icons.sell_outlined),
  'LOCATION_COURTE': ('Location Courte Durée',
      'Location journalière / hebdomadaire', Icons.play_circle_outline),
};

const _paymentMethodLabels = {
  'virement': 'Virement',
  'cheque': 'Chèque',
  'espece': 'Espèces',
  'carte': 'Carte',
  'autre': 'Autre',
};

class _PaymentEntry {
  _PaymentEntry({
    required this.id,
    this.method = 'virement',
    this.amount = '',
    this.reference = '',
    this.chequeNumber = '',
  });
  final String id;
  String method;
  String amount;
  String reference;
  String chequeNumber;
}

class _NewContractFromReservationScreenState
    extends ConsumerState<NewContractFromReservationScreen> {
  _Step _step = _Step.client;
  bool _busy = false;
  bool _prefilled = false;
  String? _prefilledNumber;
  String? _lastError;

  // Form state
  String? _clientId;
  String _secondaryDriver = '';
  String _assignedAgent = '';
  String? _vehicleId;
  // Resume lisible de la reservation d'origine, affiche en haut de chaque
  // etape pour que l'utilisateur voie immediatement ce qui est pre-rempli.
  String? _prefilledCustomerName;
  String? _prefilledVehicleLabel;
  String _type = 'LOCATION_COURTE';
  final _duration = TextEditingController(text: '0');
  final _monthly = TextEditingController(text: '0');
  final _kmIncluded = TextEditingController(text: '0');
  final _deposit = TextEditingController(text: '0');
  final _residual = TextEditingController(text: '38');
  DateTime? _startDate;
  DateTime? _endDate;
  final _paymentTerms = TextEditingController();
  final _expectedDay = TextEditingController(text: '5');
  final _notes = TextEditingController();
  final List<_PaymentEntry> _payments = [
    _PaymentEntry(id: '${DateTime.now().millisecondsSinceEpoch}')
  ];
  // Annexes : chaque libellé peut porter UNE pièce jointe (photo ou fichier
  // image choisi dans la galerie). Les clés sont stables pour que le mapping
  // vers la catégorie backend reste prédictible (voir `_annexCategoryFor`).
  final Map<String, XFile> _annexFiles = <String, XFile>{};

  @override
  void dispose() {
    _duration.dispose();
    _monthly.dispose();
    _kmIncluded.dispose();
    _deposit.dispose();
    _residual.dispose();
    _paymentTerms.dispose();
    _expectedDay.dispose();
    _notes.dispose();
    super.dispose();
  }

  bool get _isShort => _type == 'LOCATION_COURTE';

  void _prefillFromReservation(ReservationDetailDto d) {
    if (_prefilled) return;
    _prefilled = true;
    final r = d.reservation;
    _clientId = r.customerId;
    _vehicleId = r.vehicleId;
    _startDate = r.startAt;
    _endDate = r.endAt;
    _prefilledCustomerName =
        d.customerName ?? r.customerName;
    _prefilledVehicleLabel = d.vehicleName != null
        ? [d.vehicleName, d.vehicleRegistration].whereType<String>().join(' · ')
        : r.vehicleLabel;
    final rawDays = (_startDate != null && _endDate != null)
        ? _endDate!.difference(_startDate!).inDays
        : 0;
    final typeMap = <String, String>{
      'SHORT_RENTAL': 'LOCATION_COURTE',
      'short_rental': 'LOCATION_COURTE',
      'LONG_RENTAL': 'LLD',
      'long_rental': 'LLD',
      'LLD': 'LLD',
      'LOA': 'LOA',
      'CREDIT_AUTO': 'CREDIT_AUTO',
      'VENTE_VO': 'VENTE_VO',
    };
    _type = typeMap[r.reservationType ?? ''] ?? 'LOCATION_COURTE';
    final isShort = _type == 'LOCATION_COURTE';
    final duration = isShort ? rawDays : max(1, (rawDays / 30).round());
    _duration.text = '${max(duration, 0)}';
    if (r.estimatedPrice != null && duration > 0) {
      _monthly.text = (r.estimatedPrice! / duration).round().toString();
    } else if (r.dailyRate != null) {
      _monthly.text = r.dailyRate!.round().toString();
    }
    if (r.depositAmount != null) {
      _deposit.text = r.depositAmount!.round().toString();
    }
    if (r.allowedKmPerDay != null) {
      _kmIncluded.text = r.allowedKmPerDay!.toString();
    }
    _prefilledNumber = r.number;
    // On arrive directement sur l'étape « Type » comme le web.
    _step = _Step.type;
  }

  bool _canAdvance() {
    switch (_step) {
      case _Step.client:
        return _clientId != null;
      case _Step.vehicle:
        return _vehicleId != null;
      default:
        return true;
    }
  }

  void _next() {
    final idx = _Step.values.indexOf(_step);
    if (idx < _Step.values.length - 1) {
      setState(() => _step = _Step.values[idx + 1]);
    }
  }

  void _prev() {
    final idx = _Step.values.indexOf(_step);
    if (idx > 0) setState(() => _step = _Step.values[idx - 1]);
  }

  Future<void> _save({required bool draft}) async {
    setState(() {
      _busy = true;
      _lastError = null;
    });
    try {
      final payload = <String, dynamic>{
        'contract_type': _type,
        if (_clientId != null) 'customer_id': _clientId,
        if (_vehicleId != null) 'vehicle_id': _vehicleId,
        if (_startDate != null)
          'start_date': _startDate!.toIso8601String().split('T').first,
        if (_endDate != null)
          'end_date': _endDate!.toIso8601String().split('T').first,
        if (int.tryParse(_duration.text) != null)
          'duration_months': int.parse(_duration.text),
        if (double.tryParse(_monthly.text) != null)
          'monthly_payment': double.parse(_monthly.text),
        if (double.tryParse(_deposit.text) != null)
          'deposit_amount': double.parse(_deposit.text),
        if (int.tryParse(_kmIncluded.text) != null)
          'allowed_km': int.parse(_kmIncluded.text),
        if (_type == 'LOA' && double.tryParse(_residual.text) != null)
          'buyout_option_amount': double.parse(_residual.text),
        if (_paymentTerms.text.trim().isNotEmpty)
          'payment_terms': _paymentTerms.text.trim(),
        if (int.tryParse(_expectedDay.text) != null)
          'expected_payment_day': int.parse(_expectedDay.text),
        'payment_method': _payments.isNotEmpty ? _payments.first.method : 'virement',
        if (_payments.any((p) => p.method == 'cheque' && p.chequeNumber.isNotEmpty))
          'cheque_number': _payments
              .firstWhere((p) => p.method == 'cheque' && p.chequeNumber.isNotEmpty)
              .chequeNumber,
        if (_payments.any((p) => p.reference.isNotEmpty))
          'bank_reference':
              _payments.firstWhere((p) => p.reference.isNotEmpty).reference,
        if (_notes.text.trim().isNotEmpty) 'notes': _notes.text.trim(),
        'status': draft ? 'draft' : 'draft',
        'payment_entries': _payments
            .where((p) =>
                p.amount.toString().isNotEmpty &&
                double.tryParse(p.amount.toString()) != null)
            .map((p) => {
                  'method': p.method,
                  'amount': double.parse(p.amount.toString()),
                  if (p.reference.isNotEmpty) 'reference': p.reference,
                  if (p.chequeNumber.isNotEmpty) 'cheque_number': p.chequeNumber,
                })
            .toList(),
      };
      final created = await ref
          .read(apiClientProvider)
          .postData('/contracts', body: payload);
      final contractId = created is Map
          ? (created['id'] ?? created['contract']?['id'])?.toString()
          : null;
      // Upload des annexes : non bloquant pour la création du contrat. On
      // remonte un snack si une pièce n'a pas pu partir, pour que l'agent
      // sache qu'il reste à les charger depuis la fiche contrat.
      if (contractId != null && contractId.isNotEmpty && _annexFiles.isNotEmpty) {
        final failed = <String>[];
        for (final entry in _annexFiles.entries) {
          try {
            final multipart = await MultipartFile.fromFile(entry.value.path);
            await ref.read(apiClientProvider).raw.post(
                  '/entities/contract/$contractId/documents',
                  data: FormData.fromMap({
                    'file': multipart,
                    'category': _annexCategoryFor(entry.key),
                    'title': entry.key,
                  }),
                );
          } catch (_) {
            failed.add(entry.key);
          }
        }
        if (failed.isNotEmpty && mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
                content: Text(
                    'Contrat créé. ${failed.length} annexe(s) n\'ont pas pu être envoyée(s) : ${failed.join(', ')}.')),
          );
        }
      }
      ref.invalidate(contractsListProvider);
      if (widget.reservationId != null) {
        ref.invalidate(reservationDetailProvider(widget.reservationId!));
      }
      ref.invalidate(reservationsListProvider);
      ref.invalidate(enrichedReservationsProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(draft
              ? 'Brouillon enregistré.'
              : 'Contrat créé (brouillon). Signez pour finaliser.'),
        ),
      );
      Navigator.of(context).maybePop();
    } catch (e) {
      setState(() => _lastError = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    // Si on arrive depuis une réservation, pré-remplir dès que la fiche est là.
    if (widget.reservationId != null) {
      final async = ref.watch(reservationDetailProvider(widget.reservationId!));
      return Scaffold(
        body: SafeArea(
          child: async.when(
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Center(
                child: Text('Erreur : $e',
                    style: const TextStyle(color: Colors.redAccent))),
            data: (d) {
              _prefillFromReservation(d);
              return _buildBody();
            },
          ),
        ),
      );
    }
    return Scaffold(
      body: SafeArea(child: _buildBody()),
    );
  }

  Widget _buildBody() {
    return Column(
      children: [
        _header(),
        _stepperIndicator(),
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (_prefilled && widget.reservationId != null) ...[
                _prefillSummaryCard(),
                const SizedBox(height: 12),
              ],
              _stepHint(),
              const SizedBox(height: 10),
              _stepBody(),
              if (_lastError != null) ...[
                const SizedBox(height: 10),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF2F2),
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: const Color(0xFFFECACA)),
                  ),
                  child: Text(_lastError!,
                      style: const TextStyle(
                          color: Color(0xFFB91C1C), fontSize: 12)),
                ),
              ],
              const SizedBox(height: 60),
            ],
          ),
        ),
        _footerNav(),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Header + stepper
  // ---------------------------------------------------------------------------

  Widget _header() {
    return Container(
      padding: const EdgeInsets.fromLTRB(8, 10, 16, 10),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(bottom: BorderSide(color: Theme.of(context).dividerColor)),
      ),
      child: Row(
        children: [
          IconButton(
            onPressed: () => Navigator.of(context).maybePop(),
            icon: const Icon(Icons.arrow_back),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Génération de contrat',
                    style: TextStyle(
                        fontWeight: FontWeight.w900, fontSize: 15)),
                if (_prefilledNumber != null)
                  Text('Pré-rempli depuis $_prefilledNumber',
                      style: const TextStyle(
                          fontSize: 11, color: Colors.black54)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _stepperIndicator() {
    final current = _Step.values.indexOf(_step);
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (var i = 0; i < _Step.values.length; i++) ...[
              _StepDot(
                index: i,
                label: _stepLabels[_Step.values[i]]!,
                active: i == current,
                done: i < current,
                onTap: () => setState(() => _step = _Step.values[i]),
              ),
              if (i < _Step.values.length - 1)
                Container(
                  width: 18,
                  height: 2,
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  color: i < current
                      ? const Color(0xFF4F46E5)
                      : Colors.grey.shade300,
                ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _prefillSummaryCard() {
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    String fmtRange() {
      if (_startDate == null && _endDate == null) return '—';
      final a = _startDate != null ? dateFmt.format(_startDate!) : '—';
      final b = _endDate != null ? dateFmt.format(_endDate!) : '—';
      return '$a → $b';
    }
    final rows = <(IconData, String, String)>[
      if (_prefilledCustomerName != null && _prefilledCustomerName!.isNotEmpty)
        (Icons.person_outline, 'Client', _prefilledCustomerName!),
      if (_prefilledVehicleLabel != null && _prefilledVehicleLabel!.isNotEmpty)
        (Icons.directions_car_outlined, 'Véhicule', _prefilledVehicleLabel!),
      (Icons.event_outlined, 'Période', fmtRange()),
    ];
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFEEF2FF), Color(0xFFF5F3FF)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFC7D2FE)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.auto_awesome,
                  color: Color(0xFF4F46E5), size: 16),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  _prefilledNumber != null
                      ? 'Pré-rempli depuis $_prefilledNumber'
                      : 'Réservation pré-remplie',
                  style: const TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w900,
                    color: Color(0xFF4338CA),
                    letterSpacing: 0.3,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          for (final r in rows) ...[
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(r.$1, size: 14, color: const Color(0xFF4F46E5)),
                  const SizedBox(width: 6),
                  SizedBox(
                    width: 68,
                    child: Text(r.$2,
                        style: const TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: Color(0xFF475569))),
                  ),
                  Expanded(
                    child: Text(r.$3,
                        style: const TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                            color: Color(0xFF0F172A))),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _stepHint() {
    final current = _Step.values.indexOf(_step);
    return Row(
      children: [
        Expanded(
          child: Text(
            'Étape ${current + 1} / ${_Step.values.length} — ${_stepLabels[_step]}',
            style: const TextStyle(
                color: Colors.black45,
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.1),
          ),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Footer nav
  // ---------------------------------------------------------------------------

  Widget _footerNav() {
    final idx = _Step.values.indexOf(_step);
    final isLast = idx == _Step.values.length - 1;
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border(top: BorderSide(color: Theme.of(context).dividerColor)),
      ),
      child: SafeArea(
        top: false,
        child: Row(
          children: [
            if (idx > 0)
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _busy ? null : _prev,
                  icon: const Icon(Icons.arrow_back, size: 16),
                  label: const Text('Précédent'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF334155),
                    side: const BorderSide(color: Color(0xFFCBD5E1)),
                    minimumSize: const Size.fromHeight(48),
                    textStyle: const TextStyle(
                        fontWeight: FontWeight.w900, fontSize: 13),
                  ),
                ),
              ),
            if (idx > 0) const SizedBox(width: 8),
            if (isLast) ...[
              Expanded(
                child: OutlinedButton(
                  onPressed: _busy ? null : () => _save(draft: true),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: const Color(0xFF334155),
                    side: const BorderSide(color: Color(0xFFCBD5E1)),
                    minimumSize: const Size.fromHeight(48),
                    textStyle: const TextStyle(
                        fontWeight: FontWeight.w900, fontSize: 13),
                  ),
                  child: Text(_busy ? '…' : 'Brouillon'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton.icon(
                  onPressed: _busy ? null : () => _save(draft: false),
                  icon: const Icon(Icons.check, size: 16),
                  label: Text(_busy ? 'Création…' : 'Signer et créer'),
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF4F46E5),
                    foregroundColor: Colors.white,
                    minimumSize: const Size.fromHeight(48),
                    textStyle: const TextStyle(
                        fontWeight: FontWeight.w900, fontSize: 13),
                  ),
                ),
              ),
            ] else
              Expanded(
                flex: idx > 0 ? 1 : 2,
                child: FilledButton.icon(
                  onPressed: _busy || !_canAdvance() ? null : _next,
                  icon: const Icon(Icons.arrow_forward, size: 16),
                  label: const Text('Suivant'),
                  style: FilledButton.styleFrom(
                    backgroundColor: const Color(0xFF4F46E5),
                    foregroundColor: Colors.white,
                    minimumSize: const Size.fromHeight(48),
                    textStyle: const TextStyle(
                        fontWeight: FontWeight.w900, fontSize: 13),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------
  // Steps bodies
  // ---------------------------------------------------------------------------

  Widget _stepBody() {
    switch (_step) {
      case _Step.client:
        return _clientStep();
      case _Step.vehicle:
        return _vehicleStep();
      case _Step.type:
        return _typeStep();
      case _Step.terms:
        return _termsStep();
      case _Step.annex:
        return _annexStep();
      case _Step.review:
        return _reviewStep();
    }
  }

  Widget _clientStep() {
    final clients = ref.watch(customersListProvider).valueOrNull ??
        const <CustomerDto>[];
    final selected = clients.where((c) => c.id == _clientId).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _Section('Client locataire 1'),
        _searchableDropdown<CustomerDto>(
          items: clients,
          value: _clientId,
          toId: (c) => c.id,
          toLabel: (c) =>
              '${c.displayName ?? c.code} ${c.type == 'ENTREPRISE' ? '(Entreprise)' : '(Particulier)'}',
          onChanged: (id) => setState(() => _clientId = id),
          hint: 'Sélectionner un client…',
        ),
        const SizedBox(height: 10),
        const _Section('Conducteur additionnel (optionnel)'),
        TextField(
          decoration: _dec(hint: 'Nom du conducteur additionnel…'),
          onChanged: (v) => _secondaryDriver = v,
        ),
        if (selected.isNotEmpty) ...[
          const SizedBox(height: 12),
          _ClientPreview(c: selected.first),
        ],
      ],
    );
  }

  Widget _vehicleStep() {
    final vehicles = ref.watch(vehiclesListProvider).valueOrNull ??
        const <VehicleDto>[];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _Section('Choix du véhicule'),
        _searchableDropdown<VehicleDto>(
          items: vehicles,
          value: _vehicleId,
          toId: (v) => v.id,
          toLabel: (v) => '${v.label} · ${v.registration}',
          onChanged: (id) => setState(() => _vehicleId = id),
          hint: 'Sélectionner un véhicule…',
        ),
      ],
    );
  }

  Widget _typeStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _Section('Type de contrat'),
        for (final e in _contractTypes.entries) _typeCard(e.key, e.value),
      ],
    );
  }

  Widget _typeCard(String key, (String, String, IconData) data) {
    final active = _type == key;
    return InkWell(
      onTap: () => setState(() => _type = key),
      borderRadius: BorderRadius.circular(14),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: active ? const Color(0xFFEEF2FF) : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: active
                ? const Color(0xFF4F46E5)
                : Colors.grey.shade200,
            width: active ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                gradient: active
                    ? const LinearGradient(
                        colors: [Color(0xFF4F46E5), Color(0xFF7C3AED)])
                    : null,
                color: active ? null : const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                data.$3,
                color: active ? Colors.white : const Color(0xFF4F46E5),
                size: 20,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(data.$1,
                      style: const TextStyle(
                          fontWeight: FontWeight.w900, fontSize: 13)),
                  const SizedBox(height: 2),
                  Text(data.$2,
                      style: const TextStyle(
                          color: Colors.black54, fontSize: 11.5)),
                ],
              ),
            ),
            if (active)
              Container(
                width: 22,
                height: 22,
                decoration: const BoxDecoration(
                  color: Color(0xFF4F46E5),
                  shape: BoxShape.circle,
                ),
                child:
                    const Icon(Icons.check, color: Colors.white, size: 14),
              ),
          ],
        ),
      ),
    );
  }

  Widget _termsStep() {
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    final isShort = _isShort;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _Section('Agent commercial assigné'),
        TextField(
          decoration: _dec(hint: 'Nom de l\'agent (optionnel)'),
          onChanged: (v) => _assignedAgent = v,
        ),
        const SizedBox(height: 6),
        _Section(isShort ? 'Durée (jours)' : 'Durée (mois)'),
        _NumberField(controller: _duration),
        _Section(_type == 'CREDIT_AUTO'
            ? 'Mensualité (MAD)'
            : isShort
                ? 'Prix par jour (MAD)'
                : 'Loyer mensuel (MAD)'),
        _NumberField(controller: _monthly),
        _Section(isShort
            ? 'Kilométrage journalier inclus'
            : 'Kilométrage mensuel inclus'),
        _NumberField(controller: _kmIncluded),
        const _Section('Caution / garantie (MAD)'),
        _NumberField(controller: _deposit),
        if (_type == 'LOA') ...[
          const _Section('Valeur résiduelle (%)'),
          _NumberField(controller: _residual),
        ],
        const _Section('Période'),
        _DateField(
            label: 'Début',
            value: _startDate,
            onChanged: (d) => setState(() => _startDate = d),
            dateFmt: dateFmt),
        _DateField(
            label: 'Fin',
            value: _endDate,
            onChanged: (d) => setState(() => _endDate = d),
            dateFmt: dateFmt),
        const _Section('Modes de paiement'),
        for (final p in _payments) _paymentCard(p),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => setState(() => _payments.add(_PaymentEntry(
                id: '${DateTime.now().millisecondsSinceEpoch}'))),
            icon: const Icon(Icons.add, size: 14),
            label: const Text('Ajouter un mode'),
            style: TextButton.styleFrom(
                foregroundColor: const Color(0xFF4F46E5),
                textStyle: const TextStyle(
                    fontWeight: FontWeight.w900, fontSize: 12)),
          ),
        ),
        const _Section('Jour de paiement attendu (1-31)'),
        _NumberField(controller: _expectedDay),
        const _Section('Conditions de paiement'),
        TextField(
            controller: _paymentTerms,
            maxLines: 2,
            decoration: _dec(hint: 'ex. 30 jours fin de mois…')),
      ],
    );
  }

  Widget _paymentCard(_PaymentEntry p) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        border: Border.all(color: Theme.of(context).dividerColor),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text('Paiement ${_payments.indexOf(p) + 1}',
                    style: const TextStyle(
                        fontWeight: FontWeight.w800, fontSize: 11.5)),
              ),
              if (_payments.length > 1)
                IconButton(
                  onPressed: () => setState(() => _payments.remove(p)),
                  icon: const Icon(Icons.close,
                      color: Color(0xFFB91C1C), size: 16),
                  tooltip: 'Supprimer',
                  visualDensity: VisualDensity.compact,
                ),
            ],
          ),
          const SizedBox(height: 4),
          DropdownButtonFormField<String>(
            value: p.method,
            isExpanded: true,
            decoration: _dec(label: 'Mode'),
            items: [
              for (final e in _paymentMethodLabels.entries)
                DropdownMenuItem(value: e.key, child: Text(e.value)),
            ],
            onChanged: (v) => setState(() => p.method = v ?? p.method),
          ),
          const SizedBox(height: 8),
          TextField(
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: _dec(label: 'Montant (MAD) — optionnel'),
            controller: TextEditingController(text: p.amount)
              ..selection =
                  TextSelection.collapsed(offset: p.amount.length),
            onChanged: (v) => p.amount = v,
          ),
          if (p.method == 'virement' ||
              p.method == 'carte' ||
              p.method == 'autre') ...[
            const SizedBox(height: 8),
            TextField(
              decoration: _dec(label: 'Référence'),
              controller: TextEditingController(text: p.reference)
                ..selection =
                    TextSelection.collapsed(offset: p.reference.length),
              onChanged: (v) => p.reference = v,
            ),
          ],
          if (p.method == 'cheque') ...[
            const SizedBox(height: 8),
            TextField(
              decoration: _dec(label: 'N° chèque'),
              controller: TextEditingController(text: p.chequeNumber)
                ..selection =
                    TextSelection.collapsed(offset: p.chequeNumber.length),
              onChanged: (v) => p.chequeNumber = v,
            ),
          ],
        ],
      ),
    );
  }

  Widget _annexStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _Section('Documents client'),
        _uploadZone("Pièce d'identité (CIN)"),
        _uploadZone('Permis de conduire'),
        _uploadZone('Justificatif de revenus / CNSS'),
        if (_type == 'CREDIT_AUTO')
          _uploadZone('Bilans financiers (3 derniers exercices)'),
        if (_payments.any((p) => p.method == 'cheque')) ...[
          const _Section('Chèque'),
          _uploadZone('Photo / scan du chèque'),
        ],
        const _Section('Photos véhicule avant livraison'),
        _uploadZone('Avant'),
        _uploadZone('Arrière'),
        _uploadZone('Côté gauche'),
        _uploadZone('Côté droit'),
        _uploadZone('Intérieur / tableau de bord'),
      ],
    );
  }

  Widget _uploadZone(String label) {
    final file = _annexFiles[label];
    final added = file != null;
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: added ? const Color(0xFFECFDF5) : Colors.white,
        border: Border.all(
          color: added ? const Color(0xFF059669) : Colors.grey.shade300,
        ),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                added ? Icons.check_circle : Icons.cloud_upload_outlined,
                color: added ? const Color(0xFF059669) : Colors.black45,
                size: 18,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(label,
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 12.5)),
              ),
              if (added)
                IconButton(
                  tooltip: 'Supprimer',
                  onPressed: () => setState(() => _annexFiles.remove(label)),
                  icon:
                      const Icon(Icons.close, size: 16, color: Colors.redAccent),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(minWidth: 28, minHeight: 28),
                ),
            ],
          ),
          if (added) ...[
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: AspectRatio(
                aspectRatio: 16 / 10,
                child: Image.file(File(file.path), fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => Container(
                        color: const Color(0xFFF1F5F9),
                        child: const Center(
                            child: Icon(Icons.description_outlined,
                                color: Colors.black45, size: 36)))),
              ),
            ),
          ],
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () =>
                      _pickAnnex(label, ImageSource.camera),
                  icon: const Icon(Icons.photo_camera, size: 14),
                  label: Text(added ? 'Reprendre' : 'Photo',
                      style: const TextStyle(fontSize: 11.5)),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(34),
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                  ),
                ),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () =>
                      _pickAnnex(label, ImageSource.gallery),
                  icon: const Icon(Icons.image_outlined, size: 14),
                  label: Text(added ? 'Remplacer' : 'Fichier',
                      style: const TextStyle(fontSize: 11.5)),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(34),
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _pickAnnex(String label, ImageSource source) async {
    try {
      final picker = ImagePicker();
      final f = await picker.pickImage(
          source: source, maxWidth: 2000, imageQuality: 85);
      if (f != null) setState(() => _annexFiles[label] = f);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content: Text(source == ImageSource.camera
                ? "Impossible d'ouvrir la caméra."
                : "Impossible d'ouvrir la galerie.")),
      );
    }
  }

  /// Catégorie posée sur l'EntityAttachment côté backend, pour que l'audit
  /// sache à quoi correspond chaque document (CIN du client, chèque, photo
  /// véhicule avant livraison, etc.).
  String _annexCategoryFor(String label) {
    switch (label) {
      case "Pièce d'identité (CIN)":
        return 'cin';
      case 'Permis de conduire':
        return 'driving_license';
      case 'Justificatif de revenus / CNSS':
        return 'income_proof';
      case 'Bilans financiers (3 derniers exercices)':
        return 'financial_statements';
      case 'Photo / scan du chèque':
        return 'cheque';
      case 'Avant':
      case 'Arrière':
      case 'Côté gauche':
      case 'Côté droit':
      case 'Intérieur / tableau de bord':
        return 'handover_photo';
      default:
        return 'other';
    }
  }

  Widget _reviewStep() {
    final money = NumberFormat.decimalPattern('fr');
    final clients = ref.watch(customersListProvider).valueOrNull ??
        const <CustomerDto>[];
    final vehicles = ref.watch(vehiclesListProvider).valueOrNull ??
        const <VehicleDto>[];
    final client = clients.where((c) => c.id == _clientId).firstOrNull;
    final vehicle = vehicles.where((v) => v.id == _vehicleId).firstOrNull;
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    final rows = [
      ('Type', _contractTypes[_type]?.$1 ?? _type),
      ('Client', client?.displayName ?? client?.code ?? '—'),
      if (_secondaryDriver.isNotEmpty)
        ('Conducteur additionnel', _secondaryDriver),
      if (_assignedAgent.isNotEmpty) ('Agent', _assignedAgent),
      ('Véhicule',
          vehicle != null ? '${vehicle.label} · ${vehicle.registration}' : '—'),
      ('Début', _startDate != null ? dateFmt.format(_startDate!) : '—'),
      ('Fin', _endDate != null ? dateFmt.format(_endDate!) : '—'),
      (_isShort ? 'Durée (jours)' : 'Durée (mois)', _duration.text),
      (
        _type == 'CREDIT_AUTO'
            ? 'Mensualité'
            : _isShort
                ? 'Prix / jour'
                : 'Loyer mensuel',
        '${money.format(double.tryParse(_monthly.text) ?? 0)} MAD'
      ),
      (
        _isShort
            ? 'Km / jour inclus'
            : 'Km / mois inclus',
        _kmIncluded.text
      ),
      ('Caution', '${money.format(double.tryParse(_deposit.text) ?? 0)} MAD'),
      if (_type == 'LOA') ('Valeur résiduelle', '${_residual.text} %'),
      ('Modes de paiement',
          _payments.map((p) => _paymentMethodLabels[p.method] ?? p.method).join(' + ')),
      if (_paymentTerms.text.isNotEmpty)
        ('Conditions', _paymentTerms.text),
      if (_annexFiles.isNotEmpty)
        ('Annexes', '${_annexFiles.length} document(s)'),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _Section('Résumé du contrat avant signature'),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: Theme.of(context).dividerColor),
          ),
          child: Column(
            children: [
              for (final r in rows) _ReviewRow(label: r.$1, value: r.$2),
            ],
          ),
        ),
        const SizedBox(height: 12),
        const _Section('Notes additionnelles'),
        TextField(
          controller: _notes,
          maxLines: 3,
          decoration: _dec(hint: 'Optionnel…'),
        ),
      ],
    );
  }

  // ---------------------------------------------------------------------------
  // Shared bits
  // ---------------------------------------------------------------------------

  Widget _searchableDropdown<T extends Object>({
    required List<T> items,
    required String? value,
    required String Function(T) toId,
    required String Function(T) toLabel,
    required ValueChanged<String?> onChanged,
    required String hint,
  }) {
    return Autocomplete<T>(
      displayStringForOption: toLabel,
      optionsBuilder: (text) {
        final q = text.text.toLowerCase();
        if (q.isEmpty) return items.take(20);
        return items.where((i) => toLabel(i).toLowerCase().contains(q));
      },
      onSelected: (sel) => onChanged(toId(sel)),
      fieldViewBuilder: (ctx, controller, focus, _) {
        if (value != null && controller.text.isEmpty) {
          final current = items.where((i) => toId(i) == value).firstOrNull;
          if (current != null) {
            controller.text = toLabel(current);
          }
        }
        return TextField(
          controller: controller,
          focusNode: focus,
          decoration: _dec(hint: hint),
          onChanged: (v) {
            if (v.isEmpty) onChanged(null);
          },
        );
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Widgets utilitaires (sections, champs, aperçu)
// ---------------------------------------------------------------------------

class _StepDot extends StatelessWidget {
  const _StepDot({
    required this.index,
    required this.label,
    required this.active,
    required this.done,
    required this.onTap,
  });
  final int index;
  final String label;
  final bool active;
  final bool done;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = active
        ? const Color(0xFF4F46E5)
        : done
            ? const Color(0xFF10B981)
            : const Color(0xFFCBD5E1);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 22,
              height: 22,
              decoration:
                  BoxDecoration(color: color, shape: BoxShape.circle),
              child: Center(
                child: done
                    ? const Icon(Icons.check, size: 12, color: Colors.white)
                    : Text('${index + 1}',
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w900)),
              ),
            ),
            const SizedBox(height: 3),
            Text(label,
                style: TextStyle(
                    color: color,
                    fontSize: 9,
                    fontWeight: FontWeight.w800)),
          ],
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section(this.text);
  final String text;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6, top: 6),
      child: Text(text.toUpperCase(),
          style: const TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w900,
              color: Colors.black45,
              letterSpacing: 1.1)),
    );
  }
}

class _NumberField extends StatelessWidget {
  const _NumberField({required this.controller});
  final TextEditingController controller;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextField(
        controller: controller,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: _dec(),
      ),
    );
  }
}

class _DateField extends StatelessWidget {
  const _DateField({
    required this.label,
    required this.value,
    required this.onChanged,
    required this.dateFmt,
  });
  final String label;
  final DateTime? value;
  final ValueChanged<DateTime?> onChanged;
  final DateFormat dateFmt;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        onTap: () async {
          final d = await showDatePicker(
            context: context,
            initialDate: value ?? DateTime.now(),
            firstDate: DateTime(2015),
            lastDate: DateTime(2100),
          );
          if (d != null) onChanged(d);
        },
        child: InputDecorator(
          decoration: _dec(label: label),
          child: Text(value != null ? dateFmt.format(value!) : '—'),
        ),
      ),
    );
  }
}

class _ClientPreview extends StatelessWidget {
  const _ClientPreview({required this.c});
  final CustomerDto c;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(c.type == 'ENTREPRISE' ? 'ENTREPRISE' : 'PARTICULIER',
              style: const TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w900,
                  color: Colors.black45,
                  letterSpacing: 1.2)),
          const SizedBox(height: 3),
          Text(c.displayName ?? c.code,
              style: const TextStyle(
                  fontWeight: FontWeight.w900, fontSize: 15)),
          const SizedBox(height: 6),
          Wrap(
            spacing: 10,
            runSpacing: 4,
            children: [
              if (c.nationalId != null)
                Text('CIN : ${c.nationalId}',
                    style: const TextStyle(fontSize: 11.5)),
              if (c.ice != null)
                Text('ICE : ${c.ice}',
                    style: const TextStyle(fontSize: 11.5)),
              if (c.kycStatus != null)
                Text('KYC : ${c.kycStatus}',
                    style: const TextStyle(fontSize: 11.5)),
            ],
          ),
        ],
      ),
    );
  }
}

class _ReviewRow extends StatelessWidget {
  const _ReviewRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(label,
                style:
                    const TextStyle(fontSize: 11.5, color: Colors.black54)),
          ),
          Flexible(
            child: Text(value,
                textAlign: TextAlign.right,
                style: const TextStyle(
                    fontSize: 12.5, fontWeight: FontWeight.w800)),
          ),
        ],
      ),
    );
  }
}

InputDecoration _dec({String? label, String? hint}) {
  return InputDecoration(
    labelText: label,
    hintText: hint,
    isDense: true,
    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: Color(0x33888888)),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: Color(0x33888888)),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: Color(0xFF4F46E5), width: 1.5),
    ),
  );
}



