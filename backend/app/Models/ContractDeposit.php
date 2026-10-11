<?php

namespace App\Models;

use App\Support\TenantScope;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

/**
 * Franchise d'assurance: money held as a guarantee, never an encaissement.
 * It is collected before the vehicle leaves and released once the return
 * shows the vehicle is fine.
 */
class ContractDeposit extends Model
{
    use HasFactory, SoftDeletes, TenantScope;

    public const STATUS_HELD = 'held';
    public const STATUS_RETURNED = 'returned';
    public const STATUS_RETAINED = 'retained';

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'company_id',
        'branch_id',
        'contract_id',
        'reservation_id',
        'customer_id',
        'amount',
        'method',
        'check_number',
        'check_bank',
        'check_date',
        'status',
        'notes',
        'collected_by',
        'collected_at',
        'settled_by',
        'settled_at',
        'settlement_notes',
        'source_payment_id',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'check_date' => 'date',
        'collected_at' => 'datetime',
        'settled_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $model): void {
            if (empty($model->id)) {
                $model->id = (string) Str::uuid();
            }
        });
    }

    public function contract(): BelongsTo
    {
        return $this->belongsTo(Contract::class, 'contract_id');
    }

    public function reservation(): BelongsTo
    {
        return $this->belongsTo(Reservation::class, 'reservation_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }

    public function isHeld(): bool
    {
        return $this->status === self::STATUS_HELD;
    }
}
