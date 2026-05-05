<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccountingEntryLine extends Model
{
    use HasUuids;

    protected $table = 'accounting_entry_lines';

    protected $fillable = [
        'id',
        'entry_id',
        'account_code',
        'account_id',
        'line_order',
        'label',
        'debit',
        'credit',
        'currency_code',
        'tax_id',
        'tax_amount',
        'third_party_type',
        'third_party_id',
        'branch_id',
        'cost_center',
    ];

    protected $casts = [
        'debit'      => 'decimal:2',
        'credit'     => 'decimal:2',
        'tax_amount' => 'decimal:2',
    ];

    /** @return BelongsTo<AccountingEntry, AccountingEntryLine> */
    public function entry(): BelongsTo
    {
        return $this->belongsTo(AccountingEntry::class, 'entry_id');
    }
}
