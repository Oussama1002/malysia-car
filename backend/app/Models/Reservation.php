<?php

namespace App\Models;

use App\Support\TenantScope;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Reservation extends Model
{
    use HasFactory, TenantScope;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'reservations';

    /**
     * {@inheritDoc}
     *
     * @param  \Illuminate\Database\Eloquent\Builder<static>  $query
     * @return \Illuminate\Database\Eloquent\Builder<static>
     */
    public function resolveRouteBindingQuery($query, $value, $field = null)
    {
        return parent::resolveRouteBindingQuery($query->withoutGlobalScope('tenant_scope'), $value, $field);
    }

    protected $fillable = [
        'id',
        'company_id',
        'branch_id',
        'reservation_number',
        'customer_id',
        'vehicle_id',
        'reservation_type',
        'status',
        'desired_start_at',
        'desired_end_at',
        'pickup_address',
        'delivery_address',
        'delivery_latitude',
        'delivery_longitude',
        'estimated_price',
        'daily_rate',
        'deposit_amount',
        'allowed_km_per_day',
        'payment_method',
        'pickup_location',
        'return_location',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'desired_start_at' => 'datetime',
        'desired_end_at' => 'datetime',
        'delivery_latitude' => 'decimal:7',
        'delivery_longitude' => 'decimal:7',
        'estimated_price' => 'decimal:2',
        'daily_rate' => 'decimal:2',
        'deposit_amount' => 'decimal:2',
        'allowed_km_per_day' => 'decimal:2',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }

    public function drivers(): HasMany
    {
        return $this->hasMany(ReservationDriver::class);
    }

    public function handoverReports(): HasMany
    {
        return $this->hasMany(RentalHandoverReport::class);
    }

    public function extensions(): HasMany
    {
        return $this->hasMany(RentalExtension::class);
    }

    public function damageReports(): HasMany
    {
        return $this->hasMany(RentalDamageReport::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function invoices(): HasMany
    {
        return $this->hasMany(Invoice::class, 'contract_id');
    }
}

