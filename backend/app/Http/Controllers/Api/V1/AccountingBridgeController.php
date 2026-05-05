<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AccountingEntry;
use App\Models\AccountingEntryLine;
use App\Models\AccountingJournal;
use App\Models\DepreciationLine;
use App\Models\FixedAsset;
use App\Models\FiscalPeriod;
use App\Models\Invoice;
use App\Models\Payment;
use App\Services\AccountingMappingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

class AccountingBridgeController extends Controller
{
    public function __construct(private readonly AccountingMappingService $mappingService) {}

    // ==================================================================
    // POST /accounting/bridge/invoice/{invoice}
    // ==================================================================

    public function fromInvoice(Request $request, Invoice $invoice): JsonResponse
    {
        try {
            $map = $this->mappingService->requireMappings(
                optional($request->user())->company_id ?? $invoice->company_id,
                ['account_client', 'account_tva_collectee', 'account_produit_location', 'account_vente_vo']
            );
        } catch (RuntimeException $e) {
            return ApiResponse::error($e->getMessage(), 422);
        }

        if (AccountingEntry::where('source_type', 'invoice')->where('source_id', $invoice->id)->exists()) {
            return ApiResponse::message('Accounting entry already generated for this invoice.', 422);
        }
        if (! in_array($invoice->status, ['issued', 'partial', 'paid', 'overdue'], true)) {
            return ApiResponse::message('Invoice must be issued before accounting entry can be generated.', 422);
        }

        $entry = null;
        DB::transaction(function () use (&$entry, $invoice, $request) {
            $journal = $this->resolveJournal('sales');
            $period = $this->resolvePeriod($invoice->issue_date?->toDateString() ?? now()->toDateString());

            $entry = AccountingEntry::create([
                'id' => (string) Str::uuid(),
                'company_id' => $invoice->company_id,
                'branch_id' => $invoice->branch_id,
                'journal_id' => $journal->id,
                'fiscal_period_id' => $period?->id,
                'entry_number' => $this->nextNumber($journal),
                'entry_date' => $invoice->issue_date?->toDateString() ?? now()->toDateString(),
                'description' => "Facture {$invoice->invoice_number}",
                'reference' => $invoice->invoice_number,
                'status' => 'draft',
                'source_type' => 'invoice',
                'source_id' => $invoice->id,
                'currency_code' => $invoice->currency_code ?? 'MAD',
                'created_by_user_id' => optional($request->user())->id,
            ]);

            $subtotal = (float) $invoice->subtotal_amount;
            $tax = (float) $invoice->tax_amount;
            $total = (float) $invoice->total_amount;

            $lines = [
                // Debit: client receivable
                $this->line($entry->id, 1, $map['account_client'], "Client {$invoice->customer_id}", $total, 0),
                // Credit: revenue
                $this->line($entry->id, 2, $this->invoiceRevenueAccount($invoice, $map), "Produit {$invoice->invoice_type}", 0, $subtotal),
            ];
            if ($tax > 0) {
                // Credit: TVA collected
                $lines[] = $this->line($entry->id, 3, $map['account_tva_collectee'], 'TVA facturée', 0, $tax);
            }

            AccountingEntryLine::insert($lines);
            $entry->recalculateTotals();
            $entry->save();
        });

        return ApiResponse::success($entry->fresh('lines'), null, null, 201);
    }

    // ==================================================================
    // POST /accounting/bridge/payment/{payment}
    // ==================================================================

