<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FiscalYear extends Model
{
    use HasUuids;

    protected $table = 'fiscal_years';

    protected $fillable = [
        'id',
        'company_id',
        'code',
        'start_date',
        'end_date',
        'status',
        'closed_at',
        'closed_by_user_id',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date'   => 'date',
        'closed_at'  => 'datetime',
    ];

    /** @return HasMany<FiscalPeriod> */
    public function periods(): HasMany
    {
        return $this->hasMany(FiscalPeriod::class, 'fiscal_year_id');
    }
}
