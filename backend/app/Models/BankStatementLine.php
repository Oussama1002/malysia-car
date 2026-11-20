<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class BankStatementLine extends Model
{
    protected $table = 'bank_statement_lines';
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id', 'company_id', 'value_date', 'label', 'amount',
        'external_reference', 'bank_account_code',
        'status', 'matched_payment_id', 'matched_by_user_id', 'matched_at',
    ];

    protected $casts = [
        'value_date' => 'date',
        'amount' => 'decimal:2',
        'matched_at' => 'datetime',
    ];
}
