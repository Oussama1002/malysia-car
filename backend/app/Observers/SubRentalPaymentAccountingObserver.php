<?php

namespace App\Observers;

use App\Models\SubRentalPayment;
use App\Services\AccountingBridgeService;

class SubRentalPaymentAccountingObserver
{
    public function __construct(private readonly AccountingBridgeService $bridge) {}

    public function created(SubRentalPayment $payment): void
    {
        $this->bridge->trySilently('fromSubRentalPayment', $payment);
    }
}
