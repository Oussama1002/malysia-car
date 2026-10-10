import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../../core/widgets/file_image.dart' as df_img;
import '../../../core/widgets/module_scaffold.dart';
import '../data/customer_dto.dart';
import '../data/customers_repo.dart';
import 'customer_detail_screen.dart';

/// Nouveau client — reproduit a l'identique le formulaire web
/// (frontend/modules/customers/CustomerForm.tsx) : toggle Particulier /
/// Entreprise, scanners OCR CIN + Permis, coordonnees facultatives.
class NewCustomerScreen extends ConsumerStatefulWidget {
  const NewCustomerScreen({
    super.key,
    this.initialFirstName,
    this.initialLastName,
    this.initialPhone,
    this.initialEmail,
  });

  /// Préremplissages optionnels — utilisés quand on arrive depuis la page
  /// « Demandes du site » pour créer le client sans ressaisir ce que le
  /// visiteur a déjà tapé sur la landing publique.
  final String? initialFirstName;
  final String? initialLastName;
  final String? initialPhone;
  final String? initialEmail;

  @override
  ConsumerState<NewCustomerScreen> createState() => _NewCustomerScreenState();
}

enum _CustomerKind { particulier, entreprise }

enum _ScanDoc { cin, permis }

class _NewCustomerScreenState extends ConsumerState<NewCustomerScreen> {
  final _formKey = GlobalKey<FormState>();

  _CustomerKind _kind = _CustomerKind.particulier;

  // Particulier
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _cin = TextEditingController();
  final _nationality = TextEditingController(text: 'Maroc');
  final _profession = TextEditingController();
  final _licenseNumber = TextEditingController();
  DateTime? _birthDate;
  DateTime? _licenseExpiry;

  // Entreprise
  final _legalName = TextEditingController();
  final _tradeName = TextEditingController();
  final _rc = TextEditingController();
  final _ice = TextEditingController();
  final _taxId = TextEditingController();
  final _cnss = TextEditingController();
  final _activity = TextEditingController();
  final _turnover = TextEditingController();
  final _repName = TextEditingController();
  final _repId = TextEditingController();
  DateTime? _incorporationDate;

  // Coordonnees
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _address = TextEditingController();
  final _city = TextEditingController();

  // OCR
  String? _cinPhotoPath;
  String? _permisPhotoPath;
  String? _cinDocId;
  String? _permisDocId;
  _ScanDoc? _scanningDoc;
  String? _scanNotice;
  CustomerDto? _duplicate;

