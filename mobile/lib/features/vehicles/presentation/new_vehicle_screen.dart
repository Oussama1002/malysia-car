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

enum _VehDoc { assurance, facture, immatProv, techControl, vignette }

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
  final _dailyPrice = TextEditingController();
  final _monthlyPrice = TextEditingController();
  final _purchasePrice = TextEditingController();

  // Dropdowns alignés sur le web — on garde '' = pas de choix.
  String _fuelType = '';
  String _vehicleType = '';
  String _categorie = '';
  String _gamme = '';
  _CarteGriseStatus _carteGriseStatus = _CarteGriseStatus.enAttente;

  DateTime? _miseEnCirculation;
  DateTime? _dateImmatriculation;
  DateTime? _acquisitionDate;
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

  // Photo principale du véhicule — uploadée sur POST /vehicles/{id}/photo
  // après la création, comme le fait le modal web.
  XFile? _mainPhoto;

  // Équipements cochés — sous-ensemble des libellés de `_equipmentsGroups`.
  final Set<String> _equipments = <String>{};

  // OCR
  final Map<_VehDoc, String?> _scanPath = {};
  final Map<_VehDoc, String?> _scanDocId = {};
  _VehDoc? _scanning;
  String? _scanNotice;

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
    _dailyPrice.dispose();
    _monthlyPrice.dispose();
    _purchasePrice.dispose();
    _newBrandName.dispose();
    _newModelName.dispose();
    super.dispose();
  }

  String get _registration =>
      '${_platNum.text.trim()}-$_platLetter-$_platRegion';

  // ------------------------------------------------------------------
  // OCR
  // ------------------------------------------------------------------

  String _ocrType(_VehDoc d) => switch (d) {
        _VehDoc.assurance => 'insurance_card',
        _VehDoc.facture => 'invoice',
        _VehDoc.immatProv => 'provisional_registration',
        _VehDoc.techControl => 'tech_control',
        _VehDoc.vignette => 'vignette',
      };

  String _ocrLabel(_VehDoc d) => switch (d) {
        _VehDoc.assurance => 'Assurance',
        _VehDoc.facture => "Facture d'achat",
        _VehDoc.immatProv => 'Immat. provisoire / WW',
        _VehDoc.techControl => 'Visite technique',
        _VehDoc.vignette => 'Vignette',
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
        _scanNotice = 'OCR ${_ocrLabel(doc)} en cours…';
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
        _scanNotice =
            'Scan impossible : ${_short(e)}. Saisissez les champs manuellement.';
      });
    } finally {
      if (mounted) setState(() => _scanning = null);
    }
  }

  void _applyScanFields(Map<String, dynamic> result, {required _VehDoc doc}) {
    final fields = (result['fields'] as Map<String, dynamic>? ?? const {});
    _scanDocId[doc] = result['document_id']?.toString();

    setState(() {
      final numeroPolice = _s(fields['numero_police']) ?? _s(fields['police']);
      final insuranceExpiry = _s(fields['insurance_expiry']) ??
          _s(fields['expiry_date']) ??
          _s(fields['date_expiration']);
      final chassis = _s(fields['chassis']) ?? _s(fields['vin']);
      final acquisition = _s(fields['acquisition_date']) ??
          _s(fields['invoice_date']) ??
          _s(fields['date']);
      final montant = _s(fields['montant']) ?? _s(fields['amount']);
      final immatProv =
          _s(fields['immat_provisoire']) ?? _s(fields['provisional_number']);
      final immatProvExpiry = _s(fields['immat_provisoire_expiry']) ??
          _s(fields['provisional_expiry']);
      final techExpiry = _s(fields['tech_control_expiry']) ??
          _s(fields['tech_expiry']) ??
          _s(fields['expiry_date']);
      final vignetteExpiry =
          _s(fields['vignette_expiry']) ?? _s(fields['expiry_date']);

      if (numeroPolice != null && _numeroPolice.text.isEmpty) {
        _numeroPolice.text = numeroPolice;
      }
      if (insuranceExpiry != null && _insuranceExpiry == null) {
        _insuranceExpiry = DateTime.tryParse(insuranceExpiry);
      }
      if (chassis != null && _vin.text.isEmpty) _vin.text = chassis;
      if (acquisition != null && _acquisitionDate == null) {
        _acquisitionDate = DateTime.tryParse(acquisition);
      }
      if (montant != null &&
          _purchasePrice.text.isEmpty &&
          double.tryParse(montant.replaceAll(',', '.')) != null) {
        _purchasePrice.text = montant.replaceAll(',', '.');
      }
      if (immatProv != null && _immatOnline.text.isEmpty) {
        _immatOnline.text = immatProv;
      }
      if (immatProvExpiry != null && _immatProvExpiry == null) {
        _immatProvExpiry = DateTime.tryParse(immatProvExpiry);
      }
      if (doc == _VehDoc.techControl && techExpiry != null && _techExpiry == null) {
        _techExpiry = DateTime.tryParse(techExpiry);
      }
      if (doc == _VehDoc.vignette &&
          vignetteExpiry != null &&
          _vignetteExpiry == null) {
        _vignetteExpiry = DateTime.tryParse(vignetteExpiry);
      }
      _scanNotice =
          'Champs détectés (${_ocrLabel(doc)}) — vérifiez avant d\'enregistrer.';
    });
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
        if (_insuranceExpiry != null)
          'insurance_expiry': _iso(_insuranceExpiry!),
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
        if (double.tryParse(_dailyPrice.text.trim()) != null)
          'daily_rental_price': double.parse(_dailyPrice.text.trim()),
        if (double.tryParse(_monthlyPrice.text.trim()) != null)
          'monthly_rental_price': double.parse(_monthlyPrice.text.trim()),
        if (double.tryParse(_purchasePrice.text.trim()) != null)
          'purchase_price': double.parse(_purchasePrice.text.trim()),
        if (_equipments.isNotEmpty) 'equipments': _equipments.toList(),
      };
      final id = await ref.read(vehiclesRepoProvider).create(body);
      // Upload de la photo principale si l'utilisateur en a choisi une —
      // non bloquant : la création du véhicule reste réussie même si la photo
      // échoue, on remonte juste un message d'erreur.
      if (_mainPhoto != null && id.isNotEmpty) {
        try {
          await ref
              .read(vehiclesRepoProvider)
              .uploadMainPhoto(id: id, filePath: _mainPhoto!.path);
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
    final msg = e.toString().replaceAll('Exception: ', '');
    return msg.length > 80 ? '${msg.substring(0, 80)}…' : msg;
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
                _pricingSection(),
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
              photoPath: _scanPath[d],
              scanning: _scanning == d,
              notice: _scanning == null && _scanNotice != null ? _scanNotice : null,
              onCamera: () => _scan(source: ImageSource.camera, doc: d),
              onGallery: () => _scan(source: ImageSource.gallery, doc: d),
              onClear: () => setState(() {
                _scanPath[d] = null;
                _scanDocId[d] = null;
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
            foregroundColor: const Color(0xFF4F46E5),
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
            foregroundColor: const Color(0xFF4F46E5),
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
            backgroundColor: const Color(0xFF4F46E5),
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
      setState(() => _scanNotice = 'Ajout marque impossible : ${_short(e)}');
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
      setState(() => _scanNotice = 'Ajout modèle impossible : ${_short(e)}');
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
          _twoCols(
            _dateInput(
              label: 'Expiration assurance',
              value: _insuranceExpiry,
              onPick: (d) => setState(() => _insuranceExpiry = d),
            ),
            TextFormField(
              controller: _numeroPolice,
              decoration: const InputDecoration(labelText: 'N° police'),
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

  Widget _pricingSection() {
    return ModuleCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Tarification',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          _twoCols(
            TextFormField(
              controller: _dailyPrice,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration:
                  const InputDecoration(labelText: 'Tarif / jour (MAD)'),
            ),
            TextFormField(
              controller: _monthlyPrice,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration:
                  const InputDecoration(labelText: 'Tarif / mois (MAD)'),
            ),
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: _purchasePrice,
            keyboardType:
                const TextInputType.numberWithOptions(decimal: true),
            decoration:
                const InputDecoration(labelText: "Prix d'achat (MAD)"),
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
              if (_equipments.isNotEmpty)
                TextButton(
                  onPressed: () => setState(_equipments.clear),
                  style: TextButton.styleFrom(
                    foregroundColor: const Color(0xFF4F46E5),
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    minimumSize: const Size(0, 32),
                  ),
                  child: const Text('Tout décocher',
                      style: TextStyle(
                          fontWeight: FontWeight.w800, fontSize: 11)),
                ),
            ],
          ),
          const SizedBox(height: 8),
          for (int i = 0; i < _equipmentsGroups.length; i++) ...[
            if (i > 0) const SizedBox(height: 10),
            Text(
              _equipmentsGroups[i].title.toUpperCase(),
              style: const TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w900,
                color: Colors.black45,
                letterSpacing: 1.1,
              ),
            ),
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

  // Photo principale — « Prendre une photo » (caméra) ou « Choisir » (galerie),
  // reflet des deux boutons de la carte « Photos & Vidéo » du modal web.
  Widget _photoSection() {
    final preview = _mainPhoto;
    return ModuleCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Photo du véhicule',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          const Text(
            'Facultatif — sera envoyée après la création. Idéalement l\'avant du véhicule, en extérieur.',
            style: TextStyle(color: Colors.black54, fontSize: 11.5),
          ),
          const SizedBox(height: 10),
          if (preview != null) ...[
            Stack(
              alignment: Alignment.topRight,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: AspectRatio(
                    aspectRatio: 16 / 10,
                    child: df_img.fileImage(preview.path, fit: BoxFit.cover),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(6),
                  child: Material(
                    color: Colors.red,
                    shape: const CircleBorder(),
                    child: InkWell(
                      onTap: () => setState(() => _mainPhoto = null),
                      customBorder: const CircleBorder(),
                      child: const Padding(
                        padding: EdgeInsets.all(5),
                        child: Icon(Icons.close,
                            color: Colors.white, size: 16),
                      ),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
          ],
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _pickMainPhoto(ImageSource.camera),
                  icon: const Icon(Icons.photo_camera, size: 16),
                  label: const Text('Prendre une photo'),
                  style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(40)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => _pickMainPhoto(ImageSource.gallery),
                  icon: const Icon(Icons.image_outlined, size: 16),
                  label: const Text('Galerie'),
                  style: OutlinedButton.styleFrom(
                      minimumSize: const Size.fromHeight(40)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Future<void> _pickMainPhoto(ImageSource source) async {
    try {
      final picker = ImagePicker();
      final f = await picker.pickImage(
          source: source, maxWidth: 1600, imageQuality: 80);
      if (f != null) setState(() => _mainPhoto = f);
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Impossible d\'ouvrir la caméra.')),
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

class _ScanSlot extends StatelessWidget {
  const _ScanSlot({
    required this.title,
    required this.photoPath,
    required this.scanning,
    required this.notice,
    required this.onCamera,
    required this.onGallery,
    required this.onClear,
  });

  final String title;
  final String? photoPath;
  final bool scanning;
  final String? notice;
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
                      color: Color(0xFF4338CA),
                      fontSize: 11.5,
                      fontWeight: FontWeight.w700)),
            ),
          ],
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
                ? const Color(0xFF818CF8)
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
                  ? const Color(0xFF4F46E5)
                  : Colors.black45,
            ),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w700,
                color: selected
                    ? const Color(0xFF3730A3)
                    : Theme.of(context).textTheme.bodyLarge?.color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
