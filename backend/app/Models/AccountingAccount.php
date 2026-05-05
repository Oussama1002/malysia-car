<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class AccountingAccount extends Model
{
    use HasUuids;
    use SoftDeletes;

    protected $table = 'accounting_accounts';

    protected $fillable = [
        'id',
        'company_id',
        'code',
        'name',
        'account_type',
        'normal_balance',
        'parent_code',
        'is_detail',
        'is_active',
        'allow_direct_posting',
        'opening_balance',
        'current_balance',
        'currency_code',
        'notes',
    ];

    protected $casts = [
        'opening_balance'    => 'decimal:2',
        'current_balance'    => 'decimal:2',
        'is_detail'          => 'boolean',
        'is_active'          => 'boolean',
        'allow_direct_posting' => 'boolean',
    ];

    /** @return HasMany<AccountingEntryLine> */
    public function entryLines(): HasMany
    {
        return $this->hasMany(AccountingEntryLine::class, 'account_id');
    }
}