    public function fromPayment(Request $request, Payment $payment): JsonResponse
    {
        try {
            $map = $this->mappingService->requireMappings(
                optional($request->user())->company_id ?? $payment->company_id,
                ['account_client', 'account_banque', 'account_caisse']
            );
        } catch (RuntimeException $e) {
            return ApiResponse::error($e->getMessage(), 422);
        }

        if (AccountingEntry::where('source_type', 'payment')->where('source_id', $payment->id)->exists()) {
            return ApiResponse::message('Accounting entry already generated for this payment.', 422);
        }

        $entry = null;
        DB::transaction(function () use (&$entry, $payment, $request) {
            $journal = $this->resolveJournal($payment->payment_method === 'bank_transfer' ? 'bank' : 'cash');
            $period = $this->resolvePeriod($payment->payment_date?->toDateString() ?? now()->toDateString());

            $entry = AccountingEntry::create([
                'id' => (string) Str::uuid(),
                'company_id' => $payment->company_id,
                'branch_id' => $payment->branch_id,
                'journal_id' => $journal->id,
                'fiscal_period_id' => $period?->id,
                'entry_number' => $this->nextNumber($journal),
                'entry_date' => $payment->payment_date?->toDateString() ?? now()->toDateString(),
                'description' => "Encaissement {$payment->payment_number}",
                'reference' => $payment->payment_number,
                'status' => 'draft',
                'source_type' => 'payment',
                'source_id' => $payment->id,
                'currency_code' => $payment->currency_code ?? 'MAD',
                'created_by_user_id' => optional($request->user())->id,
            ]);

            $amount = (float) $payment->amount;
            $bankAccount = in_array($payment->payment_method, ['bank_transfer', 'check'], true)
                ? $map['account_banque']
                : $map['account_caisse'];

            $lines = [
                $this->line($entry->id, 1, $bankAccount, "Encaissement {$payment->payment_method}", $amount, 0),
                $this->line($entry->id, 2, $map['account_client'], "Client {$payment->customer_id}", 0, $amount),
            ];

            AccountingEntryLine::insert($lines);
            $entry->recalculateTotals();
            $entry->save();
        });

        return ApiResponse::success($entry->fresh('lines'), null, null, 201);
    }

    // ==================================================================
    // POST /accounting/bridge/depreciation/{depreciationLine}
    // ==================================================================

    public function fromDepreciation(Request $request, DepreciationLine $depreciationLine): JsonResponse
    {
        try {
            $map = $this->mappingService->requireMappings(
                optional($request->user())->company_id,
                ['account_amortissement', 'account_amortissement_cumule']
            );
        } catch (RuntimeException $e) {
            return ApiResponse::error($e->getMessage(), 422);
        }

        if ($depreciationLine->is_posted) {
            return ApiResponse::message('Depreciation line already posted.', 422);
        }

        $asset = FixedAsset::findOrFail($depreciationLine->asset_id);
        $entry = null;

        DB::transaction(function () use (&$entry, $depreciationLine, $asset, $request) {
            $journal = $this->resolveJournal('general');
            $period = $this->resolvePeriod($depreciationLine->period_date?->toDateString() ?? now()->toDateString());

            $entry = AccountingEntry::create([
                'id' => (string) Str::uuid(),
                'company_id' => $asset->company_id,
                'journal_id' => $journal->id,
                'fiscal_period_id' => $period?->id,
                'entry_number' => $this->nextNumber($journal),
                'entry_date' => $depreciationLine->period_date?->toDateString() ?? now()->toDateString(),
                'description' => "Dotation amort. {$asset->asset_number} — {$asset->name}",
                'reference' => $asset->asset_number,
                'status' => 'draft',
                'source_type' => 'depreciation',
                'source_id' => $depreciationLine->id,
                'currency_code' => 'MAD',
                'created_by_user_id' => optional($request->user())->id,
            ]);

            $amount = (float) $depreciationLine->amount;
            $depCode = $asset->depreciation_account_code ?? $map['account_amortissement'];
            $accCode = $asset->accumulated_dep_account_code ?? $map['account_amortissement_cumule'];

            AccountingEntryLine::insert([
                $this->line($entry->id, 1, $depCode, "Dotation amort. {$asset->name}", $amount, 0),
                $this->line($entry->id, 2, $accCode, "Amort. cumulé {$asset->name}", 0, $amount),
            ]);

            $entry->recalculateTotals();
            $entry->save();

            $depreciationLine->is_posted = true;
            $depreciationLine->entry_id = $entry->id;
            $depreciationLine->save();
        });

        return ApiResponse::success($entry->fresh('lines'), null, null, 201);
    }

    // ==================================================================
    // POST /accounting/bridge/asset-disposal/{fixedAsset}
    // ==================================================================

