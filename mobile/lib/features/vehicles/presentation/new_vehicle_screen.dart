import 'package:dio/dio.dart' show DioException;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../../core/widgets/file_image.dart' as df_img;
import '../../../core/widgets/module_scaffold.dart';
import '../data/vehicles_repo.dart';
import 'vehicle_detail_screen.dart';

/// Nouveau vehicule — reproduit le modal web (frontend/screens/VehiclesList
/// .tsx) : scanners OCR (assurance, facture, immat provisoire, visite
/// technique, vignette) + fiche technique complete + payload POST /vehicles
/// aligne sur StoreVehicleRequest.
class NewVehicleScreen extends ConsumerStatefulWidget {
  const NewVehicleScreen({super.key});

  @override
  ConsumerState<NewVehicleScreen> createState() => _NewVehicleScreenState();
}

// Mêmes documents OCR que le web (frontend/modules/fleet/VehicleDocumentScanner
// .tsx) : Assurance, Autorisation de circulation (= Attestation de paiement /
// Vignette : un seul document physique au Maroc), Visite technique, Carte
// Grise — avec les mêmes types canoniques (ReaderDocument::TYPE_*).
enum _VehDoc {
  assurance,
  autorisation,
  techControl,
  carteGriseRecto,
  carteGriseVerso
}

enum _CarteGriseStatus { enAttente, recue }

// Mêmes listes que le web (frontend/screens/VehiclesList.tsx) pour que les
// deux fiches aient strictement les mêmes options.
const _plateLetters = <String>[
  'A','B','C','D','E','F','G','H','J','K','L','M','N','P','Q','R','S','T','U','V','W','Y',
];
// 1..99 comme sur le web (web : Array.from({length:99}, i=>i+1)).
final List<int> _plateRegions = List<int>.generate(99, (i) => i + 1);
const _fuelOptions = <String>['Diesel', 'Essence', 'Hybride', 'Électrique', 'GPL'];
const _gammeOptions = <String>[
  'CLASS','SPORT','MINI','UTL','AUTO MINI','SPORT 4x4',
  'V.Citadines','V.Berlines','V.Compactes','V. 4x4','V.Luxe',
];
const _categorieOptions = <String>[
  'Particulier','Utilitaire','Commercial','Tourisme','Moto',
];
const _vehicleTypeOptions = <String>[
  'Berline','SUV','Citadine','Break','Coupé','Cabriolet','Monospace','Pick-up','Van','Camion',
];

/// Référentiel des équipements d'un véhicule, groupé par famille — doit rester
/// aligné sur `Vehicle::EQUIPMENTS` côté backend (la validation serveur refuse
/// tout libellé hors de la constante).
class _EquipmentGroup {
  const _EquipmentGroup(this.title, this.items);
  final String title;
  final List<String> items;
}

const _equipmentsGroups = <_EquipmentGroup>[
  _EquipmentGroup('Sécurité active', [
    'Airbags',
    'ABS',
    'ESP',
    'Antipatinage',
    "Aide au freinage d'urgence",
    'Antidémarrage électronique',
    'Aide au démarrage en côte',
    'Sélecteur de mode de conduite',
    'Détection de fatigue',
    'Maintien dans la voie',
    "Détecteur d'angle mort",
    'Détecteur de sous-gonflage',
    'Fermeture de portes auto.',
    'Préparation ISOFIX',
    'Phares antibrouillard',
    "Système d'alarme",
  ]),
  _EquipmentGroup('Confort', [
    'Climatisation',
    'Start & Stop',
    'Régulateur de vitesse',
    'Détecteur de pluie',
    'Allumage auto. des feux',
    'Frein à main électrique',
    'Aide au stationnement',
    'Volant réglable',
    'Rétros. électriques',
    'Rétros. rabattables électriques',
    'Coffre électrique',
    'Sièges électriques',
    'Sièges élec. avec mémoire',
    'Banquette arrière rabattable 1/3-2/3',
  ]),
  _EquipmentGroup('Multimédia & assistance', [
    'Écran tactile',
    'Caméra de recul',
    'Cockpit digital',
    'Commandes au volant',
    'Commandes vocales',
    'Reconnaissance de panneaux',
    'Affichage Tête-Haute',
    'Système audio',
    'Ordinateur de bord',
    'Navigation GPS',
    'WiFi à bord',
    'Bluetooth',
    'Compatibilité smartphone',
    'Apple CarPlay® & Android Auto®',
    'Chargeur/mobile sans fil',
  ]),
  _EquipmentGroup('Extérieur & finition', [
    'Jantes aluminium',
    'Sellerie Similicuir / Tissu',
    'Volant cuir',
    'Follow-me home',
    "Lumière d'ambiance",
    'Feux de jour LED',
    'Phares Full LED',
    'Toit Panoramique ouvrant',
    'Barres de toit',
    'Vitres sur-teintées.',
  ]),
];

class _NewVehicleScreenState extends ConsumerState<NewVehicleScreen> {
  final _formKey = GlobalKey<FormState>();

  // Plaque (Immat) composee comme sur le web : num – lettre – region.
  final _platNum = TextEditingController();
  String _platLetter = 'A';
  int _platRegion = 1;

  final _immatOnline = TextEditingController(); // Immat provisoire / WW
  final _vin = TextEditingController(); // Châssis
  final _registrationCard = TextEditingController(); // N° carte grise
  final _year = TextEditingController(
      text: '${DateTime.now().year}');
  final _fiscalPower = TextEditingController();
  final _cylinders = TextEditingController();
  final _nbPlaces = TextEditingController();
  final _nbPortes = TextEditingController();
  final _mileage = TextEditingController();
  final _numeroPolice = TextEditingController();
  final _insuranceDeductible = TextEditingController();

  // Dropdowns alignés sur le web — on garde '' = pas de choix.
  String _fuelType = '';
  String _vehicleType = '';
  String _categorie = '';
  String _gamme = '';
  _CarteGriseStatus _carteGriseStatus = _CarteGriseStatus.enAttente;

  DateTime? _miseEnCirculation;
  DateTime? _dateImmatriculation;
  DateTime? _acquisitionDate;
  DateTime? _insuranceStart;
  DateTime? _insuranceExpiry;
  DateTime? _techExpiry;
  DateTime? _vignetteExpiry;
  DateTime? _immatProvExpiry;

  String? _brandId;
  String? _modelId;

  // Création à chaud d'une marque / d'un modèle, comme sur le web.
  final _newBrandName = TextEditingController();
  final _newModelName = TextEditingController();
  bool _addingBrand = false;
  bool _addingModel = false;
  bool _creatingBrand = false;
  bool _creatingModel = false;

  // Photos & vidéo du véhicule — comme la carte « Photos & Vidéo » du modal
  // web. Seule la première photo est envoyée (POST /vehicles/{id}/photo) ;
  // la vidéo est un aperçu local, non persistée (comme le web).
  final List<XFile> _photos = [];
  XFile? _video;

  // Équipements cochés — sous-ensemble des libellés de `_equipmentsGroups`.
  final Set<String> _equipments = <String>{};

