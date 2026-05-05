<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\ContractInstallment;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\PaymentAllocation;
use App\Services\AuditLogger;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PaymentController extends Controller
{
    public function __construct(private readonly NotificationService $notifications) {}

    public function index(Request $request): JsonResponse
    {
        $q = Payment::query()->with(['customer', 'bankAccount', 'allocations']);

        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($method = $request->query('payment_method')) {
            $q->where('payment_method', $method);
        }
        if ($dir = $request->query('payment_direction')) {
            $q->where('payment_direction', $dir);
        }
        if ($customer = $request->query('customer_id')) {
            $q->where('customer_id', $customer);
        }
        if ($branch = $request->query('branch_id')) {
            $q->where('branch_id', $branch);
        }
        if ($from = $request->query('from')) {
            $q->whereDate('payment_date', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $q->whereDate('payment_date', '<=', $to);
        }
        if ($search = $request->query('search')) {
            $q->where(function ($w) use ($search) {
                $w->where('payment_number', 'like', "%{$search}%")
                    ->orWhere('external_reference', 'like', "%{$search}%")
                    ->orWhere('check_number', 'like', "%{$search}%");
            });
        }

        $per = min(100, max(1, (int) $request->query('per_page', 25)));
        $page = $q->orderByDesc('payment_date')->orderByDesc('created_at')->paginate($per);

        return ApiResponse::paginated($page);
    }

    public function show(Payment $payment): JsonResponse
    {
        $payment->load(['customer', 'bankAccount', 'allocations.invoice', 'allocations.installment']);

        return ApiResponse::success($payment);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'uuid', 'exists:customers,id'],
            'branch_id' => ['nullable', 'uuid'],
            'bank_account_id' => ['nullable', 'uuid'],
            'payment_method' => ['required', 'in:cash,bank_transfer,check,card,compensation'],
            'payment_direction' => ['required', 'in:incoming,outgoing'],
            'amount' => ['required', 'numeric', 'min:0'],
            'currency_code' => ['nullable', 'string', 'size:3'],
            'payment_date' => ['required', 'date'],
            'external_reference' => ['nullable', 'string', 'max:160'],
            'check_number' => ['nullable', 'string', 'max:60'],
            'check_date' => ['nullable', 'date'],
            'check_bank' => ['nullable', 'string', 'max:160'],
            'notes' => ['nullable', 'string'],
            'allocations' => ['nullable', 'array'],
            'allocations.*.invoice_id' => ['nullable', 'uuid'],
            'allocations.*.contract_installment_id' => ['nullable', 'uuid'],
            'allocations.*.amount_allocated' => ['required_with:allocations', 'numeric', 'min:0'],
            'allocations.*.notes' => ['nullable', 'string'],
        ]);

        $payment = null;
        DB::transaction(function () use (&$payment, $data, $request) {
            $payment = Payment::create([
                'id' => (string) Str::uuid(),
                'company_id' => optional($request->user())->company_id,
                'branch_id' => $data['branch_id'] ?? null,
                'payment_number' => $this->generatePaymentNumber(),
                'customer_id' => $data['customer_id'],
                'payment_method' => $data['payment_method'],
                'payment_direction' => $data['payment_direction'],
                'amount' => $data['amount'],
                'currency_code' => $data['currency_code'] ?? 'MAD',
                'amount_allocated' => 0,
                'amount_unallocated' => $data['amount'],
                'status' => 'received',
                'payment_date' => $data['payment_date'],
                'bank_account_id' => $data['bank_account_id'] ?? null,
                'external_reference' => $data['external_reference'] ?? null,
                'check_number' => $data['check_number'] ?? null,
                'check_date' => $data['check_date'] ?? null,
                'check_bank' => $data['check_bank'] ?? null,
                'notes' => $data['notes'] ?? null,
                'received_by_user_id' => optional($request->user())->id,
            ]);

            if (! empty($data['allocations'])) {
                $this->allocatePayment($payment, $data['allocations'], optional($request->user())->id);
            }
        });

        AuditLogger::financialAction(
            action: 'payment_created',
            subject: $payment,
            user: $request->user(),
            request: $request,
            label: 'Paiement enregistré',
            after: ['amount' => $payment->amount, 'method' => $payment->payment_method],
        );
        $this->notifications->notifyRoles(
            roleCodes: ['COMPTABLE', 'DIRECTEUR', 'ADMIN'],
            category: 'payment.received',
            title: 'Paiement recu',
            body: 'Paiement '.$payment->payment_number.' enregistre.',
            module: 'finance',
            priority: 'normal',
            customerId: $payment->customer_id,
            entity: $payment,
            linkUrl: '/finance/payments',
        );

        return ApiResponse::success($payment->fresh(['allocations', 'customer']), null, null, 201);
    }

    public function allocate(Request $request, Payment $payment): JsonResponse
    {
        $data = $request->validate([
            'allocations' => ['required', 'array', 'min:1'],
            'allocations.*.invoice_id' => ['nullable', 'uuid'],
            'allocations.*.contract_installment_id' => ['nullable', 'uuid'],
            'allocations.*.amount_allocated' => ['required', 'numeric', 'min:0.01'],
            'allocations.*.notes' => ['nullable', 'string'],
        ]);

        DB::transaction(function () use ($payment, $data, $request) {
            $this->allocatePayment($payment, $data['allocations'], optional($request->user())->id);
        });

        AuditLogger::financialAction(
            action: 'payment_allocated',
            subject: $payment,
            user: $request->user(),
            request: $request,
            label: 'Paiement alloué',
            after: ['allocations' => $data['allocations']],
        );

        return ApiResponse::success($payment->fresh(['allocations.invoice', 'allocations.installment']));
    }

    public function removeAllocation(PaymentAllocation $allocation): JsonResponse
    {
        $paymentId = $allocation->payment_id;
        $invoiceId = $allocation->invoice_id;

        DB::transaction(function () use ($allocation, $invoiceId) {
            $allocation->delete();
            if ($invoiceId && ($invoice = Invoice::find($invoiceId))) {
                $invoice->refreshPaymentStatus();
            }
        });

        $payment = Payment::find($paymentId);
        if ($payment) {
            $payment->recalculateAllocation();
        }

        return ApiResponse::message('Allocation removed');
    }

    private function allocatePayment(Payment $payment, array $allocations, ?string $userId): void
    {
        $already = (float) $payment->allocations()->sum('amount_allocated');
        $remaining = (float) $payment->amount - $already;
        $touchedInvoices = [];

        foreach ($allocations as $row) {
            $amt = (float) $row['amount_allocated'];
            if ($amt <= 0) {
                continue;
            }
            if ($amt > $remaining + 0.001) {
                throw new \RuntimeException('Allocation exceeds unallocated amount of payment.');
            }

            PaymentAllocation::create([
                'id' => (string) Str::uuid(),
                'payment_id' => $payment->id,
                'invoice_id' => $row['invoice_id'] ?? null,
                'contract_installment_id' => $row['contract_installment_id'] ?? null,
                'amount_allocated' => $amt,
                'allocated_at' => now(),
                'allocated_by_user_id' => $userId,
                'notes' => $row['notes'] ?? null,
            ]);

            $remaining -= $amt;

            if (! empty($row['invoice_id'])) {
                $touchedInvoices[$row['invoice_id']] = true;
            }

            if (! empty($row['contract_installment_id'])) {
                $inst = ContractInstallment::find($row['contract_installment_id']);
                if ($inst) {
                    $inst->total_paid_amount = (float) ($inst->total_paid_amount ?? 0) + $amt;
                    $inst->balance_amount = max(0, (float) ($inst->total_due_amount ?? 0) - (float) $inst->total_paid_amount);
                    if ($inst->balance_amount <= 0) {
                        $inst->installment_status = 'paid';
                    } elseif ((float) $inst->total_paid_amount > 0) {
                        $inst->installment_status = 'partial';
                    }
                    $inst->save();
                }
            }
        }

        foreach (array_keys($touchedInvoices) as $invoiceId) {
            $invoice = Invoice::find($invoiceId);
            if ($invoice) {
                $invoice->refreshPaymentStatus();
            }
        }

        $payment->recalculateAllocation();
    }

    private function generatePaymentNumber(): string
    {
        $prefix = 'PAY-' . now()->format('Ym') . '-';
        $last = Payment::where('payment_number', 'like', $prefix . '%')
            ->orderByDesc('payment_number')->value('payment_number');
        $seq = $last ? (int) substr($last, strlen($prefix)) + 1 : 1;

        return $prefix . str_pad((string) $seq, 5, '0', STR_PAD_LEFT);
    }
}
