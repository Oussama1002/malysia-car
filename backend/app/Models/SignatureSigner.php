<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class SignatureSigner extends Model
{
    use HasUuids;

    protected $fillable = [
        'envelope_id',
        'signer_order',
        'name',
        'email',
        'phone',
        'role',
        'status',
        'provider_signer_id',
        'otp_code',
        'otp_expires_at',
        'signed_at',
        'opened_at',
        'declined_at',
        'decline_reason',
        'ip_address',
        'user_agent',
        'user_id',
    ];

    protected $casts = [
        'otp_expires_at' => 'datetime',
        'signed_at'      => 'datetime',
        'opened_at'      => 'datetime',
        'declined_at'    => 'datetime',
    ];

    protected $hidden = ['otp_code'];

    // ── Relations ────────────────────────────────────────────────────────────

    public function envelope(): BelongsTo
    {
        return $this->belongsTo(SignatureEnvelope::class, 'envelope_id');
    }

    public function events(): HasMany
    {
        return $this->hasMany(SignatureEvent::class, 'signer_id')->orderBy('occurred_at');
    }

    // ── OTP helpers ──────────────────────────────────────────────────────────

    public function generateOtp(): string
    {
        $otp = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $this->update([
            'otp_code'       => $otp,
            'otp_expires_at' => now()->addMinutes(15),
        ]);
        return $otp;
    }

    public function verifyOtp(string $code): bool
    {
        // Reload to get hidden field
        $fresh = static::find($this->id);
        return $fresh
            && $fresh->otp_code === $code
            && $fresh->otp_expires_at
            && $fresh->otp_expires_at->isFuture();
    }

    public function isSigned(): bool
    {
        return $this->status === 'signed';
    }
}
