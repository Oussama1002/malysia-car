<?php

namespace App\Observers;

use App\Models\Invoice;
use App\Services\AccountingBridgeService;

class InvoiceAccountingObserver
{
    public function __construct(private readonly AccountingBridgeService $bridge) {}

    public function created(Invoice $invoice): void
    {
        if (in_array($invoice->status, ['issued', 'partial', 'paid', 'overdue'], true)) {
            $this->bridge->trySilently('fromInvoice', $invoice);
        }
    }

    public function updated(Invoice $invoice): void
    {
        if (! $invoice->wasChanged('status')) {
            return;
        }
        if ($invoice->getOriginal('status') === 'draft'
            && in_array($invoice->status, ['issued', 'partial', 'paid', 'overdue'], true)) {
            $this->bridge->trySilently('fromInvoice', $invoice);
        }
    }
}
