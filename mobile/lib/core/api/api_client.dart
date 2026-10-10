import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_storage.dart';
import '../config/app_config.dart';

/// Le client HTTP partagé par toute l'app : un seul Dio, un seul intercepteur,
/// qui ajoute le jeton Sanctum à chaque requête et laisse passer les erreurs
/// de l'API telles qu'elles sont (401, 403, 422…) sans les transformer.
class ApiClient {
  ApiClient(this._storage) {
    _dio = Dio(BaseOptions(
      baseUrl: AppConfig.apiBaseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 20),
      // L'API Laravel renvoie du JSON sur toutes les routes qu'on utilise ;
      // l'annoncer évite les surprises en cas d'erreur HTML renvoyée par PHP.
      headers: {
        'Accept': 'application/json',
      },
    ));

    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _storage.readToken();
        if (token != null && token.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
    ));
  }

  final AuthStorage _storage;
  late final Dio _dio;

  Dio get raw => _dio;

  /// Appel GET qui déballe l'enveloppe {"data": ...} de l'API.
  Future<dynamic> getData(String path, {Map<String, dynamic>? query}) async {
    final response = await _dio.get(path, queryParameters: query);
    return _unwrap(response.data);
  }

  /// Appel POST qui déballe aussi {"data": ...}.
  Future<dynamic> postData(String path, {dynamic body}) async {
    final response = await _dio.post(path, data: body);
    return _unwrap(response.data);
  }

  /// L'API DriveFlow enveloppe tout dans {"data": ...}. On déballe ici une
  /// seule fois, pour que les dépôts n'aient pas à y penser.
  dynamic _unwrap(dynamic payload) {
    if (payload is Map && payload.containsKey('data')) {
      return payload['data'];
    }
    return payload;
  }
}

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient(ref.watch(authStorageProvider));
});
