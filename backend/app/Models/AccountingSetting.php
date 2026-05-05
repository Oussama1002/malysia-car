<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class AccountingSetting extends Model
{
    use HasUuids;

    protected $table = 'accounting_settings';

    protected $fillable = [
        'id',
        'company_id',
        'setting_key',
        'setting_value',
    ];
}
