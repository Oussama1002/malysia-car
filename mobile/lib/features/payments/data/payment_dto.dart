/// Un paiement tel que renvoyé par `GET /v1/payments` (financeApi.Payment du web).
class PaymentDto {
  const PaymentDto({
    required this.id,
    required this.number,
    required this.customerId,
    required this.method,
    required this.direction,
    required this.amount,
    required this.amountAllocated,
    required this.amountUnallocated,
    required this.currency,
    required this.status,
    this.contractId,
    this.reservationId,
    this.invoiceId,
    this.paymentType,
    this.paymentDate,
    this.externalReference,
    this.checkNumber,
    this.checkDate,
    this.checkBank,
    this.notes,
    this.customerName,
    this.customerCode,
    this.bankAccountName,
    this.allocations = const [],
    this.vehicleLabel,
  });

  final String id;
  final String number;
  final String customerId;
  final String method;
  final String direction; // incoming | outgoing
  final double amount;
  final double amountAllocated;
  final double amountUnallocated;
  final String currency;
  final String status; // received | allocated | refunded | reversed
  final String? contractId;
  final String? reservationId;
  final String? invoiceId;
  final String? paymentType;
  final DateTime? paymentDate;
  final String? externalReference;
  final String? checkNumber;
  final DateTime? checkDate;
  final String? checkBank;
  final String? notes;
  final String? customerName;
  final String? customerCode;
  final String? bankAccountName;
  final List<PaymentAllocationDto> allocations;
  /// Libellé véhicule rejoint client-side depuis le contrat ou la
  /// réservation liés (ex. "Dacia Logan · 12345-A-1").
  final String? vehicleLabel;

  PaymentDto withVehicle(String? label) => PaymentDto(
        id: id,
        number: number,
        customerId: customerId,
        method: method,
        direction: direction,
        amount: amount,
        amountAllocated: amountAllocated,
        amountUnallocated: amountUnallocated,
        currency: currency,
        status: status,
        contractId: contractId,
        reservationId: reservationId,
        invoiceId: invoiceId,
        paymentType: paymentType,
        paymentDate: paymentDate,
        externalReference: externalReference,
        checkNumber: checkNumber,
        checkDate: checkDate,
        checkBank: checkBank,
        notes: notes,
        customerName: customerName,
        customerCode: customerCode,
        bankAccountName: bankAccountName,
        allocations: allocations,
        vehicleLabel: label ?? vehicleLabel,
      );

  factory PaymentDto.fromJson(Map<String, dynamic> j) {
    final cust = j['customer'];
    String? name;
    String? code;
    if (cust is Map) {
      name = (cust['full_name'] ?? cust['display_name'])?.toString();
      code = cust['customer_code']?.toString();
    }
    final bank = j['bank_account'];
    String? bankName;
    if (bank is Map) bankName = (bank['name'] ?? bank['bank_name'])?.toString();
    final allocs = j['allocations'];
    return PaymentDto(
      id: j['id']?.toString() ?? '',
      number: j['payment_number']?.toString() ?? '—',
      customerId: j['customer_id']?.toString() ?? '',
      method: j['payment_method']?.toString() ?? '',
      direction: j['payment_direction']?.toString() ?? 'incoming',
      amount: _d(j['amount']) ?? 0,
      amountAllocated: _d(j['amount_allocated']) ?? 0,
      amountUnallocated: _d(j['amount_unallocated']) ?? 0,
      currency: j['currency_code']?.toString() ?? 'MAD',
      status: j['status']?.toString() ?? 'received',
      contractId: j['contract_id']?.toString(),
      reservationId: j['reservation_id']?.toString(),
      invoiceId: j['invoice_id']?.toString(),
      paymentType: j['payment_type']?.toString(),
      paymentDate: _date(j['payment_date']),
      externalReference: j['external_reference']?.toString(),
      checkNumber: j['check_number']?.toString(),
      checkDate: _date(j['check_date']),
      checkBank: j['check_bank']?.toString(),
      notes: j['notes']?.toString(),
      customerName: name,
      customerCode: code,
      bankAccountName: bankName,
      allocations: allocs is List
          ? allocs
              .whereType<Map>()
              .map((m) => PaymentAllocationDto.fromJson(
                  m.map((k, v) => MapEntry(k.toString(), v))))
              .toList()
          : const [],
    );
  }
}

class PaymentAllocationDto {
  const PaymentAllocationDto({
    required this.id,
    required this.amountAllocated,
    this.invoiceId,
    this.invoiceNumber,
    this.installmentId,
    this.installmentNumber,
    this.installmentDueDate,
    this.allocatedAt,
    this.notes,
  });
  final String id;
  final double amountAllocated;
  final String? invoiceId;
  final String? invoiceNumber;
  final String? installmentId;
  final int? installmentNumber;
  final DateTime? installmentDueDate;
  final DateTime? allocatedAt;
  final String? notes;

  factory PaymentAllocationDto.fromJson(Map<String, dynamic> j) {
    final inv = j['invoice'];
    final inst = j['installment'];
    return PaymentAllocationDto(
      id: j['id']?.toString() ?? '',
      amountAllocated: _d(j['amount_allocated']) ?? 0,
      invoiceId: j['invoice_id']?.toString(),
      invoiceNumber: inv is Map ? inv['invoice_number']?.toString() : null,
      installmentId: j['contract_installment_id']?.toString(),
      installmentNumber: inst is Map
          ? int.tryParse(inst['installment_number']?.toString() ?? '')
          : null,
      installmentDueDate:
          inst is Map ? _date(inst['due_date']) : null,
      allocatedAt: _date(j['allocated_at']),
      notes: j['notes']?.toString(),
    );
  }
}

double? _d(dynamic v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString());
}

DateTime? _date(dynamic v) {
  if (v == null) return null;
  return DateTime.tryParse(v.toString());
}

const Map<String, String> kPaymentMethodLabel = {
  'cash': 'Espèces',
  'bank_transfer': 'Virement',
  'check': 'Chèque',
  'card': 'Carte',
  'compensation': 'Compensation',
  'wallet': 'Wallet / Avoir',
};

const Map<String, String> kPaymentTypeLabel = {
  'avance': 'Avance',
  'paiement_location': 'Paiement location',
  'solde': 'Solde',
  'caution': 'Caution',
  'penalite': 'Pénalité',
  'utilisation_avoir': 'Utilisation avoir',
};

const Map<String, String> kPaymentStatusLabel = {
  'received': 'Reçu',
  'allocated': 'Alloué',
  'refunded': 'Remboursé',
  'reversed': 'Annulé',
};

String paymentMethodFr(String raw) =>
    kPaymentMethodLabel[raw.toLowerCase()] ?? raw;
String paymentTypeFr(String raw) =>
    kPaymentTypeLabel[raw.toLowerCase()] ?? raw;
String paymentStatusFr(String raw) =>
    kPaymentStatusLabel[raw.toLowerCase()] ?? raw;
