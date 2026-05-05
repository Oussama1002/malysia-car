<?php

namespace App\Models;

use App\Support\TenantScope;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class AiPrediction extends Model
{
    use HasUuids, TenantScope;

    protected $table = 'ai_predictions';

    protected $fillable = [
        'id',
        'company_id',
        'branch_id',
        'prediction_type',
        'entity_type',
        'entity_id',
        'score',
        'risk_level',
        'model_mode',
        'provider',
        'summary',
        'payload',
        'predicted_at',
        'created_by',
    ];

    protected $casts = [
        'score' => 'decimal:2',
        'payload' => 'array',
        'predicted_at' => 'datetime',
    ];
}
