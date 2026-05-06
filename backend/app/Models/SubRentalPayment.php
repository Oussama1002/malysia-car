<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class SubRentalPayment extends Model
{
    use HasFactory;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'sub_rental_contract_id',
        'amount',
        'payment_method',
        'payment_date',
        'reference',
        'notes',
        'accounting_entry_id',
        'created_by',
    ];

    protected $casts = [
        'amount' => 'decimal:2',
        'payment_date' => 'date',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $model): void {
            if (empty($model->id)) {
                $model->id = (string) Str::uuid();
            }
        });

        static::created(function (self $model): void {
            $model->syncContractPaymentStatus();
        });
    }

    public function contract(): BelongsTo
    {
        return $this->belongsTo(SubRentalContract::class, 'sub_rental_contract_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    private function syncContractPaymentStatus(): void
    {
        $contract = $this->contract;
        if (!$contract) {
            return;
        }

        $totalPaid = $contract->totalPaid();
        $totalCost = (float) $contract->total_cost;

        if ($totalPaid <= 0) {
            $status = 'unpaid';
        } elseif ($totalPaid < $totalCost) {
            $status = 'partial';
        } else {
            $status = 'paid';
        }

        $contract->updateQuietly(['payment_status' => $status]);
    }
}