    public function fromAssetDisposal(Request $request, FixedAsset $fixedAsset): JsonResponse
    {
        try {
            $map = $this->mappingService->requireMappings(
                optional($request->user())->company_id ?? $fixedAsset->company_id,
                ['account_banque', 'account_immobilisation_vehicule', 'account_amortissement_cumule', 'account_vente_vo']
            );
        } catch (RuntimeException $e) {
            return ApiResponse::error($e->getMessage(), 422);
        }

        if ($fixedAsset->status !== 'disposed') {
            return ApiResponse::message('Asset must be disposed first (call /dispose endpoint).', 422);
        }
        if ($fixedAsset->disposal_entry_id) {
            return ApiResponse::message('Disposal entry already generated.', 422);
        }

        $entry = null;
        DB::transaction(function () use (&$entry, $fixedAsset, $request) {
            $journal = $this->resolveJournal('general');
            $period = $this->resolvePeriod($fixedAsset->disposal_date?->toDateString() ?? now()->toDateString());

            $entry = AccountingEntry::create([
                'id' => (string) Str::uuid(),
                'company_id' => $fixedAsset->company_id,
                'journal_id' => $journal->id,
                'fiscal_period_id' => $period?->id,
                'entry_number' => $this->nextNumber($journal),
                'entry_date' => $fixedAsset->disposal_date?->toDateString() ?? now()->toDateString(),
                'description' => "Cession immob. {$fixedAsset->asset_number} — {$fixedAsset->name}",
                'reference' => $fixedAsset->asset_number,
                'status' => 'draft',
                'source_type' => 'asset_disposal',
                'source_id' => $fixedAsset->id,
                'currency_code' => 'MAD',
                'created_by_user_id' => optional($request->user())->id,
            ]);

            $cost = (float) $fixedAsset->acquisition_cost;
            $accDep = (float) $fixedAsset->accumulated_depreciation;
            $bookValue = max(0, $cost - $accDep);
            $proceeds = (float) ($fixedAsset->disposal_amount ?? 0);
            $assetCode = $fixedAsset->asset_account_code ?? $map['account_immobilisation_vehicule'];
            $accDepCode = $fixedAsset->accumulated_dep_account_code ?? $map['account_amortissement_cumule'];

            $lineOrder = 1;
            $lines = [];
            // Remove accumulated depreciation
            if ($accDep > 0) {
                $lines[] = $this->line($entry->id, $lineOrder++, $accDepCode, "Extourne amort. cumulé", $accDep, 0);
            }
            // Remove asset at cost
            $lines[] = $this->line($entry->id, $lineOrder++, $assetCode, "Sortie d'actif au coût", 0, $cost);
            // Book value loss (if proceeds < book value)
            if ($bookValue > 0) {
                $lines[] = $this->line($entry->id, $lineOrder++, '6512', "VNA cédée", $bookValue, 0);
            }
            // Proceeds received
            if ($proceeds > 0) {
                $lines[] = $this->line($entry->id, $lineOrder++, $map['account_banque'], "Produit de cession", $proceeds, 0);
                $lines[] = $this->line($entry->id, $lineOrder++, $map['account_vente_vo'], "Produit de cession immob.", 0, $proceeds);
            }

            AccountingEntryLine::insert($lines);
            $entry->recalculateTotals();
            $entry->save();

            $fixedAsset->disposal_entry_id = $entry->id;
            $fixedAsset->save();
        });

        return ApiResponse::success($entry->fresh('lines'), null, null, 201);
    }

    // ==================================================================
    // Helpers
    // ==================================================================

    private function resolveJournal(string $type): AccountingJournal
    {
        return AccountingJournal::where('journal_type', $type)->where('is_active', true)->firstOrFail();
    }

    private function resolvePeriod(string $date): ?FiscalPeriod
    {
        return FiscalPeriod::where('status', 'open')
            ->whereDate('start_date', '<=', $date)
            ->whereDate('end_date', '>=', $date)
            ->first();
    }

    private function nextNumber(AccountingJournal $journal): string
    {
        $prefix = $journal->sequence_prefix ?? 'JNL';
        $year = now()->format('Y');
        $seq = $journal->sequence_next;
        $journal->increment('sequence_next');

        return $prefix . $year . '-' . str_pad((string) $seq, 5, '0', STR_PAD_LEFT);
    }

    private function line(string $entryId, int $order, string $code, string $label, float $debit, float $credit): array
    {
        return [
            'id' => (string) Str::uuid(),
            'entry_id' => $entryId,
            'account_code' => $code,
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

    /**
     * @param array<string,string> $map
     */
    private function invoiceRevenueAccount(Invoice $invoice, array $map): string
    {
        $type = strtolower((string) ($invoice->invoice_type ?? ''));
        if (str_contains($type, 'used') || str_contains($type, 'occasion') || str_contains($type, 'vo')) {
            return $map['account_vente_vo'];
        }

        return $map['account_produit_location'];
    }
}
