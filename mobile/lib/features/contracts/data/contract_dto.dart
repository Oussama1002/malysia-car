class ContractDto {
  const ContractDto({
    required this.id,
    required this.number,
    required this.status,
    required this.type,
    this.customerId,
    this.vehicleId,
    this.customerName,
    this.vehicleLabel,
    this.startDate,
    this.endDate,
    this.baseAmount,
    this.monthlyPayment,
    this.durationMonths,
  });

  final String id;
  final String number;
  final String status;
  final String type;
  final String? customerId;
  final String? vehicleId;
  final String? customerName;
  final String? vehicleLabel;
  final DateTime? startDate;
  final DateTime? endDate;
  /// Montant total agréé (= backend `base_amount`). Null si le backend ne
  /// l'a pas rempli ; dans ce cas on tombe sur `totalAmount` qui recalcule.
  final double? baseAmount;
  /// `monthly_payment` : loyer mensuel (LLD/LOA/Crédit) ou tarif journalier
  /// (LCD, puisqu'un contrat court n'a pas de mois). Afficher ça comme montant
  /// « contrat » induit en erreur — l'agent voyait le tarif/jour au lieu du
  /// total.
  final double? monthlyPayment;
  final int? durationMonths;

  /// Montant total à afficher sur la liste / la fiche.
  /// Préfère `base_amount` quand il est présent (c'est le montant signé) ;
  /// sinon le calcule à partir du loyer × durée :
  ///   - LCD : loyer journalier × nombre de jours entre start et end
  ///   - LLD / LOA / Crédit : mensualité × duration_months
  double? get totalAmount {
    if (baseAmount != null && baseAmount! > 0) return baseAmount;
    if (monthlyPayment == null || monthlyPayment! <= 0) return null;
    final isShortTerm = type.toUpperCase() == 'LOCATION_COURTE' ||
        type.toUpperCase() == 'LCD';
    if (isShortTerm) {
      if (startDate != null && endDate != null) {
        final days = endDate!.difference(startDate!).inDays;
        if (days > 0) return monthlyPayment! * days;
      }
      return monthlyPayment;
    }
    final months = (durationMonths ?? 0) > 0 ? durationMonths! : 1;
    return monthlyPayment! * months;
  }

  /// Copie en enrichissant le nom client / le libellé véhicule — utilisé
  /// par le provider enrichi quand l'API ne renvoie pas `clientName`.
  ContractDto withJoined({String? customerName, String? vehicleLabel}) {
    return ContractDto(
      id: id,
      number: number,
      status: status,
      type: type,
      customerId: customerId,
      vehicleId: vehicleId,
      customerName: customerName ?? this.customerName,
      vehicleLabel: vehicleLabel ?? this.vehicleLabel,
      startDate: startDate,
      endDate: endDate,
      baseAmount: baseAmount,
      monthlyPayment: monthlyPayment,
      durationMonths: durationMonths,
    );
  }

  factory ContractDto.fromJson(Map<String, dynamic> json) {
    // Le `ContractResource` du backend renvoie les champs en camelCase :
    // `reference`, `clientName`, `vehicleName`, `vehicleRegistration`,
    // `startDate`, `endDate`, `baseAmount`, `monthlyPayment`, etc.
    // On lit les deux formats (camelCase et snake_case) pour rester tolérant.
    String? customer = json['clientName']?.toString() ??
        json['customer_name']?.toString();
    if ((customer == null || customer.isEmpty)) {
      final c = json['customer'];
      if (c is Map) {
        customer = c['display_name']?.toString() ?? c['full_name']?.toString();
        if (customer == null || customer.isEmpty) {
          final ind = c['individual_profile'];
          if (ind is Map) {
            final f = ind['first_name']?.toString() ?? '';
            final l = ind['last_name']?.toString() ?? '';
            customer = ('$f $l').trim();
          }
        }
      }
    }

    String? vehicle;
    final vn = json['vehicleName']?.toString();
    final vr = json['vehicleRegistration']?.toString();
    if (vn != null && vn.isNotEmpty) {
      vehicle = vr != null && vr.isNotEmpty ? '$vn · $vr' : vn;
    } else {
      final v = json['vehicle'];
      if (v is Map) {
        final brand =
            v['brand'] is Map ? v['brand']['name'] : v['brand_name'];
        final model = v['model'] is Map
            ? (v['model']['model_name'] ?? v['model']['name'])
            : v['model_name'];
        final reg = v['registration_number'] ?? v['registration'];
        vehicle = [
          [brand, model]
              .where((e) => e != null && '$e'.isNotEmpty)
              .join(' '),
          reg,
        ]
            .where((e) => e != null && '$e'.toString().isNotEmpty)
            .join(' · ');
      }
      vehicle ??= json['vehicle_name']?.toString();
    }

    return ContractDto(
      id: json['id']?.toString() ?? '',
      number: (json['reference'] ?? json['contract_number'])?.toString() ?? '—',
      status: json['status']?.toString() ?? 'draft',
      type: (json['type'] ?? json['contract_type'])?.toString() ?? '',
      customerId: (json['customerId'] ?? json['customer_id'])?.toString(),
      vehicleId: (json['vehicleId'] ?? json['vehicle_id'])?.toString(),
      customerName: customer,
      vehicleLabel: vehicle,
      startDate: _date(json['startDate'] ?? json['start_date']),
      endDate: _date(json['endDate'] ?? json['end_date']),
      baseAmount: _d(json['baseAmount'] ?? json['base_amount']),
      monthlyPayment: _d(json['monthlyPayment'] ?? json['monthly_payment']),
      durationMonths: _i(json['durationMonths'] ?? json['duration_months']),
    );
  }
}

