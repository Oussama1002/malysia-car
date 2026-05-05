<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ArrearsAction extends Model
{
    use HasUuids;

    protected $table = 'arrears_actions';

    protected $fillable = [
        'id',
        'case_id',
        'action_type',
        'description',
        'action_date',
        'amount',
        'promise_date',
        'new_stage',
        'attachments',
        'performed_by_user_id',
    ];

    protected $casts = [
        'action_date'  => 'date',
        'promise_date' => 'date',
        'amount'       => 'decimal:2',
        'attachments'  => 'array',
    ];

    /** @return BelongsTo<ArrearsCase, ArrearsAction> */
    public function arrearsCase(): BelongsTo
    {
        return $this->belongsTo(ArrearsCase::class, 'case_id');
    }
}
