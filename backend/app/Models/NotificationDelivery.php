<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class NotificationDelivery extends Model
{
    use HasUuids;

    protected $table = 'notification_deliveries';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'notification_id',
        'channel',
        'status',
        'attempts',
        'last_attempt_at',
        'sent_at',
        'failed_at',
        'error_message',
        'provider_message_id',
        'entity_type',
        'entity_id',
        'priority',
    ];

    protected $casts = [
        'last_attempt_at' => 'datetime',
        'sent_at' => 'datetime',
        'failed_at' => 'datetime',
        'attempts' => 'integer',
    ];

    /** @return BelongsTo<Notification, $this> */
    public function notification(): BelongsTo
    {
        return $this->belongsTo(Notification::class, 'notification_id');
    }
}
