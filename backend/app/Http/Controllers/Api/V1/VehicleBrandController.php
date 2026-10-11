<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\File;
use App\Models\Vehicle;
use App\Models\VehicleBrand;
use App\Models\VehicleModel;
use App\Services\DocumentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class VehicleBrandController extends Controller
{
    public function index(): JsonResponse
    {
        $brands = VehicleBrand::with('models')->orderBy('name')->get();

        return ApiResponse::success($brands->map(fn ($b) => $this->serialize($b)));
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

    public function updateBrand(Request $request, string $id): JsonResponse
    {
        $brand = VehicleBrand::query()->findOrFail($id);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
        ]);

        $taken = VehicleBrand::query()
            ->whereKeyNot($brand->id)
            ->whereRaw('LOWER(name) = ?', [mb_strtolower(trim($data['name']))])
            ->exists();
        if ($taken) {
            return ApiResponse::error('Une marque porte déjà ce nom.', 422);
        }

        $brand->name = trim($data['name']);
        $brand->save();

        return ApiResponse::success($this->serialize($brand->load('models')));
    }

    /** Logo téléversé par l'agence, servi ensuite par /v1/files/{id}. */
    public function uploadLogo(Request $request, string $id, DocumentService $documents): JsonResponse
    {
        $brand = VehicleBrand::query()->findOrFail($id);
        $request->validate([
            'file' => ['required', 'file', 'max:2048', 'mimes:png,jpg,jpeg,webp,svg'],
        ]);

        $file = $documents->storeUploadedFile($request->file('file'), $request->user(), 'brand-logos');
        // Le logo s'affiche dans une balise <img> : il doit être servi sans jeton.
        $file->is_public = true;
        $file->save();

        $brand->logo_file_id = $file->id;
        $brand->save();

        return ApiResponse::success($this->serialize($brand->load('models')));
    }

    public function deleteLogo(string $id): JsonResponse
    {
        $brand = VehicleBrand::query()->findOrFail($id);
        $brand->logo_file_id = null;
        $brand->save();

        return ApiResponse::success($this->serialize($brand->load('models')));
    }

    public function destroyBrand(string $id): JsonResponse
    {
        $brand = VehicleBrand::query()->findOrFail($id);

        $used = Vehicle::query()->where('brand_id', $brand->id)->count();
        if ($used > 0) {
            return ApiResponse::error(
                'Impossible de supprimer « '.$brand->name.' » : '.$used.' véhicule(s) utilisent cette marque.',
                422,
            );
        }

        $brand->models()->delete();
        $brand->delete();

        return ApiResponse::message('Marque supprimée');
    }

    public function updateModel(Request $request, string $id): JsonResponse
    {
        $model = VehicleModel::query()->findOrFail($id);
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
        ]);

        $taken = VehicleModel::query()
            ->where('brand_id', $model->brand_id)
            ->whereKeyNot($model->id)
            ->whereRaw('LOWER(name) = ?', [mb_strtolower(trim($data['name']))])
            ->exists();
        if ($taken) {
            return ApiResponse::error('Cette marque a déjà un modèle portant ce nom.', 422);
        }

        $model->name = trim($data['name']);
        $model->save();

        return ApiResponse::success(['id' => $model->id, 'name' => $model->name]);
    }

    public function destroyModel(string $id): JsonResponse
    {
        $model = VehicleModel::query()->findOrFail($id);

        $used = Vehicle::query()->where('model_id', $model->id)->count();
        if ($used > 0) {
            return ApiResponse::error(
                'Impossible de supprimer « '.$model->name.' » : '.$used.' véhicule(s) utilisent ce modèle.',
                422,
            );
        }

        $model->delete();

        return ApiResponse::message('Modèle supprimé');
    }

    /** @return array<string, mixed> */
    private function serialize(VehicleBrand $brand): array
    {
        $logoUrl = null;
        if (! empty($brand->logo_file_id) && File::query()->whereKey($brand->logo_file_id)->exists()) {
            $logoUrl = '/v1/files/'.$brand->logo_file_id;
        }

        return [
            'id' => $brand->id,
            'name' => $brand->name,
            'logoUrl' => $logoUrl,
            'vehiclesCount' => Vehicle::query()->where('brand_id', $brand->id)->count(),
            'models' => $brand->models->sortBy('name')->map(fn ($m) => [
                'id' => $m->id,
                'name' => $m->name,
                'vehiclesCount' => Vehicle::query()->where('model_id', $m->id)->count(),
            ])->values(),
        ];
    }
}
