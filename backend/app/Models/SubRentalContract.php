<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\TenantScope;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SubRentalContract extends Model
{
    use HasUuids;
    use TenantScope;

    protected $table = 'sub_rental_contracts';

    protected $fillable = [
        'company_id',
        'supplier_agency_id',
        'vehicle_id',
        'external_vehicle_identity',
        'start_date',
        'end_date',
        'daily_cost',
        'total_cost',
        'deposit_amount',
        'payment_method',
        'status',
        'supplier_contract_file_id',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'daily_cost' => 'decimal:2',
        'total_cost' => 'decimal:2',
        'deposit_amount' => 'decimal:2',
        'external_vehicle_identity' => 'array',
    ];

    /** @return BelongsTo<SupplierAgency, $this> */
    public function supplierAgency(): BelongsTo
    {
        return $this->belongsTo(SupplierAgency::class, 'supplier_agency_id');
    }

    /** @return BelongsTo<Vehicle, $this> */
    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'vehicle_id');
    }
}
