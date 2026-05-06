<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FixedChargePayment extends Model
{
    use HasUuids;

    protected $table = 'fixed_charge_payments';

    protected $fillable = [
        'fixed_charge_id',
        'due_date',
        'paid_at',
        'amount',
        'payment_method',
        'status',
        'invoice_file_id',
        'accounting_entry_id',
    ];

    protected $casts = [
        'due_date' => 'date',
        'paid_at' => 'datetime',
        'amount' => 'decimal:2',
    ];

    /** @return BelongsTo<FixedCharge, $this> */
    public function fixedCharge(): BelongsTo
    {
        return $this->belongsTo(FixedCharge::class, 'fixed_charge_id');
    }

    /** @return BelongsTo<AccountingEntry, $this> */
    public function accountingEntry(): BelongsTo
    {
        return $this->belongsTo(AccountingEntry::class, 'accounting_entry_id');
    }
}
