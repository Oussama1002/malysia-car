<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class LegalCase extends Model
{
    use HasUuids;
    use SoftDeletes;

    protected $table = 'legal_cases';

    protected $fillable = [
        'id',
        'arrears_case_id',
        'case_number',
        'customer_id',
        'contract_id',
        'vehicle_id',
        'case_type',
        'status',
        'lawyer_name',
        'lawyer_contact',
        'court_reference',
        'court_name',
        'filing_date',
        'hearing_date',
        'judgment_date',
        'claimed_amount',
        'awarded_amount',
        'judgment_summary',
        'documents',
        'notes',
        'assigned_to_user_id',
        'created_by_user_id',
        'closed_at',
    ];

    protected $casts = [
        'filing_date'    => 'date',
        'hearing_date'   => 'date',
        'judgment_date'  => 'date',
        'claimed_amount' => 'decimal:2',
        'awarded_amount' => 'decimal:2',
        'documents'      => 'array',
        'closed_at'      => 'datetime',
    ];

    /** @return BelongsTo<ArrearsCase, LegalCase> */
    public function arrearsCase(): BelongsTo
    {
        return $this->belongsTo(ArrearsCase::class, 'arrears_case_id');
    }

    /** @return BelongsTo<Customer, LegalCase> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    /** @return HasMany<RepossessionOrder> */
    public function repossessionOrders(): HasMany
    {
        return $this->hasMany(RepossessionOrder::class, 'legal_case_id');
    }

    protected static function booted(): void
    {
        static::addGlobalScope('tenant_via_arrears_case', function (Builder $builder): void {
            if (app()->runningInConsole() || ! auth()->check()) {
                return;
            }
            $user = auth()->user();
            if (! $user || empty($user->company_id)) {
                return;
            }
            $role = strtoupper((string) ($user->primaryRoleCode() ?? ''));
            $builder->whereHas('arrearsCase', function ($q) use ($user, $role): void {
                $q->where('company_id', $user->company_id);
                if (! in_array($role, ['ADMIN', 'DIRECTEUR'], true) && ! empty($user->branch_id)) {
                    $q->where('branch_id', $user->branch_id);
                }
            });
        });
    }
}
