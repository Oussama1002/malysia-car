<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomerBlacklistEntry extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'customer_blacklist_entries';

    public $timestamps = false;

    protected $fillable = [
        'customer_id',
        'reason',
        'severity',
        'source_module',
        'added_by',
        'added_at',
        'removed_at',
        'removed_by',
        'removal_reason',
        'created_at',
    ];

    protected $casts = [
        'added_at' => 'datetime',
        'removed_at' => 'datetime',
        'created_at' => 'datetime',
    ];

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'customer_id');
    }
}
