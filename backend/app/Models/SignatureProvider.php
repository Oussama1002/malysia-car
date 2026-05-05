<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class SignatureProvider extends Model
{
    use HasUuids;

    protected $fillable = [
        'provider_code',
        'provider_name',
        'is_active',
        'api_base_url',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];
}