  // OCR
  final Map<_VehDoc, String?> _scanPath = {};
  final Map<_VehDoc, String?> _scanDocId = {};
  _VehDoc? _scanning;
  // Notice shown next to each scanner card. Keyed per document so the
  // "Champs détectés" / "Scan impossible" message of one card never bleeds
  // into another — the previous shared `String? _scanNotice` made it look
  // like every card had succeeded.
  final Map<_VehDoc, String?> _scanNotice = {};
  // Parité avec `VehicleDocumentScanner.tsx` : chaque champ attendu pour le
  // document est listé après OCR, détecté (valeur) ou non détecté (null), pour
  // que l'agent voie exactement ce que le serveur a trouvé.
  final Map<_VehDoc, List<_FieldOutcome>?> _scanPreview = {};

  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _platNum.dispose();
    _immatOnline.dispose();
    _vin.dispose();
    _registrationCard.dispose();
    _year.dispose();
    _fiscalPower.dispose();
    _cylinders.dispose();
    _nbPlaces.dispose();
    _nbPortes.dispose();
    _mileage.dispose();
    _numeroPolice.dispose();
    _insuranceDeductible.dispose();
    _newBrandName.dispose();
    _newModelName.dispose();
    super.dispose();
  }

  String get _registration =>
      '${_platNum.text.trim()}-$_platLetter-$_platRegion';

  // ------------------------------------------------------------------
  // OCR
  // ------------------------------------------------------------------

  // Types canoniques du backend (ReaderDocument::TYPE_*). Pour la visite
  // technique et la vignette, le document physique au Maroc est l'attestation
  // de paiement de la Taxe Spéciale Annuelle sur les Véhicules : on envoie
  // donc `payment_attestation` pour que le parser serveur
  // (DocumentParser::parsePaymentAttestation) tourne et ramène immat.,
  // carburant, mise en circulation et puissance fiscale. Sans ça le hint
  // `other` renvoyait un tableau de champs vide et rien ne pré-remplissait.
  String _ocrType(_VehDoc d) => switch (d) {
        _VehDoc.assurance => 'insurance',
        _VehDoc.autorisation => 'autorisation_circulation',
        _VehDoc.techControl => 'payment_attestation',
        _VehDoc.carteGriseRecto => 'vehicle_registration',
        _VehDoc.carteGriseVerso => 'vehicle_registration',
      };

  String _ocrLabel(_VehDoc d) => switch (d) {
        _VehDoc.assurance => 'Assurance',
        _VehDoc.autorisation => 'Autorisation de circulation / Vignette',
        _VehDoc.techControl => 'Visite technique',
        _VehDoc.carteGriseRecto => 'Carte Grise — Recto',
        _VehDoc.carteGriseVerso => 'Carte Grise — Verso',
      };

  String _ocrHint(_VehDoc d) => switch (d) {
        _VehDoc.assurance => 'N° police, période de garantie, immatriculation',
        _VehDoc.autorisation =>
          'Attestation de paiement TSAV — immat., WW, marque, carburant, mise en circulation, validité vignette',
        _VehDoc.techControl => 'Date d\'expiration de la visite technique',
        _VehDoc.carteGriseRecto =>
          'Marque, modèle, immatriculation, 1ère mise en circulation',
        _VehDoc.carteGriseVerso =>
          'Châssis (VIN), carburant, puissance fiscale, fin de validité',
      };

  Future<void> _scan({
    required ImageSource source,
    required _VehDoc doc,
  }) async {
    try {
      final picker = ImagePicker();
      final f = await picker.pickImage(
          source: source, maxWidth: 1600, imageQuality: 80);
      if (f == null) return;
      final bytes = kIsWeb ? await f.readAsBytes() : null;
      setState(() {
        _scanPath[doc] = f.path;
        _scanning = doc;
        _scanNotice[doc] = 'OCR ${_ocrLabel(doc)} en cours…';
        _scanPreview[doc] = null;
      });
      final result = await ref.read(vehiclesRepoProvider).scanDocument(
            filePath: kIsWeb ? null : f.path,
            fileBytes: bytes,
            fileName: f.name,
            type: _ocrType(doc),
          );
      _applyScanFields(result, doc: doc);
    } catch (e) {
      setState(() {
        _scanNotice[doc] =
            'Scan impossible : ${_short(e)}. Saisissez les champs manuellement.';
      });
    } finally {
      if (mounted) setState(() => _scanning = null);
    }
  }

  /// Applique les champs extraits selon le document, en reprenant exactement
  /// les mappings du web (frontend/modules/fleet/VehicleDocumentScanner.tsx :
  /// mapAssurance / mapAutorisation / mapVisiteTech / mapVignette / mapCarteGrise).
  void _applyScanFields(Map<String, dynamic> result, {required _VehDoc doc}) {
    final rawFields = result['fields'];
    final fields = <String, dynamic>{};
    if (rawFields is Map) {
      rawFields.forEach((k, v) => fields[k.toString()] = v);
    }
    _scanDocId[doc] = result['document_id']?.toString();

    // Backend may answer with { _type_mismatch: "ce n'est pas une assurance" }
    // when the server-side classifier disagrees with the slot the agent used.
    // In that case there's nothing to apply — just surface the message.
    final mismatch = _s(fields['_type_mismatch']);
    if (mismatch != null) {
      setState(() {
        _scanNotice[doc] = mismatch;
      });
      return;
    }

    String? pick(List<String> keys) {
      for (final k in keys) {
        final v = _s(fields[k]);
        if (v != null) return v;
      }
      return null;
    }

    // Track which human-readable fields got filled, so the per-card notice can
    // tell the agent exactly what was recognised ("Marque, Modèle, VIN")
    // instead of a bare "Champs détectés" that hides a silent 0-match.
    final applied = <String>[];
    void note(bool wasApplied, String label) {
      if (wasApplied) applied.add(label);
    }

    // Résultat détaillé par champ attendu — alimente le panneau
    // « Champs détectés » / « Non détectés » (parité web).
    final outcomes = <_FieldOutcome>[];
    void outcome(String label, String? value) {
      outcomes.add(_FieldOutcome(label, (value?.trim().isEmpty ?? true) ? null : value));
    }

    setState(() {
      switch (doc) {
        case _VehDoc.assurance:
          final police = pick(
              ['policy_number', 'numero_police', 'policy_no', 'contract_number']);
          final start = pick(
              ['guarantee_start', 'date_effet', 'start_date', 'date_debut']);
          final end = pick([
            'guarantee_end',
            'expiry_date',
            'date_expiration',
            'validity_date',
            'date_fin'
          ]);
          final ww = _ww(pick([
            'registration_number',
            'immatriculation',
            'plate_number',
            'ww_number'
          ]));
          if (police != null && _numeroPolice.text.isEmpty) {
            _numeroPolice.text = police;
            note(true, 'N° police');
          }
          if (start != null && _insuranceStart == null) {
            final parsed = DateTime.tryParse(start);
            if (parsed != null) {
              _insuranceStart = parsed;
              note(true, 'Garantie du');
            }
          }
          if (end != null && _insuranceExpiry == null) {
            final parsed = DateTime.tryParse(end);
            if (parsed != null) {
              _insuranceExpiry = parsed;
              note(true, 'Garantie au');
            }
          }
          if (ww != null && _immatOnline.text.isEmpty) {
            _immatOnline.text = ww;
            note(true, 'N° provisoire / WW');
          }
          outcome('Compagnie', pick(['insurance_company', 'company_name', 'compagnie', 'insurer']));
          outcome('N° police', police);
          outcome('Garantie du', start);
          outcome('Garantie au', end);
          outcome('N° provisoire / WW', ww);
          break;
        case _VehDoc.autorisation:
          final reg =
              pick(['registration_number', 'immatriculation', 'plate_number']);
          final ww = _ww(pick([
            'ww_number',
            'provisional_number',
            'numero_provisoire',
            'registration_number'
          ]));
          final brand = pick(['brand', 'marque', 'make']);
          final fuel = pick(['fuel_type', 'carburant', 'energie']);
          final mec = pick([
            'first_registration_date',
            'mise_en_circulation',
            'date_circulation'
          ]);
          note(_applyPlate(reg), 'Immatriculation');
          if (ww != null && _immatOnline.text.isEmpty) {
            _immatOnline.text = ww;
            note(true, 'N° provisoire / WW');
          }
          if (fuel != null) {
            final matched = _matchFuel(fuel);
            if (matched != _fuelType) {
              _fuelType = matched;
              note(true, 'Carburant');
            }
          }
          if (mec != null && _miseEnCirculation == null) {
            final parsed = DateTime.tryParse(mec);
            if (parsed != null) {
              _miseEnCirculation = parsed;
              note(true, 'Mise en circulation');
            }
          }
          note(_matchBrandModel(brand, null), 'Marque');
          // L'attestation de paiement TSAV ET l'autorisation de circulation
          // sont le même papier au Maroc, donc on en tire aussi la date de
          // validité de la vignette.
          final vignetteExp = pick([
            'expiry_date',
            'date_expiration',
            'validity_date',
            'date_validite',
            'valid_until',
            'year',
            'annee',
          ]);
          if (vignetteExp != null && _vignetteExpiry == null) {
            final parsed = DateTime.tryParse(vignetteExp);
            if (parsed != null) {
              _vignetteExpiry = parsed;
              note(true, 'Exp. vignette');
            }
          }
          outcome('Immatriculation', reg);
          outcome('N° provisoire / WW', ww);
          outcome('Marque', brand);
          outcome('Carburant', fuel);
          outcome('Mise en circulation', mec);
          outcome('Exp. vignette', vignetteExp);
          break;
        case _VehDoc.techControl:
          // Parité avec `mapVisiteTech` du web : la visite technique ne sert
          // qu'à poser la date d'expiration — immatriculation, carburant,
          // puissance fiscale et mise en circulation viennent de la carte
          // grise, pas de ce procès-verbal.
          final exp = pick([
            'expiry_date',
            'date_expiration',
            'validity_date',
            'date_validite',
            'valid_until',
            'next_inspection'
          ]);
          if (exp != null && _techExpiry == null) {
            final parsed = DateTime.tryParse(exp);
            if (parsed != null) {
              _techExpiry = parsed;
              note(true, 'Exp. visite technique');
            }
          }
          outcome('Exp. visite tech.', exp);
          break;
        case _VehDoc.carteGriseRecto:
          // Recto : plaque définitive, immatriculation antérieure (WW),
          // 1ère mise en circulation, fin de validité.
          final reg =
              pick(['registration_number', 'immatriculation', 'plate_number']);
          final ww = _ww(pick([
            'ww_number',
            'provisional_number',
            'numero_provisoire',
            'immatriculation_anterieure'
          ]));
          final mec = pick([
            'first_registration_date',
            'mise_en_circulation',
            'date_circulation',
            'premiere_mise_en_circulation',
          ]);
          final exp = pick([
            'expiry_date',
            'fin_validite',
            'validity_date',
            'date_validite',
            'date_expiration',
          ]);
          note(_applyPlate(reg), 'Immatriculation');
          if (ww != null && _immatOnline.text.isEmpty) {
            _immatOnline.text = ww;
            note(true, 'Immat. provisoire / WW');
          }
          if (mec != null && _miseEnCirculation == null) {
            final parsed = DateTime.tryParse(mec);
            if (parsed != null) {
              _miseEnCirculation = parsed;
              note(true, 'Mise en circulation');
            }
          }
          // La fin de validité détectée sur la carte grise est posée sur
          // `date_immatriculation` : le formulaire mobile n'a pas de champ
          // dédié à la fin de validité de la carte grise, et cette date est
          // le témoin le plus proche sur la fiche véhicule — l'agent corrige
          // si besoin avant d'enregistrer.
          if (exp != null && _dateImmatriculation == null) {
            final parsed = DateTime.tryParse(exp);
            if (parsed != null) {
              _dateImmatriculation = parsed;
              note(true, 'Fin de validité');
            }
          }
          // La carte grise a été uploadée → statut « Reçue » automatiquement.
          _carteGriseStatus = _CarteGriseStatus.recue;
          outcome('Immatriculation', reg);
          outcome('Immat. antérieure / WW', ww);
          outcome('Mise en circulation', mec);
          outcome('Fin de validité', exp);
          break;
        case _VehDoc.carteGriseVerso:
          // Verso : marque, modèle, carburant, VIN/châssis, puissance
          // fiscale, nombre de portes / places / cylindres.
          final brand = pick(['brand', 'marque', 'make']);
          final model = pick(['model', 'modele']);
          final vin =
              pick(['vin_number', 'vin', 'chassis', 'chassis_number']);
          final fuel = pick(['fuel_type', 'carburant', 'energie']);
          final cv = pick(['fiscal_power', 'puissance_fiscale', 'cv_fiscaux']);
          final nbPortes = pick(['nombre_portes', 'number_of_doors', 'doors']);
          final nbPlaces = pick(['nombre_places', 'number_of_seats', 'seats']);
          final nbCylindres = pick(
              ['nombre_cylindres', 'number_of_cylinders', 'cylinders']);
          note(_matchBrandModel(brand, model), 'Marque / Modèle');
          if (fuel != null) {
            final matched = _matchFuel(fuel);
            if (matched != _fuelType) {
              _fuelType = matched;
              note(true, 'Carburant');
            }
          }
          if (vin != null && _vin.text.isEmpty) {
            _vin.text = vin;
            note(true, 'VIN / Châssis');
          }
          if (cv != null && _fiscalPower.text.isEmpty) {
            _fiscalPower.text = cv;
            note(true, 'Puissance fiscale');
          }
          if (nbPortes != null && _nbPortes.text.isEmpty) {
            _nbPortes.text = nbPortes;
            note(true, 'Nombre de portes');
          }
          if (nbPlaces != null && _nbPlaces.text.isEmpty) {
            _nbPlaces.text = nbPlaces;
            note(true, 'Nombre de places');
          }
          if (nbCylindres != null && _cylinders.text.isEmpty) {
            _cylinders.text = nbCylindres;
            note(true, 'Nombre de cylindres');
          }
          _carteGriseStatus = _CarteGriseStatus.recue;
          outcome('Marque', brand);
          outcome('Modèle', model);
          outcome('VIN / Châssis', vin);
          outcome('Carburant', fuel);
          outcome('Puissance fiscale', cv);
          outcome('Nombre de portes', nbPortes);
          outcome('Nombre de places', nbPlaces);
          outcome('Nombre de cylindres', nbCylindres);
          break;
      }
      _scanPreview[doc] = outcomes;
      if (applied.isEmpty) {
        _scanNotice[doc] = fields.isEmpty
            ? 'Aucun champ exploitable détecté. Vérifiez la netteté du document ou saisissez les informations manuellement.'
            : "Document reconnu mais aucun champ n'a pu être rapproché (${fields.length} brute(s)). Saisissez les informations manuellement.";
      } else {
        _scanNotice[doc] =
            'Champs détectés (${_ocrLabel(doc)}) : ${applied.join(' · ')}. Vérifiez avant d\'enregistrer.';
      }
    });
  }

  /// Normalise un numéro WW éventuellement bruité par l'OCR → "WW<chiffres>".
  String? _ww(String? v) {
    if (v == null) return null;
    final up = v.toUpperCase();
    final m = RegExp(r'W[WMNAHVY][A-Z]?\s*[-.]?\s*(\d{4,7})').firstMatch(up) ??
        RegExp(r'(\d{4,7})\s*W[WMNAHVY]').firstMatch(up);
    return m != null ? 'WW${m.group(1)}' : null;
  }

  /// Correspondance Arabe → Latin pour les lettres de la plaque marocaine.
  /// La carte grise imprime la lettre en arabe (ب, ج, د, …) alors que la
  /// liste `_plateLetters` ne stocke que du Latin. Sans cette table l'OCR
  /// renvoyait une plaque du type "27314-ب-72" qui ne matchait pas la regex
  /// `[A-Z]` et retombait sur le fallback "premier bloc de chiffres", d'où
  /// le "9-.-22" vu à l'écran.
  static const Map<String, String> _arabicToLatinLetter = {
    'أ': 'A', 'ا': 'A',
    'ب': 'B',
    'ج': 'J',
    'د': 'D',
    'ه': 'H',
    'و': 'W',
    'ط': 'T',
  };

  /// Décompose une plaque "12345-A-1" (ou "12345-ب-1") dans num / lettre /
  /// région. Retourne true si au moins un segment a été rempli — pour que
  /// la notice de scan puisse dire "Immatriculation" seulement quand c'est
  /// vrai.
  bool _applyPlate(String? reg) {
    if (reg == null) return false;
    // On remplace les lettres arabes par leur équivalent latin AVANT la
    // regex pour que la plaque "27314-ب-72" se décompose comme "27314-B-72".
    var normalized = reg;
    _arabicToLatinLetter.forEach((ar, la) {
      normalized = normalized.replaceAll(ar, la);
    });
    final cleaned = normalized.replaceAll(RegExp(r'\s+'), '').toUpperCase();

    var changed = false;
    // 1) Plaque complète avec lettre reconnue (après mapping arabe→latin).
    final m = RegExp(r'(\d{1,5})\D+([A-Z])\D+(\d{1,2})').firstMatch(cleaned);
    if (m != null) {
      if (_platNum.text.isEmpty) {
        _platNum.text = m.group(1)!;
        changed = true;
      }
      final letter = m.group(2)!;
      if (_plateLetters.contains(letter) && _platLetter != letter) {
        _platLetter = letter;
        changed = true;
      }
      final region = int.tryParse(m.group(3)!);
      if (region != null && region >= 1 && region <= 99 && _platRegion != region) {
        _platRegion = region;
        changed = true;
      }
      return changed;
    }
    // 2) Plaque "chiffres - inconnu - chiffres" (lettre arabe non mappée ou
    //    bruit OCR). On remplit quand même le numéro et la région pour éviter
    //    le "9-.-22" ; l'agent corrige la lettre dans le dropdown.
    final partial = RegExp(r'(\d{3,5})\D{1,3}(\d{1,2})\b').firstMatch(cleaned);
    if (partial != null) {
      if (_platNum.text.isEmpty) {
        _platNum.text = partial.group(1)!;
        changed = true;
      }
      final region = int.tryParse(partial.group(2)!);
      if (region != null && region >= 1 && region <= 99 && _platRegion != region) {
        _platRegion = region;
        changed = true;
      }
      return changed;
    }
    // 3) Dernier recours : on prend le plus long bloc de chiffres comme num.
    if (_platNum.text.isEmpty) {
      final digits = RegExp(r'\d{3,5}').firstMatch(cleaned);
      if (digits != null) {
        _platNum.text = digits.group(0)!;
        changed = true;
      }
    }
    return changed;
  }

  String _matchFuel(String raw) {
    final low = raw.toLowerCase();
    if (low.contains('diesel') || low.contains('gasoil')) return 'Diesel';
    if (low.contains('essence') ||
        low.contains('petrol') ||
        low.contains('gasoline')) {
      return 'Essence';
    }
    if (low.contains('hybri')) return 'Hybride';
    if (low.contains('electr') || low.contains('électr')) return 'Électrique';
    if (low.contains('gpl') || low.contains('lpg')) return 'GPL';
    for (final o in _fuelOptions) {
      if (o.toLowerCase() == low) return o;
    }
    return _fuelType;
  }

  /// Rapproche le texte OCR marque/modèle des options du catalogue (exact →
  /// sous-chaîne), comme `closestOption` côté web, pour pré-remplir les listes.
  bool _matchBrandModel(String? brandText, String? modelText) {
    var changed = false;
    final brands = ref.read(vehicleBrandsProvider).valueOrNull ??
        const <VehicleBrandDto>[];
    if (brandText != null && _brandId == null && brands.isNotEmpty) {
      final bt = brandText.toLowerCase().trim();
      VehicleBrandDto? match;
      for (final b in brands) {
        if (b.name.toLowerCase() == bt) {
          match = b;
          break;
        }
      }
      match ??= brands
          .where((b) =>
              b.name.toLowerCase().contains(bt) ||
              bt.contains(b.name.toLowerCase()))
          .firstOrNull;
      if (match != null) {
        _brandId = match.id;
        _modelId = null;
        changed = true;
      }
    }
    if (modelText != null && _brandId != null) {
      final models =
          brands.where((b) => b.id == _brandId).firstOrNull?.models ??
              const <VehicleModelDto>[];
      final mt = modelText.toLowerCase().trim();
      VehicleModelDto? mm;
      for (final m in models) {
        if (m.name.toLowerCase() == mt) {
          mm = m;
          break;
        }
      }
      mm ??= models
          .where((m) =>
              m.name.toLowerCase().contains(mt) ||
              mt.contains(m.name.toLowerCase()))
          .firstOrNull;
      if (mm != null) {
        _modelId = mm.id;
        changed = true;
      }
    }
    return changed;
  }

  // ------------------------------------------------------------------
  // Submit
  // ------------------------------------------------------------------

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_platNum.text.trim().isEmpty) {
      setState(() => _error = 'Numéro de plaque requis.');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final body = <String, dynamic>{
        'registration': _registration,
        if (_vin.text.trim().isNotEmpty) 'vin': _vin.text.trim(),
        if (_brandId != null) 'brand_id': _brandId,
        if (_modelId != null) 'model_id': _modelId,
        if (int.tryParse(_year.text.trim()) != null)
          'year': int.parse(_year.text.trim()),
        if (_fuelType.isNotEmpty) 'fuel_type': _fuelType,
        if (int.tryParse(_fiscalPower.text.trim()) != null)
          'fiscal_power': int.parse(_fiscalPower.text.trim()),
        // La N° carte grise n'est envoyée que si « reçue », comme sur le web.
        if (_carteGriseStatus == _CarteGriseStatus.recue &&
            _registrationCard.text.trim().isNotEmpty)
          'registration_card_number': _registrationCard.text.trim(),
        'carte_grise_status':
            _carteGriseStatus == _CarteGriseStatus.recue ? 'recue' : 'en_attente',
        if (_insuranceStart != null)
          'insurance_start': _iso(_insuranceStart!),
        if (_insuranceExpiry != null)
          'insurance_expiry': _iso(_insuranceExpiry!),
        if (double.tryParse(_insuranceDeductible.text.trim()) != null)
          'insurance_deductible': double.parse(_insuranceDeductible.text.trim()),
        if (_techExpiry != null) 'tech_control_expiry': _iso(_techExpiry!),
        if (_vignetteExpiry != null) 'vignette_expiry': _iso(_vignetteExpiry!),
        if (int.tryParse(_mileage.text.trim()) != null)
          'mileage_km': int.parse(_mileage.text.trim()),
        if (_vehicleType.isNotEmpty) 'vehicle_type': _vehicleType,
        if (_categorie.isNotEmpty) 'categorie': _categorie,
        if (_gamme.isNotEmpty) 'gamme': _gamme,
        if (int.tryParse(_cylinders.text.trim()) != null)
          'nombre_cylindres': int.parse(_cylinders.text.trim()),
        if (int.tryParse(_nbPlaces.text.trim()) != null)
          'nombre_places': int.parse(_nbPlaces.text.trim()),
        if (int.tryParse(_nbPortes.text.trim()) != null)
          'nombre_portes': int.parse(_nbPortes.text.trim()),
        if (_miseEnCirculation != null)
          'mise_en_circulation': _iso(_miseEnCirculation!),
        if (_dateImmatriculation != null)
          'date_immatriculation': _iso(_dateImmatriculation!),
        if (_acquisitionDate != null)
          'acquisition_date': _iso(_acquisitionDate!),
        if (_numeroPolice.text.trim().isNotEmpty)
          'numero_police': _numeroPolice.text.trim(),
        if (_immatOnline.text.trim().isNotEmpty)
          'immat_online': _immatOnline.text.trim(),
        if (_immatProvExpiry != null)
          'immat_provisoire_expiry': _iso(_immatProvExpiry!),
        if (_equipments.isNotEmpty) 'equipments': _equipments.toList(),
      };
      final id = await ref.read(vehiclesRepoProvider).create(body);
      // Upload de la première photo comme photo principale — non bloquant :
      // la création du véhicule reste réussie même si l'upload échoue, comme
      // le modal web qui n'envoie que la première photo.
      if (_photos.isNotEmpty && id.isNotEmpty) {
        try {
          await ref
              .read(vehiclesRepoProvider)
              .uploadMainPhoto(id: id, filePath: _photos.first.path);
        } catch (e) {
          setState(() {
            _error =
                "Véhicule créé, mais l'upload de la photo a échoué : ${_short(e)}";
          });
        }
      }
      ref.invalidate(vehiclesListProvider);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(
        builder: (_) => VehicleDetailScreen(id: id),
      ));
    } catch (e) {
      setState(() => _error = _friendly(e));
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  String _iso(DateTime d) => DateFormat('yyyy-MM-dd').format(d);

  String _friendly(Object e) {
    final msg = e.toString();
    final match = RegExp(r'status code of (\d+)').firstMatch(msg);
    if (match != null) {
      final code = int.parse(match[1]!);
      if (code == 422) return 'Les informations saisies ne sont pas valides.';
      if (code == 403) {
        return "Vous n'avez pas la permission de créer un véhicule.";
      }
    }
    return 'Création impossible pour le moment.';
  }

  String _short(Object e) {
    // Extraire le message serveur quand c'est une DioException : le message
    // brut est "DioException [bad response]: …" ce qui ne dit rien à l'agent.
    // L'API renvoie {"message": "…"} ou {"data": {"message": "…"}} en 422/503.
    String msg = e.toString();
    if (e is DioException) {
      final data = e.response?.data;
      if (data is Map) {
        final serverMsg = data['message'] ??
            (data['data'] is Map ? (data['data'] as Map)['message'] : null) ??
            data['error'];
        if (serverMsg != null) msg = serverMsg.toString();
      } else if (data is String && data.isNotEmpty) {
        msg = data;
      } else {
        msg = e.message ?? e.toString();
      }
    }
    msg = msg.replaceAll('Exception: ', '').trim();
    return msg.length > 180 ? '${msg.substring(0, 180)}…' : msg;
  }

  String? _s(dynamic v) {
    if (v == null) return null;
    final s = v.toString().trim();
    return s.isEmpty ? null : s;
  }

  Future<DateTime?> _pickDate({DateTime? initial}) => showDatePicker(
        context: context,
        initialDate: initial ?? DateTime.now(),
        firstDate: DateTime(1990),
        lastDate: DateTime(2100),
        locale: const Locale('fr'),
      );

  // ------------------------------------------------------------------
  // Build
  // ------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Nouveau véhicule')),
      body: ModuleBackground(
        child: SafeArea(
          child: Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _scannerSection(),
                const SizedBox(height: 12),
                _identitySection(),
                const SizedBox(height: 12),
                _technicalSection(),
                const SizedBox(height: 12),
                _adminSection(),
                const SizedBox(height: 12),
                _equipmentsSection(),
                const SizedBox(height: 12),
                _photoSection(),
                if (_error != null) ...[
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(10),
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
                    backgroundColor: const Color(0xFFB8933F),
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
                      : const Text('Créer le véhicule',
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

  Widget _scannerSection() {
    return ModuleCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Scanner les documents (OCR)',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          const Text(
            'Déposez chaque document pour extraire automatiquement les informations.',
            style: TextStyle(color: Colors.black54, fontSize: 12),
          ),
          const SizedBox(height: 10),
          for (final d in _VehDoc.values) ...[
            _ScanSlot(
              title: _ocrLabel(d),
              subtitle: _ocrHint(d),
              photoPath: _scanPath[d],
              scanning: _scanning == d,
              notice: _scanning == d ? null : _scanNotice[d],
              preview: _scanning == d ? null : _scanPreview[d],
              onCamera: () => _scan(source: ImageSource.camera, doc: d),
              onGallery: () => _scan(source: ImageSource.gallery, doc: d),
              onClear: () => setState(() {
                _scanPath[d] = null;
                _scanDocId[d] = null;
                _scanNotice[d] = null;
                _scanPreview[d] = null;
              }),
            ),
            if (d != _VehDoc.values.last) const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }

  Widget _identitySection() {
    return ModuleCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Immatriculation',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                flex: 3,
                child: TextFormField(
                  controller: _platNum,
                  keyboardType: TextInputType.number,
                  maxLength: 5,
                  decoration: const InputDecoration(
                    counterText: '',
                    hintText: '12345',
                  ),
                  onChanged: (v) {
                    final cleaned = v.replaceAll(RegExp(r'\D'), '');
                    if (cleaned != v) _platNum.text = cleaned;
                  },
                ),
              ),
              const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 6),
                  child: Text('–',
                      style: TextStyle(
                          fontWeight: FontWeight.w900, fontSize: 18))),
              Expanded(
                flex: 2,
                child: DropdownButtonFormField<String>(
                  value: _platLetter,
                  isExpanded: true,
                  items: _plateLetters
                      .map((l) =>
                          DropdownMenuItem(value: l, child: Text(l)))
                      .toList(),
                  onChanged: (v) => setState(() => _platLetter = v ?? 'A'),
                ),
              ),
              const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 6),
                  child: Text('–',
                      style: TextStyle(
                          fontWeight: FontWeight.w900, fontSize: 18))),
              Expanded(
                flex: 2,
                child: DropdownButtonFormField<int>(
                  value: _platRegion,
                  isExpanded: true,
                  items: _plateRegions
                      .map((n) =>
                          DropdownMenuItem(value: n, child: Text('$n')))
                      .toList(),
                  onChanged: (v) => setState(() => _platRegion = v ?? 1),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: _immatOnline,
            decoration: const InputDecoration(
              labelText: 'Immat. provisoire / WW',
              hintText: 'Immatriculation en ligne',
            ),
          ),
        ],
      ),
    );
  }

  Widget _technicalSection() {
    final brands = ref.watch(vehicleBrandsProvider).valueOrNull ??
        const <VehicleBrandDto>[];
    final models = _brandId == null
        ? const <VehicleModelDto>[]
        : (brands
                .where((b) => b.id == _brandId)
                .firstOrNull
                ?.models ??
            const []);
    return ModuleCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Fiche technique',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          // Marque + bouton « + Ajouter » comme sur le web — on peut créer une
          // marque à la volée sans quitter le formulaire.
          _brandField(brands),
          if (_addingBrand) ...[
            const SizedBox(height: 8),
            _inlineAddRow(
              controller: _newBrandName,
              hint: 'Nouvelle marque',
              pending: _creatingBrand,
              onCancel: () => setState(() {
                _addingBrand = false;
                _newBrandName.clear();
              }),
              onSubmit: _submitNewBrand,
            ),
          ],
          const SizedBox(height: 10),
          _modelField(models),
          if (_addingModel && _brandId != null) ...[
            const SizedBox(height: 8),
            _inlineAddRow(
              controller: _newModelName,
              hint: 'Nouveau modèle',
              pending: _creatingModel,
              onCancel: () => setState(() {
                _addingModel = false;
                _newModelName.clear();
              }),
              onSubmit: _submitNewModel,
            ),
          ],
          const SizedBox(height: 10),
          _twoCols(
            TextFormField(
              controller: _year,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Année'),
            ),
            _dropdown(
              label: 'Catégorie',
              value: _categorie,
              options: _categorieOptions,
              onChanged: (v) => setState(() => _categorie = v),
            ),
          ),
          const SizedBox(height: 10),
          _twoCols(
            _dropdown(
              label: 'Type',
              value: _vehicleType,
              options: _vehicleTypeOptions,
              onChanged: (v) => setState(() => _vehicleType = v),
            ),
            _dropdown(
              label: 'Carburant',
              value: _fuelType,
              options: _fuelOptions,
              onChanged: (v) => setState(() => _fuelType = v),
            ),
          ),
          const SizedBox(height: 10),
          _twoCols(
            _dropdown(
              label: 'Gamme',
              value: _gamme,
              options: _gammeOptions,
              onChanged: (v) => setState(() => _gamme = v),
            ),
            TextFormField(
              controller: _fiscalPower,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Puissance (CV)'),
            ),
          ),
          const SizedBox(height: 10),
          _twoCols(
            TextFormField(
              controller: _cylinders,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Cylindres'),
            ),
            TextFormField(
              controller: _mileage,
              keyboardType: TextInputType.number,
              decoration:
                  const InputDecoration(labelText: 'Index compteur (km)'),
            ),
          ),
          const SizedBox(height: 10),
          _twoCols(
            TextFormField(
              controller: _nbPlaces,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                  labelText: 'Places', hintText: 'ex: 5'),
            ),
            TextFormField(
              controller: _nbPortes,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(
                  labelText: 'Portes', hintText: 'ex: 5'),
            ),
          ),
          const SizedBox(height: 10),
          _dateInput(
            label: 'Mise en circulation',
            value: _miseEnCirculation,
            onPick: (d) => setState(() => _miseEnCirculation = d),
          ),
        ],
      ),
    );
  }

  // ---------- helpers formulaire (marque/modèle/dropdown) ----------

  Widget _brandField(List<VehicleBrandDto> brands) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: DropdownButtonFormField<String>(
            value: _brandId,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Marque'),
            items: [
              const DropdownMenuItem<String>(
                  value: null, child: Text('— Choix —')),
              for (final b in brands)
                DropdownMenuItem(value: b.id, child: Text(b.name)),
            ],
            onChanged: (v) => setState(() {
              _brandId = v;
              _modelId = null;
            }),
          ),
        ),
        const SizedBox(width: 8),
        TextButton(
          onPressed: () => setState(() => _addingBrand = !_addingBrand),
          style: TextButton.styleFrom(
            foregroundColor: const Color(0xFFB8933F),
            padding: const EdgeInsets.symmetric(horizontal: 10),
          ),
          child: Text(_addingBrand ? 'Fermer' : '+ Ajouter',
              style: const TextStyle(
                  fontWeight: FontWeight.w900, fontSize: 11)),
        ),
      ],
    );
  }

  Widget _modelField(List<VehicleModelDto> models) {
    final canAdd = _brandId != null;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: DropdownButtonFormField<String>(
            value: _modelId,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Modèle'),
            items: [
              const DropdownMenuItem<String>(
                  value: null, child: Text('— Choix —')),
              for (final m in models)
                DropdownMenuItem(value: m.id, child: Text(m.name)),
            ],
            onChanged:
                canAdd ? (v) => setState(() => _modelId = v) : null,
          ),
        ),
        const SizedBox(width: 8),
        TextButton(
          onPressed: !canAdd
              ? null
              : () => setState(() => _addingModel = !_addingModel),
          style: TextButton.styleFrom(
            foregroundColor: const Color(0xFFB8933F),
            padding: const EdgeInsets.symmetric(horizontal: 10),
          ),
          child: Text(_addingModel ? 'Fermer' : '+ Ajouter',
              style: const TextStyle(
                  fontWeight: FontWeight.w900, fontSize: 11)),
        ),
      ],
    );
  }

  Widget _inlineAddRow({
    required TextEditingController controller,
    required String hint,
    required bool pending,
    required VoidCallback onCancel,
    required Future<void> Function() onSubmit,
  }) {
    return Row(
      children: [
        Expanded(
          child: TextField(
            controller: controller,
            decoration: InputDecoration(hintText: hint, isDense: true),
            onSubmitted: (_) => onSubmit(),
          ),
        ),
        const SizedBox(width: 8),
        FilledButton(
          onPressed: pending ? null : () => onSubmit(),
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFFB8933F),
            minimumSize: const Size(48, 44),
          ),
          child: pending
              ? const SizedBox(
                  height: 16,
                  width: 16,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white),
                )
              : const Text('OK',
                  style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12)),
        ),
        IconButton(
          onPressed: pending ? null : onCancel,
          icon: const Icon(Icons.close, size: 18),
          tooltip: 'Annuler',
        ),
      ],
    );
  }

  Future<void> _submitNewBrand() async {
    final name = _newBrandName.text.trim();
    if (name.isEmpty) return;
    setState(() => _creatingBrand = true);
    try {
      final created = await ref.read(vehiclesRepoProvider).createBrand(name);
      ref.invalidate(vehicleBrandsProvider);
      setState(() {
        _brandId = created.id;
        _modelId = null;
        _addingBrand = false;
        _newBrandName.clear();
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ajout marque impossible : ${_short(e)}')),
        );
      }
    } finally {
      if (mounted) setState(() => _creatingBrand = false);
    }
  }

  Future<void> _submitNewModel() async {
    final name = _newModelName.text.trim();
    final brandId = _brandId;
    if (name.isEmpty || brandId == null) return;
    setState(() => _creatingModel = true);
    try {
      final created = await ref
          .read(vehiclesRepoProvider)
          .createModel(brandId: brandId, name: name);
      ref.invalidate(vehicleBrandsProvider);
      setState(() {
        _modelId = created.id;
        _addingModel = false;
        _newModelName.clear();
      });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Ajout modèle impossible : ${_short(e)}')),
        );
      }
    } finally {
      if (mounted) setState(() => _creatingModel = false);
    }
  }

  Widget _dropdown({
    required String label,
    required String value,
    required List<String> options,
    required ValueChanged<String> onChanged,
  }) {
    // On tolère une valeur préexistante hors liste (si l'OCR a renvoyé une
    // casse différente) pour éviter de la perdre silencieusement.
    final hasValue = value.isNotEmpty && !options.contains(value);
    return DropdownButtonFormField<String>(
      value: value.isEmpty ? '' : value,
      isExpanded: true,
      decoration: InputDecoration(labelText: label),
      items: [
        const DropdownMenuItem<String>(value: '', child: Text('— Choix —')),
        for (final o in options)
          DropdownMenuItem(value: o, child: Text(o)),
        if (hasValue) DropdownMenuItem(value: value, child: Text(value)),
      ],
      onChanged: (v) => onChanged(v ?? ''),
    );
  }

  Widget _adminSection() {
    final isCarteRecue = _carteGriseStatus == _CarteGriseStatus.recue;
    return ModuleCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Administratif',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          // Statut carte grise + N° conditionnel, comme la carte Conformité
          // Administrative du modal web.
          _twoCols(
            DropdownButtonFormField<_CarteGriseStatus>(
              value: _carteGriseStatus,
              isExpanded: true,
              decoration:
                  const InputDecoration(labelText: 'Statut carte grise'),
              items: const [
                DropdownMenuItem(
                    value: _CarteGriseStatus.enAttente,
                    child: Text('En attente')),
                DropdownMenuItem(
                    value: _CarteGriseStatus.recue, child: Text('Reçue')),
              ],
              onChanged: (v) => setState(() =>
                  _carteGriseStatus = v ?? _CarteGriseStatus.enAttente),
            ),
            isCarteRecue
                ? TextFormField(
                    controller: _registrationCard,
                    decoration: const InputDecoration(
                        labelText: 'N° Carte grise'),
                  )
                : TextFormField(
                    controller: _vin,
                    decoration:
                        const InputDecoration(labelText: 'Châssis (VIN)'),
                  ),
          ),
          if (isCarteRecue) ...[
            const SizedBox(height: 10),
            TextFormField(
              controller: _vin,
              decoration: const InputDecoration(labelText: 'Châssis (VIN)'),
            ),
          ],
          const SizedBox(height: 10),
          _twoCols(
            _dateInput(
              label: "Date d'immatriculation",
              value: _dateImmatriculation,
              onPick: (d) => setState(() => _dateImmatriculation = d),
            ),
            _dateInput(
              label: "Date d'acquisition",
              value: _acquisitionDate,
              onPick: (d) => setState(() => _acquisitionDate = d),
            ),
          ),
          const SizedBox(height: 10),
          _dateInput(
            label: 'Validité immat. provisoire',
            value: _immatProvExpiry,
            onPick: (d) => setState(() => _immatProvExpiry = d),
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: _numeroPolice,
            decoration: const InputDecoration(labelText: 'N° police'),
          ),
          const SizedBox(height: 10),
          _twoCols(
            _dateInput(
              label: 'Assurance du',
              value: _insuranceStart,
              onPick: (d) => setState(() => _insuranceStart = d),
            ),
            _dateInput(
              label: 'Assurance au',
              value: _insuranceExpiry,
              onPick: (d) => setState(() => _insuranceExpiry = d),
            ),
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: _insuranceDeductible,
            keyboardType:
                const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              labelText: "Franchise d'assurance (MAD)",
              hintText: 'Ex : 5000',
            ),
          ),
          const SizedBox(height: 10),
          _twoCols(
            _dateInput(
              label: 'Expiration visite technique',
              value: _techExpiry,
              onPick: (d) => setState(() => _techExpiry = d),
            ),
            _dateInput(
              label: 'Expiration vignette',
              value: _vignetteExpiry,
              onPick: (d) => setState(() => _vignetteExpiry = d),
            ),
          ),
        ],
      ),
    );
  }

  // Équipements — multi-sélection groupée par famille, comme le web.
  Widget _equipmentsSection() {
    return ModuleCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text('Équipements',
                    style:
                        TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
              ),
              Text(
                '${_equipments.length} coché${_equipments.length > 1 ? 's' : ''}',
                style:
                    const TextStyle(color: Colors.black54, fontSize: 11.5),
              ),
            ],
          ),
          const SizedBox(height: 6),
          // Boutons globaux : « Tout sélectionner » coche tous les libellés
          // des 4 familles (via le Set, pas de doublon). « Tout décocher »
          // vide la sélection — seulement visible quand il y a de la matière.
          Row(
            children: [
              TextButton.icon(
                onPressed: () => setState(() {
                  for (final g in _equipmentsGroups) {
                    _equipments.addAll(g.items);
                  }
                }),
                icon: const Icon(Icons.done_all, size: 14),
                label: const Text('Tout sélectionner'),
                style: TextButton.styleFrom(
                  foregroundColor: const Color(0xFFB8933F),
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  minimumSize: const Size(0, 30),
                  textStyle: const TextStyle(
                      fontWeight: FontWeight.w900, fontSize: 11),
                ),
              ),
              if (_equipments.isNotEmpty)
                TextButton.icon(
                  onPressed: () => setState(_equipments.clear),
                  icon: const Icon(Icons.remove_done, size: 14),
                  label: const Text('Tout décocher'),
                  style: TextButton.styleFrom(
                    foregroundColor: const Color(0xFFB8933F),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    minimumSize: const Size(0, 30),
                    textStyle: const TextStyle(
                        fontWeight: FontWeight.w900, fontSize: 11),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 4),
          for (int i = 0; i < _equipmentsGroups.length; i++) ...[
            if (i > 0) const SizedBox(height: 10),
            // Titre de famille + bouton local « Tout sélectionner / décocher »
            // qui bascule uniquement les libellés de ce groupe.
            Builder(builder: (_) {
              final items = _equipmentsGroups[i].items;
              final allChecked = items.every(_equipments.contains);
              return Row(
                children: [
                  Expanded(
                    child: Text(
                      _equipmentsGroups[i].title.toUpperCase(),
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        color: Colors.black45,
                        letterSpacing: 1.1,
                      ),
                    ),
                  ),
                  TextButton(
                    onPressed: () => setState(() {
                      if (allChecked) {
                        _equipments.removeAll(items);
                      } else {
                        _equipments.addAll(items);
                      }
                    }),
                    style: TextButton.styleFrom(
                      foregroundColor: const Color(0xFFB8933F),
                      padding: const EdgeInsets.symmetric(horizontal: 6),
                      minimumSize: const Size(0, 28),
                    ),
                    child: Text(
                      allChecked ? 'Tout décocher' : 'Tout sélectionner',
                      style: const TextStyle(
                          fontWeight: FontWeight.w900,
                          fontSize: 10,
                          letterSpacing: 0.5),
                    ),
                  ),
                ],
              );
            }),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final label in _equipmentsGroups[i].items)
                  _EquipmentChip(
                    label: label,
                    selected: _equipments.contains(label),
                    onToggle: () => setState(() {
                      if (!_equipments.add(label)) _equipments.remove(label);
                    }),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  // Photos & Vidéo — comme la carte du modal web : plusieurs photos
  // (caméra / galerie) + une vidéo. Seule la première photo est envoyée.
  Widget _photoSection() {
    return ModuleCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Photos & Vidéo',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),

          // ---- Photos ----
          const Text('Photos du véhicule',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _pickPhotos(ImageSource.camera),
                  icon: const Icon(Icons.photo_camera, size: 16),
                  label: const Text('Prendre une photo'),
                  style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(40)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _pickPhotos(ImageSource.gallery),
                  icon: const Icon(Icons.image_outlined, size: 16),
                  label: const Text('Galerie'),
                  style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(40)),
                ),
              ),
            ],
          ),
          if (_photos.isNotEmpty) ...[
            const SizedBox(height: 10),
            GridView.count(
              crossAxisCount: 4,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              children: [
                for (int i = 0; i < _photos.length; i++)
                  Stack(
                    alignment: Alignment.topRight,
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: AspectRatio(
                          aspectRatio: 1,
                          child: df_img.fileImage(_photos[i].path,
                              fit: BoxFit.cover),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(3),
                        child: Material(
                          color: Colors.red,
                          shape: const CircleBorder(),
                          child: InkWell(
                            onTap: () =>
                                setState(() => _photos.removeAt(i)),
                            customBorder: const CircleBorder(),
                            child: const Padding(
                              padding: EdgeInsets.all(3),
                              child: Icon(Icons.close,
                                  color: Colors.white, size: 13),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
              ],
            ),
          ],

          const SizedBox(height: 16),

          // ---- Vidéo ----
          const Text('Vidéo du véhicule (optionnel)',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _pickVideo(ImageSource.camera),
                  icon: const Icon(Icons.videocam_outlined, size: 16),
                  label: const Text('Filmer'),
                  style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(40)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _pickVideo(ImageSource.gallery),
                  icon: const Icon(Icons.video_library_outlined, size: 16),
                  label: Text(_video == null ? 'Galerie' : 'Remplacer'),
                  style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(40)),
                ),
              ),
            ],
          ),
          if (_video != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: Theme.of(context).dividerColor),
              ),
              child: Row(
                children: [
                  const Icon(Icons.movie_outlined,
                      size: 18, color: Colors.black54),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(_video!.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 12)),
                  ),
                  InkWell(
                    onTap: () => setState(() => _video = null),
                    child: const Icon(Icons.close, size: 18, color: Colors.red),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _pickPhotos(ImageSource source) async {
    try {
      final picker = ImagePicker();
      if (source == ImageSource.gallery) {
        final files =
            await picker.pickMultiImage(maxWidth: 1600, imageQuality: 80);
        if (files.isNotEmpty) setState(() => _photos.addAll(files));
      } else {
        final f = await picker.pickImage(
            source: source, maxWidth: 1600, imageQuality: 80);
        if (f != null) setState(() => _photos.add(f));
      }
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Impossible d\'ouvrir la caméra.')),
      );
    }
  }

  Future<void> _pickVideo(ImageSource source) async {
    try {
      final picker = ImagePicker();
      final f = await picker.pickVideo(source: source);
      if (f != null) setState(() => _video = f);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Impossible d\'ouvrir la vidéo.')),
      );
    }
  }

  Widget _dateInput({
    required String label,
    required DateTime? value,
    required ValueChanged<DateTime> onPick,
  }) {
    final fmt = DateFormat('dd/MM/yyyy', 'fr');
    return InkWell(
      onTap: () async {
        final d = await _pickDate(initial: value);
        if (d != null) onPick(d);
      },
      child: InputDecorator(
        decoration: InputDecoration(labelText: label),
        child: Text(value != null ? fmt.format(value) : '—'),
      ),
    );
  }

  Widget _twoCols(Widget a, Widget b) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(child: a),
        const SizedBox(width: 10),
        Expanded(child: b),
      ],
    );
  }
}

