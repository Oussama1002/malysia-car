<?php

namespace App\Observers;

use App\Models\DepreciationLine;
use App\Services\AccountingBridgeService;

class DepreciationAccountingObserver
{
    public function __construct(private readonly AccountingBridgeService $bridge) {}

    public function created(DepreciationLine $line): void
    {
        if (! $line->is_posted) {
            $this->bridge->trySilently('fromDepreciation', $line);
        }
    }
}
