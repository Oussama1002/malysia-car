<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\AccountingAccount;
use App\Models\AccountingEntry;
use App\Models\AccountingEntryLine;
use App\Models\AccountingJournal;
use App\Models\FiscalPeriod;
use App\Models\FixedCharge;
use App\Models\FixedChargePayment;
use App\Support\PaymentMethodNormalizer;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

class FixedChargeService
{
    public function __construct(
        private readonly AccountingMappingService $mappingSvc,
        private readonly NotificationService $notifications,
    ) {}

    public function advanceNextDueDate(FixedCharge $charge, Carbon $fromDue): Carbon
    {
        return match ($charge->frequency) {
            'monthly' => $fromDue->copy()->addMonthNoOverflow(),
            'quarterly' => $fromDue->copy()->addMonthsNoOverflow(3),
            'yearly' => $fromDue->copy()->addYear(),
            'one_time' => $fromDue->copy(),
            default => $fromDue->copy()->addMonthNoOverflow(),
        };
    }

    /**
     * Creates the next scheduled payment row and moves next_due_date forward (non-one_time).
     */
    public function generatePayment(FixedCharge $charge): FixedChargePayment
    {
        if ($charge->status !== 'active') {
            throw new RuntimeException('Charge is not active.');
        }
        $due = $charge->next_due_date ?? $charge->start_date;
        if (! $due) {
            throw new RuntimeException('No due date.');
        }

        $payment = FixedChargePayment::query()->create([
            'id' => (string) Str::uuid(),
            'fixed_charge_id' => $charge->id,
            'due_date' => $due->toDateString(),
            'amount' => $charge->amount,
            'payment_method' => PaymentMethodNormalizer::normalize($charge->payment_method),
            'status' => 'pending',
        ]);

        if ($charge->frequency !== 'one_time') {
            $next = $this->advanceNextDueDate($charge, Carbon::parse($due->toDateString()));
            if ($charge->end_date && $next->gt(Carbon::parse($charge->end_date))) {
                $charge->next_due_date = null;
            } else {
                $charge->next_due_date = $next->toDateString();
            }
        } else {
            $charge->next_due_date = null;
        }
        $charge->save();

        return $payment;
    }

    public function markPaid(
        FixedChargePayment $payment,
        ?string $paymentMethod,
        bool $postAccounting,
        ?string $userId,
    ): FixedChargePayment {
        return DB::transaction(function () use ($payment, $paymentMethod, $postAccounting, $userId): FixedChargePayment {
            $payment->paid_at = now();
            $payment->status = 'paid';
            if ($paymentMethod) {
                $payment->payment_method = PaymentMethodNormalizer::normalize($paymentMethod);
            }
            $payment->save();

            $charge = $payment->fixedCharge;
            if ($postAccounting && $charge && $charge->accounting_account_id) {
                $entryId = $this->postExpenseEntry($charge, $payment, $userId);
                if ($entryId) {
                    $payment->accounting_entry_id = $entryId;
                    $payment->save();
                }
            }

            return $payment->fresh();
        });
    }

    public function refreshOverduePayments(): int
    {
        $n = 0;
        $today = now()->toDateString();
        FixedChargePayment::query()
            ->where('status', 'pending')
            ->whereDate('due_date', '<', $today)
            ->each(function (FixedChargePayment $p) use (&$n): void {
                $p->update(['status' => 'overdue']);
                $this->notifyOverdue($p);
                $n++;
            });

        return $n;
    }

    private function notifyOverdue(FixedChargePayment $payment): void
    {
        $charge = $payment->fixedCharge;
        if (! $charge) {
            return;
        }
        $this->notifications->notifyRoles(
            roleCodes: ['COMPTABLE', 'DIRECTEUR', 'ADMIN'],
            category: 'finance.fixed_charge_overdue',
            title: 'Charge fixe en retard',
            body: ($charge->name ?? 'Charge').' — échéance '.$payment->due_date->toDateString(),
            module: 'finance',
            priority: 'high',
            entity: $charge,
            linkUrl: '/finance/fixed-charges',
        );
    }

