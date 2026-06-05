<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class ContractSignature extends Model
{
    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'contract_signatures';

    protected $fillable = [
        'id',
        'company_id',
        'signature_request_id',
        'contract_id',
        'signer_name',
        'signature_disk',
        'signature_path',
        'proof_document_id',
        'signed_at',
        'ip_address',
        'user_agent',
    ];

    protected $casts = [
        'signed_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (ContractSignature $s) {
            if (! $s->id) {
                $s->id = (string) Str::uuid();
            }
        });
    }

    /**
     * @return BelongsTo<SignatureRequest, $this>
     */
    public function request(): BelongsTo
    {
        return $this->belongsTo(SignatureRequest::class, 'signature_request_id');
    }

    /**
     * @return BelongsTo<Contract, $this>
     */
    public function contract(): BelongsTo
    {
        return $this->belongsTo(Contract::class, 'contract_id');
    }
}
