<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerKycDocument extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'customer_kyc_documents';

    protected $fillable = [
        'kyc_case_id',
        'document_type',
        'file_path',
        'file_name',
        'file_size',
        'mime_type',
        'document_number',
        'issued_at',
        'expires_at',
        'verification_status',
        'verified_by',
        'verified_at',
        'notes',
    ];

    protected $casts = [
        'issued_at' => 'date',
        'expires_at' => 'date',
        'verified_at' => 'datetime',
    ];

    public function kycCase(): BelongsTo
    {
        return $this->belongsTo(CustomerKycCase::class, 'kyc_case_id');
    }
}
