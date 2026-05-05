<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SignatureEvent extends Model
{
    use HasUuids;

    protected $fillable = [
        'envelope_id',
        'signer_id',
        'event_type',
        'idempotency_key',
        'event_data',
        'ip_address',
        'occurred_at',
    ];

    protected $casts = [
        'event_data'  => 'array',
        'occurred_at' => 'datetime',
    ];

    // ── Relations ────────────────────────────────────────────────────────────

    public function envelope(): BelongsTo
    {
        return $this->belongsTo(SignatureEnvelope::class, 'envelope_id');
    }

    public function signer(): BelongsTo
    {
        return $this->belongsTo(SignatureSigner::class, 'signer_id');
    }
}
