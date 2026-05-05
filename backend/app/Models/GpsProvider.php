<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class GpsProvider extends Model
{
    use HasUuids;

    protected $table = 'gps_providers';

    protected $fillable = [
        'id',
        'provider_code',
        'display_name',
        'api_key',
        'webhook_secret',
        'ip_allowlist',
        'active',
        'settings',
    ];

    protected $casts = [
        'ip_allowlist' => 'array',
        'settings' => 'array',
        'active' => 'boolean',
    ];
}
