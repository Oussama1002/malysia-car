<?php

namespace App\Models;

use App\Support\TenantScope;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Str;
use Carbon\Carbon;

class SubRentalContract extends Model
{
    use HasFactory, SoftDeletes, TenantScope;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'company_id',
        'branch_id',
        'supplier_agency_id',
        'vehicle_id',
        'contract_number',
        'external_vehicle_identity',
        'start_date',
        'end_date',
        'daily_cost',
        'total_cost',
        'deposit_amount',
        'payment_method',
        'payment_status',
        'status',
        'supplier_contract_file_id',
        'return_report_file_id',
        'notes',
        'created_by',
        'activated_by',
        'returned_by',
        'closed_by',
        'activated_at',
        'returned_at',
        'closed_at',
    ];

    protected $casts = [
        'external_vehicle_identity' => 'array',
        'start_date' => 'date',
        'end_date' => 'date',
        'daily_cost' => 'decimal:2',
        'total_cost' => 'decimal:2',
        'deposit_amount' => 'decimal:2',
        'activated_at' => 'datetime',
        'returned_at' => 'datetime',
        'closed_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $model): void {
            if (empty($model->id)) {
                $model->id = (string) Str::uuid();
            }
            if (empty($model->contract_number)) {
                $model->contract_number = 'SL-' . strtoupper(Str::random(8));
            }
        });
    }

    public function supplierAgency(): BelongsTo
    {
        return $this->belongsTo(SupplierAgency::class, 'supplier_agency_id');
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'vehicle_id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(SubRentalPayment::class, 'sub_rental_contract_id')
            ->orderByDesc('payment_date');
    }

    public function returnReport(): HasOne
    {
        return $this->hasOne(SubRentalReturnReport::class, 'sub_rental_contract_id');
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function activatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'activated_by');
    }

    public function returnedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'returned_by');
    }

    public function totalPaid(): float
    {
        return (float) $this->payments()->sum('amount');
    }

    public function remainingBalance(): float
    {
        return max(0, (float) $this->total_cost - $this->totalPaid());
    }

    public function daysCount(): int
    {
        if (!$this->start_date || !$this->end_date) {
            return 0;
        }
        return max(1, (int) $this->start_date->diffInDays($this->end_date));
    }

    public function isReturnDueSoon(int $thresholdDays = 3): bool
    {
        if (!$this->end_date || $this->status !== 'active') {
            return false;
        }
        $daysLeft = Carbon::today()->diffInDays($this->end_date, false);
        return $daysLeft >= 0 && $daysLeft <= $thresholdDays;
    }

    public function isOverdue(): bool
    {
        if (!$this->end_date || $this->status !== 'active') {
            return false;
        }
        return Carbon::today()->greaterThan($this->end_date);
    }

    public function customerReservationsRevenue(): float
    {
        if (!$this->vehicle_id) {
            return 0;
        }
        return (float) Reservation::query()
            ->where('vehicle_id', $this->vehicle_id)
            ->whereIn('status', ['closed', 'billing_pending', 'damage_pending', 'inspection_pending', 'returned'])
            ->where('desired_start_at', '>=', $this->start_date)
            ->where('desired_end_at', '<=', Carbon::parse($this->end_date)->endOfDay())
            ->sum('estimated_price');
    }

    public function margin(): float
    {
        return $this->customerReservationsRevenue() - (float) $this->total_cost;
    }
}
