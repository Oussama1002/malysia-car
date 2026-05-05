<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GpsPosition extends Model
{
    use HasFactory;

    public $incrementing = true;

    protected $keyType = 'int';

    public $timestamps = false;

    protected $table = 'gps_positions';

    protected $fillable = [
        'gps_device_id',
        'vehicle_id',
        'recorded_at',
        'latitude',
        'longitude',
        'speed_kmh',
        'heading_degrees',
        'altitude_meters',
        'odometer_km',
        'ignition_on',
        'battery_level',
        'raw_payload',
        'created_at',
    ];

    protected $casts = [
        'recorded_at' => 'datetime',
        'created_at' => 'datetime',
        'latitude' => 'decimal:7',
        'longitude' => 'decimal:7',
        'speed_kmh' => 'decimal:2',
        'heading_degrees' => 'decimal:2',
        'altitude_meters' => 'decimal:2',
        'odometer_km' => 'decimal:2',
        'ignition_on' => 'boolean',
        'battery_level' => 'decimal:2',
        'raw_payload' => 'array',
    ];
}

