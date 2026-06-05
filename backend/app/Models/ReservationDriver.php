<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReservationDriver extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'reservation_drivers';

    protected $fillable = [
        'id',
        'reservation_id',
        'driver_type',
        'first_name',
        'last_name',
        'phone',
        'email',
        'cin_passport',
        'license_number',
        'license_expiry',
        'relationship',
        'is_contract_signer',
        'is_financially_responsible',
        'status',
    ];

    protected $casts = [
        'license_expiry' => 'date',
        'is_contract_signer' => 'boolean',
        'is_financially_responsible' => 'boolean',
    ];

    public function reservation(): BelongsTo
    {
        return $this->belongsTo(Reservation::class);
    }
}
