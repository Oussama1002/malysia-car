<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\ContractInstallment;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\PaymentAllocation;
use App\Models\Reservation;
use App\Services\AuditLogger;
use App\Services\NotificationService;
use App\Services\ReservationInvoiceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PaymentController extends Controller
{
    public function __construct(private readonly NotificationService $notifications) {}

    public function index(Request $request): JsonResponse
    {
        $q = Payment::query()->with(['customer.individualProfile', 'customer.companyProfile', 'bankAccount', 'allocations']);

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
        $payment->load(['customer.individualProfile', 'customer.companyProfile', 'bankAccount', 'allocations.invoice', 'allocations.installment']);

        return ApiResponse::success($payment);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'uuid', 'exists:customers,id'],
            'contract_id' => ['nullable', 'uuid'],
            'reservation_id' => ['nullable', 'uuid'],
            'invoice_id' => ['nullable', 'uuid'],
            'branch_id' => ['nullable', 'uuid'],
            'bank_account_id' => ['nullable', 'uuid'],
            'payment_method' => ['required', 'in:cash,bank_transfer,check,card,compensation,wallet'],
            'payment_type' => ['nullable', 'string', 'in:avance,paiement_location,solde,caution,penalite,utilisation_avoir'],
            'payment_direction' => ['nullable', 'in:incoming,outgoing'],
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

        // Guard: same cheque cannot be entered twice. We match on trimmed
        // check_number and check_bank (both non-empty), ignore soft-deleted
        // rows (a rejected cheque was soft-deleted so its number is free to
        // re-use for a new physical cheque), and only refuse when there is
        // still a live payment on that combination.
        if (($data['payment_method'] ?? '') === 'check' && !empty($data['check_number'])) {
            $chequeNumber = trim((string) $data['check_number']);
            $chequeBank   = isset($data['check_bank']) ? trim((string) $data['check_bank']) : null;

            $dup = Payment::query()
                ->where('payment_method', 'check')
                ->whereRaw('TRIM(check_number) = ?', [$chequeNumber])
                ->when($chequeBank, fn ($q) => $q->whereRaw('LOWER(TRIM(COALESCE(check_bank, ""))) = ?', [strtolower($chequeBank)]))
                ->whereNotIn('status', ['reversed', 'refunded'])
                ->first();

            if ($dup) {
                return ApiResponse::error(
                    'Ce chèque a déjà été enregistré (paiement '.$dup->payment_number.'). Un même chèque ne peut pas être payé deux fois.',
                    422,
                    ['check_number' => ['Ce chèque a déjà été enregistré (paiement '.$dup->payment_number.').']]
                );
            }
        }

        $payment = null;
        DB::transaction(function () use (&$payment, $data, $request) {
            $payment = Payment::create([
                'id' => (string) Str::uuid(),
                'company_id' => optional($request->user())->company_id,
                'branch_id' => $data['branch_id'] ?? null,
                'payment_number' => $this->generatePaymentNumber(),
                'customer_id' => $data['customer_id'],
                'contract_id' => $data['contract_id'] ?? null,
                'reservation_id' => $data['reservation_id'] ?? null,
                'invoice_id' => $data['invoice_id'] ?? null,
                'payment_method' => $data['payment_method'],
                'payment_type' => $data['payment_type'] ?? null,
                'payment_direction' => $data['payment_direction'] ?? 'incoming',
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
            } else {
                // No explicit allocation. Resolve the invoice: the one selected on
                // the form, else the reservation's invoice (create/issue it if
                // needed). This runs server-side so it never depends on the
                // frontend having finished loading the invoice id.
                $invoice = ! empty($data['invoice_id']) ? Invoice::find($data['invoice_id']) : null;
                if (! $invoice && ! empty($data['reservation_id'])) {
                    $reservation = Reservation::find($data['reservation_id']);
                    if ($reservation) {
                        $invoice = app(ReservationInvoiceService::class)->ensure($reservation, optional($request->user())->id);
                        $payment->invoice_id = $invoice->id;
                        $payment->save();
                    }
                }
                if ($invoice) {
                    // Auto-allocate this payment (or advance) so the invoice leaves
                    // "draft" and reflects the amount received.
                    $due = (float) ($invoice->amount_due ?? 0);
                    if ($due <= 0) {
                        $due = (float) ($invoice->total_amount ?? 0);
                    }
                    $alloc = $due > 0 ? min((float) $data['amount'], $due) : (float) $data['amount'];
                    if ($alloc > 0) {
                        $this->allocatePayment(
                            $payment,
                            [['invoice_id' => $invoice->id, 'amount_allocated' => $alloc]],
                            optional($request->user())->id,
                        );
                    }
                }
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

    /** GET /v1/payments/{payment}/receipt — download a payment receipt PDF. */
    public function receipt(Request $request, Payment $payment): \Symfony\Component\HttpFoundation\Response
    {
        $payment->load(['customer.individualProfile', 'customer.companyProfile']);
        $invoice = $payment->invoice_id ? Invoice::find($payment->invoice_id) : null;

        $customer = $payment->customer;
        $customerName = '—';
        if ($customer) {
            if (method_exists($customer, 'displayName')) {
                $customerName = $customer->displayName();
            } else {
                $ind = trim(($customer->individualProfile->first_name ?? '').' '.($customer->individualProfile->last_name ?? ''));
                $customerName = $ind !== '' ? $ind : ($customer->companyProfile->legal_name ?? '—');
            }
        }

        $methods = [
            'cash' => 'Espèces', 'cheque' => 'Chèque', 'check' => 'Chèque',
            'bank_transfer' => 'Virement', 'transfer' => 'Virement', 'card' => 'Carte',
            'mobile' => 'Mobile', 'wallet' => 'Portefeuille', 'online' => 'En ligne',
        ];

        $pdf = \Barryvdh\DomPDF\Facade\Pdf::loadView('pdf.receipt', [
            'payment' => $payment,
            'invoice' => $invoice,
            'customerName' => $customerName,
            'company' => null,
            'methodLabel' => $methods[strtolower((string) $payment->payment_method)] ?? ($payment->payment_method ?? '—'),
            'reference' => $payment->external_reference ?: $payment->bank_reference,
            'title' => 'Reçu '.($payment->payment_number ?? ''),
        ]);

        return $pdf->download('recu-'.($payment->payment_number ?? substr($payment->id, 0, 8)).'.pdf');
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

    public function updateChequeStatus(Request $request, Payment $payment): JsonResponse
    {
        if ($payment->payment_method !== 'check') {
            return ApiResponse::error('Ce paiement n\'est pas un chèque.', 422);
        }

        $data = $request->validate([
            'cheque_status' => ['required', 'in:pending,cleared,bounced'],
            'cashed_at' => ['nullable', 'date'],
            'bounce_reason' => ['nullable', 'string', 'max:255'],
        ]);

        $touchedInvoices = [];
        DB::transaction(function () use ($payment, $data, &$touchedInvoices) {
            $payment->cheque_status = $data['cheque_status'];
            $payment->cheque_cashed_at = $data['cheque_status'] === 'cleared'
                ? ($data['cashed_at'] ?? now())
                : null;
            $payment->cheque_bounce_reason = $data['cheque_status'] === 'bounced'
                ? ($data['bounce_reason'] ?? null)
                : null;

            // A bounced cheque means the money never landed — unwind allocations
            // so the invoice reverts to its owed state, flip the payment status
            // to "reversed", and soft-delete it so the reservation Paiements
            // list no longer counts it.
            if ($data['cheque_status'] === 'bounced') {
                foreach ($payment->allocations()->get() as $alloc) {
                    if ($alloc->invoice_id) $touchedInvoices[] = $alloc->invoice_id;
                    $alloc->delete();
                }
                $payment->amount_allocated = 0;
                $payment->amount_unallocated = (float) $payment->amount;
                $payment->status = 'reversed';
                $payment->save();
                $payment->delete(); // soft-delete
            } else {
                // Cleared / back-to-pending: keep the payment as-is, just
                // record the new cheque status.
                if ($payment->trashed()) {
                    $payment->restore();
                }
                $payment->save();
            }
        });

        foreach (array_unique($touchedInvoices) as $invoiceId) {
            if ($invoice = Invoice::find($invoiceId)) {
                $invoice->refreshPaymentStatus();
            }
        }

        return ApiResponse::success($payment->fresh());
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
        // withTrashed + withoutGlobalScopes so soft-deleted payments (bounced
        // cheques) and cross-tenant rows still occupy their sequence number.
        // Otherwise a bounced payment leaves its number reusable, which trips
        // payments_payment_number_unique the next time we try to insert it.
        $last = Payment::withTrashed()
            ->withoutGlobalScopes()
            ->where('payment_number', 'like', $prefix . '%')
            ->orderByDesc('payment_number')
            ->value('payment_number');
        $seq = $last ? (int) substr($last, strlen($prefix)) + 1 : 1;

        return $prefix . str_pad((string) $seq, 5, '0', STR_PAD_LEFT);
    }
}