int? _i(dynamic v) {
  if (v == null) return null;
  if (v is int) return v;
  if (v is num) return v.toInt();
  return int.tryParse(v.toString());
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

/// Mapping statuts contrats — doit couvrir tous les statuts du backend
/// (voir ContractController) : draft, pending, pending_approval, approved,
/// signed, active, suspended, terminated, closed, cancelled, rejected,
/// expired, completed. Sans ca certains statuts (notamment "signed"
/// retourne par l'auto-promotion sur paiement) s'affichaient en anglais.
const Map<String, String> kContractStatusFr = {
  'draft': 'Brouillon',
  'pending': 'En attente',
  'pending_approval': "En attente d'approbation",
  'approved': 'Approuvé',
  'signed': 'Signé',
  'active': 'Actif',
  'suspended': 'Suspendu',
  'terminated': 'Résilié',
  'closed': 'Clôturé',
  'cancelled': 'Annulé',
  'rejected': 'Rejeté',
  'expired': 'Expiré',
  'completed': 'Terminé',
};

/// Mapping types contrats — valeurs reelles du backend (champ
/// `contract_type`) : LLD, LOA, CREDIT_AUTO, VENTE_VO, LOCATION_COURTE.
const Map<String, String> kContractTypeFr = {
  'LLD': 'LLD (Location longue durée)',
  'LOA': "LOA (Location avec option d'achat)",
  'CREDIT_AUTO': 'Crédit auto',
  'VENTE_VO': "Vente VO",
  'LOCATION_COURTE': 'Location courte durée',
  // Variantes historiques tolerees.
  'LOCATION_LONGUE': 'LLD (Location longue durée)',
  'LEASING': 'LOA (Location avec option d\'achat)',
  'VENTE_CREDIT': 'Crédit auto',
  'VENTE_COMPTANT': 'Vente VO',
  'SOUS_LOCATION': 'Sous-location',
};

String contractStatusFr(String raw) =>
    kContractStatusFr[raw.toLowerCase()] ?? raw;

String contractTypeFr(String raw) =>
    kContractTypeFr[raw.toUpperCase()] ?? raw;