class _FieldOutcome {
  _FieldOutcome(this.label, this.value);
  final String label;
  final String? value;
}

class _ScanSlot extends StatelessWidget {
  const _ScanSlot({
    required this.title,
    this.subtitle,
    required this.photoPath,
    required this.scanning,
    required this.notice,
    required this.preview,
    required this.onCamera,
    required this.onGallery,
    required this.onClear,
  });

  final String title;
  final String? subtitle;
  final String? photoPath;
  final bool scanning;
  final String? notice;
  final List<_FieldOutcome>? preview;
  final VoidCallback onCamera;
  final VoidCallback onGallery;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.document_scanner_outlined,
                  size: 16, color: Colors.black54),
              const SizedBox(width: 6),
              Expanded(
                child: Text(title,
                    style: const TextStyle(
                        fontSize: 12.5, fontWeight: FontWeight.w800)),
              ),
            ],
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 4),
            Text(subtitle!,
                style: const TextStyle(fontSize: 10.5, color: Colors.black45)),
          ],
          const SizedBox(height: 8),
          if (photoPath != null) ...[
            Stack(
              alignment: Alignment.topRight,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: AspectRatio(
                    aspectRatio: 16 / 10,
                    child: df_img.fileImage(photoPath!, fit: BoxFit.cover),
                  ),
                ),
                if (!scanning)
                  Padding(
                    padding: const EdgeInsets.all(6),
                    child: Material(
                      color: Colors.red,
                      shape: const CircleBorder(),
                      child: InkWell(
                        onTap: onClear,
                        customBorder: const CircleBorder(),
                        child: const Padding(
                          padding: EdgeInsets.all(5),
                          child:
                              Icon(Icons.close, color: Colors.white, size: 16),
                        ),
                      ),
                    ),
                  ),
                if (scanning)
                  const Positioned.fill(
                    child: ColoredBox(
                      color: Color(0x66000000),
                      child: Center(
                        child: SizedBox(
                          height: 24,
                          width: 24,
                          child: CircularProgressIndicator(
                              strokeWidth: 2.5, color: Colors.white),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
          ],
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: scanning ? null : onCamera,
                  icon: const Icon(Icons.photo_camera, size: 16),
                  label: const Text('Photo'),
                  style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(40)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: scanning ? null : onGallery,
                  icon: const Icon(Icons.folder_open_outlined, size: 16),
                  label: const Text('Fichier'),
                  style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(40)),
                ),
              ),
            ],
          ),
          if (notice != null) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: const Color(0xFFEEF2FF),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(notice!,
                  style: const TextStyle(
                      color: Color(0xFF7A5F22),
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700)),
            ),
          ],
          if (preview != null && preview!.isNotEmpty) ...[
            const SizedBox(height: 8),
            _OcrPreviewPanel(outcomes: preview!),
          ],
        ],
      ),
    );
  }
}

