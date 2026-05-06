<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\TenantScope;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SupplierAgency extends Model
{
    use HasUuids;
    use TenantScope;

    protected $table = 'supplier_agencies';

    protected $fillable = [
        'company_id',
        'name',
        'phone',
        'email',
        'address',
        'contact_person',
        'status',
        'notes',
    ];

    /** @return HasMany<SubRentalContract, $this> */
    public function subRentals(): HasMany
    {
        return $this->hasMany(SubRentalContract::class, 'supplier_agency_id');
    }
}
