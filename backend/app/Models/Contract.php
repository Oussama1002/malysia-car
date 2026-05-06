<?php

namespace App\Models;

use App\Support\TenantScope;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Contract extends Model
{
    use HasFactory, SoftDeletes, TenantScope;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'contracts';

    /**
     * {@inheritDoc}
     *
     * @param  \Illuminate\Database\Eloquent\Builder<static>  $query
     * @return \Illuminate\Database\Eloquent\Builder<static>
     */
    public function resolveRouteBindingQuery($query, $value, $field = null)
    {
        return parent::resolveRouteBindingQuery($query->withoutGlobalScope('tenant_scope'), $value, $field);
    }

    protected $fillable = [
        'id',
        'company_id',
        'branch_id',
        'contract_number',
        'contract_type',
        'customer_id',
        'vehicle_id',
        'template_id',
        'credit_application_id',
        'status',
        'legal_status',
        'signature_status',
        'start_date',
        'end_date',
        'duration_months',
        'currency_code',
        'base_amount',
        'monthly_payment',
        'down_payment_amount',
        'buyout_option_amount',
        'allowed_km',
        'excess_km_rate',
        'deposit_amount',
        'insurance_included',
        'maintenance_included',
        'activation_date',
        'closure_date',
        'signed_at',
        'terminated_reason',
        'notes',
        'created_by',
        'approved_by',
        'payment_method',
        'payment_terms',
        'bank_reference',
        'cheque_number',
        'expected_payment_day',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'activation_date' => 'datetime',
        'closure_date' => 'datetime',
        'signed_at' => 'datetime',
        'insurance_included' => 'boolean',
        'maintenance_included' => 'boolean',
        'base_amount' => 'decimal:2',
        'monthly_payment' => 'decimal:2',
        'down_payment_amount' => 'decimal:2',
        'buyout_option_amount' => 'decimal:2',
        'allowed_km' => 'decimal:2',
        'excess_km_rate' => 'decimal:2',
        'deposit_amount' => 'decimal:2',
        'expected_payment_day' => 'integer',
    ];

    /**
     * @return HasMany<ContractInstallment, $this>
     */
    public function installments(): HasMany
    {
        return $this->hasMany(ContractInstallment::class, 'contract_id')->orderBy('installment_number');
    }

    /**
     * @return HasMany<ContractHistory, $this>
     */
    public function history(): HasMany
    {
        return $this->hasMany(ContractHistory::class, 'contract_id')->orderByDesc('at');
    }

    /**
     * @return BelongsTo<Customer, $this>
     */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    /**
     * @return BelongsTo<Vehicle, $this>
     */
    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'vehicle_id');
    }
}

