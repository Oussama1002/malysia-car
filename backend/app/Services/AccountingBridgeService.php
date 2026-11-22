<?php

namespace App\Services;

use App\Models\AccountingEntry;
use App\Models\AccountingEntryLine;
use App\Models\AccountingJournal;
use App\Models\Customer;
use App\Models\DepreciationLine;
use App\Models\Expense;
use App\Models\FiscalPeriod;
use App\Models\FixedAsset;
use App\Models\FixedChargePayment;
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
            $journal = $this->resolveJournal('sales', $invoice->company_id);
            $period = $this->resolvePeriod($invoice->issue_date?->toDateString() ?? now()->toDateString(), $invoice->company_id);

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

            // Avoirs (credit notes) : on écrit l'exact contraire d'une facture.
            // Le compte client est crédité, le produit et la TVA sont débités.
            $isCredit = strtolower((string) ($invoice->invoice_type ?? '')) === 'credit_note';
            $clientD = $isCredit ? 0 : $total;
            $clientC = $isCredit ? $total : 0;
            $revenueD = $isCredit ? $subtotal : 0;
            $revenueC = $isCredit ? 0 : $subtotal;
            $taxD = $isCredit ? $tax : 0;
            $taxC = $isCredit ? 0 : $tax;
            $label = $isCredit ? 'Avoir' : 'Produit';

            $customerLabel = $this->customerLabel($invoice->customer_id);
            $lines = [
                $this->line($entry->id, 1, $map['account_client'], "Client {$customerLabel}", $clientD, $clientC, 'customer', $invoice->customer_id),
                $this->line($entry->id, 2, $this->invoiceRevenueAccount($invoice, $map), "{$label} {$invoice->invoice_type}", $revenueD, $revenueC),
            ];
            if ($tax > 0) {
                $lines[] = $this->line($entry->id, 3, $map['account_tva_collectee'], $isCredit ? 'TVA sur avoir' : 'TVA facturée', $taxD, $taxC);
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
            $journal = $this->resolveJournal($payment->payment_method === 'bank_transfer' ? 'bank' : 'cash', $payment->company_id);
            $period = $this->resolvePeriod($payment->payment_date?->toDateString() ?? now()->toDateString(), $payment->company_id);

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

            $customerLabel = $this->customerLabel($payment->customer_id);
            AccountingEntryLine::insert([
                $this->line($entry->id, 1, $bankAccount, "Encaissement {$payment->payment_method}", $amount, 0),
                $this->line($entry->id, 2, $map['account_client'], "Client {$customerLabel}", 0, $amount, 'customer', $payment->customer_id),
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
            $journal = $this->resolveJournal('general', $asset->company_id);
            $period = $this->resolvePeriod($line->period_date?->toDateString() ?? now()->toDateString(), $asset->company_id);

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
            $journal = $this->resolveJournal('general', $asset->company_id);
            $period = $this->resolvePeriod($asset->disposal_date?->toDateString() ?? now()->toDateString(), $asset->company_id);

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

    public function fromExpense(Expense $expense, ?string $userId = null): AccountingEntry
    {
        $chargeKey = AccountingMappingService::expenseAccountKeyFor($expense->category);
        $map = $this->mappingService->requireMappings(
            $expense->company_id,
            [$chargeKey, 'account_fournisseur', 'account_banque', 'account_caisse']
        );

        if (AccountingEntry::where('source_type', 'expense')->where('source_id', $expense->id)->exists()) {
            throw new RuntimeException('Accounting entry already generated for this expense.');
        }
        $isPaid = $expense->status === 'paid';

        $entry = null;
        DB::transaction(function () use (&$entry, $expense, $userId, $map, $chargeKey, $isPaid) {
            // When the expense is already paid cash/bank, book straight to the bank/cash
            // account; otherwise record a supplier payable and let the bank reconciliation
            // or a later payment clear it.
            if ($isPaid) {
                $method = strtolower((string) ($expense->payment_method ?? ''));
                $journalType = in_array($method, ['bank_transfer', 'check', 'cheque'], true) ? 'bank' : 'cash';
            } else {
                $journalType = 'general';
            }
            $journal = $this->resolveJournal($journalType, $expense->company_id);
            $date = $expense->expense_date?->toDateString() ?? now()->toDateString();
            $period = $this->resolvePeriod($date, $expense->company_id);

            $entry = AccountingEntry::create([
                'id' => (string) Str::uuid(),
                'company_id' => $expense->company_id,
                'branch_id' => $expense->branch_id,
                'journal_id' => $journal->id,
                'fiscal_period_id' => $period?->id,
                'entry_number' => $this->nextNumber($journal),
                'entry_date' => $date,
                'description' => "Dépense {$expense->label}",
                'reference' => $expense->reference,
                'status' => 'draft',
                'source_type' => 'expense',
                'source_id' => $expense->id,
                'currency_code' => $expense->currency_code ?? 'MAD',
                'created_by_user_id' => $userId,
            ]);

            $amount = (float) $expense->amount;
            $chargeAccount = $map[$chargeKey];
            $counterpart = $isPaid
                ? ($journalType === 'bank' ? $map['account_banque'] : $map['account_caisse'])
                : $map['account_fournisseur'];

            AccountingEntryLine::insert([
                $this->line($entry->id, 1, $chargeAccount, "Charge {$expense->category}", $amount, 0),
                $this->line($entry->id, 2, $counterpart, $isPaid ? 'Règlement dépense' : 'Fournisseur', 0, $amount),
            ]);
            $entry->recalculateTotals();
            $this->autoPost($entry, $userId);
        });

        return $entry->fresh('lines');
    }

    public function fromFixedChargePayment(FixedChargePayment $payment, ?string $userId = null): AccountingEntry
    {
        $charge = $payment->fixedCharge()->first();
        if (! $charge) {
            throw new RuntimeException('Fixed charge payment is not linked to a parent charge.');
        }
        $chargeKey = AccountingMappingService::expenseAccountKeyFor($charge->category);
        $map = $this->mappingService->requireMappings(
            $charge->company_id,
            [$chargeKey, 'account_banque', 'account_caisse']
        );

        if (AccountingEntry::where('source_type', 'fixed_charge_payment')->where('source_id', $payment->id)->exists()) {
            throw new RuntimeException('Accounting entry already generated for this fixed charge payment.');
        }
        if ($payment->status !== 'paid') {
            throw new RuntimeException('Fixed charge payment must be marked paid before posting.');
        }

        $entry = null;
        DB::transaction(function () use (&$entry, $payment, $charge, $userId, $map, $chargeKey) {
            $method = strtolower((string) ($payment->payment_method ?? ''));
            $journalType = in_array($method, ['bank_transfer', 'check', 'cheque'], true) ? 'bank' : 'cash';
            $journal = $this->resolveJournal($journalType, $charge->company_id);
            $date = $payment->paid_at?->toDateString()
                ?? $payment->due_date?->toDateString()
                ?? now()->toDateString();
            $period = $this->resolvePeriod($date, $charge->company_id);

            $entry = AccountingEntry::create([
                'id' => (string) Str::uuid(),
                'company_id' => $charge->company_id,
                'branch_id' => $charge->branch_id,
                'journal_id' => $journal->id,
                'fiscal_period_id' => $period?->id,
                'entry_number' => $this->nextNumber($journal),
                'entry_date' => $date,
                'description' => "Charge fixe {$charge->name}",
                'reference' => $charge->name,
                'status' => 'draft',
                'source_type' => 'fixed_charge_payment',
                'source_id' => $payment->id,
                'currency_code' => $charge->currency_code ?? 'MAD',
                'created_by_user_id' => $userId,
            ]);

            $amount = (float) $payment->amount;
            $accountFromCharge = $charge->accountingAccount?->code;
            $chargeAccount = $accountFromCharge ?: $map[$chargeKey];
            $counterpart = $journalType === 'bank' ? $map['account_banque'] : $map['account_caisse'];

            AccountingEntryLine::insert([
                $this->line($entry->id, 1, $chargeAccount, "Charge fixe {$charge->category}", $amount, 0),
                $this->line($entry->id, 2, $counterpart, 'Règlement charge fixe', 0, $amount),
            ]);
            $entry->recalculateTotals();
            $this->autoPost($entry, $userId);

            $payment->accounting_entry_id = $entry->id;
            $payment->save();
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

    private function resolveJournal(string $type, ?string $companyId = null): AccountingJournal
    {
        return AccountingJournal::query()
            ->where('journal_type', $type)
            ->where('is_active', true)
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->firstOrFail();
    }

    private function resolvePeriod(string $date, ?string $companyId = null): ?FiscalPeriod
    {
        return FiscalPeriod::query()
            ->where('status', 'open')
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->whereDate('start_date', '<=', $date)
            ->whereDate('end_date', '>=', $date)
            ->first();
    }

    /**
     * Atomic journal-number allocator. Must run inside a transaction so the
     * row lock survives until the entry is committed — two concurrent writes
     * can otherwise read the same `sequence_next` and mint colliding numbers.
     */
    private function nextNumber(AccountingJournal $journal): string
    {
        return DB::transaction(function () use ($journal) {
            $row = AccountingJournal::query()
                ->whereKey($journal->id)
                ->lockForUpdate()
                ->first(['id', 'sequence_prefix', 'sequence_next']);
            $prefix = $row->sequence_prefix ?? 'JNL';
            $seq = (int) $row->sequence_next;
            AccountingJournal::query()->whereKey($journal->id)->update(['sequence_next' => $seq + 1]);
            $year = now()->format('Y');
            return $prefix . $year . '-' . str_pad((string) $seq, 5, '0', STR_PAD_LEFT);
        });
    }

    private function line(
        string $entryId,
        int $order,
        string $code,
        string $label,
        float $debit,
        float $credit,
        ?string $thirdPartyType = null,
        ?string $thirdPartyId = null,
    ): array {
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
            'third_party_type' => $thirdPartyType,
            'third_party_id' => $thirdPartyId,
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }

    private function customerLabel(?string $customerId): string
    {
        if (! $customerId) return '-';
        $customer = Customer::find($customerId);
        if (! $customer) return $customerId;
        return trim($customer->customer_code . ' · ' . $customer->display_name);
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
