<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\FixedCharge;
use App\Models\FixedChargePayment;
use App\Services\AuditLogger;
use App\Services\FixedChargeService;
use App\Support\ErpConstants;
use App\Support\PaymentMethodNormalizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class FixedChargeController extends Controller
{
    public function __construct(private readonly FixedChargeService $svc) {}

    public function index(Request $request): JsonResponse
    {
        $q = FixedCharge::query()->orderByDesc('created_at');
        if ($request->query('status')) {
            $q->where('status', $request->query('status'));
        }
        if ($request->query('category')) {
            $q->where('category', $request->query('category'));
        }
        $per = min(100, max(1, (int) $request->query('per_page', 50)));

        return ApiResponse::paginated($q->paginate($per));
    }

    public function dashboard(Request $request): JsonResponse
    {
        $companyId = $request->user()?->company_id;

        return ApiResponse::success($this->svc->dashboard($companyId));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'category' => ['required', 'string', 'max:80'],
            'amount' => ['required', 'numeric', 'min:0'],
            'currency_code' => ['nullable', 'string', 'size:3'],
            'frequency' => ['required', 'in:'.implode(',', ErpConstants::FIXED_CHARGE_FREQUENCIES)],
            'start_date' => ['required', 'date'],
            'end_date' => ['nullable', 'date'],
            'next_due_date' => ['nullable', 'date'],
            'payment_method' => ['nullable', 'string', 'max:40'],
            'supplier_name' => ['nullable', 'string', 'max:255'],
            'accounting_account_id' => ['nullable', 'uuid', 'exists:accounting_accounts,id'],
            'status' => ['nullable', 'in:'.implode(',', ErpConstants::FIXED_CHARGE_STATUSES)],
            'notes' => ['nullable', 'string'],
            'branch_id' => ['nullable', 'uuid'],
            'company_id' => ['nullable', 'uuid'],
        ]);

        $nextDue = $data['next_due_date'] ?? $data['start_date'];

        /** @var FixedCharge $row */
        $row = FixedCharge::query()->create([
            'id' => (string) Str::uuid(),
            'company_id' => $data['company_id'] ?? $request->user()?->company_id,
            'branch_id' => $data['branch_id'] ?? null,
            'name' => $data['name'],
            'category' => mb_strtolower(trim($data['category'])),
            'amount' => $data['amount'],
            'currency_code' => strtoupper($data['currency_code'] ?? 'MAD'),
            'frequency' => $data['frequency'],
            'start_date' => $data['start_date'],
            'end_date' => $data['end_date'] ?? null,
            'next_due_date' => $nextDue,
            'payment_method' => PaymentMethodNormalizer::normalize($data['payment_method'] ?? null),
            'supplier_name' => $data['supplier_name'] ?? null,
            'accounting_account_id' => $data['accounting_account_id'] ?? null,
            'status' => $data['status'] ?? 'active',
            'notes' => $data['notes'] ?? null,
            'created_by' => $request->user()?->id,
        ]);

        AuditLogger::created($row, $request->user(), request: $request);

        // Generate the first pending payment so the alert scheduler can track upcoming due dates.
        try {
            if ($row->status === 'active' && $row->next_due_date) {
                DB::transaction(fn () => $this->svc->generatePayment($row));
            }
        } catch (\Throwable $e) {
            // Non-blocking — charge is created even if first payment generation fails
        }

        return ApiResponse::success($row->fresh(['payments']), null, null, 201);
    }

    public function show(FixedCharge $fixedCharge): JsonResponse
    {
        $fixedCharge->load(['payments', 'accountingAccount']);

        return ApiResponse::success($fixedCharge);
    }

    public function update(Request $request, FixedCharge $fixedCharge): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'category' => ['sometimes', 'string', 'max:80'],
            'amount' => ['sometimes', 'numeric', 'min:0'],
            'currency_code' => ['nullable', 'string', 'size:3'],
            'frequency' => ['sometimes', 'in:'.implode(',', ErpConstants::FIXED_CHARGE_FREQUENCIES)],
            'start_date' => ['sometimes', 'date'],
            'end_date' => ['nullable', 'date'],
            'next_due_date' => ['nullable', 'date'],
            'payment_method' => ['nullable', 'string', 'max:40'],
            'supplier_name' => ['nullable', 'string', 'max:255'],
            'accounting_account_id' => ['nullable', 'uuid', 'exists:accounting_accounts,id'],
            'status' => ['sometimes', 'in:'.implode(',', ErpConstants::FIXED_CHARGE_STATUSES)],
            'notes' => ['nullable', 'string'],
            'branch_id' => ['nullable', 'uuid'],
        ]);

        if (isset($data['payment_method'])) {
            $data['payment_method'] = PaymentMethodNormalizer::normalize($data['payment_method']);
        }
        if (isset($data['category'])) {
            $data['category'] = mb_strtolower(trim($data['category']));
        }

        $before = $fixedCharge->getOriginal();
        $fixedCharge->update($data);
        AuditLogger::updated($fixedCharge, $request->user(), before: array_intersect_key($before, $fixedCharge->getChanges()), after: $fixedCharge->getChanges(), request: $request);

        return ApiResponse::success($fixedCharge->fresh());
    }

    public function generatePayment(Request $request, FixedCharge $fixedCharge): JsonResponse
    {
        $payment = DB::transaction(fn () => $this->svc->generatePayment($fixedCharge));

        return ApiResponse::success($payment, null, null, 201);
    }
}
