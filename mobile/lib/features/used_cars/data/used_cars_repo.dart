import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/api_client.dart';
import 'used_car_dto.dart';

class UsedCarsRepo {
  UsedCarsRepo(this._api);
  final ApiClient _api;

  Future<List<UsedCarDto>> list({int perPage = 100}) async {
    final data =
        await _api.getData('/used-cars', query: {'per_page': perPage});
    if (data is! List) return const [];
    return data
        .whereType<Map<String, dynamic>>()
        .map(UsedCarDto.fromJson)
        .toList();
  }
}

final usedCarsRepoProvider = Provider<UsedCarsRepo>(
    (ref) => UsedCarsRepo(ref.watch(apiClientProvider)));

final usedCarsListProvider = FutureProvider<List<UsedCarDto>>(
    (ref) => ref.watch(usedCarsRepoProvider).list());
