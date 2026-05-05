<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class GpsIngestionEvent extends Model
{
    use HasUuids;

    protected $table = 'gps_ingestion_events';

    protected $fillable = [
        'id',
        'provider_code',
        'idempotency_key',
        'device_imei',
        'status',
        'reason',
        'recorded_at',
        'received_at',
        'raw_payload',
    ];

    protected $casts = [
        'recorded_at' => 'datetime',
        'received_at' => 'datetime',
        'raw_payload' => 'array',
    ];
}