/// Deux encarts côte-à-côte — « Champs détectés » (vert) et « Non détectés »
/// (ambre), mêmes couleurs et même typographie que le web ERP.
class _OcrPreviewPanel extends StatelessWidget {
  const _OcrPreviewPanel({required this.outcomes});
  final List<_FieldOutcome> outcomes;

  @override
  Widget build(BuildContext context) {
    final detected = outcomes.where((o) => o.value != null && o.value!.isNotEmpty).toList();
    final missing = outcomes.where((o) => o.value == null || o.value!.isEmpty).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (detected.isNotEmpty)
          _PreviewGroup(
            title: 'Champs détectés',
            titleColor: const Color(0xFF047857),
            background: const Color(0xFFECFDF5),
            borderColor: const Color(0xFFA7F3D0),
            rows: [
              for (final o in detected)
                _PreviewRow(label: o.label, value: o.value!, detected: true),
            ],
          ),
        if (detected.isNotEmpty && missing.isNotEmpty) const SizedBox(height: 6),
        if (missing.isNotEmpty)
          _PreviewGroup(
            title: 'Non détectés',
            titleColor: const Color(0xFFB45309),
            background: const Color(0xFFFFFBEB),
            borderColor: const Color(0xFFFDE68A),
            rows: [
              for (final o in missing)
                _PreviewRow(label: o.label, value: 'non détecté', detected: false),
            ],
          ),
      ],
    );
  }
}

