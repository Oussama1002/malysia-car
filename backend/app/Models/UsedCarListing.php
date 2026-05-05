<?php

namespace App\Models;

use App\Support\TenantScope;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class UsedCarListing extends Model
{
    use HasUuids, SoftDeletes, TenantScope;

    protected $table = 'used_car_listings';

    protected $fillable = [
        'id',
        'vehicle_id',
        'company_id',
        'branch_id',
        'listing_code',
        'stage',
        'publication_channel',
        'asking_price',
        'min_acceptable_price',
        'estimated_value',
        'valuation_score',
        'inspection_score',
        'inspection_notes',
        'mileage_at_listing',
        'published_at',
        'reserved_at',
        'reserved_by_customer_id',
        'reserved_until',
        'sold_at',
        'sold_to_customer_id',
        'final_sale_price',
        'currency_code',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'asking_price' => 'decimal:2',
        'min_acceptable_price' => 'decimal:2',
        'estimated_value' => 'decimal:2',
        'valuation_score' => 'decimal:2',
        'inspection_score' => 'integer',
        'mileage_at_listing' => 'integer',
        'final_sale_price' => 'decimal:2',
        'inspection_notes' => 'array',
        'published_at' => 'datetime',
        'reserved_at' => 'datetime',
        'reserved_until' => 'datetime',
        'sold_at' => 'datetime',
    ];

    /** @return BelongsTo<Vehicle, $this> */
    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'vehicle_id');
    }

    /** @return HasMany<UsedCarValuation, $this> */
    public function valuations(): HasMany
    {
        return $this->hasMany(UsedCarValuation::class, 'listing_id')->orderByDesc('valued_at');
    }

    /** @return HasMany<UsedCarSale, $this> */
    public function sales(): HasMany
    {
        return $this->hasMany(UsedCarSale::class, 'listing_id');
    }

    /** @return BelongsTo<Customer, $this> */
    public function reservedBy(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'reserved_by_customer_id');
    }

    /** @return BelongsTo<Customer, $this> */
    public function soldTo(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'sold_to_customer_id');
    }
}
