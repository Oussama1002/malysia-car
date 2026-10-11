<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Vehicle;
use App\Models\VehicleBrand;
use App\Models\VehicleModel;
use App\Models\WebsiteLead;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class PublicSiteController extends Controller
{
    public function vehicles(NotificationService $notifications): JsonResponse
    {
        $vehicles = Cache::remember('public_site.vehicles', 300, function () {
            return Vehicle::query()
                ->withoutGlobalScopes()
                ->with(['brand', 'model'])
                ->whereNull('deleted_at')
                ->whereIn('status', ['AVAILABLE', 'RENTED', 'RESERVED'])
                ->orderBy('daily_rental_price')
                ->limit(500)
                ->get()
                ->map(fn (Vehicle $v) => [
                    'id' => $v->id,
                    'brand' => $v->brand?->name ?? $v->brand_name,
                    'model' => $v->model?->model_name ?? $v->model?->name ?? $v->model_name,
                    'year' => $v->year,
                    'fuel' => $v->fuel_type,
                    'transmission' => $v->transmission,
                    'categorie' => $v->categorie,
                    'price_per_day' => $v->daily_rental_price !== null ? (float) $v->daily_rental_price : null,
                    'price_from_per_day' => $v->minTierDailyPrice(),
                    'photo_url' => $v->photo_file_id ? '/api/v1/files/'.$v->photo_file_id : null,
                    'seats' => $v->nombre_places !== null ? (int) $v->nombre_places : null,
                    'doors' => $v->nombre_portes !== null ? (int) $v->nombre_portes : null,
                    'equipments' => $v->equipments ?? [],
                ])
                ->values()
                ->all();
        });

        $this->alertMissingPrices($vehicles, $notifications);

        return ApiResponse::success($vehicles);
    }

    private function alertMissingPrices(array $vehicles, NotificationService $notifications): void
    {
        foreach ($vehicles as $v) {
            if (! empty($v['price_per_day'])) {
                continue;
            }
            $key = 'public_site.pricing_alert:'.$v['id'];
            if (Cache::has($key)) {
                continue;
            }
            $label = trim(($v['brand'] ?? '').' '.($v['model'] ?? '')) ?: 'Véhicule sans marque';
            try {
                $notifications->notifyRoles(
                    roleCodes: ['ADMIN', 'GESTIONNAIRE_FLOTTE'],
                    category: 'fleet.price_missing',
                    title: 'Tarif à définir pour un véhicule du site',
                    body: $label.' est affiché sur la landing sans prix / jour. Merci de renseigner le tarif.',
                    module: 'fleet',
                    priority: 'high',
                    linkUrl: '/fleet/'.$v['id'],
                );
                Cache::put($key, true, now()->addDay());
            } catch (\Throwable) {
            }
        }
    }

    public function catalog(): JsonResponse
    {
        $data = Cache::remember('public_site.catalog', 3600, function () {
            $brandRows = VehicleBrand::query()
                ->orderBy('name')
                ->get(['id', 'name'])
                ->map(fn (VehicleBrand $b) => [
                    'id' => $b->id,
                    'name' => $b->name,
                ])
                ->all();

            $modelRows = VehicleModel::query()
                ->with('brand:id,name')
                ->orderBy('name')
                ->get(['id', 'brand_id', 'name'])
                ->map(fn (VehicleModel $m) => [
                    'id' => $m->id,
                    'name' => $m->name,
                    'brand_id' => $m->brand_id,
                    'brand_name' => $m->brand?->name,
                ])
                ->all();

            $vehicleBrandNames = Vehicle::query()
                ->withoutGlobalScopes()
                ->whereNull('deleted_at')
                ->whereNotNull('brand_name')
                ->where('brand_name', '!=', '')
                ->distinct()
                ->pluck('brand_name')
                ->all();
            $vehicleModelRows = Vehicle::query()
                ->withoutGlobalScopes()
                ->whereNull('deleted_at')
                ->whereNotNull('model_name')
                ->where('model_name', '!=', '')
                ->whereNotNull('brand_name')
                ->where('brand_name', '!=', '')
                ->distinct()
                ->get(['brand_name', 'model_name'])
                ->all();

            $brandByKey = [];
            foreach ($brandRows as $b) {
                $key = mb_strtolower(trim($b['name']));
                $brandByKey[$key] = $b;
            }
            foreach ($vehicleBrandNames as $name) {
                $key = mb_strtolower(trim((string) $name));
                if ($key === '' || isset($brandByKey[$key])) {
                    continue;
                }
                $brandByKey[$key] = [
                    'id' => 'name:'.$key,
                    'name' => $name,
                ];
            }
            $brands = array_values($brandByKey);
            usort($brands, fn ($a, $b) => strcmp($a['name'], $b['name']));

            $modelByKey = [];
            foreach ($modelRows as $m) {
                $key = mb_strtolower(trim(($m['brand_name'] ?? '').'|'.$m['name']));
                $modelByKey[$key] = $m;
            }
            foreach ($vehicleModelRows as $row) {
                $brandName = (string) $row->brand_name;
                $modelName = (string) $row->model_name;
                $key = mb_strtolower(trim($brandName.'|'.$modelName));
                if ($key === '|' || isset($modelByKey[$key])) {
                    continue;
                }
                $brandKey = mb_strtolower(trim($brandName));
                $brandId = $brandByKey[$brandKey]['id'] ?? ('name:'.$brandKey);
                $modelByKey[$key] = [
                    'id' => 'name:'.$key,
                    'name' => $modelName,
                    'brand_id' => $brandId,
                    'brand_name' => $brandName,
                ];
            }
            $models = array_values($modelByKey);
            usort($models, function ($a, $b) {
                $c = strcmp((string) ($a['brand_name'] ?? ''), (string) ($b['brand_name'] ?? ''));
                return $c !== 0 ? $c : strcmp((string) $a['name'], (string) $b['name']);
            });

            return [
                'brands' => $brands,
                'models' => $models,
            ];
        });

        return ApiResponse::success($data);
    }

    public function storeLead(Request $request, NotificationService $notifications): JsonResponse
    {
        $data = $request->validate([
            'full_name' => ['required', 'string', 'max:160'],
            'phone' => ['required', 'string', 'max:40'],
            'email' => ['nullable', 'email', 'max:160'],
            'city' => ['nullable', 'string', 'max:120'],
            'vehicle_id' => ['nullable', 'uuid'],
            'vehicle_label' => ['nullable', 'string', 'max:160'],
            'pickup_at' => ['nullable', 'date'],
            'return_at' => ['nullable', 'date', 'after_or_equal:pickup_at'],
            'message' => ['nullable', 'string', 'max:2000'],
            'website' => ['nullable', 'string', 'max:0'],
        ], [
            'return_at.after_or_equal' => 'La date de retour doit suivre la date de départ.',
        ]);

        $lead = WebsiteLead::query()->create([
            'company_id' => $this->defaultCompanyId(),
            'full_name' => $data['full_name'],
            'phone' => $data['phone'],
            'email' => $data['email'] ?? null,
            'city' => $data['city'] ?? null,
            'vehicle_id' => $data['vehicle_id'] ?? null,
            'vehicle_label' => $data['vehicle_label'] ?? null,
            'pickup_at' => $data['pickup_at'] ?? null,
            'return_at' => $data['return_at'] ?? null,
            'message' => $data['message'] ?? null,
            'status' => WebsiteLead::STATUS_NEW,
            'ip_address' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 255),
        ]);

        try {
            $notifications->notifyRoles(
                roleCodes: ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL'],
                category: 'sales.website_lead',
                title: 'Nouvelle demande du site',
                body: $lead->full_name.' — '.$lead->phone
                    .($lead->vehicle_label ? ' · '.$lead->vehicle_label : '')
                    .($lead->pickup_at ? ' · du '.$lead->pickup_at->format('d/m/Y') : '')
                    .($lead->return_at ? ' au '.$lead->return_at->format('d/m/Y') : ''),
                module: 'rentals',
                priority: 'high',
                entity: $lead,
                linkUrl: '/rentals/website-leads',
            );
        } catch (\Throwable) {
        }

        return ApiResponse::success([
            'reference' => strtoupper(substr($lead->id, 0, 8)),
        ], null, null, 201);
    }

    public function branches(): JsonResponse
    {
        $branches = Cache::remember('public_site.branches', 3600, function () {
            return \App\Models\Branch::query()
                ->where('is_active', true)
                ->orderBy('name')
                ->get()
                ->map(fn (\App\Models\Branch $b) => [
                    'id' => $b->id,
                    'name' => $b->name,
                    'city' => $b->city,
                    'phone' => $b->phone,
                    'email' => $b->email,
                ])
                ->values()
                ->all();
        });

        return ApiResponse::success($branches);
    }

    private function defaultCompanyId(): ?string
    {
        return Cache::remember(
            'public_site.company_id',
            3600,
            fn () => \DB::table('companies')->orderBy('created_at')->value('id'),
        );
    }
}
