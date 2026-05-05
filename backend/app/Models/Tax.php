<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Tax extends Model
{
    use HasUuids;

    protected $table = 'taxes';

    protected $fillable = [
        'id',
        'code',
        'name',
        'rate',
        'tax_type',
        'applies_to',
        'is_active',
        'account_code',
    ];

    protected $casts = [
        'rate'      => 'decimal:4',
        'is_active' => 'boolean',
    ];
}
