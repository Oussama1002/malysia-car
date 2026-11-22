<?php

namespace App\Observers;

use App\Models\Expense;
use App\Services\AccountingBridgeService;

class ExpenseAccountingObserver
{
    public function __construct(private readonly AccountingBridgeService $bridge) {}

    public function created(Expense $expense): void
    {
        if (in_array($expense->status, ['paid', 'unpaid', 'overdue'], true)) {
            $this->bridge->trySilently('fromExpense', $expense);
        }
    }

    public function updated(Expense $expense): void
    {
        if (! $expense->wasChanged('status')) {
            return;
        }
        $original = $expense->getOriginal('status');
        if (in_array($original, [null, 'draft'], true)
            && in_array($expense->status, ['paid', 'unpaid', 'overdue'], true)) {
            $this->bridge->trySilently('fromExpense', $expense);
        }
    }
}
