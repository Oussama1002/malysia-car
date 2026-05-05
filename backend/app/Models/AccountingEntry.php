<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class AccountingEntry extends Model
{
    use HasUuids;
    use SoftDeletes;

    protected $table = 'accounting_entries';

    protected $fillable = [
        'id',
        'company_id',
        'branch_id',
        'journal_id',
        'fiscal_period_id',
        'entry_number',
        'entry_date',
        'description',
        'reference',
        'status',
        'source_type',
        'source_id',
        'currency_code',
        'total_debit',
        'total_credit',
        'posted_at',
        'posted_by_user_id',
        'created_by_user_id',
    ];

    protected $casts = [
        'entry_date'   => 'date',
        'posted_at'    => 'datetime',
        'total_debit'  => 'decimal:2',
        'total_credit' => 'decimal:2',
    ];

    /** @return BelongsTo<AccountingJournal, AccountingEntry> */
    public function journal(): BelongsTo
    {
        return $this->belongsTo(AccountingJournal::class, 'journal_id');
    }

    /** @return BelongsTo<FiscalPeriod, AccountingEntry> */
    public function fiscalPeriod(): BelongsTo
    {
        return $this->belongsTo(FiscalPeriod::class, 'fiscal_period_id');
    }

    /** @return HasMany<AccountingEntryLine> */
    public function lines(): HasMany
    {
        return $this->hasMany(AccountingEntryLine::class, 'entry_id');
    }

    public function isBalanced(): bool
    {
        return abs((float) $this->total_debit - (float) $this->total_credit) < 0.01;
    }

    public function recalculateTotals(): void
    {
        $lines = $this->lines()->get();
        $this->total_debit = $lines->sum('debit');
        $this->total_credit = $lines->sum('credit');
    }
}
