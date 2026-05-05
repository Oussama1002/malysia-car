<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class GpsAlert extends Model
{
    use HasFactory;

    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    protected $table = 'gps_alerts';

    protected $fillable = [
        'id',
        'vehicle_id',
        'gps_device_id',
        'alert_type',
        'severity',
        'title',
        'description',
        'triggered_at',
        'resolved_at',
        'resolved_by',
        'status',
        'metadata_json',
        'created_at',
    ];

    protected $casts = [
        'triggered_at' => 'datetime',
        'resolved_at' => 'datetime',
        'created_at' => 'datetime',
        'metadata_json' => 'array',
    ];
}

