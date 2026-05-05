<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CreditScore extends Model
{
    use HasUuids;

    protected $fillable = [
        'credit_application_id',
        'customer_id',
        'score',
        'risk_band',
        'recommendation',
        'factors_positive',
        'factors_negative',
        'breakdown',
        'scored_by',
        'scored_at',
    ];

    protected $casts = [
        'score' => 'decimal:2',
        'factors_positive' => 'array',
        'factors_negative' => 'array',
        'breakdown' => 'array',
        'scored_at' => 'datetime',
    ];

    public function application(): BelongsTo
    {
        return $this->belongsTo(CreditApplication::class, 'credit_application_id');
    }
}
