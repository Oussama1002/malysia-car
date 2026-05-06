<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class SubRentalReturnReport extends Model
{
    use HasFactory;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'sub_rental_contract_id',
        'vehicle_id',
        'returned_at',
        'odometer_km',
        'fuel_level',
        'condition_notes',
        'damage_notes',
        'extra_charges',
        'signed_by_supplier',
        'file_id',
        'created_by',
    ];

    protected $casts = [
        'returned_at' => 'datetime',
        'odometer_km' => 'decimal:2',
        'extra_charges' => 'decimal:2',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $model): void {
            if (empty($model->id)) {
                $model->id = (string) Str::uuid();
            }
        });
    }

    public function contract(): BelongsTo
    {
        return $this->belongsTo(SubRentalContract::class, 'sub_rental_contract_id');
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'vehicle_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
