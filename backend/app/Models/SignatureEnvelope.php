<?php

namespace App\Models;

use App\Support\TenantScope;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class SignatureEnvelope extends Model
{
    use HasUuids, SoftDeletes, TenantScope;

    protected $fillable = [
        'company_id',
        'provider',
        'provider_envelope_id',
        'subject',
        'message',
        'status',
        'signable_type',
        'signable_id',
        'source_file_id',
        'signed_file_id',
        'certificate_file_id',
        'document_path',
        'signed_document_path',
        'metadata',
        'proof_metadata',
        'expires_at',
        'sent_at',
        'completed_at',
        'created_by_user_id',
    ];

    protected $casts = [
        'metadata'     => 'array',
        'proof_metadata' => 'array',
        'expires_at'   => 'datetime',
        'sent_at'      => 'datetime',
        'completed_at' => 'datetime',
    ];

    // ── Relations ────────────────────────────────────────────────────────────

    public function signable(): MorphTo
    {
        return $this->morphTo();
    }

    public function signers(): HasMany
    {
        return $this->hasMany(SignatureSigner::class, 'envelope_id')->orderBy('signer_order');
    }

    public function events(): HasMany
    {
        return $this->hasMany(SignatureEvent::class, 'envelope_id')->orderBy('occurred_at');
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    public function sourceFile(): BelongsTo
    {
        return $this->belongsTo(GeneratedDocument::class, 'source_file_id');
    }

    public function signedFile(): BelongsTo
    {
        return $this->belongsTo(GeneratedDocument::class, 'signed_file_id');
    }

    public function certificateFile(): BelongsTo
    {
        return $this->belongsTo(GeneratedDocument::class, 'certificate_file_id');
    }

    public function isCompleted(): bool
    {
        return $this->status === 'completed';
    }

    public function canBeSent(): bool
    {
        return in_array($this->status, ['draft', 'in_progress']) && $this->signers()->exists();
    }

    public function allSigned(): bool
    {
        return $this->signers()->where('status', '!=', 'signed')->doesntExist();
    }

    public function recordEvent(string $type, ?string $signerId = null, array $data = []): SignatureEvent
    {
        return $this->events()->create([
            'signer_id'  => $signerId,
            'event_type' => $type,
            'event_data' => $data ?: null,
            'occurred_at' => now(),
        ]);
    }
}
