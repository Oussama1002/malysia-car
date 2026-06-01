<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WalletTransaction extends Model
{
    use HasUuids;

    public $incrementing = false;
    protected $keyType = 'string';

    // Transactions are immutable — no updates allowed after creation
    protected $guarded = ['id'];

    protected $casts = [
        'amount'        => 'decimal:2',
        'balance_after' => 'decimal:2',
    ];

    public function wallet(): BelongsTo
    {
        return $this->belongsTo(CustomerWallet::class, 'wallet_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function performedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'performed_by');
    }
}
