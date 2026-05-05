<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ContractHistory extends Model
{
    use HasFactory;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'contract_histories';

    protected $fillable = [
        'id',
        'contract_id',
        'action',
        'from_status',
        'to_status',
        'note',
        'actor_id',
        'at',
    ];

    protected $casts = [
        'at' => 'datetime',
    ];

    /**
     * @return BelongsTo<Contract, $this>
     */
    public function contract(): BelongsTo
    {
        return $this->belongsTo(Contract::class, 'contract_id');
    }
}

