<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class VehicleDocument extends Model
{
    use HasFactory;

    protected $fillable = [
        'vehicle_id',
        'type',
        'number',
        'issued_at',
        'expires_at',
        'original_filename',
        'mime_type',
        'size_bytes',
        'storage_disk',
        'storage_path',
        'uploaded_by',
        'classification',
    ];

    protected $casts = [
        'issued_at' => 'date',
        'expires_at' => 'date',
    ];

    /** @var list<string> */
    protected $hidden = [
        'storage_disk',
        'storage_path',
    ];

    /** @var list<string> */
    protected $appends = [
        'document_ref',
    ];

    public function getDocumentRefAttribute(): string
    {
        return 'veh-'.$this->getKey();
    }

    /**
     * @return BelongsTo<Vehicle, $this>
     */
    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class, 'vehicle_id');
    }
}

