<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DepreciationLine extends Model
{
    use HasUuids;

    protected $table = 'depreciation_lines';

    protected $fillable = [
        'id',
        'asset_id',
        'fiscal_period_id',
        'period_date',
        'amount',
        'cumulative_depreciation',
        'book_value',
        'is_posted',
        'entry_id',
    ];

    protected $casts = [
        'period_date'             => 'date',
        'amount'                  => 'decimal:2',
        'cumulative_depreciation' => 'decimal:2',
        'book_value'              => 'decimal:2',
        'is_posted'               => 'boolean',
    ];

    /** @return BelongsTo<FixedAsset, DepreciationLine> */
    public function asset(): BelongsTo
    {
        return $this->belongsTo(FixedAsset::class, 'asset_id');
    }
}
