<?php

namespace App\Models;

use App\Support\TenantScope;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class Invoice extends Model
{
    use HasUuids, SoftDeletes, TenantScope;

    protected $table = 'invoices';

    protected $fillable = [
        'id',
        'company_id',
        'branch_id',
        'invoice_number',
        'invoice_type',
        'customer_id',
        'contract_id',
        'sale_id',
        'issue_date',
        'due_date',
        'currency_code',
        'subtotal_amount',
        'tax_amount',
        'discount_amount',
        'total_amount',
        'amount_paid',
        'amount_due',
        'status',
        'issued_at',
        'sent_at',
        'paid_at',
        'cancelled_at',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'issue_date' => 'date',
        'due_date' => 'date',
        'issued_at' => 'datetime',
        'sent_at' => 'datetime',
        'paid_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'subtotal_amount' => 'decimal:2',
        'tax_amount' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'total_amount' => 'decimal:2',
        'amount_paid' => 'decimal:2',
        'amount_due' => 'decimal:2',
    ];

    /** @return HasMany<InvoiceLine, $this> */
    public function lines(): HasMany
    {
        return $this->hasMany(InvoiceLine::class, 'invoice_id')->orderBy('position');
    }

    /** @return BelongsTo<Customer, $this> */
    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    /** @return BelongsTo<Contract, $this> */
    public function contract(): BelongsTo
    {
        return $this->belongsTo(Contract::class, 'contract_id');
    }

    /** @return HasMany<PaymentAllocation, $this> */
    public function allocations(): HasMany
    {
        return $this->hasMany(PaymentAllocation::class, 'invoice_id');
    }

    public function recalculateTotals(): void
    {
        $lines = $this->lines()->get();
        $sub = $lines->sum('line_total');
        $tax = $lines->sum('tax_amount');
        $total = $sub;
        $this->subtotal_amount = $sub - $tax;
        $this->tax_amount = $tax;
        $this->total_amount = $total - (float) $this->discount_amount;
        $this->amount_due = max(0, (float) $this->total_amount - (float) $this->amount_paid);
    }

    public function refreshPaymentStatus(): void
    {
        $paid = (float) $this->allocations()->sum('amount_allocated');
        $this->amount_paid = $paid;
        $this->amount_due = max(0, (float) $this->total_amount - $paid);
        if ($paid <= 0) {
            // keep current status (draft/issued/overdue)
        } elseif ($paid >= (float) $this->total_amount) {
            $this->status = 'paid';
            $this->paid_at = $this->paid_at ?? now();
        } else {
            $this->status = 'partial';
        }
        $this->save();
    }
}
