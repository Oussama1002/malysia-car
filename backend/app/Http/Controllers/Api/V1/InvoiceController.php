<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Contract;
use App\Models\ContractInstallment;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Services\AuditLogger;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class InvoiceController extends Controller
{
    public function __construct(private readonly NotificationService $notifications) {}

    public function index(Request $request): JsonResponse
    {
        $q = Invoice::query()->with(['customer', 'contract']);

        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($customer = $request->query('customer_id')) {
            $q->where('customer_id', $customer);
        }
        if ($contract = $request->query('contract_id')) {
            $q->where('contract_id', $contract);
        }
        if ($branch = $request->query('branch_id')) {
            $q->where('branch_id', $branch);
        }
        if ($type = $request->query('invoice_type')) {
            $q->where('invoice_type', $type);
        }
        if ($from = $request->query('from')) {
            $q->whereDate('issue_date', '>=', $from);
        }
        if ($to = $request->query('to')) {
            $q->whereDate('issue_date', '<=', $to);
        }
        if ($search = $request->query('search')) {
            $q->where(function ($w) use ($search) {
                $w->where('invoice_number', 'like', "%{$search}%")
                    ->orWhereHas('customer', function ($cw) use ($search) {
                        $cw->where('full_name', 'like', "%{$search}%")
                            ->orWhere('customer_code', 'like', "%{$search}%");
                    });
            });
        }

        // Lazy-update overdue flag
        $overdueIds = Invoice::query()
            ->whereIn('status', ['issued', 'partial'])
            ->whereNotNull('due_date')
            ->where('due_date', '<', now()->toDateString())
            ->where('amount_due', '>', 0)
            ->pluck('id');
        if ($overdueIds->isNotEmpty()) {
            Invoice::query()->whereIn('id', $overdueIds)->update(['status' => 'overdue']);
            $overdues = Invoice::query()->whereIn('id', $overdueIds)->get();
            foreach ($overdues as $overdue) {
                $this->notifications->notifyRoles(
                    roleCodes: ['COMPTABLE', 'DIRECTEUR', 'ADMIN', 'CONTENTIEUX'],
                    category: 'invoice.overdue',
                    title: 'Facture en retard',
                    body: 'La facture '.$overdue->invoice_number.' est en retard de paiement.',
                    module: 'finance',
                    priority: 'critical',
                    entity: $overdue,
                    customerId: $overdue->customer_id,
                    linkUrl: '/finance/invoices/'.$overdue->id,
                );
            }
        }

        $per = min(100, max(1, (int) $request->query('per_page', 25)));
        $page = $q->orderByDesc('issue_date')->orderByDesc('created_at')->paginate($per);

        return ApiResponse::paginated($page);
    }

    public function show(Invoice $invoice): JsonResponse
    {
        $invoice->load(['lines', 'customer', 'contract', 'allocations.payment']);

        return ApiResponse::success($invoice);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'uuid', 'exists:customers,id'],
            'contract_id' => ['nullable', 'uuid', 'exists:contracts,id'],
            'sale_id' => ['nullable', 'uuid'],
            'branch_id' => ['nullable', 'uuid'],
            'invoice_type' => ['required', 'in:contract,sale,service,credit_note'],
            'issue_date' => ['required', 'date'],
            'due_date' => ['nullable', 'date'],
            'currency_code' => ['nullable', 'string', 'size:3'],
            'discount_amount' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string'],
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.line_type' => ['required', 'in:installment,fee,penalty,sale,adjustment'],
            'lines.*.contract_installment_id' => ['nullable', 'uuid'],
            'lines.*.description' => ['required', 'string', 'max:255'],
            'lines.*.quantity' => ['nullable', 'numeric', 'min:0'],
            'lines.*.unit_price' => ['required', 'numeric', 'min:0'],
            'lines.*.discount_amount' => ['nullable', 'numeric', 'min:0'],
            'lines.*.tax_rate' => ['nullable', 'numeric', 'min:0'],
            'lines.*.metadata' => ['nullable', 'array'],
        ]);

        $invoice = null;
        DB::transaction(function () use (&$invoice, $data, $request) {
            $invoice = Invoice::create([
                'id' => (string) Str::uuid(),
                'company_id' => optional($request->user())->company_id,
                'branch_id' => $data['branch_id'] ?? null,
                'invoice_number' => $this->generateInvoiceNumber(),
                'invoice_type' => $data['invoice_type'],
                'customer_id' => $data['customer_id'],
                'contract_id' => $data['contract_id'] ?? null,
                'sale_id' => $data['sale_id'] ?? null,
                'issue_date' => $data['issue_date'],
                'due_date' => $data['due_date'] ?? null,
                'currency_code' => $data['currency_code'] ?? 'MAD',
                'discount_amount' => $data['discount_amount'] ?? 0,
                'status' => 'draft',
                'notes' => $data['notes'] ?? null,
                'created_by' => optional($request->user())->id,
            ]);

            foreach ($data['lines'] as $idx => $line) {
                $qty = (float) ($line['quantity'] ?? 1);
                $unit = (float) $line['unit_price'];
                $discount = (float) ($line['discount_amount'] ?? 0);
                $rate = (float) ($line['tax_rate'] ?? 0);
                $subtotal = max(0, $qty * $unit - $discount);
                $tax = round($subtotal * $rate / 100, 2);
                $lineTotal = round($subtotal + $tax, 2);

                InvoiceLine::create([
                    'id' => (string) Str::uuid(),
                    'invoice_id' => $invoice->id,
                    'position' => $idx + 1,
                    'line_type' => $line['line_type'],
                    'contract_installment_id' => $line['contract_installment_id'] ?? null,
                    'description' => $line['description'],
                    'quantity' => $qty,
                    'unit_price' => $unit,
                    'discount_amount' => $discount,
                    'tax_rate' => $rate,
                    'tax_amount' => $tax,
                    'line_total' => $lineTotal,
                    'metadata' => $line['metadata'] ?? null,
                ]);
            }

            $invoice->refresh();
            $invoice->recalculateTotals();
            $invoice->save();
        });

        AuditLogger::financialAction(
            action: 'invoice_created',
            subject: $invoice,
            user: $request->user(),
            request: $request,
            label: 'Facture créée',
        );

        return ApiResponse::success($invoice->fresh(['lines', 'customer']), null, null, 201);
    }

    public function update(Request $request, Invoice $invoice): JsonResponse
    {
        if (in_array($invoice->status, ['paid', 'cancelled'], true)) {
            return ApiResponse::message('Cannot edit an invoice that is paid or cancelled.', 422);
        }

        $data = $request->validate([
            'issue_date' => ['sometimes', 'date'],
            'due_date' => ['nullable', 'date'],
            'discount_amount' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string'],
        ]);
        $before = $invoice->getOriginal();
        $invoice->fill($data);
        $invoice->recalculateTotals();
        $invoice->save();

        AuditLogger::financialAction(
            action: 'invoice_updated',
            subject: $invoice,
            user: $request->user(),
            before: array_intersect_key($before, $invoice->getChanges()),
            after: $invoice->getChanges(),
            request: $request,
            label: 'Facture mise à jour',
        );

        return ApiResponse::success($invoice->fresh('lines'));
    }

    public function issue(Request $request, Invoice $invoice): JsonResponse
    {
        if ($invoice->status !== 'draft') {
            return ApiResponse::message('Only draft invoices can be issued.', 422);
        }
        $invoice->status = 'issued';
        $invoice->issued_at = now();
        $invoice->save();

        AuditLogger::financialAction(
            action: 'invoice_issued',
            subject: $invoice,
            user: $request->user(),
            request: $request,
            label: 'Facture émise',
        );

        return ApiResponse::success($invoice);
    }

    public function cancel(Request $request, Invoice $invoice): JsonResponse
    {
        if (in_array($invoice->status, ['paid', 'cancelled'], true)) {
            return ApiResponse::message('Cannot cancel a paid or already cancelled invoice.', 422);
        }
        $invoice->status = 'cancelled';
        $invoice->cancelled_at = now();
        $invoice->notes = trim(($invoice->notes ? $invoice->notes . "\n" : '') . '[Cancel] ' . ($request->input('reason', '')));
        $invoice->save();

        AuditLogger::financialAction(
            action: 'invoice_cancelled',
            subject: $invoice,
            user: $request->user(),
            request: $request,
            label: 'Facture annulée',
            after: ['reason' => $request->input('reason')],
        );

        return ApiResponse::success($invoice);
    }

    public function destroy(Request $request, Invoice $invoice): JsonResponse
    {
        if ($invoice->status !== 'draft') {
            return ApiResponse::message('Only draft invoices can be deleted.', 422);
        }
        AuditLogger::deleted($invoice, $request->user(), request: $request, legal: true);
        $invoice->delete();

        return ApiResponse::message('Invoice deleted');
    }

    /**
     * Generate invoice lines automatically from a contract's unpaid installments.
     */
    public function generateFromContract(Request $request, Contract $contract): JsonResponse
    {
        $data = $request->validate([
            'installment_ids' => ['nullable', 'array'],
            'installment_ids.*' => ['uuid'],
            'issue_date' => ['nullable', 'date'],
            'due_date' => ['nullable', 'date'],
        ]);

        $query = ContractInstallment::where('contract_id', $contract->id)
            ->whereIn('installment_status', ['pending', 'partial', 'overdue']);
        if (! empty($data['installment_ids'])) {
            $query->whereIn('id', $data['installment_ids']);
        }
        $installments = $query->orderBy('due_date')->get();

        if ($installments->isEmpty()) {
            return ApiResponse::message('No pending installments to invoice.', 422);
        }

        $invoice = null;
        DB::transaction(function () use (&$invoice, $contract, $installments, $data, $request) {
            $invoice = Invoice::create([
                'id' => (string) Str::uuid(),
                'company_id' => $contract->company_id ?? optional($request->user())->company_id,
                'branch_id' => $contract->branch_id ?? null,
                'invoice_number' => $this->generateInvoiceNumber(),
                'invoice_type' => 'contract',
                'customer_id' => $contract->customer_id,
                'contract_id' => $contract->id,
                'issue_date' => $data['issue_date'] ?? now()->toDateString(),
                'due_date' => $data['due_date'] ?? optional($installments->first()->due_date)->toDateString(),
                'currency_code' => $contract->currency_code ?? 'MAD',
                'status' => 'draft',
                'created_by' => optional($request->user())->id,
            ]);

            $position = 1;
            foreach ($installments as $inst) {
                $principal = (float) ($inst->principal_amount ?? 0);
                $interest = (float) ($inst->interest_amount ?? 0);
                $tax = (float) ($inst->tax_amount ?? 0);
                $penalty = (float) ($inst->penalty_amount ?? 0);
                $due = (float) ($inst->total_due_amount ?? ($principal + $interest + $tax + $penalty));
                $paid = (float) ($inst->total_paid_amount ?? 0);
                $remaining = max(0, $due - $paid);
                if ($remaining <= 0) {
                    continue;
                }

                InvoiceLine::create([
                    'id' => (string) Str::uuid(),
                    'invoice_id' => $invoice->id,
                    'position' => $position++,
                    'line_type' => 'installment',
                    'contract_installment_id' => $inst->id,
                    'description' => 'Échéance #' . ($inst->installment_number ?? $inst->id) . ' — ' . optional($inst->due_date)->format('Y-m-d'),
                    'quantity' => 1,
                    'unit_price' => $remaining,
                    'discount_amount' => 0,
                    'tax_rate' => 0,
                    'tax_amount' => 0,
                    'line_total' => $remaining,
                    'metadata' => [
                        'principal' => $principal,
                        'interest' => $interest,
                        'tax' => $tax,
                        'penalty' => $penalty,
                    ],
                ]);
            }

            $invoice->refresh();
            $invoice->recalculateTotals();
            $invoice->save();
        });

        return ApiResponse::success($invoice->fresh(['lines', 'customer']), null, null, 201);
    }

    private function generateInvoiceNumber(): string
    {
        $prefix = 'INV-' . now()->format('Ym') . '-';
        $last = Invoice::where('invoice_number', 'like', $prefix . '%')
            ->orderByDesc('invoice_number')->value('invoice_number');
        $seq = $last ? (int) substr($last, strlen($prefix)) + 1 : 1;

        return $prefix . str_pad((string) $seq, 5, '0', STR_PAD_LEFT);
    }
}
