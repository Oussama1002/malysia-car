<?php

namespace App\Services;

use App\Models\Contract;
use App\Models\Customer;
use App\Models\CustomerWallet;
use App\Models\WalletTransaction;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Central service for all wallet operations.
 * All public methods run inside a DB transaction and update the wallet balance atomically.
 * No cash refund path exists — only credit/debit against the avoir balance.
 */
class WalletService
{
    // ──────────────────────────────────────────────────────────────────────────
    // Read helpers
    // ──────────────────────────────────────────────────────────────────────────

    /** Get or create the wallet for a customer (lazy init). */
    public function getOrCreate(Customer $customer): CustomerWallet
    {
        return CustomerWallet::firstOrCreate(
            ['customer_id' => $customer->id],
            [
                'id'            => (string) Str::uuid(),
                'company_id'    => $customer->company_id,
                'customer_id'   => $customer->id,
                'balance'       => 0,
                'currency_code' => 'MAD',
            ]
        );
    }

    public function balance(Customer $customer): float
    {
        return (float) $this->getOrCreate($customer)->balance;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Credit
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Add credit to the customer wallet.
     *
     * @param  string  $type  Semantic type: 'early_return' | 'manual_credit' | …
     * @param  string|null  $referenceType  e.g. 'contract', 'reservation'
     * @param  string|null  $referenceId    UUID of the referenced entity
     * @param  string|null  $description    Human-readable note (shown in UI)
     * @param  string|null  $reason         Required for manual adjustments
     * @param  string|null  $performedBy    User UUID
     */
    public function credit(
        Customer $customer,
        float $amount,
        string $type,
        ?string $referenceType = null,
        ?string $referenceId = null,
        ?string $description = null,
        ?string $reason = null,
        ?string $performedBy = null,
    ): WalletTransaction {
        if ($amount <= 0) {
            throw new RuntimeException("Wallet credit amount must be positive, got {$amount}.");
        }

        return DB::transaction(function () use ($customer, $amount, $type, $referenceType, $referenceId, $description, $reason, $performedBy) {
            $wallet = $this->getOrCreate($customer);

            // Lock the wallet row for update to prevent race conditions
            $wallet = CustomerWallet::lockForUpdate()->find($wallet->id);
            $wallet->balance = round((float) $wallet->balance + $amount, 2);
            $wallet->save();

            return WalletTransaction::create([
                'id'             => (string) Str::uuid(),
                'company_id'     => $customer->company_id,
                'wallet_id'      => $wallet->id,
                'customer_id'    => $customer->id,
                'direction'      => 'credit',
                'type'           => $type,
                'amount'         => round($amount, 2),
                'balance_after'  => $wallet->balance,
                'reference_type' => $referenceType,
                'reference_id'   => $referenceId,
                'description'    => $description,
                'reason'         => $reason,
                'performed_by'   => $performedBy,
            ]);
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Debit
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Debit the wallet (apply credit to a reservation/contract).
     * Partial usage is supported — $amount can be less than the balance.
     * Throws if the requested amount exceeds the current balance.
     */
    public function debit(
        Customer $customer,
        float $amount,
        string $type,
        ?string $referenceType = null,
        ?string $referenceId = null,
        ?string $description = null,
        ?string $performedBy = null,
    ): WalletTransaction {
        if ($amount <= 0) {
            throw new RuntimeException("Wallet debit amount must be positive, got {$amount}.");
        }

        return DB::transaction(function () use ($customer, $amount, $type, $referenceType, $referenceId, $description, $performedBy) {
            $wallet = CustomerWallet::lockForUpdate()
                ->where('customer_id', $customer->id)
                ->firstOrFail();

            if ((float) $wallet->balance < round($amount, 2)) {
                throw new RuntimeException(
                    "Solde insuffisant : disponible {$wallet->balance} MAD, demandé {$amount} MAD."
                );
            }

            $wallet->balance = round((float) $wallet->balance - $amount, 2);
            $wallet->save();

            return WalletTransaction::create([
                'id'             => (string) Str::uuid(),
                'company_id'     => $customer->company_id,
                'wallet_id'      => $wallet->id,
                'customer_id'    => $customer->id,
                'direction'      => 'debit',
                'type'           => $type,
                'amount'         => round($amount, 2),
                'balance_after'  => $wallet->balance,
                'reference_type' => $referenceType,
                'reference_id'   => $referenceId,
                'description'    => $description,
                'reason'         => null,
                'performed_by'   => $performedBy,
            ]);
        });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Business logic: early return credit calculation
    // ──────────────────────────────────────────────────────────────────────────

    /**
     * Calculate the refundable avoir amount for an early contract return.
     *
     * Logic:
     *   – Daily rate  = monthly_payment / 30
     *   – Unused days = days between actual closure date and planned end date
     *   – Credit      = unused_days × daily_rate
     *
     * Returns 0 if the contract has no end date, no monthly payment,
     * or if the return is not before the planned end date.
     */
    public function calculateEarlyReturnCredit(Contract $contract, ?\DateTimeInterface $actualReturnDate = null): float
    {
        $endDate     = $contract->end_date     ? \Carbon\Carbon::parse($contract->end_date)     : null;
        $returnDate  = $actualReturnDate       ? \Carbon\Carbon::parse($actualReturnDate)       : now();
        $monthly     = (float) ($contract->monthly_payment ?? 0);

        if (! $endDate || $monthly <= 0) {
            return 0.0;
        }

        $unusedDays = (int) $returnDate->diffInDays($endDate, false); // negative if overdue
        if ($unusedDays <= 0) {
            return 0.0;
        }

        $dailyRate = $monthly / 30;

        return round($dailyRate * $unusedDays, 2);
    }

    /**
     * Credit the customer wallet for an early return and return the transaction.
     * Should be called inside ContractController::terminate when early_return reason.
     */
    public function applyEarlyReturnCredit(
        Contract $contract,
        ?string $performedBy = null,
    ): ?WalletTransaction {
        $customer = $contract->customer;
        if (! $customer) {
            return null;
        }

        $credit = $this->calculateEarlyReturnCredit($contract);
        if ($credit <= 0) {
            return null;
        }

        $endDate    = $contract->end_date ? \Carbon\Carbon::parse($contract->end_date)->toDateString() : '—';
        $returnDate = now()->toDateString();

        return $this->credit(
            customer: $customer,
            amount: $credit,
            type: 'early_return',
            referenceType: 'contract',
            referenceId: (string) $contract->id,
            description: "Retour anticipé du contrat {$contract->contract_number} — retour le {$returnDate}, échéance prévue {$endDate}",
            reason: null,
            performedBy: $performedBy,
        );
    }
}
