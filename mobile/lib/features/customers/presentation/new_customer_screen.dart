import 'dart:io' if (dart.library.html) 'dart:html' as io;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../../core/widgets/module_scaffold.dart';
import '../data/customer_dto.dart';
import '../data/customers_repo.dart';
import 'customer_detail_screen.dart';

/// Nouveau client particulier avec scan CIN. L'OCR renseigne nom, prénom, CIN,
/// date de naissance, nationalité et adresse — l'agent ne retape pas ce qui
/// se lit sur la carte, et vérifie en même temps que le client n'est pas
/// déjà dans la base.
class NewCustomerScreen extends ConsumerStatefulWidget {
  const NewCustomerScreen({super.key});

  @override
  ConsumerState<NewCustomerScreen> createState() => _NewCustomerScreenState();
}

class _NewCustomerScreenState extends ConsumerState<NewCustomerScreen> {
  final _formKey = GlobalKey<FormState>();
  final _firstName = TextEditingController();
  final _lastName = TextEditingController();
  final _cin = TextEditingController();
  final _phone = TextEditingController();
  final _email = TextEditingController();
  final _address = TextEditingController();

  DateTime? _birthDate;
  String? _cinPhotoPath;
  String? _scannedDocId;
  CustomerDto? _duplicate;
  bool _scanning = false;
  String? _scanNotice;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _firstName.dispose();
    _lastName.dispose();
    _cin.dispose();
    _phone.dispose();
    _email.dispose();
    _address.dispose();
    super.dispose();
  }

  Future<void> _scanCin({required ImageSource source}) async {
    try {
      final picker = ImagePicker();
      final f = await picker.pickImage(
        source: source,
        maxWidth: 1600,
        imageQuality: 80,
      );
      if (f == null) return;
      // Sur web, f.path est un blob URL inutilisable par dart:io ;
      // on lit les octets et on les passe directement.
      final bytes = kIsWeb ? await f.readAsBytes() : null;
      setState(() {
        _cinPhotoPath = f.path;
        _scanning = true;
        _scanNotice = 'OCR en cours… cela prend 10 à 30 secondes.';
        _duplicate = null;
      });
      final result = await ref.read(customersRepoProvider).scanDocument(
            filePath: kIsWeb ? null : f.path,
            fileBytes: bytes,
            fileName: f.name,
            type: 'cin',
          );
      _applyScanFields(result);
    } catch (e) {
      setState(() {
        _scanNotice = 'Scan impossible : ${_shortError(e)}. Saisissez les champs manuellement.';
      });
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }

  Future<void> _applyScanFields(Map<String, dynamic> result) async {
    final fields = (result['fields'] as Map<String, dynamic>? ?? const {});
    final docId = result['document_id']?.toString();
    _scannedDocId = docId;
    String? firstName = _str(fields['first_name']);
    String? lastName = _str(fields['last_name']);
    final doc = _str(fields['document_number']) ?? _str(fields['national_id_number']);
    final birth = _str(fields['date_of_birth']);
    final address = _str(fields['address']);

    setState(() {
      if (firstName != null) _firstName.text = _titleCase(firstName);
      if (lastName != null) _lastName.text = _titleCase(lastName);
      if (doc != null) _cin.text = doc.toUpperCase();
      if (address != null && _address.text.isEmpty) _address.text = address;
      if (birth != null) _birthDate = DateTime.tryParse(birth);
      _scanNotice = 'Champs détectés — vérifiez avant d\'enregistrer.';
    });

    // Si on reconnaît le CIN, on avertit : c'est peut-être un doublon.
    if (doc != null) {
      final existing = await ref.read(customersRepoProvider).lookup(cin: doc);
      if (existing != null && mounted) {
        setState(() => _duplicate = existing);
      }
    }
  }

  Future<void> _pickBirthDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _birthDate ?? DateTime(1990),
      firstDate: DateTime(1920),
      lastDate: DateTime.now(),
      locale: const Locale('fr'),
    );
    if (picked != null) setState(() => _birthDate = picked);
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final body = <String, dynamic>{
        'customer_type': 'PARTICULIER',
        'individual_profile': {
          'first_name': _firstName.text.trim(),
          'last_name': _lastName.text.trim(),
          if (_cin.text.trim().isNotEmpty)
            'national_id_number': _cin.text.trim(),
          if (_birthDate != null)
            'date_of_birth':
                DateFormat('yyyy-MM-dd').format(_birthDate!),
        },
        if (_phone.text.trim().isNotEmpty) 'primary_phone': _phone.text.trim(),
        if (_email.text.trim().isNotEmpty) 'primary_email': _email.text.trim(),
        if (_address.text.trim().isNotEmpty)
          'addresses': [
            {
              'address_type': 'home',
              'address_line_1': _address.text.trim(),
            }
          ],
      };
      final created = await ref.read(customersRepoProvider).create(body: body);
      // Si l'OCR a produit un document, on le rattache au client créé pour
      // qu'il apparaisse dans son dossier KYC.
      if (_scannedDocId != null) {
        try {
          await ref.read(customersRepoProvider).linkDocument(
                documentId: _scannedDocId!,
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

  String _friendly(Object e) {
    final msg = e.toString();
    final match = RegExp(r'status code of (\d+)').firstMatch(msg);
    if (match != null) {
      final code = int.parse(match[1]!);
      if (code == 422) return 'Les informations saisies ne sont pas valides.';
      if (code == 403) return 'Vous n\'avez pas la permission de créer un client.';
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

  String _titleCase(String s) {
    return s.toLowerCase().split(RegExp(r'\s+')).map((w) {
      if (w.isEmpty) return w;
      return w[0].toUpperCase() + w.substring(1);
    }).join(' ');
  }

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return Scaffold(
      appBar: AppBar(title: const Text('Nouveau client')),
      body: ModuleBackground(
        child: SafeArea(
          child: Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                _ScanCard(
                  photoPath: _cinPhotoPath,
                  scanning: _scanning,
                  notice: _scanNotice,
                  duplicate: _duplicate,
                  onCamera: () => _scanCin(source: ImageSource.camera),
                  onGallery: () => _scanCin(source: ImageSource.gallery),
                  onClear: () => setState(() {
                    _cinPhotoPath = null;
                    _scannedDocId = null;
                    _scanNotice = null;
                    _duplicate = null;
                  }),
                  onOpenDuplicate: () {
                    if (_duplicate == null) return;
                    Navigator.of(context).pushReplacement(MaterialPageRoute(
                      builder: (_) => CustomerDetailScreen(id: _duplicate!.id),
                    ));
                  },
                ),
                const SizedBox(height: 12),
                ModuleCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Identité',
                          style: TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Expanded(
                            child: TextFormField(
                              controller: _firstName,
                              textCapitalization: TextCapitalization.words,
                              decoration: const InputDecoration(
                                  labelText: 'Prénom *'),
                              validator: (v) => v == null || v.trim().isEmpty
                                  ? 'Prénom requis'
                                  : null,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: TextFormField(
                              controller: _lastName,
                              textCapitalization: TextCapitalization.words,
                              decoration: const InputDecoration(
                                  labelText: 'Nom *'),
                              validator: (v) => v == null || v.trim().isEmpty
                                  ? 'Nom requis'
                                  : null,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      TextFormField(
                        controller: _cin,
                        textCapitalization: TextCapitalization.characters,
                        decoration: const InputDecoration(
                          labelText: 'CIN',
                          hintText: 'ex. AB123456',
                        ),
                      ),
                      const SizedBox(height: 10),
                      InkWell(
                        onTap: _pickBirthDate,
                        child: InputDecorator(
                          decoration: const InputDecoration(
                            labelText: 'Date de naissance',
                            suffixIcon: Icon(Icons.event),
                          ),
                          child: Text(_birthDate != null
                              ? dateFmt.format(_birthDate!)
                              : 'Choisir'),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                ModuleCard(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Contact',
                          style: TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 10),
                      TextFormField(
                        controller: _phone,
                        keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(
                          labelText: 'Téléphone',
                          hintText: '06 00 00 00 00',
                        ),
                      ),
                      const SizedBox(height: 10),
                      TextFormField(
                        controller: _email,
                        keyboardType: TextInputType.emailAddress,
                        decoration:
                            const InputDecoration(labelText: 'Email'),
                      ),
                      const SizedBox(height: 10),
                      TextFormField(
                        controller: _address,
                        maxLines: 2,
                        decoration:
                            const InputDecoration(labelText: 'Adresse'),
                      ),
                    ],
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(12),
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
}

class _ScanCard extends StatelessWidget {
  const _ScanCard({
    required this.photoPath,
    required this.scanning,
    required this.notice,
    required this.duplicate,
    required this.onCamera,
    required this.onGallery,
    required this.onClear,
    required this.onOpenDuplicate,
  });

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
    return ModuleCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.credit_card, size: 18, color: Colors.black54),
              SizedBox(width: 6),
              Text('Scanner la CIN',
                  style:
                      TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
            ],
          ),
          const SizedBox(height: 6),
          const Text(
            'Prenez une photo nette de la carte, recto. L\'OCR remplit les champs ci-dessous.',
            style: TextStyle(color: Colors.black54, fontSize: 12),
          ),
          const SizedBox(height: 12),
          if (photoPath != null) ...[
            Stack(
              alignment: Alignment.topRight,
              children: [
                ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: AspectRatio(
                    aspectRatio: 16 / 10,
                    child: kIsWeb
                        ? Image.network(photoPath!, fit: BoxFit.cover)
                        : Image.file(io.File(photoPath!), fit: BoxFit.cover),
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
                          padding: EdgeInsets.all(4),
                          child:
                              Icon(Icons.close, size: 16, color: Colors.white),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
          ] else
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: scanning ? null : onCamera,
                    icon: const Icon(Icons.photo_camera),
                    label: const Text('Photo'),
                    style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(46)),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: scanning ? null : onGallery,
                    icon: const Icon(Icons.photo_library_outlined),
                    label: const Text('Galerie'),
                    style: OutlinedButton.styleFrom(
                        minimumSize: const Size.fromHeight(46)),
                  ),
                ),
              ],
            ),
          if (scanning) ...[
            const SizedBox(height: 10),
            const Row(
              children: [
                SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2.4)),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'OCR en cours…',
                    style:
                        TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
                  ),
                ),
              ],
            ),
          ],
          if (notice != null) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: const Color(0xFFEEF0FB),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(notice!,
                  style: const TextStyle(
                      fontSize: 12, color: Colors.black87)),
            ),
          ],
          if (duplicate != null) ...[
            const SizedBox(height: 10),
            InkWell(
              onTap: onOpenDuplicate,
              borderRadius: BorderRadius.circular(12),
              child: Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.amber.shade50,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.amber.shade300),
                ),
                child: Row(
                  children: [
                    Icon(Icons.warning_amber,
                        color: Colors.amber.shade800),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Ce client existe déjà',
                              style: TextStyle(
                                  color: Colors.amber.shade900,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 13)),
                          Text(
                            '${duplicate!.displayName ?? '—'} · ${duplicate!.code}',
                            style: TextStyle(
                                color: Colors.amber.shade900, fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                    Icon(Icons.arrow_forward_ios,
                        size: 14, color: Colors.amber.shade800),
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
