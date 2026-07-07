<?php

namespace App\Models;

use App\Support\TenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class Expense extends Model
{
    use SoftDeletes, TenantScope;

    public $incrementing = false;
    protected $keyType = 'string';
    protected $table = 'expenses';

    protected $fillable = [
        'id', 'company_id', 'branch_id',
        'label', 'amount', 'currency_code', 'expense_date', 'due_date',
        'category', 'expense_type', 'status', 'payment_method', 'reference',
        'vehicle_id', 'driver_id', 'customer_id', 'contract_id',
        'reservation_id', 'mission_id', 'supplier_id',
        'frequency', 'recurring_parent_id', 'reminder_threshold_value',
        'notes', 'created_by', 'paid_at',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'expense_date' => 'date',
        'due_date' => 'date',
        'paid_at' => 'datetime',
    ];

    protected static function boot(): void
    {
        parent::boot();
        static::creating(function (self $m) {
            if (empty($m->id)) $m->id = (string) Str::uuid();
        });
    }

    public function vehicle(): BelongsTo { return $this->belongsTo(Vehicle::class); }
    public function customer(): BelongsTo { return $this->belongsTo(Customer::class); }
    public function supplier(): BelongsTo { return $this->belongsTo(ExpenseSupplier::class, 'supplier_id'); }
    public function contract(): BelongsTo { return $this->belongsTo(Contract::class); }
    public function reservation(): BelongsTo { return $this->belongsTo(Reservation::class); }
}
