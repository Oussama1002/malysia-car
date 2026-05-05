<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BankTransaction extends Model
{
    use HasUuids;

    protected $table = 'bank_transactions';

    protected $fillable = [
        'id',
        'bank_account_id',
        'transaction_type',
        'amount',
        'currency_code',
        'value_date',
        'posted_date',
        'description',
        'external_reference',
        'counterparty_name',
        'counterparty_iban',
        'matched_payment_id',
        'reconciliation_status',
        'import_batch_id',
        'raw_payload',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'value_date' => 'date',
        'posted_date' => 'date',
        'raw_payload' => 'array',
    ];

    /** @return BelongsTo<BankAccount, $this> */
    public function bankAccount(): BelongsTo
    {
        return $this->belongsTo(BankAccount::class, 'bank_account_id');
    }

    /** @return BelongsTo<Payment, $this> */
    public function matchedPayment(): BelongsTo
    {
        return $this->belongsTo(Payment::class, 'matched_payment_id');
    }
}
