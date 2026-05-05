<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Trip extends Model
{
    use HasFactory;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'trips';

    protected $fillable = [
        'id',
        'vehicle_id',
        'gps_device_id',
        'started_at',
        'ended_at',
        'start_latitude',
        'start_longitude',
        'end_latitude',
        'end_longitude',
        'distance_km',
        'duration_seconds',
        'max_speed_kmh',
        'metadata_json',
    ];

    protected $casts = [
        'started_at' => 'datetime',
        'ended_at' => 'datetime',
        'start_latitude' => 'decimal:7',
        'start_longitude' => 'decimal:7',
        'end_latitude' => 'decimal:7',
        'end_longitude' => 'decimal:7',
        'distance_km' => 'decimal:2',
        'max_speed_kmh' => 'decimal:2',
        'metadata_json' => 'array',
    ];
}

