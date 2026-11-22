<?php

namespace App\Observers;

use App\Models\WalletTransaction;
use App\Services\AccountingBridgeService;

class WalletTransactionAccountingObserver
{
    public function __construct(private readonly AccountingBridgeService $bridge) {}

    public function created(WalletTransaction $tx): void
    {
        $this->bridge->trySilently('fromWalletTransaction', $tx);
    }
}
