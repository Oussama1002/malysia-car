<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PaymentAllocation extends Model
{
    use HasUuids;

    protected $table = 'payment_allocations';

    protected $fillable = [
        'id',
        'payment_id',
        'invoice_id',
        'contract_installment_id',
        'amount_allocated',
        'allocated_at',
        'allocated_by_user_id',
        'notes',
    ];

    protected $casts = [
        'amount_allocated' => 'decimal:2',
        'allocated_at' => 'datetime',
    ];

    /** @return BelongsTo<Payment, $this> */
    public function payment(): BelongsTo
    {
        return $this->belongsTo(Payment::class, 'payment_id');
    }

    /** @return BelongsTo<Invoice, $this> */
    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class, 'invoice_id');
    }

    /** @return BelongsTo<ContractInstallment, $this> */
    public function installment(): BelongsTo
    {
        return $this->belongsTo(ContractInstallment::class, 'contract_installment_id');
    }
}
