<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class UsedCarSale extends Model
{
    use HasUuids;

    protected $table = 'used_car_sales';

    protected $fillable = [
        'id',
        'listing_id',
        'vehicle_id',
        'buyer_customer_id',
        'branch_id',
        'sale_number',
        'sale_price',
        'discount_amount',
        'vat_mode',
        'vat_rate',
        'tax_amount',
        'taxable_base',
        'net_sale_amount',
        'total_amount',
        'currency_code',
        'payment_method',
        'payment_status',
        'amount_paid',
        'sale_date',
        'invoice_id',
        'accounting_entry_id',
        'accounting_status',
        'transfer_status',
        'contract_id',
        'notes',
        'closed_by_user_id',
    ];

    protected $casts = [
        'sale_price' => 'decimal:2',
        'discount_amount' => 'decimal:2',
        'vat_rate' => 'decimal:2',
        'tax_amount' => 'decimal:2',
        'taxable_base' => 'decimal:2',
        'net_sale_amount' => 'decimal:2',
        'total_amount' => 'decimal:2',
        'amount_paid' => 'decimal:2',
        'sale_date' => 'datetime',
    ];

    /** @return BelongsTo<UsedCarListing, $this> */
    public function listing(): BelongsTo
    {
        return $this->belongsTo(UsedCarListing::class, 'listing_id');
    }

    /** @return BelongsTo<Vehicle, $this> */
    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'vehicle_id');
    }

    /** @return BelongsTo<Customer, $this> */
    public function buyer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'buyer_customer_id');
    }

    /** @return BelongsTo<Invoice, $this> */
    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class, 'invoice_id');
    }

    /** @return BelongsTo<AccountingEntry, $this> */
    public function accountingEntry(): BelongsTo
    {
        return $this->belongsTo(AccountingEntry::class, 'accounting_entry_id');
    }

    /** @return HasMany<VehicleOwnershipTransfer, $this> */
    public function ownershipTransfers(): HasMany
    {
        return $this->hasMany(VehicleOwnershipTransfer::class, 'sale_id');
    }
}
