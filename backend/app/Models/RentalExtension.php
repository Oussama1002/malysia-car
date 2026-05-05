<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class RentalExtension extends Model
{
    use HasUuids;

    protected $table = 'rental_extensions';

    protected $fillable = [
        'id',
        'reservation_id',
        'contract_id',
        'old_end_at',
        'new_end_at',
        'additional_amount',
        'status',
        'requested_by',
        'requested_at',
        'resolved_at',
        'resolved_by',
        'notes',
    ];

    protected $casts = [
        'old_end_at' => 'datetime',
        'new_end_at' => 'datetime',
        'additional_amount' => 'decimal:2',
        'requested_at' => 'datetime',
        'resolved_at' => 'datetime',
    ];
}

