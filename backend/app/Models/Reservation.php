<?php

namespace App\Models;

use App\Support\TenantScope;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

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
    ];
}

