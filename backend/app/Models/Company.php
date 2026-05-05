<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Company extends Model
{
    use HasFactory, HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'legal_name',
        'trade_name',
        'country_code',
        'ice',
        'default_currency',
        'default_locale',
        'is_active',
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];
}
