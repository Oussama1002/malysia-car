<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class FixedAsset extends Model
{
    use HasUuids;
    use SoftDeletes;

    protected $table = 'fixed_assets';

    protected $fillable = [
        'id',
        'company_id',
        'asset_number',
        'name',
        'category',
        'vehicle_id',
        'acquisition_date',
        'acquisition_cost',
        'residual_value',
        'useful_life_months',
        'depreciation_method',
        'accumulated_depreciation',
        'book_value',
        'asset_account_code',
        'depreciation_account_code',
        'accumulated_dep_account_code',
        'status',
        'disposal_date',
        'disposal_amount',
        'disposal_entry_id',
        'notes',
    ];

    protected $casts = [
        'acquisition_date'        => 'date',
        'disposal_date'           => 'date',
        'acquisition_cost'        => 'decimal:2',
        'residual_value'          => 'decimal:2',
        'accumulated_depreciation' => 'decimal:2',
        'book_value'              => 'decimal:2',
        'disposal_amount'         => 'decimal:2',
    ];

    /** @return HasMany<DepreciationLine> */
    public function depreciationLines(): HasMany
    {
        return $this->hasMany(DepreciationLine::class, 'asset_id');
    }

    public function monthlyDepreciation(): float
    {
        return max(
            0,
            ((float) $this->acquisition_cost - (float) $this->residual_value)
            / max(1, $this->useful_life_months)
        );
    }
}
