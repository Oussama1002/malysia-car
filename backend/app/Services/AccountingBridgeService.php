<?php

namespace App\Services;

use App\Models\AccountingEntry;
use App\Models\AccountingEntryLine;
use App\Models\AccountingJournal;
use App\Models\DepreciationLine;
use App\Models\FiscalPeriod;
use App\Models\FixedAsset;
use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

class AccountingBridgeService
{
    public function __construct(private readonly AccountingMappingService $mappingService) {}

    public function fromInvoice(Invoice $invoice, ?string $userId = null): AccountingEntry
    {
        $map = $this->mappingService->requireMappings(
            $invoice->company_id,
            ['account_client', 'account_tva_collectee', 'account_produit_location', 'account_vente_vo']
        );

        if (AccountingEntry::where('source_type', 'invoice')->where('source_id', $invoice->id)->exists()) {
            throw new RuntimeException('Accounting entry already generated for this invoice.');
        }
        if (! in_array($invoice->status, ['issued', 'partial', 'paid', 'overdue'], true)) {
            throw new RuntimeException('Invoice must be issued before accounting entry can be generated.');
        }

        $entry = null;
        DB::transaction(function () use (&$entry, $invoice, $userId, $map) {
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
                'created_by_user_id' => $userId,
            ]);

            $subtotal = (float) $invoice->subtotal_amount;
            $tax = (float) $invoice->tax_amount;
            $total = (float) $invoice->total_amount;

            $lines = [
                $this->line($entry->id, 1, $map['account_client'], "Client {$invoice->customer_id}", $total, 0),
                $this->line($entry->id, 2, $this->invoiceRevenueAccount($invoice, $map), "Produit {$invoice->invoice_type}", 0, $subtotal),
            ];
            if ($tax > 0) {
                $lines[] = $this->line($entry->id, 3, $map['account_tva_collectee'], 'TVA facturée', 0, $tax);
            }

            AccountingEntryLine::insert($lines);
            $entry->recalculateTotals();
            $this->autoPost($entry, $userId);
        });

        return $entry->fresh('lines');
    }

    public function fromPayment(Payment $payment, ?string $userId = null): AccountingEntry
    {
        $map = $this->mappingService->requireMappings(
            $payment->company_id,
            ['account_client', 'account_banque', 'account_caisse']
        );

        if (AccountingEntry::where('source_type', 'payment')->where('source_id', $payment->id)->exists()) {
            throw new RuntimeException('Accounting entry already generated for this payment.');
        }

        $entry = null;
        DB::transaction(function () use (&$entry, $payment, $userId, $map) {
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
                'created_by_user_id' => $userId,
            ]);

            $amount = (float) $payment->amount;
            $bankAccount = in_array($payment->payment_method, ['bank_transfer', 'check'], true)
                ? $map['account_banque']
                : $map['account_caisse'];

            AccountingEntryLine::insert([
                $this->line($entry->id, 1, $bankAccount, "Encaissement {$payment->payment_method}", $amount, 0),
                $this->line($entry->id, 2, $map['account_client'], "Client {$payment->customer_id}", 0, $amount),
            ]);
            $entry->recalculateTotals();
            $this->autoPost($entry, $userId);
        });

        return $entry->fresh('lines');
    }

    public function fromDepreciation(DepreciationLine $line, ?string $userId = null): AccountingEntry
    {
        $asset = FixedAsset::findOrFail($line->asset_id);
        $map = $this->mappingService->requireMappings(
            $asset->company_id,
            ['account_amortissement', 'account_amortissement_cumule']
        );

        if ($line->is_posted) {
            throw new RuntimeException('Depreciation line already posted.');
        }

        $entry = null;
        DB::transaction(function () use (&$entry, $line, $asset, $userId, $map) {
            $journal = $this->resolveJournal('general');
            $period = $this->resolvePeriod($line->period_date?->toDateString() ?? now()->toDateString());

            $entry = AccountingEntry::create([
                'id' => (string) Str::uuid(),
                'company_id' => $asset->company_id,
                'journal_id' => $journal->id,
                'fiscal_period_id' => $period?->id,
                'entry_number' => $this->nextNumber($journal),
                'entry_date' => $line->period_date?->toDateString() ?? now()->toDateString(),
                'description' => "Dotation amort. {$asset->asset_number} — {$asset->name}",
                'reference' => $asset->asset_number,
                'status' => 'draft',
                'source_type' => 'depreciation',
                'source_id' => $line->id,
                'currency_code' => 'MAD',
                'created_by_user_id' => $userId,
            ]);

            $amount = (float) $line->amount;
            $depCode = $asset->depreciation_account_code ?? $map['account_amortissement'];
            $accCode = $asset->accumulated_dep_account_code ?? $map['account_amortissement_cumule'];

            AccountingEntryLine::insert([
                $this->line($entry->id, 1, $depCode, "Dotation amort. {$asset->name}", $amount, 0),
                $this->line($entry->id, 2, $accCode, "Amort. cumulé {$asset->name}", 0, $amount),
            ]);
            $entry->recalculateTotals();
            $this->autoPost($entry, $userId);

            $line->is_posted = true;
            $line->entry_id = $entry->id;
            $line->save();
        });

        return $entry->fresh('lines');
    }

    public function fromAssetDisposal(FixedAsset $asset, ?string $userId = null): AccountingEntry
    {
        $map = $this->mappingService->requireMappings(
            $asset->company_id,
            ['account_banque', 'account_immobilisation_vehicule', 'account_amortissement_cumule', 'account_vente_vo']
        );

        if ($asset->status !== 'disposed') {
            throw new RuntimeException('Asset must be disposed first (call /dispose endpoint).');
        }
        if ($asset->disposal_entry_id) {
            throw new RuntimeException('Disposal entry already generated.');
        }

        $entry = null;
        DB::transaction(function () use (&$entry, $asset, $userId, $map) {
            $journal = $this->resolveJournal('general');
            $period = $this->resolvePeriod($asset->disposal_date?->toDateString() ?? now()->toDateString());

            $entry = AccountingEntry::create([
                'id' => (string) Str::uuid(),
                'company_id' => $asset->company_id,
                'journal_id' => $journal->id,
                'fiscal_period_id' => $period?->id,
                'entry_number' => $this->nextNumber($journal),
                'entry_date' => $asset->disposal_date?->toDateString() ?? now()->toDateString(),
                'description' => "Cession immob. {$asset->asset_number} — {$asset->name}",
                'reference' => $asset->asset_number,
                'status' => 'draft',
                'source_type' => 'asset_disposal',
                'source_id' => $asset->id,
                'currency_code' => 'MAD',
                'created_by_user_id' => $userId,
            ]);

            $cost = (float) $asset->acquisition_cost;
            $accDep = (float) $asset->accumulated_depreciation;
            $bookValue = max(0, $cost - $accDep);
            $proceeds = (float) ($asset->disposal_amount ?? 0);
            $assetCode = $asset->asset_account_code ?? $map['account_immobilisation_vehicule'];
            $accDepCode = $asset->accumulated_dep_account_code ?? $map['account_amortissement_cumule'];

            $order = 1;
            $lines = [];
            if ($accDep > 0) {
                $lines[] = $this->line($entry->id, $order++, $accDepCode, 'Extourne amort. cumulé', $accDep, 0);
            }
            $lines[] = $this->line($entry->id, $order++, $assetCode, "Sortie d'actif au coût", 0, $cost);
            if ($bookValue > 0) {
                $lines[] = $this->line($entry->id, $order++, '6512', 'VNA cédée', $bookValue, 0);
            }
            if ($proceeds > 0) {
                $lines[] = $this->line($entry->id, $order++, $map['account_banque'], 'Produit de cession', $proceeds, 0);
                $lines[] = $this->line($entry->id, $order++, $map['account_vente_vo'], 'Produit de cession immob.', 0, $proceeds);
            }

            AccountingEntryLine::insert($lines);
            $entry->recalculateTotals();
            $this->autoPost($entry, $userId);

            $asset->disposal_entry_id = $entry->id;
            $asset->save();
        });

        return $entry->fresh('lines');
    }

    /**
     * Silent wrapper used by model observers — mapping/race errors are logged,
     * not thrown, so a system write never fails because accounting isn't ready.
     */
    public function trySilently(string $method, mixed $model, ?string $userId = null): ?AccountingEntry
    {
        try {
            return $this->{$method}($model, $userId);
        } catch (Throwable $e) {
            Log::warning('Accounting bridge skipped', [
                'method' => $method,
                'model_id' => $model->id ?? null,
                'reason' => $e->getMessage(),
            ]);
            return null;
        }
    }

    private function autoPost(AccountingEntry $entry, ?string $userId): void
    {
        $entry->status = 'posted';
        $entry->posted_at = now();
        $entry->posted_by_user_id = $userId;
        $entry->save();
    }

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
