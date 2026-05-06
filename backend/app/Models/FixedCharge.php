<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\TenantScope;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FixedCharge extends Model
{
    use HasUuids;
    use TenantScope;

    protected $table = 'fixed_charges';

    protected $fillable = [
        'company_id',
        'branch_id',
        'name',
        'category',
        'amount',
        'currency_code',
        'frequency',
        'start_date',
        'end_date',
        'next_due_date',
        'payment_method',
        'supplier_name',
        'accounting_account_id',
        'status',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'next_due_date' => 'date',
        'amount' => 'decimal:2',
    ];

    /** @return HasMany<FixedChargePayment, $this> */
    public function payments(): HasMany
    {
        return $this->hasMany(FixedChargePayment::class, 'fixed_charge_id');
    }

    /** @return BelongsTo<AccountingAccount, $this> */
    public function accountingAccount(): BelongsTo
    {
        return $this->belongsTo(AccountingAccount::class, 'accounting_account_id');
    }
}
