<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\Mission;
use App\Models\RentalDamageReport;
use App\Models\RentalExtension;
use App\Models\RentalHandoverReport;
use App\Models\Reservation;
use App\Services\AuditLogger;
use App\Services\RentalAvailabilityService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ReservationController extends Controller
{
    public function __construct(private readonly RentalAvailabilityService $availability) {}

    private const FLOW = [
        'draft',
        'reserved',
        'confirmed',
        'pickup_scheduled',
        'handed_over',
        'active',
        'extension_requested',
        'return_scheduled',
        'returned',
        'inspection_pending',
        'damage_pending',
        'billing_pending',
        'closed',
        'cancelled',
    ];

    public function index(Request $request): JsonResponse
    {
        $q = Reservation::query()->orderByDesc('created_at');
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($vehicleId = $request->query('vehicle_id')) {
            $q->where('vehicle_id', $vehicleId);
        }
        if ($customerId = $request->query('customer_id')) {
            $q->where('customer_id', $customerId);
        }
        $per = min(100, max(1, (int) $request->query('per_page', 50)));
        $page = $q->paginate($per);

        return ApiResponse::success($page->items(), [
            'current_page' => $page->currentPage(),
            'last_page' => $page->lastPage(),
            'per_page' => $page->perPage(),
            'total' => $page->total(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'uuid'],
            'vehicle_id' => ['required', 'uuid'],
            'reservation_type' => ['required', 'string', 'max:50'],
            'desired_start_at' => ['required', 'date'],
            'desired_end_at' => ['required', 'date'],
            'pickup_address' => ['nullable', 'string', 'max:255'],
            'delivery_address' => ['nullable', 'string', 'max:255'],
            'delivery_latitude' => ['nullable', 'numeric'],
            'delivery_longitude' => ['nullable', 'numeric'],
            'estimated_price' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string'],
            'company_id' => ['nullable', 'uuid'],
            'branch_id' => ['nullable', 'uuid'],
        ]);

        $r = DB::transaction(function () use ($data, $request) {
            $startAt = Carbon::parse($data['desired_start_at']);
            $endAt = Carbon::parse($data['desired_end_at']);
            $this->availability->assertVehicleAvailableWithLock($data['vehicle_id'], $startAt, $endAt);

            return Reservation::query()->create([
                'id' => (string) Str::uuid(),
                'company_id' => $data['company_id'] ?? $request->user()?->company_id,
                'branch_id' => $data['branch_id'] ?? null,
                'reservation_number' => 'RSV-'.now()->format('Ymd').'-'.strtoupper(Str::random(6)),
                'customer_id' => $data['customer_id'],
                'vehicle_id' => $data['vehicle_id'],
                'reservation_type' => $data['reservation_type'],
                'status' => 'reserved',
                'desired_start_at' => $data['desired_start_at'],
                'desired_end_at' => $data['desired_end_at'],
                'pickup_address' => $data['pickup_address'] ?? null,
                'delivery_address' => $data['delivery_address'] ?? null,
                'delivery_latitude' => $data['delivery_latitude'] ?? null,
                'delivery_longitude' => $data['delivery_longitude'] ?? null,
                'estimated_price' => $data['estimated_price'] ?? null,
                'notes' => $data['notes'] ?? null,
                'created_by' => auth()->id(),
            ]);
        });

        AuditLogger::statusChanged($r, 'draft', 'reserved', $request->user(), $request, module: 'rentals');

        return ApiResponse::success($r, null, null, 201);
    }

    public function show(Reservation $reservation): JsonResponse
    {
        $handoverReports = RentalHandoverReport::query()
            ->where('reservation_id', $reservation->id)
            ->orderBy('performed_at')
            ->get();
        $extensions = RentalExtension::query()
            ->where('reservation_id', $reservation->id)
            ->orderByDesc('requested_at')
            ->get();
        $damages = RentalDamageReport::query()
            ->where('reservation_id', $reservation->id)
            ->orderByDesc('created_at')
            ->get();

        return ApiResponse::success([
            'reservation' => $reservation,
            'handover_reports' => $handoverReports,
            'extensions' => $extensions,
            'damage_reports' => $damages,
        ]);
    }

    public function createMission(Request $request, Reservation $reservation): JsonResponse
    {
        $data = $request->validate([
            'mission_type' => ['required', 'string', 'max:50'], // delivery, pickup
            'assigned_user_id' => ['nullable', 'uuid'],
            'scheduled_start_at' => ['nullable', 'date'],
            'scheduled_end_at' => ['nullable', 'date'],
            'origin_address' => ['nullable', 'string', 'max:255'],
            'destination_address' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string'],
        ]);

        $m = DB::transaction(function () use ($reservation, $data) {
            $this->transitionReservation($reservation, 'pickup_scheduled');

            return Mission::query()->create([
                'id' => (string) Str::uuid(),
                'company_id' => $reservation->company_id,
                'branch_id' => $reservation->branch_id,
                'reservation_id' => $reservation->id,
                'vehicle_id' => $reservation->vehicle_id,
                'assigned_user_id' => $data['assigned_user_id'] ?? null,
                'mission_type' => $data['mission_type'],
                'status' => 'planned',
                'scheduled_start_at' => $data['scheduled_start_at'] ?? $reservation->desired_start_at,
                'scheduled_end_at' => $data['scheduled_end_at'] ?? $reservation->desired_end_at,
                'origin_address' => $data['origin_address'] ?? $reservation->pickup_address,
                'destination_address' => $data['destination_address'] ?? $reservation->delivery_address,
                'notes' => $data['notes'] ?? null,
                'created_by' => auth()->id(),
            ]);
        });

        return ApiResponse::success($m, null, null, 201);
    }

    public function confirm(Request $request, Reservation $reservation): JsonResponse
    {
        DB::transaction(function () use ($request, $reservation): void {
            $locked = Reservation::withoutGlobalScopes()
                ->whereKey((string) $reservation->getKey())
                ->lockForUpdate()
                ->firstOrFail();
            $this->availability->assertVehicleAvailableWithLock(
                (string) $locked->vehicle_id,
                Carbon::parse($locked->desired_start_at),
                Carbon::parse($locked->desired_end_at),
                (string) $locked->id
            );
            $this->transitionReservation($locked, 'confirmed', $request);
        });

        return ApiResponse::success($reservation->fresh());
    }

    public function cancel(Request $request, Reservation $reservation): JsonResponse
    {
        $this->transitionReservation($reservation, 'cancelled', $request);

        return ApiResponse::success($reservation->fresh());
    }

    public function handoverPickup(Request $request, Reservation $reservation): JsonResponse
    {
        $data = $request->validate([
            'odometer' => ['nullable', 'numeric', 'min:0'],
            'fuel_level' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'condition_notes' => ['nullable', 'string'],
            'checklist' => ['nullable', 'array'],
            'photos' => ['nullable', 'array'],
            'signature' => ['nullable', 'string'],
            'contract_id' => ['nullable', 'uuid'],
        ]);

        $report = DB::transaction(function () use ($reservation, $data, $request) {
            $this->transitionReservation($reservation, 'handed_over', $request);
            $this->transitionReservation($reservation, 'active', $request);

            return RentalHandoverReport::query()->create([
                'id' => (string) Str::uuid(),
                'vehicle_id' => $reservation->vehicle_id,
                'customer_id' => $reservation->customer_id,
                'reservation_id' => $reservation->id,
                'contract_id' => $data['contract_id'] ?? null,
                'handover_type' => 'pickup',
                'odometer' => $data['odometer'] ?? null,
                'fuel_level' => $data['fuel_level'] ?? null,
                'condition_notes' => $data['condition_notes'] ?? null,
                'checklist' => $data['checklist'] ?? null,
                'photos' => $data['photos'] ?? null,
                'signature' => $data['signature'] ?? null,
                'performed_by' => $request->user()?->id,
                'performed_at' => now(),
            ]);
        });

        return ApiResponse::success($report, null, null, 201);
    }

    public function requestExtension(Request $request, Reservation $reservation): JsonResponse
    {
        $data = $request->validate([
            'new_end_at' => ['required', 'date', 'after:now'],
            'additional_amount' => ['nullable', 'numeric', 'min:0'],
            'contract_id' => ['nullable', 'uuid'],
            'notes' => ['nullable', 'string'],
        ]);

        $newEnd = Carbon::parse($data['new_end_at']);
        $oldEnd = Carbon::parse($reservation->desired_end_at);

        $ext = DB::transaction(function () use ($reservation, $data, $newEnd, $oldEnd, $request): mixed {
            $locked = Reservation::withoutGlobalScopes()
                ->whereKey((string) $reservation->getKey())
                ->lockForUpdate()
                ->firstOrFail();
            $this->availability->assertVehicleAvailableWithLock(
                (string) $locked->vehicle_id,
                Carbon::parse($locked->desired_start_at),
                $newEnd,
                (string) $locked->id
            );
            $this->transitionReservation($locked, 'extension_requested', $request);
            $locked->desired_end_at = $newEnd;
            $locked->save();

            return RentalExtension::query()->create([
                'id' => (string) Str::uuid(),
                'reservation_id' => $locked->id,
                'contract_id' => $data['contract_id'] ?? null,
                'old_end_at' => $oldEnd,
                'new_end_at' => $newEnd,
                'additional_amount' => $data['additional_amount'] ?? 0,
                'status' => 'applied',
                'requested_by' => $request->user()?->id,
                'requested_at' => now(),
                'resolved_at' => now(),
                'resolved_by' => $request->user()?->id,
                'notes' => $data['notes'] ?? null,
            ]);
        });

        return ApiResponse::success($ext, null, null, 201);
    }

    public function handoverReturn(Request $request, Reservation $reservation): JsonResponse
    {
        $data = $request->validate([
            'odometer' => ['nullable', 'numeric', 'min:0'],
            'fuel_level' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'condition_notes' => ['nullable', 'string'],
            'checklist' => ['nullable', 'array'],
            'photos' => ['nullable', 'array'],
            'signature' => ['nullable', 'string'],
            'contract_id' => ['nullable', 'uuid'],
        ]);

        $report = DB::transaction(function () use ($reservation, $data, $request) {
            $this->transitionReservation($reservation, 'returned', $request);
            $this->transitionReservation($reservation, 'inspection_pending', $request);

            return RentalHandoverReport::query()->create([
                'id' => (string) Str::uuid(),
                'vehicle_id' => $reservation->vehicle_id,
                'customer_id' => $reservation->customer_id,
                'reservation_id' => $reservation->id,
                'contract_id' => $data['contract_id'] ?? null,
                'handover_type' => 'return',
                'odometer' => $data['odometer'] ?? null,
                'fuel_level' => $data['fuel_level'] ?? null,
                'condition_notes' => $data['condition_notes'] ?? null,
                'checklist' => $data['checklist'] ?? null,
                'photos' => $data['photos'] ?? null,
                'signature' => $data['signature'] ?? null,
                'performed_by' => $request->user()?->id,
                'performed_at' => now(),
            ]);
        });

        return ApiResponse::success($report, null, null, 201);
    }

    public function damageReport(Request $request, Reservation $reservation): JsonResponse
    {
        $data = $request->validate([
            'damage_type' => ['required', 'string', 'max:50'],
            'description' => ['nullable', 'string'],
            'estimated_cost' => ['nullable', 'numeric', 'min:0'],
            'final_cost' => ['nullable', 'numeric', 'min:0'],
            'responsible_party' => ['nullable', 'string', 'max:30'],
            'status' => ['nullable', 'string', 'max:30'],
        ]);

        $row = DB::transaction(function () use ($reservation, $data, $request) {
            $this->transitionReservation($reservation, 'damage_pending', $request);

            return RentalDamageReport::query()->create([
                'id' => (string) Str::uuid(),
                'reservation_id' => $reservation->id,
                'vehicle_id' => $reservation->vehicle_id,
                'customer_id' => $reservation->customer_id,
                'damage_type' => $data['damage_type'],
                'description' => $data['description'] ?? null,
                'estimated_cost' => $data['estimated_cost'] ?? 0,
                'final_cost' => $data['final_cost'] ?? null,
                'responsible_party' => $data['responsible_party'] ?? 'customer',
                'status' => $data['status'] ?? 'open',
            ]);
        });

        return ApiResponse::success($row, null, null, 201);
    }

    public function closeBilling(Request $request, Reservation $reservation): JsonResponse
    {
        $data = $request->validate([
            'issue_date' => ['nullable', 'date'],
            'due_date' => ['nullable', 'date'],
            'currency_code' => ['nullable', 'string', 'size:3'],
        ]);

        $invoice = DB::transaction(function () use ($reservation, $data, $request) {
            $this->transitionReservation($reservation, 'billing_pending', $request);

            $base = (float) ($reservation->estimated_price ?? 0);
            $extensions = (float) RentalExtension::query()
                ->where('reservation_id', $reservation->id)
                ->where('status', 'applied')
                ->sum('additional_amount');
            $damages = (float) RentalDamageReport::query()
                ->where('reservation_id', $reservation->id)
                ->sum(DB::raw('COALESCE(final_cost, estimated_cost)'));
            $total = max(0, $base + $extensions + $damages);

            $invoice = Invoice::query()->create([
                'id' => (string) Str::uuid(),
                'company_id' => $reservation->company_id,
                'branch_id' => $reservation->branch_id,
                'invoice_number' => 'INV-RENT-'.now()->format('Ym').'-'.strtoupper(Str::random(6)),
                'invoice_type' => 'service',
                'customer_id' => $reservation->customer_id,
                'contract_id' => null,
                'issue_date' => $data['issue_date'] ?? now()->toDateString(),
                'due_date' => $data['due_date'] ?? now()->addDays(7)->toDateString(),
                'currency_code' => $data['currency_code'] ?? 'MAD',
                'status' => 'draft',
                'created_by' => $request->user()?->id,
            ]);

            InvoiceLine::query()->create([
                'id' => (string) Str::uuid(),
                'invoice_id' => $invoice->id,
                'position' => 1,
                'line_type' => 'service',
                'description' => 'Clôture location '.$reservation->reservation_number,
                'quantity' => 1,
                'unit_price' => $total,
                'discount_amount' => 0,
                'tax_rate' => 0,
                'tax_amount' => 0,
                'line_total' => $total,
                'metadata' => [
                    'reservation_id' => $reservation->id,
                    'base_amount' => $base,
                    'extensions' => $extensions,
                    'damages' => $damages,
                ],
            ]);
            $invoice->refresh();
            $invoice->recalculateTotals();
            $invoice->save();

            RentalDamageReport::query()
                ->where('reservation_id', $reservation->id)
                ->whereNull('linked_invoice_id')
                ->update(['linked_invoice_id' => $invoice->id, 'status' => 'invoiced']);

            $this->transitionReservation($reservation, 'closed', $request);

            return $invoice;
        });

        return ApiResponse::success($invoice->fresh('lines'), null, null, 201);
    }

    private function transitionReservation(Reservation $reservation, string $to, ?Request $request = null): void
    {
        if (! in_array($to, self::FLOW, true)) {
            abort(422, 'Invalid rental status transition target.');
        }
        $from = (string) $reservation->status;
        if ($from === $to) {
            return;
        }
        $reservation->status = $to;
        $reservation->save();
        AuditLogger::statusChanged($reservation, $from, $to, $request?->user(), $request, module: 'rentals');
    }
}

