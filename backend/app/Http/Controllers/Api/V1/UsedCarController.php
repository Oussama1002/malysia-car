<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AccountingEntry;
use App\Models\AccountingEntryLine;
use App\Models\AccountingJournal;
use App\Models\Contract;
use App\Models\FixedAsset;
use App\Models\FiscalPeriod;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\Payment;
use App\Models\PaymentAllocation;
use App\Models\UsedCarListing;
use App\Models\UsedCarSale;
use App\Models\UsedCarValuation;
use App\Models\Vehicle;
use App\Models\VehicleOwnershipTransfer;
use App\Services\AccountingMappingService;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

class UsedCarController extends Controller
{
    public function __construct(private readonly AccountingMappingService $mappingService) {}

    // ==================================================================
    // Listings
    // ==================================================================

    public function index(Request $request): JsonResponse
    {
        $q = UsedCarListing::query()->with(['vehicle.brand', 'vehicle.model']);

        if ($stage = $request->query('stage')) {
            $q->where('stage', $stage);
        }
        if ($branch = $request->query('branch_id')) {
            $q->where('branch_id', $branch);
        }
        if ($channel = $request->query('publication_channel')) {
            $q->where('publication_channel', $channel);
        }
        if ($search = $request->query('search')) {
            $q->where(function ($w) use ($search) {
                $w->where('listing_code', 'like', "%{$search}%")
                    ->orWhereHas('vehicle', function ($vw) use ($search) {
                        $vw->where('registration_number', 'like', "%{$search}%")
                            ->orWhere('vin', 'like', "%{$search}%");
                    });
            });
        }

        $per = min(100, max(1, (int) $request->query('per_page', 25)));
        $page = $q->orderByDesc('updated_at')->paginate($per);

        return ApiResponse::success(
            $page->items(),
            [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ]
        );
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'vehicle_id' => ['required', 'uuid', 'exists:vehicles,id'],
            'branch_id' => ['nullable', 'uuid'],
            'asking_price' => ['nullable', 'numeric', 'min:0'],
            'min_acceptable_price' => ['nullable', 'numeric', 'min:0'],
            'publication_channel' => ['nullable', 'string', 'max:80'],
            'mileage_at_listing' => ['nullable', 'integer', 'min:0'],
            'inspection_score' => ['nullable', 'integer', 'min:0', 'max:100'],
            'inspection_notes' => ['nullable', 'array'],
            'notes' => ['nullable', 'string'],
        ]);

        // Prevent duplicate active listing per vehicle
        $existing = UsedCarListing::where('vehicle_id', $data['vehicle_id'])
            ->whereIn('stage', ['draft', 'evaluated', 'published', 'reserved'])
            ->first();
        if ($existing) {
            return ApiResponse::message('A listing already exists for this vehicle.', 422);
        }

        $listing = UsedCarListing::create(array_merge($data, [
            'id' => (string) Str::uuid(),
            'listing_code' => 'VO-' . strtoupper(Str::random(8)),
            'stage' => 'draft',
            'currency_code' => 'MAD',
            'created_by' => optional($request->user())->id,
        ]));

        // Mark vehicle as available for sale
        Vehicle::where('id', $listing->vehicle_id)->update([
            'availability_status' => 'for_sale',
        ]);

        return ApiResponse::success($listing->fresh('vehicle'), null, null, 201);
    }

    public function show(UsedCarListing $usedCarListing): JsonResponse
    {
        $usedCarListing->load([
            'vehicle.brand',
            'vehicle.model',
            'valuations',
            'sales.invoice',
            'sales.accountingEntry',
            'sales.ownershipTransfers',
            'reservedBy',
            'soldTo',
        ]);

        return ApiResponse::success($usedCarListing);
    }

    public function update(Request $request, UsedCarListing $usedCarListing): JsonResponse
    {
        $data = $request->validate([
            'asking_price' => ['nullable', 'numeric', 'min:0'],
            'min_acceptable_price' => ['nullable', 'numeric', 'min:0'],
            'publication_channel' => ['nullable', 'string', 'max:80'],
            'stage' => ['sometimes', 'in:draft,evaluated,published,reserved,sold,cancelled'],
            'notes' => ['nullable', 'string'],
        ]);

        if (isset($data['stage']) && $data['stage'] === 'published' && ! $usedCarListing->published_at) {
            $data['published_at'] = now();
        }

        $usedCarListing->fill($data)->save();

        return ApiResponse::success($usedCarListing->fresh('vehicle'));
    }

    public function destroy(UsedCarListing $usedCarListing): JsonResponse
    {
        if (in_array($usedCarListing->stage, ['sold'], true)) {
            return ApiResponse::message('Sold listings cannot be deleted.', 422);
        }
        $usedCarListing->delete();

        return ApiResponse::message('Listing archived', 200);
    }

    // ==================================================================
    // Evaluation
    // ==================================================================

    public function evaluate(Request $request, UsedCarListing $usedCarListing): JsonResponse
    {
        $data = $request->validate([
            'method' => ['required', 'in:expert,argus,comparable,automated'],
            'market_value' => ['nullable', 'numeric', 'min:0'],
            'trade_in_value' => ['nullable', 'numeric', 'min:0'],
            'suggested_price' => ['nullable', 'numeric', 'min:0'],
            'condition_score' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'mileage' => ['nullable', 'integer', 'min:0'],
            'factors' => ['nullable', 'array'],
            'notes' => ['nullable', 'string'],
        ]);

        $valuation = null;
        DB::transaction(function () use (&$valuation, $data, $usedCarListing, $request) {
            $valuation = UsedCarValuation::create(array_merge($data, [
                'id' => (string) Str::uuid(),
                'listing_id' => $usedCarListing->id,
                'valued_by_user_id' => optional($request->user())->id,
                'valued_at' => now(),
            ]));

            // Update the listing's latest estimated value + promote stage
            $usedCarListing->estimated_value = $data['market_value'] ?? $data['suggested_price'] ?? $usedCarListing->estimated_value;
            $usedCarListing->valuation_score = $this->composeValuationScore($data);
            if (! $usedCarListing->asking_price && isset($data['suggested_price'])) {
                $usedCarListing->asking_price = $data['suggested_price'];
            }
            if ($usedCarListing->stage === 'draft') {
                $usedCarListing->stage = 'evaluated';
            }
            $usedCarListing->save();
        });

        return ApiResponse::success($valuation, null, null, 201);
    }

    public function valuations(UsedCarListing $usedCarListing): JsonResponse
    {
        return ApiResponse::success($usedCarListing->valuations()->get());
    }

    public function publish(UsedCarListing $usedCarListing): JsonResponse
    {
        if (! in_array($usedCarListing->stage, ['draft', 'evaluated'], true)) {
            return ApiResponse::message('Listing cannot be published from current stage.', 422);
        }
        $usedCarListing->stage = 'published';
        $usedCarListing->published_at = now();
        $usedCarListing->save();

        return ApiResponse::success($usedCarListing);
    }

    public function reserve(Request $request, UsedCarListing $usedCarListing): JsonResponse
    {
        $data = $request->validate([
            'customer_id' => ['required', 'uuid', 'exists:customers,id'],
            'reserved_until' => ['nullable', 'date'],
        ]);
        if ($usedCarListing->stage === 'sold') {
            return ApiResponse::message('Already sold.', 422);
        }
        $usedCarListing->stage = 'reserved';
        $usedCarListing->reserved_at = now();
        $usedCarListing->reserved_by_customer_id = $data['customer_id'];
        $usedCarListing->reserved_until = $data['reserved_until'] ?? now()->addDays(7);
        $usedCarListing->save();

        return ApiResponse::success($usedCarListing->fresh('reservedBy'));
    }

    public function cancelReservation(UsedCarListing $usedCarListing): JsonResponse
    {
        if ($usedCarListing->stage !== 'reserved') {
            return ApiResponse::message('Listing is not reserved.', 422);
        }
        $usedCarListing->stage = $usedCarListing->published_at ? 'published' : 'evaluated';
        $usedCarListing->reserved_at = null;
        $usedCarListing->reserved_by_customer_id = null;
        $usedCarListing->reserved_until = null;
        $usedCarListing->save();

        return ApiResponse::success($usedCarListing);
    }

    // ==================================================================
    // Sale workflow
    // ==================================================================

    public function sell(Request $request, UsedCarListing $usedCarListing): JsonResponse
    {
        // Legacy endpoint now enforces strict financial completion.
        return $this->sellAndInvoice($request, $usedCarListing);
    }

    public function sellAndInvoiceByListing(Request $request, UsedCarListing $listing): JsonResponse
    {
        return $this->sellAndInvoice($request, $listing);
    }

    public function sellAndInvoice(Request $request, UsedCarListing $usedCarListing): JsonResponse
    {
        $data = $request->validate([
            'buyer_customer_id' => ['required', 'uuid', 'exists:customers,id'],
            'sale_price' => ['required', 'numeric', 'min:0'],
            'discount_amount' => ['sometimes', 'numeric', 'min:0'],
            'vat_mode' => ['sometimes', 'in:standard,margin,exempt'],
            'vat_rate' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'payment_method' => ['required', 'in:cash,bank_transfer,check,card,financed'],
            'amount_paid' => ['sometimes', 'numeric', 'min:0'],
            'sale_date' => ['sometimes', 'date'],
            'branch_id' => ['nullable', 'uuid'],
            'contract_id' => ['nullable', 'uuid'],
            'notes' => ['nullable', 'string'],
            'override_without_invoice' => ['sometimes', 'boolean'],
            'override_unpaid_transfer' => ['sometimes', 'boolean'],
            'override_reason' => ['nullable', 'string', 'max:500'],
        ]);

        if ($usedCarListing->stage === 'sold') {
            return ApiResponse::message('Already sold.', 422);
        }

        $vehicle = Vehicle::query()->find($usedCarListing->vehicle_id);
        if (! $vehicle) {
            return ApiResponse::message('Vehicle not found for listing.', 422);
        }

        $hasActiveContract = Contract::query()
            ->where('vehicle_id', $vehicle->id)
            ->where('status', 'active')
            ->exists();
        if ($hasActiveContract) {
            return ApiResponse::message('Vehicle has an active contract and cannot be sold.', 422);
        }

        $user = $request->user();
        $isAdminOverride = (($user?->role ?? '') === 'ADMIN');
        $overrideWithoutInvoice = (bool) ($data['override_without_invoice'] ?? false);
        if ($overrideWithoutInvoice && ! $isAdminOverride) {
            return ApiResponse::message('Only ADMIN can override invoice requirement.', 403);
        }

        $pricing = $this->computeSalePricing(
            salePrice: (float) $data['sale_price'],
            discount: (float) ($data['discount_amount'] ?? 0),
            vatMode: (string) ($data['vat_mode'] ?? 'standard'),
            vatRate: (float) ($data['vat_rate'] ?? 20),
            vehicle: $vehicle,
        );

        $amountPaid = (float) ($data['amount_paid'] ?? 0);
        if ($amountPaid > ($pricing['total_amount'] + 0.001)) {
            return ApiResponse::message('Amount paid cannot exceed total invoice amount.', 422);
        }
        $paymentStatus = $amountPaid <= 0
            ? 'pending'
            : ($amountPaid >= $pricing['total_amount'] ? 'paid' : 'partial');

        $sale = null;
        $invoice = null;
        $payment = null;
        $transfer = null;
        $entry = null;

        DB::transaction(function () use (
            &$sale,
            &$invoice,
            &$payment,
            &$transfer,
            &$entry,
            $usedCarListing,
            $vehicle,
            $data,
            $pricing,
            $amountPaid,
            $paymentStatus,
            $user,
            $overrideWithoutInvoice
        ) {
            $sale = UsedCarSale::query()->create([
                'id' => (string) Str::uuid(),
                'listing_id' => $usedCarListing->id,
                'vehicle_id' => $usedCarListing->vehicle_id,
                'buyer_customer_id' => $data['buyer_customer_id'],
                'branch_id' => $data['branch_id'] ?? $usedCarListing->branch_id,
                'sale_number' => 'SALE-'.strtoupper(Str::random(8)),
                'sale_price' => $data['sale_price'],
                'discount_amount' => $data['discount_amount'] ?? 0,
                'vat_mode' => $pricing['vat_mode'],
                'vat_rate' => $pricing['vat_rate'],
                'taxable_base' => $pricing['taxable_base'],
                'tax_amount' => $pricing['tax_amount'],
                'net_sale_amount' => $pricing['net_amount'],
                'total_amount' => $pricing['total_amount'],
                'currency_code' => 'MAD',
                'payment_method' => $data['payment_method'],
                'payment_status' => $paymentStatus,
                'amount_paid' => $amountPaid,
                'sale_date' => $data['sale_date'] ?? now(),
                'contract_id' => $data['contract_id'] ?? null,
                'notes' => $data['notes'] ?? null,
                'closed_by_user_id' => $user?->id,
                'accounting_status' => 'pending',
                'transfer_status' => 'initiated',
            ]);

            if (! $overrideWithoutInvoice) {
                $invoice = $this->createSaleInvoice($sale, $pricing, $user?->id, (string) ($data['notes'] ?? ''));
                $invoice->status = 'issued';
                $invoice->issued_at = now();
                $invoice->save();
                $sale->invoice_id = $invoice->id;
            }

            if ($invoice && $amountPaid > 0) {
                $payment = $this->createAndAllocatePayment(
                    invoice: $invoice,
                    amountPaid: $amountPaid,
                    paymentMethod: (string) $data['payment_method'],
                    paymentDate: $data['sale_date'] ?? now()->toDateString(),
                    branchId: $data['branch_id'] ?? $usedCarListing->branch_id,
                    userId: $user?->id,
                    notes: (string) ($data['notes'] ?? ''),
                );
                $sale->payment_status = (string) ($invoice->status === 'paid' ? 'paid' : 'partial');
                $sale->amount_paid = $amountPaid;
            }

            $entry = null;
            if ($invoice) {
                $entry = $this->postUsedCarAccounting($sale, $invoice, $vehicle, $user?->id);
                $sale->accounting_entry_id = $entry?->id;
                $sale->accounting_status = $entry ? 'posted' : 'pending';
            } elseif ($overrideWithoutInvoice) {
                $sale->accounting_status = 'skipped_override';
            }
            $sale->save();

            $usedCarListing->stage = 'sold';
            $usedCarListing->sold_at = now();
            $usedCarListing->sold_to_customer_id = $data['buyer_customer_id'];
            $usedCarListing->final_sale_price = $data['sale_price'];
            $usedCarListing->save();

            $vehicle->status = 'sold';
            $vehicle->availability_status = 'sold';
            $vehicle->save();

            $transfer = VehicleOwnershipTransfer::query()->create([
                'id' => (string) Str::uuid(),
                'vehicle_id' => $usedCarListing->vehicle_id,
                'sale_id' => $sale->id,
                'to_customer_id' => $data['buyer_customer_id'],
                'transfer_type' => 'sale',
                'transfer_status' => 'initiated',
                'transfer_date' => now()->toDateString(),
                'notes' => $invoice && $invoice->status !== 'paid'
                    ? 'Blocked until invoice is paid.'
                    : null,
            ]);
        });

        AuditLogger::financialAction(
            action: 'used_car_sale_closed',
            subject: $sale,
            user: $request->user(),
            request: $request,
            label: 'Vente VO finalisée avec finance',
            after: [
                'invoice_id' => $sale->invoice_id,
                'payment_status' => $sale->payment_status,
                'accounting_status' => $sale->accounting_status,
                'vat_mode' => $sale->vat_mode,
                'vat_rate' => $sale->vat_rate,
                'override_without_invoice' => $overrideWithoutInvoice,
                'override_reason' => $data['override_reason'] ?? null,
            ],
        );

        return ApiResponse::success([
            'sale' => $sale->fresh(['buyer', 'vehicle', 'ownershipTransfers', 'invoice', 'accountingEntry']),
            'invoice' => $invoice?->fresh(['lines', 'allocations']),
            'payment' => $payment?->fresh(['allocations']),
            'transfer' => $transfer,
            'warnings' => $this->saleWarnings($sale->fresh(['invoice', 'ownershipTransfers'])),
        ], null, null, 201);
    }

    public function transfers(UsedCarListing $usedCarListing): JsonResponse
    {
        $sales = $usedCarListing->sales()->with('ownershipTransfers')->get();
        $transfers = $sales->flatMap(fn ($s) => $s->ownershipTransfers);

        return ApiResponse::success($transfers);
    }

    public function updateTransfer(Request $request, VehicleOwnershipTransfer $transfer): JsonResponse
    {
        $data = $request->validate([
            'transfer_status' => ['required', 'in:initiated,docs_submitted,stamped,completed,failed'],
            'admin_reference' => ['nullable', 'string', 'max:120'],
            'transfer_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string'],
            'documents' => ['nullable', 'array'],
            'override_unpaid_invoice' => ['sometimes', 'boolean'],
            'override_reason' => ['nullable', 'string', 'max:500'],
        ]);

        if ($data['transfer_status'] === 'completed' && $transfer->sale_id) {
            $sale = UsedCarSale::query()->with('invoice')->find($transfer->sale_id);
            if ($sale && $sale->invoice && $sale->invoice->status !== 'paid') {
                $isAdmin = (($request->user()?->role ?? '') === 'ADMIN');
                $override = (bool) ($data['override_unpaid_invoice'] ?? false);
                if (! ($override && $isAdmin)) {
                    return ApiResponse::message('Cannot complete transfer while sale invoice is unpaid.', 422);
                }
                $transfer->notes = trim((string) (($transfer->notes ?? '')."\nOverride: ".($data['override_reason'] ?? 'No reason')));
            }
        }
        $transfer->fill($data);
        if ($data['transfer_status'] === 'completed') {
            $transfer->completed_at = now();
        }
        $transfer->save();

        if ($transfer->sale_id) {
            UsedCarSale::query()->where('id', $transfer->sale_id)->update([
                'transfer_status' => $transfer->transfer_status,
            ]);
        }

        AuditLogger::updated($transfer, $request->user(), request: $request, legal: true);

        return ApiResponse::success($transfer);
    }

    // ==================================================================
    // Helpers
    // ==================================================================

    /**
     * @return array{vat_mode:string,vat_rate:float,taxable_base:float,tax_amount:float,net_amount:float,total_amount:float}
     */
    private function computeSalePricing(float $salePrice, float $discount, string $vatMode, float $vatRate, Vehicle $vehicle): array
    {
        $net = max(0, round($salePrice - $discount, 2));
        $vatMode = in_array($vatMode, ['standard', 'margin', 'exempt'], true) ? $vatMode : 'standard';
        $vatRate = max(0, $vatRate);
        $taxableBase = 0.0;
        $tax = 0.0;

        if ($vatMode === 'standard') {
            $taxableBase = $net;
            $tax = round($taxableBase * $vatRate / 100, 2);
        } elseif ($vatMode === 'margin') {
            $referenceCost = (float) ($vehicle->purchase_price ?? $vehicle->book_value ?? 0);
            $margin = max(0, $net - $referenceCost);
            $taxableBase = $margin;
            // TVA marge VO = margin TTC base extraction.
            $tax = $vatRate > 0 ? round($margin * $vatRate / (100 + $vatRate), 2) : 0.0;
        }

        return [
            'vat_mode' => $vatMode,
            'vat_rate' => round($vatRate, 2),
            'taxable_base' => round($taxableBase, 2),
            'tax_amount' => round($tax, 2),
            'net_amount' => round($net, 2),
            'total_amount' => round($net + $tax, 2),
        ];
    }

    private function createSaleInvoice(UsedCarSale $sale, array $pricing, ?string $userId, string $notes): Invoice
    {
        $invoice = Invoice::query()->create([
            'id' => (string) Str::uuid(),
            'company_id' => $sale->listing?->company_id,
            'branch_id' => $sale->branch_id,
            'invoice_number' => $this->generateInvoiceNumber(),
            'invoice_type' => 'sale',
            'customer_id' => $sale->buyer_customer_id,
            'contract_id' => $sale->contract_id,
            'sale_id' => $sale->id,
            'issue_date' => optional($sale->sale_date)->toDateString() ?? now()->toDateString(),
            'due_date' => optional($sale->sale_date)->toDateString() ?? now()->toDateString(),
            'currency_code' => $sale->currency_code ?? 'MAD',
            'discount_amount' => (float) ($sale->discount_amount ?? 0),
            'status' => 'draft',
            'notes' => trim("Auto-generated from used-car sale.\n".$notes),
            'created_by' => $userId,
        ]);

        InvoiceLine::query()->create([
            'id' => (string) Str::uuid(),
            'invoice_id' => $invoice->id,
            'position' => 1,
            'line_type' => 'sale',
            'description' => 'Vente véhicule d\'occasion '.$sale->sale_number,
            'quantity' => 1,
            'unit_price' => $pricing['net_amount'],
            'discount_amount' => 0,
            'tax_rate' => $pricing['vat_mode'] === 'exempt' ? 0 : $pricing['vat_rate'],
            'tax_amount' => $pricing['tax_amount'],
            'line_total' => $pricing['total_amount'],
            'metadata' => [
                'vat_mode' => $pricing['vat_mode'],
                'taxable_base' => $pricing['taxable_base'],
                'sale_id' => $sale->id,
            ],
        ]);

        $invoice->recalculateTotals();
        $invoice->save();

        return $invoice;
    }

    private function createAndAllocatePayment(
        Invoice $invoice,
        float $amountPaid,
        string $paymentMethod,
        string $paymentDate,
        ?string $branchId,
        ?string $userId,
        string $notes,
    ): Payment {
        $payment = Payment::query()->create([
            'id' => (string) Str::uuid(),
            'company_id' => $invoice->company_id,
            'branch_id' => $branchId,
            'payment_number' => $this->generatePaymentNumber(),
            'customer_id' => $invoice->customer_id,
            'payment_method' => $paymentMethod,
            'payment_direction' => 'incoming',
            'amount' => $amountPaid,
            'currency_code' => $invoice->currency_code ?? 'MAD',
            'amount_allocated' => 0,
            'amount_unallocated' => $amountPaid,
            'status' => 'received',
            'payment_date' => $paymentDate,
            'notes' => trim("Auto-captured during used-car sale.\n".$notes),
            'received_by_user_id' => $userId,
        ]);

        PaymentAllocation::query()->create([
            'id' => (string) Str::uuid(),
            'payment_id' => $payment->id,
            'invoice_id' => $invoice->id,
            'amount_allocated' => $amountPaid,
            'allocated_at' => now(),
            'allocated_by_user_id' => $userId,
            'notes' => 'Auto-allocation from used-car sale workflow',
        ]);

        $payment->recalculateAllocation();
        $invoice->refreshPaymentStatus();

        return $payment->fresh(['allocations']);
    }

    private function postUsedCarAccounting(UsedCarSale $sale, Invoice $invoice, Vehicle $vehicle, ?string $userId): ?AccountingEntry
    {
        try {
            $map = $this->mappingService->requireMappings(
                $invoice->company_id,
                ['account_client', 'account_tva_collectee', 'account_vente_vo', 'account_immobilisation_vehicule', 'account_amortissement_cumule']
            );
        } catch (RuntimeException) {
            return null;
        }

        if (AccountingEntry::query()->where('source_type', 'used_car_sale')->where('source_id', $sale->id)->exists()) {
            return AccountingEntry::query()->where('source_type', 'used_car_sale')->where('source_id', $sale->id)->first();
        }

        $journal = $this->resolveJournal('sales');
        $period = $this->resolvePeriod($invoice->issue_date?->toDateString() ?? now()->toDateString());
        $entry = AccountingEntry::query()->create([
            'id' => (string) Str::uuid(),
            'company_id' => $invoice->company_id,
            'branch_id' => $invoice->branch_id,
            'journal_id' => $journal->id,
            'fiscal_period_id' => $period?->id,
            'entry_number' => $this->nextEntryNumber($journal),
            'entry_date' => $invoice->issue_date?->toDateString() ?? now()->toDateString(),
            'description' => "Vente VO {$sale->sale_number}",
            'reference' => $invoice->invoice_number,
            'status' => 'draft',
            'source_type' => 'used_car_sale',
            'source_id' => $sale->id,
            'currency_code' => $invoice->currency_code ?? 'MAD',
            'created_by_user_id' => $userId,
        ]);

        $lines = [];
        $order = 1;
        $total = (float) $sale->total_amount;
        $net = (float) $sale->net_sale_amount;
        $tax = (float) $sale->tax_amount;
        $asset = FixedAsset::query()
            ->where('vehicle_id', $vehicle->id)
            ->whereNull('deleted_at')
            ->orderByDesc('created_at')
            ->first();
        $bookValue = (float) ($asset?->book_value ?? $vehicle->book_value ?? 0);
        $assetCost = (float) ($asset?->acquisition_cost ?? $vehicle->purchase_price ?? $bookValue);
        $accDep = (float) ($asset?->accumulated_depreciation ?? max(0, $assetCost - $bookValue));

        // Receivable + sale revenue + VAT
        $lines[] = $this->accountingLine($entry->id, $order++, $map['account_client'], "Créance client VO {$sale->buyer_customer_id}", $total, 0);
        $lines[] = $this->accountingLine($entry->id, $order++, $map['account_vente_vo'], 'Produit de vente VO', 0, $net);
        if ($tax > 0) {
            $lines[] = $this->accountingLine($entry->id, $order++, $map['account_tva_collectee'], 'TVA vente VO', 0, $tax);
        }

        // Asset exit + gain/loss lines if asset exists.
        if ($assetCost > 0) {
            if ($accDep > 0) {
                $lines[] = $this->accountingLine($entry->id, $order++, $map['account_amortissement_cumule'], 'Sortie amortissement cumulé', $accDep, 0);
            }
            $lines[] = $this->accountingLine($entry->id, $order++, $map['account_immobilisation_vehicule'], 'Sortie coût immobilisation', 0, $assetCost);

            $gainLoss = round($net - $bookValue, 2);
            if ($gainLoss > 0) {
                $lines[] = $this->accountingLine($entry->id, $order++, '7751', 'Plus-value cession immobilisation', 0, $gainLoss);
            } elseif ($gainLoss < 0) {
                $lines[] = $this->accountingLine($entry->id, $order++, '6751', 'Moins-value cession immobilisation', abs($gainLoss), 0);
            }

            if ($asset) {
                $asset->status = 'disposed';
                $asset->disposal_date = $invoice->issue_date ?? now()->toDateString();
                $asset->disposal_amount = $net;
                $asset->disposal_entry_id = $entry->id;
                $asset->book_value = 0;
                $asset->save();
            }
        }

        AccountingEntryLine::query()->insert($lines);
        $entry->recalculateTotals();
        $entry->save();

        return $entry;
    }

    /**
     * @return array<string, mixed>
     */
    private function accountingLine(string $entryId, int $order, string $accountCode, string $label, float $debit, float $credit): array
    {
        return [
            'id' => (string) Str::uuid(),
            'entry_id' => $entryId,
            'account_code' => $accountCode,
            'account_id' => null,
            'line_order' => $order,
            'label' => $label,
            'debit' => round($debit, 2),
            'credit' => round($credit, 2),
            'currency_code' => 'MAD',
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }

    private function resolveJournal(string $type): AccountingJournal
    {
        return AccountingJournal::query()
            ->where('journal_type', $type)
            ->where('is_active', true)
            ->firstOrFail();
    }

    private function resolvePeriod(string $date): ?FiscalPeriod
    {
        return FiscalPeriod::query()
            ->where('status', 'open')
            ->whereDate('start_date', '<=', $date)
            ->whereDate('end_date', '>=', $date)
            ->first();
    }

    private function nextEntryNumber(AccountingJournal $journal): string
    {
        $prefix = $journal->sequence_prefix ?? 'JNL';
        $year = now()->format('Y');
        $seq = (int) $journal->sequence_next;
        $journal->increment('sequence_next');

        return $prefix.$year.'-'.str_pad((string) $seq, 5, '0', STR_PAD_LEFT);
    }

    private function generateInvoiceNumber(): string
    {
        $prefix = 'INV-'.now()->format('Ym').'-';
        $last = Invoice::query()->where('invoice_number', 'like', $prefix.'%')
            ->orderByDesc('invoice_number')->value('invoice_number');
        $seq = $last ? ((int) substr((string) $last, strlen($prefix)) + 1) : 1;

        return $prefix.str_pad((string) $seq, 5, '0', STR_PAD_LEFT);
    }

    private function generatePaymentNumber(): string
    {
        $prefix = 'PAY-'.now()->format('Ym').'-';
        $last = Payment::query()->where('payment_number', 'like', $prefix.'%')
            ->orderByDesc('payment_number')->value('payment_number');
        $seq = $last ? ((int) substr((string) $last, strlen($prefix)) + 1) : 1;

        return $prefix.str_pad((string) $seq, 5, '0', STR_PAD_LEFT);
    }

    /**
     * @return array<int, string>
     */
    private function saleWarnings(UsedCarSale $sale): array
    {
        $warnings = [];
        if (! $sale->invoice_id) {
            $warnings[] = 'Invoice missing';
        } elseif ($sale->invoice && $sale->invoice->status !== 'paid') {
            $warnings[] = 'Invoice unpaid';
        }
        if ($sale->accounting_status !== 'posted') {
            $warnings[] = 'Accounting not posted';
        }
        $transfer = $sale->ownershipTransfers()->latest('created_at')->first();
        if ($transfer && $transfer->transfer_status !== 'completed') {
            $warnings[] = 'Ownership transfer not completed';
        }

        return $warnings;
    }

    private function composeValuationScore(array $data): ?float
    {
        if (! empty($data['condition_score'])) {
            return (float) $data['condition_score'];
        }
        if (! empty($data['market_value']) && ! empty($data['suggested_price'])) {
            $diff = abs($data['market_value'] - $data['suggested_price']);
            $max = max($data['market_value'], $data['suggested_price']);
            if ($max > 0) {
                return round(100 - ($diff / $max) * 100, 2);
            }
        }

        return null;
    }
}
