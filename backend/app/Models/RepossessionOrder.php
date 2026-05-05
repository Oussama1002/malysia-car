<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RepossessionOrder extends Model
{
    use HasUuids;

    protected $table = 'repossession_orders';

    protected $fillable = [
        'id',
        'legal_case_id',
        'vehicle_id',
        'customer_id',
        'order_number',
        'status',
        'ordered_at',
        'completed_at',
        'recovery_agent',
        'recovery_location',
        'notes',
        'photos',
        'created_by_user_id',
    ];

    protected $casts = [
        'ordered_at'   => 'date',
        'completed_at' => 'date',
        'photos'       => 'array',
    ];

    /** @return BelongsTo<LegalCase, RepossessionOrder> */
    public function legalCase(): BelongsTo
    {
        return $this->belongsTo(LegalCase::class, 'legal_case_id');
    }
}
