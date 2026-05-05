<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class RentalHandoverReport extends Model
{
    use HasUuids;

    protected $table = 'rental_handover_reports';

    protected $fillable = [
        'id',
        'vehicle_id',
        'customer_id',
        'reservation_id',
        'contract_id',
        'handover_type',
        'odometer',
        'fuel_level',
        'condition_notes',
        'checklist',
        'photos',
        'signature',
        'performed_by',
        'performed_at',
    ];

    protected $casts = [
        'odometer' => 'decimal:2',
        'fuel_level' => 'decimal:2',
        'checklist' => 'array',
        'photos' => 'array',
        'performed_at' => 'datetime',
    ];
}