  bool _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    // Préremplissage à partir d'une demande du site : on ne touche qu'aux
    // champs vraiment vides pour ne pas écraser une saisie en cours.
    if (widget.initialFirstName != null && _firstName.text.isEmpty) {
      _firstName.text = widget.initialFirstName!;
    }
    if (widget.initialLastName != null && _lastName.text.isEmpty) {
      _lastName.text = widget.initialLastName!;
    }
    if (widget.initialPhone != null && _phone.text.isEmpty) {
      _phone.text = widget.initialPhone!;
    }
    if (widget.initialEmail != null && _email.text.isEmpty) {
      _email.text = widget.initialEmail!;
    }
  }

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    _cin.dispose();
    _nationality.dispose();
    _profession.dispose();
    _licenseNumber.dispose();
    _legalName.dispose();
    _tradeName.dispose();
    _rc.dispose();
    _ice.dispose();
    _taxId.dispose();
    _cnss.dispose();
    _activity.dispose();
    _turnover.dispose();
    _repName.dispose();
    _repId.dispose();
    _phone.dispose();
    _email.dispose();
    _address.dispose();
    _city.dispose();
    super.dispose();
  }

  // ------------------------------------------------------------------
  // OCR
  // ------------------------------------------------------------------

  Future<void> _scan({
    required ImageSource source,
    required _ScanDoc doc,
  }) async {
    try {
      final picker = ImagePicker();
      final f = await picker.pickImage(
        source: source,
        maxWidth: 1600,
        imageQuality: 80,
      );
      if (f == null) return;
      final bytes = kIsWeb ? await f.readAsBytes() : null;
      setState(() {
        if (doc == _ScanDoc.cin) {
          _cinPhotoPath = f.path;
        } else {
          _permisPhotoPath = f.path;
        }
        _scanningDoc = doc;
        _scanNotice =
            'OCR ${doc == _ScanDoc.cin ? 'CIN' : 'Permis'} en cours…';
        _duplicate = null;
      });
      final result = await ref.read(customersRepoProvider).scanDocument(
            filePath: kIsWeb ? null : f.path,
            fileBytes: bytes,
            fileName: f.name,
            type: doc == _ScanDoc.cin ? 'cin' : 'driving_license',
          );
      await _applyScanFields(result, doc: doc);
    } catch (e) {
      setState(() {
        _scanNotice =
            'Scan impossible : ${_shortError(e)}. Saisissez les champs manuellement.';
      });
    } finally {
      if (mounted) setState(() => _scanningDoc = null);
    }
  }

  Future<void> _applyScanFields(
    Map<String, dynamic> result, {
    required _ScanDoc doc,
  }) async {
    final fields = (result['fields'] as Map<String, dynamic>? ?? const {});
    final docId = result['document_id']?.toString();
    if (doc == _ScanDoc.cin) {
      _cinDocId = docId;
    } else {
      _permisDocId = docId;
    }

    final firstName = _str(fields['first_name']);
    final lastName = _str(fields['last_name']);
    final cin = _str(fields['document_number']) ??
        _str(fields['national_id_number']);
    final birth = _str(fields['date_of_birth']);
    final nationality = _str(fields['nationality']);
    final address = _str(fields['address']);
    final licNum = _str(fields['license_number']);
    final licExp = _str(fields['expiry_date']);

    setState(() {
      // Ne jamais ecraser une saisie manuelle existante.
      if (firstName != null && _firstName.text.isEmpty) {
        _firstName.text = _titleCase(firstName);
      }
      if (lastName != null && _lastName.text.isEmpty) {
        _lastName.text = _titleCase(lastName);
      }
      if (cin != null && _cin.text.isEmpty) _cin.text = cin.toUpperCase();
      if (nationality != null && _nationality.text.isEmpty) {
        _nationality.text = _normalizeNationality(nationality);
      }
      if (address != null && _address.text.isEmpty) _address.text = address;
      if (birth != null && _birthDate == null) {
        _birthDate = DateTime.tryParse(birth);
      }
      if (licNum != null && _licenseNumber.text.isEmpty) {
        _licenseNumber.text = licNum;
      }
      if (licExp != null && _licenseExpiry == null) {
        _licenseExpiry = DateTime.tryParse(licExp);
      }
      _scanNotice =
          'Champs détectés (${doc == _ScanDoc.cin ? 'CIN' : 'Permis'}) — vérifiez.';
    });

    if (cin != null) {
      final existing = await ref.read(customersRepoProvider).lookup(cin: cin);
      if (existing != null && mounted) {
        setState(() => _duplicate = existing);
      }
    }
  }

  // ------------------------------------------------------------------
  // Submit
  // ------------------------------------------------------------------

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final body = <String, dynamic>{
        'customer_type':
            _kind == _CustomerKind.particulier ? 'PARTICULIER' : 'ENTREPRISE',
        'contacts': <Map<String, dynamic>>[],
        'addresses': <Map<String, dynamic>>[],
      };

      if (_kind == _CustomerKind.particulier) {
        body['individual_profile'] = {
          'first_name': _firstName.text.trim(),
          'last_name': _lastName.text.trim(),
          if (_cin.text.trim().isNotEmpty)
            'national_id_number': _cin.text.trim(),
          if (_birthDate != null)
            'date_of_birth': DateFormat('yyyy-MM-dd').format(_birthDate!),
          if (_nationality.text.trim().isNotEmpty)
            'nationality': _nationality.text.trim(),
          if (_profession.text.trim().isNotEmpty)
            'profession': _profession.text.trim(),
          if (_licenseNumber.text.trim().isNotEmpty)
            'driving_license_number': _licenseNumber.text.trim(),
          if (_licenseExpiry != null)
            'driving_license_expiry':
                DateFormat('yyyy-MM-dd').format(_licenseExpiry!),
        };
      } else {
        body['company_profile'] = {
          'legal_name': _legalName.text.trim(),
          if (_tradeName.text.trim().isNotEmpty)
            'trade_name': _tradeName.text.trim(),
          if (_rc.text.trim().isNotEmpty)
            'registration_number': _rc.text.trim(),
          if (_ice.text.trim().isNotEmpty) 'ice': _ice.text.trim(),
          if (_taxId.text.trim().isNotEmpty)
            'tax_identifier': _taxId.text.trim(),
          if (_cnss.text.trim().isNotEmpty) 'cnss_number': _cnss.text.trim(),
          if (_incorporationDate != null)
            'incorporation_date':
                DateFormat('yyyy-MM-dd').format(_incorporationDate!),
          if (_activity.text.trim().isNotEmpty)
            'business_activity': _activity.text.trim(),
          if (_turnover.text.trim().isNotEmpty &&
              double.tryParse(_turnover.text.trim()) != null)
            'annual_turnover': double.parse(_turnover.text.trim()),
          if (_repName.text.trim().isNotEmpty)
            'legal_representative_name': _repName.text.trim(),
          if (_repId.text.trim().isNotEmpty)
            'legal_representative_id_number': _repId.text.trim(),
        };
      }

      if (_phone.text.trim().isNotEmpty) {
        (body['contacts'] as List).add({
          'contact_type': 'phone',
          'value': _phone.text.trim(),
          'is_primary': true,
        });
      }
      if (_email.text.trim().isNotEmpty) {
        (body['contacts'] as List).add({
          'contact_type': 'email',
          'value': _email.text.trim(),
          'is_primary': true,
        });
      }
      if (_address.text.trim().isNotEmpty) {
        (body['addresses'] as List).add({
          'address_type': 'home',
          'address_line_1': _address.text.trim(),
          if (_city.text.trim().isNotEmpty) 'city': _city.text.trim(),
          'country_code': 'MA',
          'is_primary': true,
        });
      }

      final created =
          await ref.read(customersRepoProvider).create(body: body);
      for (final docId in [_cinDocId, _permisDocId]) {
        if (docId == null) continue;
        try {
          await ref.read(customersRepoProvider).linkDocument(
                documentId: docId,
                customerId: created.id,
              );
        } catch (_) {}
      }
      ref.invalidate(customersListProvider);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(
        builder: (_) => CustomerDetailScreen(id: created.id),
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

  String _friendly(Object e) {
    final msg = e.toString();
    final match = RegExp(r'status code of (\d+)').firstMatch(msg);
    if (match != null) {
      final code = int.parse(match[1]!);
      if (code == 422) return 'Les informations saisies ne sont pas valides.';
      if (code == 403) {
        return 'Vous n\'avez pas la permission de créer un client.';
      }
    }
    return 'Création impossible pour le moment.';
  }

  String _shortError(Object e) {
    final msg = e.toString().replaceAll('Exception: ', '');
    return msg.length > 80 ? '${msg.substring(0, 80)}…' : msg;
  }

  String? _str(dynamic v) {
    if (v == null) return null;
    final s = v.toString().trim();
    return s.isEmpty ? null : s;
  }

  String _titleCase(String s) => s
      .toLowerCase()
      .split(RegExp(r'\s+'))
      .map((w) => w.isEmpty ? w : w[0].toUpperCase() + w.substring(1))
      .join(' ');

  String _normalizeNationality(String raw) {
    final v = raw.toUpperCase();
    const table = {
      'MAR': 'Maroc',
      'MAROC': 'Maroc',
      'MA': 'Maroc',
      'FRA': 'France',
      'FRANC': 'France',
      'FR': 'France',
      'ESP': 'Espagne',
      'SPAIN': 'Espagne',
      'ESPAG': 'Espagne',
      'ES': 'Espagne',
      'DZA': 'Algérie',
      'ALGER': 'Algérie',
      'DZ': 'Algérie',
      'TUN': 'Tunisie',
      'TUNIS': 'Tunisie',
      'TN': 'Tunisie',
    };
    for (final entry in table.entries) {
      if (v.startsWith(entry.key) || v.contains(entry.key)) return entry.value;
    }
    return _titleCase(raw);
  }

  Future<DateTime?> _pickDate({DateTime? initial}) {
    return showDatePicker(
      context: context,
      initialDate: initial ?? DateTime(1990),
      firstDate: DateTime(1920),
      lastDate: DateTime(2100),
      locale: const Locale('fr'),
    );
  }

  // ------------------------------------------------------------------
  // Build
  // ------------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Nouveau client')),
      body: ModuleBackground(
        child: SafeArea(
          child: Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _kindToggle(),
                const SizedBox(height: 14),
                if (_kind == _CustomerKind.particulier) ...[
                  _scannerCard(),
                  const SizedBox(height: 12),
                  _particulierCard(),
                ] else
                  _entrepriseCard(),
                const SizedBox(height: 12),
                _coordonneesCard(),
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
                      : const Text('Créer le client',
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

  Widget _kindToggle() {
    return Row(
      children: [
        for (final k in _CustomerKind.values)
          Expanded(
            child: Padding(
              padding: EdgeInsets.only(
                  right: k == _CustomerKind.particulier ? 6 : 0,
                  left: k == _CustomerKind.entreprise ? 6 : 0),
              child: InkWell(
                onTap: () => setState(() => _kind = k),
                borderRadius: BorderRadius.circular(14),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: _kind == k
                        ? const Color(0xFFEEF2FF)
                        : Theme.of(context).colorScheme.surface,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: _kind == k
                          ? const Color(0xFF818CF8)
                          : Theme.of(context).dividerColor,
                      width: _kind == k ? 1.6 : 1,
                    ),
                  ),
                  child: Text(
                    k == _CustomerKind.particulier
                        ? 'Particulier'
                        : 'Entreprise',
                    style: TextStyle(
                      fontWeight: FontWeight.w900,
                      fontSize: 13,
                      color: _kind == k
                          ? const Color(0xFF4338CA)
                          : Colors.black87,
                    ),
                  ),
                ),
              ),
            ),
          ),
      ],
    );
  }

  Widget _scannerCard() {
    return ModuleCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Scanner les pièces (OCR)',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
          const SizedBox(height: 4),
          const Text(
            "Prenez la CIN puis le permis. Les champs détectés remplissent le formulaire ci-dessous.",
            style: TextStyle(color: Colors.black54, fontSize: 12),
          ),
          const SizedBox(height: 10),
          _ScanSlot(
            title: 'CIN',
            photoPath: _cinPhotoPath,
            scanning: _scanningDoc == _ScanDoc.cin,
            notice: _scanningDoc == null ? _scanNotice : null,
            duplicate: _duplicate,
            onCamera: () =>
                _scan(source: ImageSource.camera, doc: _ScanDoc.cin),
            onGallery: () =>
                _scan(source: ImageSource.gallery, doc: _ScanDoc.cin),
            onClear: () => setState(() {
              _cinPhotoPath = null;
              _cinDocId = null;
              _duplicate = null;
            }),
            onOpenDuplicate: () {
              if (_duplicate == null) return;
              Navigator.of(context).pushReplacement(MaterialPageRoute(
                builder: (_) => CustomerDetailScreen(id: _duplicate!.id),
              ));
            },
          ),
          const SizedBox(height: 8),
          _ScanSlot(
            title: 'Permis de conduire',
            photoPath: _permisPhotoPath,
            scanning: _scanningDoc == _ScanDoc.permis,
            notice: null,
            duplicate: null,
            onCamera: () =>
                _scan(source: ImageSource.camera, doc: _ScanDoc.permis),
            onGallery: () =>
                _scan(source: ImageSource.gallery, doc: _ScanDoc.permis),
            onClear: () => setState(() {
              _permisPhotoPath = null;
              _permisDocId = null;
            }),
            onOpenDuplicate: () {},
          ),
        ],
      ),
    );
  }

  Widget _particulierCard() {
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return ModuleCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Identité particulier',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          _twoCols(
            TextFormField(
              controller: _firstName,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Prénom *'),
              validator: (v) =>
                  v == null || v.trim().isEmpty ? 'Prénom requis' : null,
            ),
            TextFormField(
              controller: _lastName,
              textCapitalization: TextCapitalization.words,
              decoration: const InputDecoration(labelText: 'Nom *'),
              validator: (v) =>
                  v == null || v.trim().isEmpty ? 'Nom requis' : null,
            ),
          ),
          const SizedBox(height: 10),
          _twoCols(
            TextFormField(
              controller: _cin,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(labelText: 'CIN'),
            ),
            InkWell(
              onTap: () async {
                final d = await _pickDate(initial: _birthDate);
                if (d != null) setState(() => _birthDate = d);
              },
              child: InputDecorator(
                decoration:
                    const InputDecoration(labelText: 'Date de naissance'),
                child: Text(
                  _birthDate != null ? dateFmt.format(_birthDate!) : '—',
                ),
              ),
            ),
          ),
          const SizedBox(height: 10),
          _twoCols(
            TextFormField(
              controller: _nationality,
              decoration: const InputDecoration(labelText: 'Nationalité'),
            ),
            TextFormField(
              controller: _profession,
              decoration: const InputDecoration(labelText: 'Profession'),
            ),
          ),
          const SizedBox(height: 10),
          _twoCols(
            TextFormField(
              controller: _licenseNumber,
              decoration:
                  const InputDecoration(labelText: 'Permis de conduire n°'),
            ),
            InkWell(
              onTap: () async {
                final d = await _pickDate(initial: _licenseExpiry);
                if (d != null) setState(() => _licenseExpiry = d);
              },
              child: InputDecorator(
                decoration:
                    const InputDecoration(labelText: 'Expiration permis'),
                child: Text(_licenseExpiry != null
                    ? dateFmt.format(_licenseExpiry!)
                    : '—'),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _entrepriseCard() {
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return ModuleCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Identité entreprise',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          _twoCols(
            TextFormField(
              controller: _legalName,
              textCapitalization: TextCapitalization.words,
              decoration:
                  const InputDecoration(labelText: 'Raison sociale *'),
              validator: (v) => v == null || v.trim().isEmpty
                  ? 'Raison sociale requise'
                  : null,
            ),
            TextFormField(
              controller: _tradeName,
              decoration:
                  const InputDecoration(labelText: 'Nom commercial'),
            ),
          ),
          const SizedBox(height: 10),
          _twoCols(
            TextFormField(
              controller: _rc,
              decoration: const InputDecoration(labelText: 'RC'),
            ),
            TextFormField(
              controller: _ice,
              decoration: const InputDecoration(labelText: 'ICE'),
            ),
          ),
          const SizedBox(height: 10),
          _twoCols(
            TextFormField(
              controller: _taxId,
              decoration:
                  const InputDecoration(labelText: 'Identifiant fiscal (IF)'),
            ),
            TextFormField(
              controller: _cnss,
              decoration: const InputDecoration(labelText: 'N° CNSS'),
            ),
          ),
          const SizedBox(height: 10),
          _twoCols(
            InkWell(
              onTap: () async {
                final d = await _pickDate(initial: _incorporationDate);
                if (d != null) setState(() => _incorporationDate = d);
              },
              child: InputDecorator(
                decoration: const InputDecoration(
                    labelText: 'Date d\'immatriculation'),
                child: Text(_incorporationDate != null
                    ? dateFmt.format(_incorporationDate!)
                    : '—'),
              ),
            ),
            TextFormField(
              controller: _activity,
              decoration: const InputDecoration(labelText: 'Activité'),
            ),
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: _turnover,
            keyboardType:
                const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(labelText: 'CA annuel (MAD)'),
          ),
          const SizedBox(height: 10),
          _twoCols(
            TextFormField(
              controller: _repName,
              textCapitalization: TextCapitalization.words,
              decoration:
                  const InputDecoration(labelText: 'Représentant légal'),
            ),
            TextFormField(
              controller: _repId,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(
                  labelText: 'CIN du représentant'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _coordonneesCard() {
    return ModuleCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Coordonnées (facultatif)',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800)),
          const SizedBox(height: 10),
          _twoCols(
            TextFormField(
              controller: _phone,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Téléphone'),
            ),
            TextFormField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              decoration: const InputDecoration(labelText: 'Email'),
            ),
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: _address,
            decoration: const InputDecoration(
                labelText: 'Adresse', hintText: 'Rue, n°, appartement'),
          ),
          const SizedBox(height: 10),
          TextFormField(
            controller: _city,
            decoration: const InputDecoration(labelText: 'Ville'),
          ),
        ],
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

// ---------------------------------------------------------------------------
// Scan slot (CIN / Permis)
// ---------------------------------------------------------------------------

class _ScanSlot extends StatelessWidget {
  const _ScanSlot({
    required this.title,
    required this.photoPath,
    required this.scanning,
    required this.notice,
    required this.duplicate,
    required this.onCamera,
    required this.onGallery,
    required this.onClear,
    required this.onOpenDuplicate,
  });

  final String title;
  final String? photoPath;
  final bool scanning;
  final String? notice;
  final CustomerDto? duplicate;
  final VoidCallback onCamera;
  final VoidCallback onGallery;
  final VoidCallback onClear;
  final VoidCallback onOpenDuplicate;

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
              const Icon(Icons.credit_card, size: 16, color: Colors.black54),
              const SizedBox(width: 6),
              Text(title,
                  style: const TextStyle(
                      fontSize: 12.5, fontWeight: FontWeight.w800)),
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
                          child: Icon(Icons.close,
                              color: Colors.white, size: 16),
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
                    minimumSize: const Size.fromHeight(40),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: scanning ? null : onGallery,
                  icon: const Icon(Icons.folder_open_outlined, size: 16),
                  label: const Text('Galerie'),
                  style: OutlinedButton.styleFrom(
                    minimumSize: const Size.fromHeight(40),
                  ),
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
          if (duplicate != null) ...[
            const SizedBox(height: 8),
            InkWell(
              onTap: onOpenDuplicate,
              child: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFFBEB),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFFDE68A)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.warning_amber_rounded,
                        size: 18, color: Color(0xFFB45309)),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Client existant détecté : ${duplicate!.displayName ?? duplicate!.code}. Ouvrir sa fiche →',
                        style: const TextStyle(
                            color: Color(0xFF78350F),
                            fontSize: 11.5,
                            fontWeight: FontWeight.w800),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
