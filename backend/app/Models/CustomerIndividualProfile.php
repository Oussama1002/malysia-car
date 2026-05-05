<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerIndividualProfile extends Model
{
    protected $table = 'customer_individual_profiles';

    protected $primaryKey = 'customer_id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'customer_id',
        'first_name',
        'last_name',
        'gender',
        'date_of_birth',
        'place_of_birth',
        'nationality',
        'marital_status',
        'national_id_number',
        'passport_number',
        'driving_license_number',
        'driving_license_expiry',
        'profession',
        'employer_name',
        'monthly_income',
    ];

    protected $casts = [
        'date_of_birth' => 'date',
        'driving_license_expiry' => 'date',
        'monthly_income' => 'decimal:2',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }
}
