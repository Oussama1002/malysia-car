<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MobileLoginRequest extends Model
{
    use HasUuids;

    protected $table = 'mobile_login_requests';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'user_id',
        'device_name',
        'ip_address',
        'user_agent',
        'status',
        'decided_by',
        'decided_at',
        'expires_at',
        'consumed_at',
    ];

    protected $casts = [
        'decided_at' => 'datetime',
        'expires_at' => 'datetime',
        'consumed_at' => 'datetime',
    ];

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<User, $this> */
    public function decider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by');
    }

    public function isPending(): bool
    {
        return $this->status === 'pending' && $this->expires_at && $this->expires_at->isFuture();
    }

    public function markExpiredIfNeeded(): void
    {
        if ($this->status === 'pending' && $this->expires_at && $this->expires_at->isPast()) {
            $this->status = 'expired';
            $this->save();
        }
    }
}
