<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FiscalPeriod extends Model
{
    use HasUuids;

    protected $table = 'fiscal_periods';

    protected $fillable = [
        'id',
        'fiscal_year_id',
        'period_number',
        'start_date',
        'end_date',
        'status',
        'closed_at',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date'   => 'date',
        'closed_at'  => 'datetime',
    ];

    /** @return BelongsTo<FiscalYear, FiscalPeriod> */
    public function fiscalYear(): BelongsTo
    {
        return $this->belongsTo(FiscalYear::class, 'fiscal_year_id');
    }

    /** @return HasMany<AccountingEntry> */
    public function accountingEntries(): HasMany
    {
        return $this->hasMany(AccountingEntry::class, 'fiscal_period_id');
    }
}
