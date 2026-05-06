<?php

namespace App\Models;

use App\Support\TenantScope;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class SupplierAgency extends Model
{
    use HasFactory, SoftDeletes, TenantScope;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'company_id',
        'branch_id',
        'name',
        'contact_person',
        'phone',
        'email',
        'address',
        'city',
        'ice',
        'rc',
        'status',
        'notes',
        'created_by',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $model): void {
            if (empty($model->id)) {
                $model->id = (string) Str::uuid();
            }
        });
    }

    public function subRentalContracts(): HasMany
    {
        return $this->hasMany(SubRentalContract::class, 'supplier_agency_id');
    }

    public function activeSubRentalContracts(): HasMany
    {
        return $this->hasMany(SubRentalContract::class, 'supplier_agency_id')
            ->whereIn('status', ['active', 'draft']);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function isBlacklisted(): bool
    {
        return $this->status === 'blacklisted';
    }

    public function isActive(): bool
    {
        return $this->status === 'active';
    }
}
