<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FieldMissionSignature extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'mission_id',
        'signer_name',
        'signed_at',
        'ip_address',
        'user_agent',
        'gps_lat',
        'gps_lng',
        'storage_disk',
        'storage_path',
    ];

    protected $casts = [
        'signed_at' => 'datetime',
        'gps_lat' => 'float',
        'gps_lng' => 'float',
    ];

    protected $hidden = [
        'storage_disk',
        'storage_path',
    ];

    public function mission(): BelongsTo
    {
        return $this->belongsTo(Mission::class);
    }
}
