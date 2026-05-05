<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\VehicleBrand;
use App\Models\VehicleModel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VehicleBrandController extends Controller
{
    public function index(): JsonResponse
    {
        $brands = VehicleBrand::with('models')->orderBy('name')->get();

        return ApiResponse::success($brands->map(fn ($b) => [
            'id'     => $b->id,
            'name'   => $b->name,
            'models' => $b->models->sortBy('name')->map(fn ($m) => [
                'id'   => $m->id,
                'name' => $m->name,
            ])->values(),
        ]));
    }

    public function storeBrand(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
        ]);

        $existing = VehicleBrand::query()
            ->whereRaw('LOWER(name) = ?', [mb_strtolower(trim($data['name']))])
            ->first();

        $brand = $existing ?? VehicleBrand::create([
            'name' => trim($data['name']),
        ]);

        return ApiResponse::success([
            'id' => $brand->id,
            'name' => $brand->name,
        ], null, null, $existing ? 200 : 201);
    }

    public function storeModel(Request $request): JsonResponse
    {
        $data = $request->validate([
            'brand_id' => ['required', 'uuid', 'exists:vehicle_brands,id'],
            'name' => ['required', 'string', 'max:120'],
        ]);

        $existing = VehicleModel::query()
            ->where('brand_id', $data['brand_id'])
            ->whereRaw('LOWER(name) = ?', [mb_strtolower(trim($data['name']))])
            ->first();

        $model = $existing ?? VehicleModel::create([
            'brand_id' => $data['brand_id'],
            'name' => trim($data['name']),
        ]);

        return ApiResponse::success([
            'id' => $model->id,
            'name' => $model->name,
            'brand_id' => $model->brand_id,
        ], null, null, $existing ? 200 : 201);
    }
}
