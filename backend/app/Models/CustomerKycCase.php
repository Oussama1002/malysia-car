<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CustomerKycCase extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'customer_kyc_cases';

    protected $fillable = [
        'customer_id',
        'kyc_status',
        'risk_score',
        'verification_level',
        'reviewed_by',
        'reviewed_at',
        'rejection_reason',
        'expires_at',
    ];

    protected $casts = [
        'risk_score' => 'decimal:2',
        'reviewed_at' => 'datetime',
        'expires_at' => 'datetime',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    public function documents(): HasMany
    {
        return $this->hasMany(CustomerKycDocument::class, 'kyc_case_id');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
