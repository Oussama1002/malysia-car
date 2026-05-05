<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class BankAccount extends Model
{
    use HasUuids, SoftDeletes;

    protected $table = 'bank_accounts';

    protected $fillable = [
        'id',
        'company_id',
        'branch_id',
        'account_name',
        'bank_name',
        'account_number',
        'iban',
        'swift_code',
        'currency_code',
        'opening_balance',
        'current_balance',
        'is_active',
        'is_primary',
        'notes',
    ];

    protected $casts = [
        'opening_balance' => 'decimal:2',
        'current_balance' => 'decimal:2',
        'is_active' => 'boolean',
        'is_primary' => 'boolean',
    ];

    /** @return HasMany<BankTransaction, $this> */
    public function transactions(): HasMany
    {
        return $this->hasMany(BankTransaction::class, 'bank_account_id')->orderByDesc('value_date');
    }
}
