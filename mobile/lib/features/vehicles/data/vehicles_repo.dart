import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import 'vehicle_detail_dto.dart';
import 'vehicle_dto.dart';

class VehicleBrandDto {
  const VehicleBrandDto({required this.id, required this.name, this.models = const []});
  final String id;
  final String name;
  final List<VehicleModelDto> models;

  factory VehicleBrandDto.fromJson(Map<String, dynamic> j) {
    final rawModels = j['models'];
    return VehicleBrandDto(
      id: j['id']?.toString() ?? '',
      name: j['name']?.toString() ?? '',
      models: rawModels is List
          ? rawModels
              .whereType<Map>()
              .map((m) => VehicleModelDto.fromJson(
                  m.map((k, v) => MapEntry(k.toString(), v))))
              .toList()
          : const [],
    );
  }
}

class VehicleModelDto {
  const VehicleModelDto({required this.id, required this.name});
  final String id;
  final String name;

  factory VehicleModelDto.fromJson(Map<String, dynamic> j) => VehicleModelDto(
        id: j['id']?.toString() ?? '',
        name: j['name']?.toString() ?? '',
      );
}

class VehiclesRepo {
  VehiclesRepo(this._api);
  final ApiClient _api;

  Future<List<VehicleDto>> list({int perPage = 200}) async {
    final data = await _api.getData('/vehicles', query: {'per_page': perPage});
    if (data is! List) return const [];
    return data
        .whereType<Map<String, dynamic>>()
        .map(VehicleDto.fromJson)
        .toList();
  }

  Future<List<VehicleBrandDto>> listBrands() async {
    final data = await _api.getData('/vehicle-brands');
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((m) => VehicleBrandDto.fromJson(
            m.map((k, v) => MapEntry(k.toString(), v))))
        .toList();
  }

  Future<VehicleBrandDto> createBrand(String name) async {
    final data =
        await _api.postData('/vehicle-brands', body: {'name': name.trim()});
    final map = data is Map<String, dynamic>
        ? data
        : (data as Map).map((k, v) => MapEntry(k.toString(), v));
    return VehicleBrandDto.fromJson(map);
  }

  Future<VehicleModelDto> createModel({
    required String brandId,
    required String name,
  }) async {
    final data = await _api.postData('/vehicle-models',
        body: {'brand_id': brandId, 'name': name.trim()});
    final map = data is Map<String, dynamic>
        ? data
        : (data as Map).map((k, v) => MapEntry(k.toString(), v));
    return VehicleModelDto.fromJson(map);
  }

  /// POST /vehicles — meme payload que StoreVehicleRequest cote web.
  Future<String> create(Map<String, dynamic> body) async {
    final data = await _api.postData('/vehicles', body: body);
    final map = data is Map<String, dynamic>
        ? data
        : (data as Map).map((k, v) => MapEntry(k.toString(), v));
    return map['id']?.toString() ?? '';
  }

  /// POST /vehicles/{id}/photo — même endpoint que le modal web. Le champ
  /// multipart est `photo`, pas `file`.
  Future<void> uploadMainPhoto({
    required String id,
    required String filePath,
  }) async {
    final multipart = await MultipartFile.fromFile(filePath);
    await _api.raw.post(
      '/vehicles/$id/photo',
      data: FormData.fromMap({'photo': multipart}),
    );
  }

  /// OCR : upload d'un document vehicule + extraction. Mode `sync=true`
  /// pour contourner la file d'attente (le worker n'est pas toujours à
  /// jour en prod) : le backend exécute Tesseract + parser dans la requête
  /// et nous renvoie l'extraction directement — plus de polling fragile.
  /// Renvoie les champs extraits + l'id du document pour l'attacher au
  /// véhicule.
  Future<Map<String, dynamic>> scanDocument({
    String? filePath,
    List<int>? fileBytes,
    String? fileName,
    required String type,
  }) async {
    final MultipartFile multipart;
    if (fileBytes != null) {
      multipart = MultipartFile.fromBytes(fileBytes,
          filename: fileName ?? 'upload.jpg');
    } else if (filePath != null) {
      multipart = await MultipartFile.fromFile(filePath);
    } else {
      throw ArgumentError('scanDocument: filePath or fileBytes required');
    }
    final upload = await _api.raw.post(
      '/document-reader/uploads',
      data: FormData.fromMap({'file': multipart, 'document_type': type}),
    );
    final uploadData = upload.data['data'] ?? upload.data;
    final docId = (uploadData is Map ? uploadData['id'] : null)?.toString();
    if (docId == null) throw Exception('Réponse upload sans identifiant.');

    // Appel synchrone : Tesseract tourne pendant la requête HTTP (jusqu'à
    // ~2 min). On s'offre un receiveTimeout long juste pour cet appel au
    // lieu des 20 s par défaut, sinon Dio tue la connexion avant la fin.
    final resp = await _api.raw.post(
      '/document-reader/documents/$docId/extract',
      data: {'document_type': type, 'sync': true},
      options: Options(
        receiveTimeout: const Duration(seconds: 180),
        sendTimeout: const Duration(seconds: 60),
      ),
    );
    final body = resp.data;
    final doc = body is Map ? (body['data'] ?? body) : body;
    if (doc is! Map) {
      throw Exception('Réponse extract inattendue.');
    }
    final docMap = doc.map((k, v) => MapEntry(k.toString(), v));
    final status = docMap['status']?.toString();
    if (status == 'failed') {
      throw Exception(
          docMap['error_message']?.toString() ?? 'Échec OCR.');
    }
    if (status != 'extracted' && status != 'validated') {
      // Le mode sync devrait toujours renvoyer un état terminal ; si ce
      // n'est pas le cas, repli vers un court polling pour couvrir le cas
      // où `sync=true` est ignoré par un ancien backend.
      for (var i = 0; i < 20; i++) {
        await Future<void>.delayed(Duration(seconds: i < 5 ? 1 : 3));
        final poll = await _api.getData('/document-reader/documents/$docId');
        if (poll is Map) {
          final p = poll.map((k, v) => MapEntry(k.toString(), v));
          final s = p['status']?.toString();
          if (s == 'extracted' || s == 'validated') {
            return _unpackExtraction(docId, p);
          }
          if (s == 'failed') {
            throw Exception(
                p['error_message']?.toString() ?? 'Échec OCR.');
          }
        }
      }
      throw Exception('OCR trop long — réessayez.');
    }
    return _unpackExtraction(docId, docMap);
  }

