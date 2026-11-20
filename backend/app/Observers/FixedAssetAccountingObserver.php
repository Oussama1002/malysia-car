<?php

namespace App\Observers;

use App\Models\FixedAsset;
use App\Services\AccountingBridgeService;

class FixedAssetAccountingObserver
{
    public function __construct(private readonly AccountingBridgeService $bridge) {}

    public function updated(FixedAsset $asset): void
    {
        if (! $asset->wasChanged('status')) {
            return;
        }
        if ($asset->status === 'disposed' && ! $asset->disposal_entry_id) {
            $this->bridge->trySilently('fromAssetDisposal', $asset);
        }
    }
}
