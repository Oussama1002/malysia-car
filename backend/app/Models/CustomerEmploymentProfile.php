<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerEmploymentProfile extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'customer_employment_profiles';

    protected $fillable = [
        'customer_id',
        'employer_name',
        'employment_type',
        'job_title',
        'contract_type',
        'employment_start_date',
        'cnss_registered',
        'cnss_number',
        'salary_net',
        'salary_gross',
    ];

    protected $casts = [
        'employment_start_date' => 'date',
        'cnss_registered' => 'boolean',
        'salary_net' => 'decimal:2',
        'salary_gross' => 'decimal:2',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }
}
