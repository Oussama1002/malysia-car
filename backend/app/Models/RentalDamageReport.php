<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class RentalDamageReport extends Model
{
    use HasUuids;

    protected $table = 'rental_damage_reports';

    protected $fillable = [
        'id',
        'reservation_id',
        'vehicle_id',
        'customer_id',
        'damage_type',
        'description',
        'estimated_cost',
        'final_cost',
        'responsible_party',
        'status',
        'linked_invoice_id',
    ];

    protected $casts = [
        'estimated_cost' => 'decimal:2',
        'final_cost' => 'decimal:2',
    ];
}

