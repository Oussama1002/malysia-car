import 'dart:io' show File;
import 'dart:math';
import 'dart:typed_data' show Uint8List;

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../../core/api/api_client.dart';
import '../../../core/auth/user_repo.dart';
import '../../contracts/data/contracts_repo.dart';
import '../../contracts/presentation/contract_paper_preview.dart';
import '../../contracts/presentation/contract_pdf_preview_screen.dart';
import '../../contracts/presentation/signature_pad.dart';
import '../../customers/data/customer_dto.dart';
import '../../customers/data/customers_repo.dart';
import '../../documents/data/document_dto.dart';
import '../../documents/data/entity_documents_repo.dart';
import '../../documents/presentation/document_viewer_screen.dart';
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
  // Signature électronique du client sur l'étape Validation. Les bytes
  // sont capturés depuis le SignaturePad et uploadés comme document
  // 'signature' sur le contrat créé.
  final GlobalKey<SignaturePadState> _signatureKey = GlobalKey<SignaturePadState>();
  bool _signed = false;
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
  // Mode de paiement dédié à la Franchise d'assurance — l'agent peut l'avoir
  // encaissée par un canal différent du loyer (ex. espèces pour la franchise,
  // virement pour le loyer). Reste indépendant du mode de paiement du loyer.
  String _depositMethod = 'virement';
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

  /// Whitelist of contract types from settings.contracts.enabled_contract_types
  /// (CSV). Loaded on first build from /v1/settings/contracts. Falls back to
  /// LLD + LOCATION_COURTE if the admin never set the value, matching the
  /// business default on the web app.
  Set<String> _enabledTypes = const {'LLD', 'LOCATION_COURTE'};
  bool _enabledTypesLoaded = false;
  Future<void> _loadEnabledContractTypes() async {
    if (_enabledTypesLoaded) return;
    _enabledTypesLoaded = true;
    try {
      final res = await ref.read(apiClientProvider).getData('/settings/contracts');
      final map = res is Map ? res : const <String, dynamic>{};
      final data = map['data'] is Map ? map['data'] as Map : map;
      final settings = data['settings'] is Map ? data['settings'] as Map : const <String, dynamic>{};
      final csv = (settings['enabled_contract_types'] ?? '').toString();
      final parts = csv
          .split(',')
          .map((s) => s.trim())
          .where((s) => s.isNotEmpty)
          .toSet();
      if (parts.isNotEmpty && mounted) {
        setState(() {
          _enabledTypes = parts;
          // Si le type pré-rempli n'est plus autorisé, retomber sur le
          // premier type disponible pour que la page ne reste pas vide.
          if (!_enabledTypes.contains(_type)) {
            _type = _enabledTypes.first;
          }
        });
      }
    } catch (_) {
      // Non-blocking — on garde le défaut LLD + LCD.
    }
  }

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
    // Tarif rule: the monthly rent only prefills from the reservation when
    // that reservation came from a landing-page lead (source=website_lead).
    // Agent-created reservations force the agent to type the price here.
    // See feedback-no-vehicle-tarif.
    if (r.source == 'website_lead') {
      if (r.estimatedPrice != null && duration > 0) {
        _monthly.text = (r.estimatedPrice! / duration).round().toString();
      } else if (r.dailyRate != null) {
        _monthly.text = r.dailyRate!.round().toString();
      }
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
      case _Step.terms:
        // Loyer, Franchise, Date de début and Date de fin must all be
        // set to a strictly positive value / non-null date before the
        // agent can leave the Conditions step.
        final hasMonthly = (double.tryParse(_monthly.text) ?? 0) > 0;
        final hasDeposit = (double.tryParse(_deposit.text) ?? 0) > 0;
        return hasMonthly && hasDeposit && _startDate != null && _endDate != null;
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
      // Les sélecteurs mobiles stockent des libellés FR internes
      // (virement, cheque, especes, carte). `deposit_method` sur
      // StoreContractRequest n'accepte que `cash,cheque,bank_transfer,card,other`
      // — sans cette conversion le POST /contracts tombait en 422.
      String depositMethodToApi(String m) {
        switch (m) {
          case 'cheque':
          case 'check':
            return 'cheque';
          case 'virement':
          case 'bank_transfer':
            return 'bank_transfer';
          case 'carte':
          case 'card':
            return 'card';
          case 'especes':
          case 'cash':
            return 'cash';
          default:
            return 'other';
        }
      }
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
        // Carried onto the contract row so the detail page and the
        // generated PDF show how the franchise was collected.
        'deposit_method': depositMethodToApi(_depositMethod),
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
      // Thread the source reservation through so the backend can gate the
      // tarif propagation + the activate() reservation-exclusion fix.
      if (widget.reservationId != null) {
        payload['reservation_id'] = widget.reservationId;
      }
      final created = await ref
          .read(apiClientProvider)
          .postData('/contracts', body: payload);
      final contractId = created is Map
          ? (created['id'] ?? created['contract']?['id'])?.toString()
          : null;

      // ─── Payments: same flow as the web wizard ────────────────────
      // The backend auto-promotes draft → approved on every Payment that
      // lands with contract_id (see PaymentController@maybePromoteContract),
      // so we must create payments BEFORE trying to activate. The caution
      // (franchise d'assurance) is sent as its own row with payment_type
      // 'caution' so it's split out of the Payé total on the Paiements tab.
      final paymentErrors = <String>[];
      if (contractId != null && contractId.isNotEmpty) {
        String uiToApiMethod(String m) {
          switch (m) {
            case 'cheque':
            case 'check':
              return 'check';
            case 'virement':
            case 'bank_transfer':
              return 'bank_transfer';
            case 'carte':
            case 'card':
              return 'card';
            case 'especes':
            case 'cash':
              return 'cash';
            default:
              return 'bank_transfer';
          }
        }

        final todayIso = DateTime.now().toIso8601String().split('T').first;

        // 1. Rent payments collected on step 5. First empty-amount row
        //    defaults to the monthly rent so a quick save still records
        //    the signing-time encaissement.
        final defaultRent = double.tryParse(_monthly.text) ?? 0.0;
        for (var i = 0; i < _payments.length; i++) {
          final p = _payments[i];
          final raw = double.tryParse(p.amount.toString()) ?? 0.0;
          final amount = raw > 0 ? raw : (i == 0 ? defaultRent : 0.0);
          if (amount <= 0 || _clientId == null) continue;
          final body = <String, dynamic>{
            'customer_id': _clientId,
            'contract_id': contractId,
            if (widget.reservationId != null)
              'reservation_id': widget.reservationId,
            'payment_method': uiToApiMethod(p.method),
            'payment_type': 'paiement_location',
            'amount': amount,
            'payment_date': todayIso,
            if (p.reference.isNotEmpty) 'external_reference': p.reference,
            if (p.chequeNumber.isNotEmpty) 'check_number': p.chequeNumber,
            'notes': 'Encaissement initial — signature contrat.',
          };
          try {
            await ref.read(apiClientProvider).postData('/payments', body: body);
          } catch (e) {
            paymentErrors.add(e.toString());
          }
        }

        // 2. Franchise d'assurance (caution) — separate row so it feeds
        //    deposit_paid instead of inflating Payé location. The agent
        //    picks its own payment mode on the Franchise section — a client
        //    often hands over the franchise in cash while paying the loyer
        //    by cheque or virement.
        final depositAmount = double.tryParse(_deposit.text) ?? 0.0;
        final depositMethod = uiToApiMethod(_depositMethod);
        if (depositAmount > 0 && _clientId != null) {
          try {
            await ref.read(apiClientProvider).postData('/payments', body: {
              'customer_id': _clientId,
              'contract_id': contractId,
              if (widget.reservationId != null)
                'reservation_id': widget.reservationId,
              'payment_method': depositMethod,
              'payment_type': 'caution',
              'amount': depositAmount,
              'payment_date': todayIso,
              'notes': "Franchise d'assurance — signature contrat.",
            });
          } catch (e) {
            paymentErrors.add('Franchise : $e');
          }
        }

        // 3. Best-effort activate — payments already promoted the contract
        //    to Approuvé, so a 422 here is non-fatal.
        try {
          await ref
              .read(apiClientProvider)
              .postData('/contracts/$contractId/activate', body: const {});
        } catch (_) {
          // Contrat déjà Approuvé via les paiements — pas d'alerte.
        }
      }

      // Signature électronique : si l'agent a signé sur l'étape Validation,
      // on exporte le PNG et on l'upload comme document du contrat avec
      // category='signature' pour que la fiche contrat et le PDF
      // regénéré y aient accès. Non bloquant.
      if (contractId != null && contractId.isNotEmpty && _signed) {
        try {
          final bytes = await _signatureKey.currentState?.exportPng();
          if (bytes != null) {
            final multi = MultipartFile.fromBytes(
              bytes,
              filename: 'signature-contrat.png',
            );
            await ref.read(apiClientProvider).raw.post(
                  '/entities/contract/$contractId/documents',
                  data: FormData.fromMap({
                    'file': multi,
                    'category': 'signature',
                    'title': 'Signature électronique client',
                    'notes': 'Capturée depuis le mobile',
                  }),
                );
          }
        } catch (_) {
          // Non bloquant — l'agent pourra la ré-attacher depuis la fiche
          // contrat si l'upload a échoué.
        }
      }

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
      final successMsg = draft
          ? 'Brouillon enregistré.'
          : 'Contrat créé et paiements enregistrés — statut Approuvé.';
      final failedMsg = paymentErrors.isEmpty
          ? successMsg
          : '$successMsg ${paymentErrors.length} encaissement(s) n\'ont pas pu être créés — ressaisissez-les depuis Paiements.';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(failedMsg)),
      );
      // When a contract was finalised (not just a draft) and we got a
      // contract id back, open the PDF preview straight away so the agent
      // can read it over, hand it to the client, or hit Télécharger. On a
      // plain draft save we just pop back to the previous screen.
      if (!draft && contractId != null && contractId.isNotEmpty) {
        await Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ContractPdfPreviewScreen(
              contractId: contractId,
              contractNumber: _prefilledNumber,
            ),
          ),
        );
        if (!mounted) return;
      }
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
                      ? const Color(0xFFB8933F)
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
                  color: Color(0xFFB8933F), size: 16),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  _prefilledNumber != null
                      ? 'Pré-rempli depuis $_prefilledNumber'
                      : 'Réservation pré-remplie',
                  style: const TextStyle(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w900,
                    color: Color(0xFF7A5F22),
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
                  Icon(r.$1, size: 14, color: const Color(0xFFB8933F)),
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
                    backgroundColor: const Color(0xFFB8933F),
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
                    backgroundColor: const Color(0xFFB8933F),
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
    final all = ref.watch(customersListProvider).valueOrNull ??
        const <CustomerDto>[];
    // Clients blacklistés hors du choix.
    final clients = all.where((c) => !c.isBlacklisted).toList();
    final selected = clients.where((c) => c.id == _clientId).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _Section('Client locataire 1'),
        _searchableDropdown<CustomerDto>(
          items: clients,
          value: _clientId,
          toId: (c) => c.id,
          toLabel: (c) {
            final name = c.displayName ?? c.code;
            final cin = (c.nationalId ?? '').trim();
            // CIN right next to the name — just the value, no 'CIN' prefix.
            final cinSuffix = cin.isNotEmpty ? ' · $cin' : '';
            final kind = c.type == 'ENTREPRISE' ? '(Entreprise)' : '(Particulier)';
            return '$name$cinSuffix $kind';
          },
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
    _loadEnabledContractTypes();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _Section('Type de contrat'),
        for (final e in _contractTypes.entries)
          if (_enabledTypes.contains(e.key)) _typeCard(e.key, e.value),
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
                ? const Color(0xFFB8933F)
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
                        colors: [Color(0xFFB8933F), Color(0xFF9A7B2E)])
                    : null,
                color: active ? null : const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(
                data.$3,
                color: active ? Colors.white : const Color(0xFFB8933F),
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
                  color: Color(0xFFB8933F),
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
        // Verrouillé sur l'utilisateur courant : un contrat est généré par
        // l'agent qui le signe. Le champ reste visible pour la traçabilité,
        // mais il est en lecture seule et pré-rempli avec le nom de la
        // session (ou l'email si le nom n'est pas renseigné).
        Consumer(
          builder: (context, ref, _) {
            final me = ref.watch(currentUserProvider).valueOrNull;
            if (me != null) {
              final label = me.displayName.trim().isNotEmpty
                  ? me.displayName.trim()
                  : me.email;
              if (_assignedAgent != label) {
                _assignedAgent = label;
              }
            }
            return TextField(
              controller: TextEditingController(text: _assignedAgent),
              enabled: false,
              decoration: _dec(hint: 'Agent connecté'),
            );
          },
        ),
        const SizedBox(height: 6),
        _Section(isShort ? 'Durée (jours)' : 'Durée (mois)'),
        _NumberField(controller: _duration),
        _Section('${_type == 'CREDIT_AUTO'
            ? 'Mensualité'
            : isShort
                ? 'Prix par jour'
                : 'Loyer mensuel'} (MAD) *'),
        _NumberField(
          controller: _monthly,
          onChanged: (_) => setState(() {}),
        ),
        _Section(isShort
            ? 'Kilométrage journalier inclus'
            : 'Kilométrage mensuel inclus'),
        _NumberField(controller: _kmIncluded),
        const _Section('Franchise d\'assurance (MAD) *'),
        _NumberField(
          controller: _deposit,
          onChanged: (_) => setState(() {}),
        ),
        const _Section('Franchise encaissée par'),
        Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: DropdownButtonFormField<String>(
            value: _depositMethod,
            isExpanded: true,
            decoration: _dec(),
            items: const [
              DropdownMenuItem(value: 'virement', child: Text('Virement')),
              DropdownMenuItem(value: 'cheque', child: Text('Chèque')),
              DropdownMenuItem(value: 'especes', child: Text('Espèces')),
              DropdownMenuItem(value: 'carte', child: Text('Carte')),
              DropdownMenuItem(value: 'autre', child: Text('Autre')),
            ],
            onChanged: (v) {
              if (v != null) setState(() => _depositMethod = v);
            },
          ),
        ),
        if (_type == 'LOA') ...[
          const _Section('Valeur résiduelle (%)'),
          _NumberField(controller: _residual),
        ],
        const _Section('Période *'),
        _DateField(
            label: 'Date de début',
            value: _startDate,
            onChanged: (d) => setState(() => _startDate = d),
            dateFmt: dateFmt),
        _DateField(
            label: 'Date de fin',
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
                foregroundColor: const Color(0xFFB8933F),
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
        if (_clientId != null && _clientId!.isNotEmpty) ...[
          const _Section('Documents du client déjà au dossier'),
          _ExistingClientDocuments(customerId: _clientId!),
          const SizedBox(height: 8),
        ],
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
      ("Franchise d'assurance", '${money.format(double.tryParse(_deposit.text) ?? 0)} MAD'),
      ("Franchise encaissée par",
          _paymentMethodLabels[_depositMethod] ?? _depositMethod),
      if (_type == 'LOA') ('Valeur résiduelle', '${_residual.text} %'),
      ('Modes de paiement (Loyer)',
          _payments.map((p) => _paymentMethodLabels[p.method] ?? p.method).join(' + ')),
      if (_paymentTerms.text.isNotEmpty)
        ('Conditions', _paymentTerms.text),
      if (_annexFiles.isNotEmpty)
        ('Annexes', '${_annexFiles.length} document(s)'),
    ];
    // Durée en jours pour le prix unitaire (mêmes règles que le web).
    final totalDays = _isShort
        ? (int.tryParse(_duration.text) ?? 0)
        : ((int.tryParse(_duration.text) ?? 0) * 30);
    final monthly = double.tryParse(_monthly.text) ?? 0;
    final totalTtc = _isShort
        ? monthly * (totalDays > 0 ? totalDays : 1)
        : monthly * (int.tryParse(_duration.text) ?? 0);
    final deposit = double.tryParse(_deposit.text) ?? 0;
    final paperValues = <String, String?>{
      'contract_number': 'attribué à l\'enregistrement',
      'customer_last_name': client?.displayName ?? client?.code,
      'customer_cin': client?.nationalId ?? client?.passportNumber,
      'customer_license': client?.drivingLicenseNumber,
      'customer_phone': client?.phone,
      'driver_last_name': _secondaryDriver.isEmpty ? null : _secondaryDriver,
      'vehicle_brand': vehicle == null
          ? null
          : [vehicle.brand, vehicle.model]
              .where((s) => (s ?? '').isNotEmpty)
              .join(' ')
              .trim(),
      'vehicle_plate': vehicle?.registration,
      'start_date': _startDate != null ? dateFmt.format(_startDate!) : null,
      'end_date': _endDate != null ? dateFmt.format(_endDate!) : null,
      'fuel': vehicle?.fuel,
      'days': totalDays > 0 ? totalDays.toString() : null,
      'unit_price': totalDays > 0
          ? '${money.format(totalTtc / totalDays)} MAD'
          : null,
      // La ligne « Assurance » du formulaire papier porte la Franchise
      // d'assurance convenue, pas l'expiration flotte.
      'insurance': deposit > 0 ? '${money.format(deposit)} MAD' : null,
      'total_ttc': '${money.format(totalTtc)} MAD',
      'payment_method': _paymentMethodLabels[_depositMethod] ??
          (_paymentTerms.text.isEmpty ? null : _paymentTerms.text),
    };
    final now = DateTime.now();
    final paperFlags = <String, bool>{
      'insurance': vehicle?.insuranceExpiry != null &&
          vehicle!.insuranceExpiry!.isAfter(now),
      'registration': (vehicle?.registration ?? '').isNotEmpty,
      'circulation': (vehicle?.registration ?? '').isNotEmpty,
      'vignette': vehicle?.vignetteExpiry != null &&
          vehicle!.vignetteExpiry!.isAfter(now),
      'inspection': vehicle?.techControlExpiry != null &&
          vehicle!.techControlExpiry!.isAfter(now),
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const _Section('Aperçu du contrat'),
        FutureBuilder<Uint8List?>(
          future: _signed ? _signatureKey.currentState?.exportPng() : null,
          builder: (_, snap) => ContractPaperPreview(
            values: paperValues,
            papers: paperFlags,
            signaturePng: snap.data,
          ),
        ),
        const SizedBox(height: 12),
        const _Section('Signature électronique du client'),
        SignaturePad(
          key: _signatureKey,
          onChanged: (hasStrokes) => setState(() => _signed = hasStrokes),
        ),
        const SizedBox(height: 6),
        Row(
          children: [
            TextButton.icon(
              onPressed: () {
                _signatureKey.currentState?.clear();
                setState(() => _signed = false);
              },
              icon: const Icon(Icons.refresh, size: 16),
              label: const Text('Effacer'),
            ),
            const Spacer(),
            if (_signed)
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 4),
                child: Text('✓ Signé',
                    style: TextStyle(
                        color: Color(0xFF059669),
                        fontWeight: FontWeight.w900,
                        fontSize: 12)),
              ),
          ],
        ),
        const SizedBox(height: 14),
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
        ? const Color(0xFFB8933F)
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

