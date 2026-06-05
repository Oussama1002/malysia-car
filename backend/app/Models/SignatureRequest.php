<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Str;

class SignatureRequest extends Model
{
    public const STATUS_SENT = 'sent_for_signature';
    public const STATUS_SIGNED = 'signed';
    public const STATUS_REJECTED = 'rejected';
    public const STATUS_EXPIRED = 'expired';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'signature_requests';

    protected $fillable = [
        'id',
        'company_id',
        'contract_id',
        'token',
        'status',
        'signer_name',
        'signer_email',
        'signer_phone',
        'document_id',
        'expires_at',
        'sent_at',
        'signed_at',
        'rejected_at',
        'rejected_reason',
        'created_by',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'sent_at' => 'datetime',
        'signed_at' => 'datetime',
        'rejected_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (SignatureRequest $r) {
            if (! $r->id) {
                $r->id = (string) Str::uuid();
            }
            if (! $r->token) {
                $r->token = self::freshToken();
            }
        });
    }

    /** A long, URL-safe, unguessable one-time token. */
    public static function freshToken(): string
    {
        do {
            $token = Str::random(64);
        } while (self::query()->where('token', $token)->exists());

        return $token;
    }

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    /** Can this request still be signed right now? */
    public function isSignable(): bool
    {
        return $this->status === self::STATUS_SENT && ! $this->isExpired();
    }

    /**
     * @return BelongsTo<Contract, $this>
     */
    public function contract(): BelongsTo
    {
        return $this->belongsTo(Contract::class, 'contract_id');
    }

    /**
     * @return HasOne<ContractSignature, $this>
     */
    public function signature(): HasOne
    {
        return $this->hasOne(ContractSignature::class, 'signature_request_id');
    }
}
