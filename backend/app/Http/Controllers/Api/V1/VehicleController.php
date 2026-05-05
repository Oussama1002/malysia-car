<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Fleet\StoreVehicleRequest;
use App\Http\Requests\Api\V1\Fleet\UpdateVehicleRequest;
use App\Http\Resources\VehicleResource;
use App\Http\Responses\ApiResponse;
use App\Models\ComplianceAlert;
use App\Models\Vehicle;
use App\Models\VehicleStatusHistory;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class VehicleController extends Controller
{
    private function statusHistoryActorId(): ?int
    {
        $id = auth()->id();
        if ($id === null) {
            return null;
        }

        $idStr = (string) $id;
        if (! ctype_digit($idStr)) {
            return null;
        }

        return (int) $idStr;
    }

    public function index(Request $request): JsonResponse
    {
        $q = Vehicle::query()->with(['brand', 'model']);

        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($search = $request->query('search')) {
            $q->where(function ($w) use ($search) {
                $w->where('registration_number', 'like', "%{$search}%")
                    ->orWhere('vin', 'like', "%{$search}%")
                    ->orWhere('vehicle_code', 'like', "%{$search}%");
            });
        }
        if ($compliance = $request->query('compliance')) {
            $q->where(function ($b) use ($compliance) {
                if ($compliance === 'insurance_expired') {
                    $b->whereDate('insurance_expiry', '<', now()->toDateString());
                } elseif ($compliance === 'technical_expired') {
                    $b->whereDate('tech_control_expiry', '<', now()->toDateString());
                } elseif ($compliance === 'compliance_ok') {
                    // Matches list badge: no open compliance rows for this vehicle.
                    $b->whereDoesntHave('complianceAlerts', function ($w): void {
                        $w->where('status', 'open');
                    });
                }
            });
        }

        $per = min(100, max(1, (int) $request->query('per_page', 50)));
        $page = $q->orderByDesc('updated_at')->paginate($per);

        $rows = collect(VehicleResource::collection($page->items())->resolve($request))
            ->map(function (array $item): array {
                $openAlerts = ComplianceAlert::query()
                    ->where('vehicle_id', $item['id'])
                    ->where('status', 'open')
                    ->pluck('alert_type')
                    ->all();

                $item['complianceStatus'] = empty($openAlerts)
                    ? 'ok'
                    : (collect($openAlerts)->contains(fn ($type) => str_contains((string) $type, 'expired') || str_contains((string) $type, 'missing')) ? 'critical' : 'warning');
                $item['complianceAlerts'] = array_values($openAlerts);

                return $item;
            })
            ->values()
            ->all();

        return ApiResponse::success(
            $rows,
            [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ]
        );
    }

    public function store(StoreVehicleRequest $request): JsonResponse
    {
        $data = $request->validated();

        /** @var Vehicle $v */
        $v = DB::transaction(function () use ($data, $request) {
            $v = new Vehicle;
            $v->id = (string) Str::uuid();
            $v->vehicle_code = $data['vehicle_code'] ?? ('VEH-'.strtoupper(Str::random(8)));
            $v->registration_number = $data['registration'];
            $v->registration_card_number = $data['registration_card_number'] ?? null;
            $v->vin = $data['vin'] ?? null;
            $v->brand_id = $data['brand_id'] ?? null;
            $v->model_id = $data['model_id'] ?? null;
            $v->year = $data['year'] ?? null;
            $v->color = $data['color'] ?? null;
            $v->fuel_type = $data['fuel_type'] ?? null;
            $v->fiscal_power = $data['fiscal_power'] ?? null;
            $v->insurance_expiry = $data['insurance_expiry'] ?? null;
            $v->tech_control_expiry = $data['tech_control_expiry'] ?? null;
            $v->vignette_expiry = $data['vignette_expiry'] ?? null;
            $v->mileage_current = $data['mileage_km'] ?? null;
            $v->status = $data['status'] ?? 'AVAILABLE';
            $v->acquisition_type = $data['acquisition_type'] ?? null;
            $v->acquisition_date = $data['acquisition_date'] ?? null;
            $v->purchase_price = $data['purchase_price'] ?? null;
            $v->residual_value = $data['residual_value'] ?? null;
            $v->book_value = $data['book_value'] ?? null;
            $v->daily_rental_price = $data['daily_rental_price'] ?? null;
            $v->monthly_rental_price = $data['monthly_rental_price'] ?? null;
            $v->gps_enabled = $data['gps_enabled'] ?? false;
            $v->notes = $data['notes'] ?? null;
            $v->branch_id = $data['branch_id'] ?? null;
            $v->company_id = $data['company_id'] ?? $request->user()?->company_id;
            $v->save();

            VehicleStatusHistory::query()->create([
                'vehicle_id' => $v->id,
                'status' => (string) $v->status,
                'started_at' => now(),
                'note' => 'Initial status',
                'set_by' => $this->statusHistoryActorId(),
            ]);

            return $v->fresh(['brand', 'model']);
        });

        AuditLogger::created($v, $request->user(), request: $request);

        return ApiResponse::success((new VehicleResource($v))->resolve($request), null, null, 201);
    }

    public function show(Request $request, Vehicle $vehicle): JsonResponse
    {
        $vehicle->load([
            'brand',
            'model',
            'documents' => fn ($q) => $q->orderByDesc('created_at'),
            'statusHistory' => fn ($q) => $q->orderByDesc('started_at'),
            'maintenanceEvents' => fn ($q) => $q->orderByDesc('performed_at'),
            'odometerReadings' => fn ($q) => $q->orderByDesc('read_at'),
            'costProfile',
            'insurancePolicies' => fn ($q) => $q->orderByDesc('end_date'),
            'technicalInspections' => fn ($q) => $q->orderByDesc('inspection_date'),
            'complianceAlerts' => fn ($q) => $q->where('status', 'open')->orderByDesc('triggered_at'),
        ]);

        $currentMileage = $vehicle->odometerReadings->first()?->reading_km ?? $vehicle->mileage_current;
        $currentStatus = $vehicle->statusHistory->first()?->status ?? $vehicle->status;

        return ApiResponse::success([
            'vehicle' => (new VehicleResource($vehicle))->resolve($request),
            'current' => [
                'status' => $currentStatus,
                'mileageKm' => $currentMileage ? (int) $currentMileage : null,
                'customer' => null,
                'contract' => null,
            ],
            'documents' => $vehicle->documents,
            'statusHistory' => $vehicle->statusHistory,
            'maintenance' => $vehicle->maintenanceEvents,
            'insurancePolicies' => $vehicle->insurancePolicies,
            'technicalInspections' => $vehicle->technicalInspections,
            'complianceAlerts' => $vehicle->complianceAlerts,
            'odometer' => $vehicle->odometerReadings,
            'costProfile' => $vehicle->costProfile,
        ]);
    }

    public function update(UpdateVehicleRequest $request, Vehicle $vehicle): JsonResponse
    {
        $data = $request->validated();
        $before = $vehicle->getOriginal();

        /** @var Vehicle $v */
        $v = DB::transaction(function () use ($vehicle, $data) {
            $oldStatus = (string) $vehicle->status;

            if (array_key_exists('registration', $data)) {
                $vehicle->registration_number = $data['registration'];
            }
            if (array_key_exists('vin', $data)) {
                $vehicle->vin = $data['vin'];
            }
            if (array_key_exists('brand_id', $data)) {
                $vehicle->brand_id = $data['brand_id'];
            }
            if (array_key_exists('model_id', $data)) {
                $vehicle->model_id = $data['model_id'];
            }
            if (array_key_exists('year', $data)) {
                $vehicle->year = $data['year'];
            }
            if (array_key_exists('color', $data)) {
                $vehicle->color = $data['color'];
            }
            if (array_key_exists('fuel_type', $data)) {
                $vehicle->fuel_type = $data['fuel_type'];
            }
            if (array_key_exists('fiscal_power', $data)) {
                $vehicle->fiscal_power = $data['fiscal_power'];
            }
            if (array_key_exists('registration_card_number', $data)) {
                $vehicle->registration_card_number = $data['registration_card_number'];
            }
            if (array_key_exists('insurance_expiry', $data)) {
                $vehicle->insurance_expiry = $data['insurance_expiry'];
            }
            if (array_key_exists('tech_control_expiry', $data)) {
                $vehicle->tech_control_expiry = $data['tech_control_expiry'];
            }
            if (array_key_exists('vignette_expiry', $data)) {
                $vehicle->vignette_expiry = $data['vignette_expiry'];
            }
            if (array_key_exists('mileage_km', $data)) {
                $vehicle->mileage_current = $data['mileage_km'];
            }
            if (array_key_exists('status', $data)) {
                $vehicle->status = $data['status'];
            }
            foreach ([
                'acquisition_type',
                'acquisition_date',
                'purchase_price',
                'residual_value',
                'book_value',
                'daily_rental_price',
                'monthly_rental_price',
                'gps_enabled',
                'notes',
                'branch_id',
                'company_id',
            ] as $k) {
                if (array_key_exists($k, $data)) {
                    $vehicle->{$k} = $data[$k];
                }
            }

            $vehicle->save();

            $newStatus = (string) $vehicle->status;
            if ($newStatus !== $oldStatus) {
                VehicleStatusHistory::query()
                    ->where('vehicle_id', $vehicle->id)
                    ->whereNull('ended_at')
                    ->update(['ended_at' => now()]);

                VehicleStatusHistory::query()->create([
                    'vehicle_id' => $vehicle->id,
                    'status' => $newStatus,
                    'started_at' => now(),
                    'note' => $data['status_note'] ?? null,
                    'set_by' => $this->statusHistoryActorId(),
                ]);
            }

            return $vehicle->fresh(['brand', 'model']);
        });

        $oldStatus = (string) ($before['status'] ?? '');
        $newStatus = (string) $v->status;
        if ($oldStatus !== '' && $oldStatus !== $newStatus) {
            AuditLogger::statusChanged(
                subject: $v,
                fromStatus: $oldStatus,
                toStatus: $newStatus,
                user: $request->user(),
                request: $request,
            );
        }
        AuditLogger::updated($v, $request->user(), before: array_intersect_key($before, $v->getAttributes()), after: array_diff_assoc($v->getAttributes(), $before), request: $request);

        return ApiResponse::success((new VehicleResource($v))->resolve($request));
    }
}