class _ExistingClientDocuments extends ConsumerWidget {
  const _ExistingClientDocuments({required this.customerId});
  final String customerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(entityDocumentsProvider(('customer', customerId)));
    return async.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 8),
        child: Center(
          child: SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      ),
      error: (e, _) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Text("Impossible de charger les documents du client : $e",
            style: const TextStyle(fontSize: 11, color: Colors.redAccent)),
      ),
      data: (docs) {
        if (docs.isEmpty) {
          return Container(
            margin: const EdgeInsets.only(bottom: 6),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              border: Border.all(color: Colors.grey.shade300),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Text(
              'Aucun document déjà au dossier pour ce client.',
              style: TextStyle(fontSize: 12, color: Colors.black54),
            ),
          );
        }
        final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (final d in docs)
              Container(
                margin: const EdgeInsets.only(bottom: 6),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: Colors.grey.shade300),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: InkWell(
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => DocumentViewerScreen(
                        id: d.id,
                        title: d.title,
                        mimeType: d.mimeType,
                      ),
                    ),
                  ),
                  child: Row(
                    children: [
                      Icon(
                        (d.mimeType ?? '').startsWith('image/')
                            ? Icons.image_outlined
                            : d.mimeType == 'application/pdf'
                                ? Icons.picture_as_pdf
                                : Icons.description_outlined,
                        color: const Color(0xFFB8933F),
                        size: 20,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(d.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 12.5)),
                            if (d.category != null || d.createdAt != null) ...[
                              const SizedBox(height: 2),
                              Text(
                                [
                                  if (d.category != null) docCategoryLabel(d.category),
                                  if (d.createdAt != null)
                                    'Déposé le ${dateFmt.format(d.createdAt!)}',
                                ].join(' · '),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                    fontSize: 11, color: Colors.black54),
                              ),
                            ],
                          ],
                        ),
                      ),
                      const Icon(Icons.open_in_new,
                          color: Color(0xFFB8933F), size: 16),
                    ],
                  ),
                ),
              ),
          ],
        );
      },
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
  const _NumberField({required this.controller, this.onChanged});
  final TextEditingController controller;
  // Optional callback so the parent (contract wizard) can re-evaluate
  // _canAdvance() the moment a required field is edited. Dart text
  // controllers don't trigger parent setState on their own.
  final ValueChanged<String>? onChanged;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextField(
        controller: controller,
        keyboardType: const TextInputType.numberWithOptions(decimal: true),
        decoration: _dec(),
        onChanged: onChanged,
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
      borderSide: const BorderSide(color: Color(0xFFB8933F), width: 1.5),
    ),
  );
}



