<?php

namespace App\Observers;

use App\Models\Payment;
use App\Services\AccountingBridgeService;

class PaymentAccountingObserver
{
    public function __construct(private readonly AccountingBridgeService $bridge) {}

    public function created(Payment $payment): void
    {
        if ($payment->status === 'completed') {
            $this->bridge->trySilently('fromPayment', $payment);
        }
    }

    public function updated(Payment $payment): void
    {
        if (! $payment->wasChanged('status')) {
            return;
        }
        if ($payment->getOriginal('status') !== 'completed' && $payment->status === 'completed') {
            $this->bridge->trySilently('fromPayment', $payment);
        }
    }
}
