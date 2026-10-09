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

const _plateLetters = ['A', 'B', 'C', 'D', 'H', 'J', 'T', 'W', 'WW'];

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
  final _color = TextEditingController();
  final _fuelType = TextEditingController();
  final _vehicleType = TextEditingController();
  final _categorie = TextEditingController();
  final _gamme = TextEditingController();
  final _fiscalPower = TextEditingController();
  final _cylinders = TextEditingController();
  final _mileage = TextEditingController();
  final _numeroPolice = TextEditingController();
  final _dailyPrice = TextEditingController();
  final _monthlyPrice = TextEditingController();
  final _purchasePrice = TextEditingController();
  final _notes = TextEditingController();

  DateTime? _miseEnCirculation;
  DateTime? _dateImmatriculation;
  DateTime? _acquisitionDate;
  DateTime? _insuranceExpiry;
  DateTime? _techExpiry;
  DateTime? _vignetteExpiry;
  DateTime? _immatProvExpiry;

  String? _brandId;
  String? _modelId;

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
    _color.dispose();
    _fuelType.dispose();
    _vehicleType.dispose();
    _categorie.dispose();
    _gamme.dispose();
    _fiscalPower.dispose();
    _cylinders.dispose();
    _mileage.dispose();
    _numeroPolice.dispose();
    _dailyPrice.dispose();
    _monthlyPrice.dispose();
    _purchasePrice.dispose();
    _notes.dispose();
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
        if (_color.text.trim().isNotEmpty) 'color': _color.text.trim(),
        if (_fuelType.text.trim().isNotEmpty)
          'fuel_type': _fuelType.text.trim(),
        if (int.tryParse(_fiscalPower.text.trim()) != null)
          'fiscal_power': int.parse(_fiscalPower.text.trim()),
        if (_registrationCard.text.trim().isNotEmpty)
          'registration_card_number': _registrationCard.text.trim(),
        if (_insuranceExpiry != null)
          'insurance_expiry': _iso(_insuranceExpiry!),
        if (_techExpiry != null) 'tech_control_expiry': _iso(_techExpiry!),
        if (_vignetteExpiry != null) 'vignette_expiry': _iso(_vignetteExpiry!),
        if (int.tryParse(_mileage.text.trim()) != null)
          'mileage_km': int.parse(_mileage.text.trim()),
        if (_vehicleType.text.trim().isNotEmpty)
          'vehicle_type': _vehicleType.text.trim(),
        if (_categorie.text.trim().isNotEmpty)
          'categorie': _categorie.text.trim(),
        if (_gamme.text.trim().isNotEmpty) 'gamme': _gamme.text.trim(),
        if (int.tryParse(_cylinders.text.trim()) != null)
          'nombre_cylindres': int.parse(_cylinders.text.trim()),
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
        if (double.tryParse(_dailyPrice.text.trim()) != null)
          'daily_rental_price': double.parse(_dailyPrice.text.trim()),
        if (double.tryParse(_monthlyPrice.text.trim()) != null)
          'monthly_rental_price': double.parse(_monthlyPrice.text.trim()),
        if (double.tryParse(_purchasePrice.text.trim()) != null)
          'purchase_price': double.parse(_purchasePrice.text.trim()),
        if (_notes.text.trim().isNotEmpty) 'notes': _notes.text.trim(),
      };
      final id = await ref.read(vehiclesRepoProvider).create(body);
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
                  items: List.generate(90, (i) => i + 1)
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
    final models =
        _brandId == null ? const <VehicleModelDto>[] : (brands
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
          Row(
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
              const SizedBox(width: 10),
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
                      _brandId == null ? null : (v) => setState(() => _modelId = v),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          _twoCols(
            TextFormField(
              controller: _year,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Année'),
            ),
            TextFormField(
              controller: _color,
              decoration: const InputDecoration(labelText: 'Couleur'),
            ),
          ),
          const SizedBox(height: 10),
          _twoCols(
            TextFormField(
              controller: _fuelType,
              decoration: const InputDecoration(
                  labelText: 'Carburant',
                  hintText: 'essence, diesel, hybride…'),
            ),
            TextFormField(
              controller: _vehicleType,
              decoration: const InputDecoration(labelText: 'Type'),
            ),
          ),
          const SizedBox(height: 10),
          _twoCols(
            TextFormField(
              controller: _categorie,
              decoration: const InputDecoration(labelText: 'Catégorie'),
            ),
            TextFormField(
              controller: _gamme,
              decoration: const InputDecoration(labelText: 'Gamme'),
            ),
          ),
          const SizedBox(height: 10),
          _twoCols(
            TextFormField(
              controller: _fiscalPower,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Puissance (CV)'),
            ),
            TextFormField(
              controller: _cylinders,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Cylindres'),
            ),
          ),
          const SizedBox(height: 10),
          _twoCols(
            TextFormField(
              controller: _mileage,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Index compteur (km)'),
            ),
            _dateInput(
              label: 'Mise en circulation',
              value: _miseEnCirculation,
              onPick: (d) => setState(() => _miseEnCirculation = d),
            ),
          ),
        ],
      ),
    );
  }

  Widget _adminSection() {
    return ModuleCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Administratif',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          _twoCols(
            TextFormField(
              controller: _registrationCard,
              decoration:
                  const InputDecoration(labelText: 'N° Carte grise'),
            ),
            TextFormField(
              controller: _vin,
              decoration:
                  const InputDecoration(labelText: 'Châssis (VIN)'),
            ),
          ),
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
              decoration: const InputDecoration(labelText: 'Tarif / jour (MAD)'),
            ),
            TextFormField(
              controller: _monthlyPrice,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: 'Tarif / mois (MAD)'),
            ),
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: _purchasePrice,
            keyboardType:
                const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: "Prix d'achat (MAD)"),
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: _notes,
            maxLines: 3,
            decoration: const InputDecoration(labelText: 'Notes'),
          ),
        ],
      ),
    );
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
