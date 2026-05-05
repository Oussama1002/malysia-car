<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VehicleOwnershipTransfer extends Model
{
    use HasUuids;

    protected $table = 'vehicle_ownership_transfers';

    protected $fillable = [
        'id',
        'vehicle_id',
        'sale_id',
        'from_company_id',
        'to_customer_id',
        'transfer_type',
        'transfer_status',
        'transfer_date',
        'admin_reference',
        'documents',
        'notes',
        'completed_at',
    ];

    protected $casts = [
        'transfer_date' => 'date',
        'completed_at' => 'datetime',
        'documents' => 'array',
    ];

    /** @return BelongsTo<Vehicle, $this> */
    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'vehicle_id');
    }

    /** @return BelongsTo<UsedCarSale, $this> */
    public function sale(): BelongsTo
    {
        return $this->belongsTo(UsedCarSale::class, 'sale_id');
    }

    /** @return BelongsTo<Customer, $this> */
    public function buyer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'to_customer_id');
    }
}
