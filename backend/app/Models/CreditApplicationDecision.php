<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CreditApplicationDecision extends Model
{
    use HasFactory;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'credit_application_decisions';

    protected $fillable = [
        'id',
        'credit_application_id',
        'decision',
        'score',
        'recommendation',
        'note',
        'decided_by',
        'decided_at',
    ];

    protected $casts = [
        'score' => 'decimal:2',
        'decided_at' => 'datetime',
    ];

    /**
     * @return BelongsTo<CreditApplication, $this>
     */
    public function creditApplication(): BelongsTo
    {
        return $this->belongsTo(CreditApplication::class, 'credit_application_id');
    }
}