  Map<String, dynamic> _unpackExtraction(
      String docId, Map<String, dynamic> docMap) {
    final extraction = docMap['extraction'];
    final data = extraction is Map ? extraction['extracted_data'] : null;
    final fields = <String, dynamic>{};
    if (data is Map) {
      data.forEach((k, v) => fields[k.toString()] = v);
    }
    return {'document_id': docId, 'fields': fields};
  }

  /// Rattache un scan OCR (ReaderDocument) à une entité véhicule. Le
  /// backend crée en même temps un entity_attachment pour que le fichier
  /// apparaisse sous l'onglet Documents du véhicule et sur Check-In /
  /// Check-Out.
  Future<void> linkReaderDocumentToVehicle({
    required String readerDocumentId,
    required String vehicleId,
  }) async {
    await _api.raw.post(
      '/document-reader/documents/$readerDocumentId/link',
      data: {'entity_type': 'vehicle', 'entity_id': vehicleId},
    );
  }

  Future<VehicleDetailDto> fetchDetail(String id) async {
    final data = await _api.getData('/vehicles/$id');
    if (data is Map) {
      final map = data is Map<String, dynamic>
          ? data
          : data.map((k, v) => MapEntry(k.toString(), v));
      return VehicleDetailDto.fromJson(map);
    }
    throw Exception('Réponse inattendue pour la fiche véhicule.');
  }

  /// Enregistre un entretien. La preuve (photo) est facultative : si fournie,
  /// elle part dans la même requête multipart.
  Future<void> createMaintenance({
    required String vehicleId,
    required String type,
    required String title,
    String? description,
    DateTime? performedAt,
    int? odometerKm,
    String? vendor,
    double? costMad,
    String? proofPath,
  }) async {
    final form = <String, dynamic>{
      'type': type,
      'title': title,
      if (description != null && description.isNotEmpty) 'description': description,
      if (performedAt != null) 'performed_at': performedAt.toIso8601String().substring(0, 10),
      if (odometerKm != null) 'odometer_km': odometerKm,
      if (vendor != null && vendor.isNotEmpty) 'vendor': vendor,
      if (costMad != null) 'cost_mad': costMad,
      if (proofPath != null)
        'proof_document': await MultipartFile.fromFile(proofPath),
    };
    await _api.raw.post(
      '/vehicles/$vehicleId/maintenance-events',
      data: FormData.fromMap(form),
    );
  }

  Future<void> createMovement({
    required String vehicleId,
    required String type,
    int? odometerKm,
    double? fuelLevel,
    String? notes,
  }) async {
    final body = <String, dynamic>{
      if (odometerKm != null) 'odometer_km': odometerKm,
      if (fuelLevel != null) 'fuel_level': fuelLevel,
      if (notes != null && notes.isNotEmpty) 'condition_notes': notes,
    };
    await _api.raw.post('/vehicles/$vehicleId/movements/$type', data: body);
  }

  Future<void> changeStatus({
    required String vehicleId,
    required String status,
    String? note,
  }) async {
    await _api.raw.put('/vehicles/$vehicleId', data: {
      'status': status,
      if (note != null && note.isNotEmpty) 'status_note': note,
    });
  }
}

final vehiclesRepoProvider =
    Provider<VehiclesRepo>((ref) => VehiclesRepo(ref.watch(apiClientProvider)));

final vehiclesListProvider = FutureProvider<List<VehicleDto>>(
    (ref) => ref.watch(vehiclesRepoProvider).list());

final vehicleBrandsProvider = FutureProvider<List<VehicleBrandDto>>(
    (ref) => ref.watch(vehiclesRepoProvider).listBrands());

final vehicleDetailProvider =
    FutureProvider.family<VehicleDetailDto, String>((ref, id) {
  return ref.watch(vehiclesRepoProvider).fetchDetail(id);
});
