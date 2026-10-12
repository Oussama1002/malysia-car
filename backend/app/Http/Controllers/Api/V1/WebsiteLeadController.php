<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Vehicle;
use App\Models\WebsiteLead;
use App\Services\AuditLogger;
use App\Services\RentalAvailabilityService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class WebsiteLeadController extends Controller
{
    public function __construct(private readonly RentalAvailabilityService $availability) {}

    public function index(Request $request): JsonResponse
    {
        $q = WebsiteLead::query()
            ->with(['handler', 'vehicle:id,registration_number,brand_id,model_id'])
            ->orderByDesc('created_at');

        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($search = $request->query('search')) {
            $q->where(function ($w) use ($search) {
                $w->where('full_name', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $page = $q->paginate(min(100, max(1, (int) $request->query('per_page', 50))));

        // Pour chaque demande qui vise un véhicule précis sur une période
        // donnée, on calcule la disponibilité à la volée. Le frontend affiche
        // alors un avertissement si la voiture est déjà prise.
        $items = collect($page->items())->map(function (WebsiteLead $lead) {
            $arr = $lead->toArray();
            $arr['availability'] = $this->computeAvailability($lead);
            return $arr;
        })->all();

        return ApiResponse::success($items, [
            'current_page' => $page->currentPage(),
            'last_page' => $page->lastPage(),
            'total' => $page->total(),
            'new_count' => WebsiteLead::query()->where('status', WebsiteLead::STATUS_NEW)->count(),
        ]);
    }

    /**
     * @return array{available: bool|null, reasons?: string[], messages?: array<string,string>}
     */
    private function computeAvailability(WebsiteLead $lead): array
    {
        if (! $lead->vehicle_id || ! $lead->pickup_at || ! $lead->return_at) {
            return ['available' => null];
        }
        try {
            $r = $this->availability->checkVehicleAvailability(
                vehicleId: (string) $lead->vehicle_id,
                startAt: Carbon::parse($lead->pickup_at),
                endAt: Carbon::parse($lead->return_at),
            );
            return [
                'available' => (bool) $r['available'],
                'reasons' => $r['reasons'] ?? [],
                'messages' => $r['messages'] ?? [],
            ];
        } catch (\Throwable $e) {
            // La notif n'est pas critique — on reste silencieux pour ne pas
            // casser la liste si la vérif échoue (véhicule introuvable, etc.).
            return ['available' => null];
        }
    }

    public function missingPrices(): JsonResponse
    {
        $all = Vehicle::query()
            ->withoutGlobalScopes()
            ->with(['brand', 'model'])
            ->whereNull('deleted_at')
            ->whereIn('status', ['AVAILABLE', 'RENTED', 'RESERVED'])
            ->orderByRaw('daily_rental_price IS NOT NULL, daily_rental_price')
            ->limit(500)
            ->get();

        $missingCount = $all->filter(fn (Vehicle $v) => $v->daily_rental_price === null
            || (float) $v->daily_rental_price <= 0)->count();

        $rows = $all->map(fn (Vehicle $v) => [
                'id' => $v->id,
                'brand' => $v->brand?->name ?? $v->brand_name,
                'model' => $v->model?->model_name ?? $v->model?->name ?? $v->model_name,
                'year' => $v->year,
                'registration' => $v->registration_number,
                'fuel' => $v->fuel_type,
                'transmission' => $v->transmission,
                'categorie' => $v->categorie,
                'photo_url' => $v->photo_file_id ? '/api/v1/files/'.$v->photo_file_id : null,
                'daily_rental_price' => $v->daily_rental_price !== null ? (float) $v->daily_rental_price : null,
                'rental_price_tiers' => $v->rental_price_tiers ?? [],
            ])
            ->values()
            ->all();

        return ApiResponse::success($rows, [
            'total' => count($rows),
            'missing_count' => $missingCount,
            'tier_schema' => array_map(
                fn ($k, $v) => ['key' => $k, 'min_days' => $v['min_days'], 'max_days' => $v['max_days'], 'label' => $v['label']],
                array_keys(Vehicle::RENTAL_PRICE_TIERS),
                array_values(Vehicle::RENTAL_PRICE_TIERS),
            ),
        ]);
    }

    public function setPrice(Request $request, Vehicle $vehicle): JsonResponse
    {
        $rules = [
            'daily_rental_price' => ['nullable', 'numeric', 'min:0'],
            'tiers' => ['nullable', 'array'],
        ];
        foreach (array_keys(Vehicle::RENTAL_PRICE_TIERS) as $key) {
            $rules['tiers.'.$key] = ['nullable', 'numeric', 'min:0'];
        }
        $data = $request->validate($rules);

        $tiers = $data['tiers'] ?? null;
        if (is_array($tiers)) {
            $clean = [];
            foreach (array_keys(Vehicle::RENTAL_PRICE_TIERS) as $key) {
                $v = $tiers[$key] ?? null;
                if (is_numeric($v) && (float) $v > 0) {
                    $clean[$key] = (float) $v;
                }
            }
            if (! isset($clean['tier_1_2'])) {
                return response()->json([
                    'message' => 'Le palier 1-2 jours est obligatoire.',
                    'errors' => ['tiers.tier_1_2' => ['Le prix du palier 1-2 jours est obligatoire.']],
                ], 422);
            }
            $vehicle->rental_price_tiers = $clean;
            $vehicle->daily_rental_price = $clean['tier_1_2'];
        } elseif (array_key_exists('daily_rental_price', $data) && $data['daily_rental_price'] !== null) {
            $vehicle->daily_rental_price = $data['daily_rental_price'];
            $vehicle->rental_price_tiers = null;
        } else {
            return response()->json([
                'message' => 'Prix manquant.',
                'errors' => ['daily_rental_price' => ['Prix manquant.']],
            ], 422);
        }

        $vehicle->save();

        Cache::forget('public_site.vehicles');
        Cache::forget('public_site.pricing_alert:'.$vehicle->id);

        AuditLogger::updated($vehicle, $request->user(), request: $request);

        return ApiResponse::success([
            'id' => $vehicle->id,
            'daily_rental_price' => (float) $vehicle->daily_rental_price,
            'rental_price_tiers' => $vehicle->rental_price_tiers,
        ]);
    }

    public function update(Request $request, WebsiteLead $lead): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'in:new,contacted,converted,rejected'],
            'handling_notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $before = $lead->status;
        $lead->update([
            'status' => $data['status'],
            'handling_notes' => $data['handling_notes'] ?? $lead->handling_notes,
            'handled_by' => $request->user()?->id,
            'handled_at' => now(),
        ]);

        AuditLogger::statusChanged($lead, $before, $data['status'], $request->user(), $request, 'rentals');

        return ApiResponse::success($lead->fresh('handler'));
    }

    public function destroy(Request $request, WebsiteLead $lead): JsonResponse
    {
        AuditLogger::deleted($lead, $request->user(), request: $request);
        $lead->delete();

        return ApiResponse::success(['id' => $lead->id, 'deleted' => true]);
    }
}
