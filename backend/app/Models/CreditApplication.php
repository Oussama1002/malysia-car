<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CreditApplication extends Model
{
    use HasFactory;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'credit_applications';

    protected $fillable = [
        'id',
        'company_id',
        'branch_id',
        'customer_id',
        'vehicle_id',
        'application_type',
        'requested_amount',
        'down_payment_amount',
        'requested_duration_months',
        'monthly_income',
        'monthly_debt',
        'debt_ratio',
        'scoring_status',
        'decision_status',
        'submitted_at',
        'decided_at',
        'decided_by',
        'rejection_reason',
    ];

    protected $casts = [
        'requested_amount' => 'decimal:2',
        'down_payment_amount' => 'decimal:2',
        'monthly_income' => 'decimal:2',
        'monthly_debt' => 'decimal:2',
        'debt_ratio' => 'decimal:4',
        'submitted_at' => 'datetime',
        'decided_at' => 'datetime',
    ];

    /**
     * @return HasMany<CreditApplicationDecision, $this>
     */
    public function decisions(): HasMany
    {
        return $this->hasMany(CreditApplicationDecision::class, 'credit_application_id')->orderByDesc('decided_at');
    }

    public function scores(): HasMany
    {
        return $this->hasMany(CreditScore::class, 'credit_application_id')->orderByDesc('scored_at');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }
}

