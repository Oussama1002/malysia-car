<?php

namespace App\Models;

use App\Support\TenantScope;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class Customer extends Model
{
    use HasFactory, HasUuids, SoftDeletes, TenantScope;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'company_id',
        'branch_id',
        'customer_code',
        'customer_type',
        'status',
        'risk_level',
        'is_blacklisted',
        'preferred_language',
        'source_channel',
        'assigned_to_user_id',
    ];

    protected $casts = [
        'is_blacklisted' => 'boolean',
    ];

    public function individualProfile(): HasOne
    {
        return $this->hasOne(CustomerIndividualProfile::class, 'customer_id');
    }

    public function companyProfile(): HasOne
    {
        return $this->hasOne(CustomerCompanyProfile::class, 'customer_id');
    }

    public function employmentProfile(): HasOne
    {
        return $this->hasOne(CustomerEmploymentProfile::class, 'customer_id');
    }

    public function addresses(): HasMany
    {
        return $this->hasMany(CustomerAddress::class, 'customer_id');
    }

    public function contacts(): HasMany
    {
        return $this->hasMany(CustomerContact::class, 'customer_id');
    }

    public function bankAccounts(): HasMany
    {
        return $this->hasMany(CustomerBankAccount::class, 'customer_id');
    }

    public function kycCases(): HasMany
    {
        return $this->hasMany(CustomerKycCase::class, 'customer_id');
    }

    public function latestKycCase(): HasOne
    {
        return $this->hasOne(CustomerKycCase::class, 'customer_id')->latestOfMany();
    }

    public function blacklistEntries(): HasMany
    {
        return $this->hasMany(CustomerBlacklistEntry::class, 'customer_id');
    }

    public function notes(): HasMany
    {
        return $this->hasMany(CustomerNote::class, 'customer_id');
    }

    public function displayName(): string
    {
        if ($this->customer_type === 'ENTREPRISE' && $this->companyProfile) {
            return (string) ($this->companyProfile->trade_name ?? $this->companyProfile->legal_name ?? $this->customer_code);
        }
        if ($this->individualProfile) {
            return trim(($this->individualProfile->first_name ?? '').' '.($this->individualProfile->last_name ?? '')) ?: $this->customer_code;
        }

        return $this->customer_code;
    }
}
