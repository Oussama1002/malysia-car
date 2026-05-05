<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AccountingJournal extends Model
{
    use HasUuids;

    protected $table = 'accounting_journals';

    protected $fillable = [
        'id',
        'company_id',
        'code',
        'name',
        'journal_type',
        'default_account_code',
        'is_default',
        'is_active',
        'sequence_prefix',
        'sequence_next',
    ];

    protected $casts = [
        'is_default'    => 'boolean',
        'is_active'     => 'boolean',
        'sequence_next' => 'integer',
    ];

    /** @return HasMany<AccountingEntry> */
    public function entries(): HasMany
    {
        return $this->hasMany(AccountingEntry::class, 'journal_id');
    }
}
