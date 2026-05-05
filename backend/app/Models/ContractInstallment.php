<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContractInstallment extends Model
{
    use HasFactory;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'contract_installments';

    protected $fillable = [
        'id',
        'contract_id',
        'installment_number',
        'due_date',
        'principal_amount',
        'interest_amount',
        'tax_amount',
        'penalty_amount',
        'total_due_amount',
        'total_paid_amount',
        'balance_amount',
        'installment_status',
        'invoiced_at',
        'paid_at',
    ];

    protected $casts = [
        'due_date' => 'date',
        'invoiced_at' => 'datetime',
        'paid_at' => 'datetime',
        'principal_amount' => 'decimal:2',
        'interest_amount' => 'decimal:2',
        'tax_amount' => 'decimal:2',
        'penalty_amount' => 'decimal:2',
        'total_due_amount' => 'decimal:2',
        'total_paid_amount' => 'decimal:2',
        'balance_amount' => 'decimal:2',
    ];

    /**
     * @return BelongsTo<Contract, $this>
     */
    public function contract(): BelongsTo
    {
        return $this->belongsTo(Contract::class, 'contract_id');
    }
}

