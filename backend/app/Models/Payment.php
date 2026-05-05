<?php

namespace App\Models;

use App\Support\TenantScope;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Payment extends Model
{
    use HasUuids, SoftDeletes, TenantScope;

    protected $table = 'payments';

    protected $fillable = [
        'id',
        'company_id',
        'branch_id',
        'payment_number',
        'customer_id',
        'payment_method',
        'payment_direction',
        'amount',
        'currency_code',
        'amount_allocated',
        'amount_unallocated',
        'status',
        'payment_date',
        'bank_account_id',
        'external_reference',
        'check_number',
        'check_date',
        'check_bank',
        'notes',
        'received_by_user_id',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'amount_allocated' => 'decimal:2',
        'amount_unallocated' => 'decimal:2',
        'payment_date' => 'date',
        'check_date' => 'date',
    ];

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    /** @return BelongsTo<BankAccount, $this> */
    public function bankAccount(): BelongsTo
    {
        return $this->belongsTo(BankAccount::class, 'bank_account_id');
    }

    /** @return HasMany<PaymentAllocation, $this> */
    public function allocations(): HasMany
    {
        return $this->hasMany(PaymentAllocation::class, 'payment_id');
    }

    public function recalculateAllocation(): void
    {
        $total = (float) $this->allocations()->sum('amount_allocated');
        $this->amount_allocated = $total;
        $this->amount_unallocated = max(0, (float) $this->amount - $total);
        $this->status = $total <= 0
            ? 'received'
            : ($total >= (float) $this->amount ? 'allocated' : 'received');
        $this->save();
    }
}
