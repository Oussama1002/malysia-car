<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UsedCarValuation extends Model
{
    use HasUuids;

    protected $table = 'used_car_valuations';

    protected $fillable = [
        'id',
        'listing_id',
        'method',
        'market_value',
        'trade_in_value',
        'suggested_price',
        'condition_score',
        'mileage',
        'factors',
        'notes',
        'valued_by_user_id',
        'valued_at',
    ];

    protected $casts = [
        'market_value' => 'decimal:2',
        'trade_in_value' => 'decimal:2',
        'suggested_price' => 'decimal:2',
        'condition_score' => 'decimal:2',
        'mileage' => 'integer',
        'factors' => 'array',
        'valued_at' => 'datetime',
    ];

    /** @return BelongsTo<UsedCarListing, $this> */
    public function listing(): BelongsTo
    {
        return $this->belongsTo(UsedCarListing::class, 'listing_id');
    }
}