class _PreviewGroup extends StatelessWidget {
  const _PreviewGroup({
    required this.title,
    required this.titleColor,
    required this.background,
    required this.borderColor,
    required this.rows,
  });
  final String title;
  final Color titleColor;
  final Color background;
  final Color borderColor;
  final List<_PreviewRow> rows;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: borderColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title.toUpperCase(),
              style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 0.6,
                  color: titleColor)),
          const SizedBox(height: 4),
          ...rows,
        ],
      ),
    );
  }
}

class _PreviewRow extends StatelessWidget {
  const _PreviewRow({
    required this.label,
    required this.value,
    required this.detected,
  });
  final String label;
  final String value;
  final bool detected;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 1.5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            flex: 5,
            child: Text(label,
                style: const TextStyle(fontSize: 10.5, color: Color(0xFF64748B))),
          ),
          Expanded(
            flex: 6,
            child: Text(
              value,
              textAlign: TextAlign.right,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 10.5,
                fontWeight: detected ? FontWeight.w800 : FontWeight.w600,
                fontStyle: detected ? FontStyle.normal : FontStyle.italic,
                color: detected
                    ? const Color(0xFF1E293B)
                    : const Color(0xFFD97706),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Puce « équipement » — tap pour cocher/décocher. Même aspect visuel que les
/// cases cochables de la version web (bord indigo + fond pâle quand actif).
class _EquipmentChip extends StatelessWidget {
  const _EquipmentChip({
    required this.label,
    required this.selected,
    required this.onToggle,
  });
  final String label;
  final bool selected;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onToggle,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: selected
              ? const Color(0xFFEEF2FF)
              : Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: selected
                ? const Color(0xFFD4AF5A)
                : Theme.of(context).dividerColor,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              selected ? Icons.check_box : Icons.check_box_outline_blank,
              size: 16,
              color: selected
                  ? const Color(0xFFB8933F)
                  : Colors.black45,
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                color: selected
                    ? const Color(0xFF5C471A)
                    : Theme.of(context).textTheme.bodyLarge?.color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
