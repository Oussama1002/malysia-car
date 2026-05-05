<?php

namespace App\Models;

use App\Support\TenantScope;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Mission extends Model
{
    use HasFactory, TenantScope;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'missions';

    protected $fillable = [
        'id',
        'company_id',
        'branch_id',
        'reservation_id',
        'contract_id',
        'vehicle_id',
        'assigned_user_id',
        'mission_type',
        'status',
        'scheduled_start_at',
        'scheduled_end_at',
        'actual_start_at',
        'actual_end_at',
        'origin_address',
        'destination_address',
        'customer_signature_file_id',
        'notes',
        'created_by',
    ];

    protected $casts = [
        'scheduled_start_at' => 'datetime',
        'scheduled_end_at' => 'datetime',
        'actual_start_at' => 'datetime',
        'actual_end_at' => 'datetime',
    ];

    /**
     * @return HasMany<MissionChecklistItem, $this>
     */
    public function checklistItems(): HasMany
    {
        return $this->hasMany(MissionChecklistItem::class, 'mission_id')->orderBy('created_at');
    }

    /**
     * @return HasMany<MissionPhoto, $this>
     */
    public function photos(): HasMany
    {
        return $this->hasMany(MissionPhoto::class, 'mission_id')->orderByDesc('created_at');
    }
}

