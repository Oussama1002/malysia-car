<?php

namespace App\Models;

use App\Support\TenantScope;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

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
        'mission_number',
        'reservation_id',
        'contract_id',
        'vehicle_id',
        'client_id',
        'assigned_user_id',
        'mission_type',
        'status',
        'priority',
        'scheduled_start_at',
        'scheduled_end_at',
        'estimated_duration_minutes',
        'planned_at',
        'accepted_at',
        'actual_start_at',
        'arrived_at',
        'actual_end_at',
        'origin_address',
        'destination_address',
        'pickup_address',
        'dropoff_address',
        'customer_signature_file_id',
        'notes',
        'client_instructions',
        'created_by',
    ];

    protected $casts = [
        'scheduled_start_at' => 'datetime',
        'scheduled_end_at' => 'datetime',
        'planned_at' => 'datetime',
        'accepted_at' => 'datetime',
        'actual_start_at' => 'datetime',
        'arrived_at' => 'datetime',
        'actual_end_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $mission) {
            if (! $mission->id) {
                $mission->id = (string) Str::uuid();
            }
            if (! $mission->mission_number) {
                $mission->mission_number = static::generateMissionNumber($mission->company_id);
            }
        });
    }

    /**
     * Generate a unique mission number: MSN-YYMMDD-NNNN
     */
    public static function generateMissionNumber(?string $companyId): string
    {
        $prefix = 'MSN-' . now()->format('ymd') . '-';
        $latest = static::query()
            ->when($companyId, fn ($q) => $q->where('company_id', $companyId))
            ->where('mission_number', 'like', $prefix . '%')
            ->orderByDesc('mission_number')
            ->value('mission_number');

        $seq = 1;
        if ($latest) {
            $lastSeq = (int) substr($latest, strlen($prefix));
            $seq = $lastSeq + 1;
        }

        return $prefix . str_pad($seq, 4, '0', STR_PAD_LEFT);
    }

    // ── Relationships ────────────────────────────────────────────────────

    public function checklistItems(): HasMany
    {
        return $this->hasMany(MissionChecklistItem::class, 'mission_id')->orderBy('created_at');
    }

    public function photos(): HasMany
    {
        return $this->hasMany(MissionPhoto::class, 'mission_id')->orderByDesc('created_at');
    }

    public function inspections(): HasMany
    {
        return $this->hasMany(FieldVehicleInspection::class, 'mission_id')->orderByDesc('created_at');
    }

    public function signatures(): HasMany
    {
        return $this->hasMany(FieldMissionSignature::class, 'mission_id')->orderByDesc('created_at');
    }

    public function issues(): HasMany
    {
        return $this->hasMany(FieldMissionIssue::class, 'mission_id')->orderByDesc('created_at');
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'vehicle_id');
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Customer::class, 'client_id');
    }

    public function assignedAgent(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_user_id');
    }

    public function reservation(): BelongsTo
    {
        return $this->belongsTo(Reservation::class, 'reservation_id');
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
