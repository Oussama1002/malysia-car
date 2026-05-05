<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerCompanyProfile extends Model
{
    protected $table = 'customer_company_profiles';

    protected $primaryKey = 'customer_id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'customer_id',
        'legal_name',
        'trade_name',
        'registration_number',
        'ice',
        'tax_identifier',
        'cnss_number',
        'incorporation_date',
        'business_activity',
        'annual_turnover',
        'employee_count',
        'legal_representative_name',
        'legal_representative_id_number',
    ];

    protected $casts = [
        'incorporation_date' => 'date',
        'annual_turnover' => 'decimal:2',
        'employee_count' => 'integer',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }
}