    private function postExpenseEntry(FixedCharge $charge, FixedChargePayment $payment, ?string $userId): ?string
    {
        $expenseAccount = AccountingAccount::query()->find($charge->accounting_account_id);
        if (! $expenseAccount) {
            return null;
        }

        $maps = $this->mappingSvc->getMappings($charge->company_id);
        $bankCode = $maps['account_banque'] ?? '5141';
        $bankAccount = AccountingAccount::query()->where('code', $bankCode)->where('is_active', true)->first();
        if (! $bankAccount) {
            return null;
        }

        $journal = AccountingJournal::query()
            ->where('is_active', true)
            ->where(function ($q): void {
                $q->where('journal_type', 'general')->orWhere('code', 'OD');
            })
            ->first()
            ?? AccountingJournal::query()->where('is_active', true)->first();

        if (! $journal) {
            return null;
        }

        $date = $payment->paid_at?->toDateString() ?? now()->toDateString();
        $period = FiscalPeriod::query()
            ->where('status', 'open')
            ->whereDate('start_date', '<=', $date)
            ->whereDate('end_date', '>=', $date)
            ->first();

        $amount = (float) $payment->amount;
        $entryId = (string) Str::uuid();

        $entry = AccountingEntry::query()->create([
            'id' => $entryId,
            'company_id' => $charge->company_id,
            'journal_id' => $journal->id,
            'fiscal_period_id' => $period?->id,
            'entry_number' => $this->nextEntryNumber($journal),
            'entry_date' => $date,
            'description' => 'Charge fixe: '.$charge->name,
            'reference' => 'FC-'.$payment->id,
            'status' => 'posted',
            'source_type' => 'fixed_charge_payment',
            'source_id' => $payment->id,
            'currency_code' => $charge->currency_code ?? 'MAD',
            'posted_at' => now(),
            'posted_by_user_id' => $userId,
            'created_by_user_id' => $userId,
        ]);

        AccountingEntryLine::query()->create([
            'id' => (string) Str::uuid(),
            'entry_id' => $entryId,
            'account_code' => $expenseAccount->code,
            'account_id' => $expenseAccount->id,
            'line_order' => 1,
            'label' => $charge->name,
            'debit' => $amount,
            'credit' => 0,
            'currency_code' => $charge->currency_code ?? 'MAD',
        ]);

        AccountingEntryLine::query()->create([
            'id' => (string) Str::uuid(),
            'entry_id' => $entryId,
            'account_code' => $bankAccount->code,
            'account_id' => $bankAccount->id,
            'line_order' => 2,
            'label' => 'Règlement charge fixe',
            'debit' => 0,
            'credit' => $amount,
            'currency_code' => $charge->currency_code ?? 'MAD',
        ]);

        $entry->refresh();
        $entry->total_debit = $amount;
        $entry->total_credit = $amount;
        $entry->save();

        return $entryId;
    }

    private function nextEntryNumber(AccountingJournal $journal): string
    {
        $prefix = $journal->sequence_prefix ?? 'JNL';
        $year = now()->format('Y');
        $seq = (int) $journal->sequence_next;
        $journal->increment('sequence_next');

        return $prefix.$year.'-'.str_pad((string) $seq, 5, '0', STR_PAD_LEFT);
    }

    /**
     * @return array<string, mixed>
     */
    public function dashboard(?string $companyId): array
    {
        $q = FixedCharge::query()->where('status', 'active');
        if ($companyId) {
            $q->where('company_id', $companyId);
        }
        $charges = $q->get();

        $monthlyTotal = 0.0;
        foreach ($charges as $c) {
            $amt = (float) $c->amount;
            $monthlyTotal += match ($c->frequency) {
                'monthly' => $amt,
                'quarterly' => $amt / 3,
                'yearly' => $amt / 12,
                'one_time' => $amt / 12,
                default => $amt,
            };
        }

        $pq = FixedChargePayment::query()->with('fixedCharge');
        if ($companyId) {
            $pq->whereHas('fixedCharge', fn ($w) => $w->where('company_id', $companyId));
        }
        $overdue = (clone $pq)->where('status', 'overdue')->count();

        $upcoming = (clone $pq)->whereIn('status', ['pending'])
            ->whereDate('due_date', '>=', now()->toDateString())
            ->whereDate('due_date', '<=', now()->addDays(30)->toDateString())
            ->count();

        $byCategory = FixedCharge::query()
            ->when($companyId, fn ($w) => $w->where('company_id', $companyId))
            ->where('status', 'active')
            ->selectRaw('category, SUM(amount) as total')
            ->groupBy('category')
            ->get()
            ->mapWithKeys(fn ($row) => [$row->category => (float) $row->total]);

        return [
            'totalMonthlyEquivalent' => round($monthlyTotal, 2),
            'overdueCount' => $overdue,
            'upcomingCount' => $upcoming,
            'byCategory' => $byCategory,
        ];
    }
}
