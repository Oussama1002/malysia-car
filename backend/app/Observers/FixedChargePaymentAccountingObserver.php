<?php

namespace App\Observers;

use App\Models\FixedChargePayment;
use App\Services\AccountingBridgeService;

class FixedChargePaymentAccountingObserver
{
    public function __construct(private readonly AccountingBridgeService $bridge) {}

    public function created(FixedChargePayment $payment): void
    {
        if ($payment->status === 'paid') {
            $this->bridge->trySilently('fromFixedChargePayment', $payment);
        }
    }

    public function updated(FixedChargePayment $payment): void
    {
        if (! $payment->wasChanged('status')) {
            return;
        }
        if ($payment->getOriginal('status') !== 'paid' && $payment->status === 'paid') {
            $this->bridge->trySilently('fromFixedChargePayment', $payment);
        }
    }
}
