<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\TenantScope;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;

class ArrearsCase extends Model
{
    use HasUuids;
    use SoftDeletes;
    use TenantScope;

    protected $table = 'arrears_cases';

    protected $fillable = [
        'id',
        'company_id',
        'branch_id',
        'case_number',
        'customer_id',
        'contract_id',
        'total_overdue',
        'total_recovered',
        'overdue_installments_count',
        'days_overdue',
        'stage',
        'resolution',
        'notes',
        'next_action_date',
        'assigned_to_user_id',
        'closed_at',
        'created_by_user_id',
    ];

    protected $casts = [
        'total_overdue'    => 'decimal:2',
        'total_recovered'  => 'decimal:2',
        'next_action_date' => 'date',
        'closed_at'        => 'datetime',
    ];

    /** @return BelongsTo<Customer, ArrearsCase> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    /** @return BelongsTo<Contract, ArrearsCase> */
    public function contract(): BelongsTo
    {
        return $this->belongsTo(Contract::class, 'contract_id');
    }

    /** @return HasMany<ArrearsAction> */
    public function actions(): HasMany
    {
        return $this->hasMany(ArrearsAction::class, 'case_id');
    }

    /** @return HasOne<LegalCase> */
    public function legalCase(): HasOne
    {
        return $this->hasOne(LegalCase::class, 'arrears_case_id');
    }
}
