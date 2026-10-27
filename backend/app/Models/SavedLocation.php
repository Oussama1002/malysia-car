<?php

namespace App\Models;

use App\Support\TenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

class SavedLocation extends Model
{
    use TenantScope, SoftDeletes;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'saved_locations';

    protected $fillable = [
        'id',
        'company_id',
        'branch_id',
        'title',
        'address',
        'maps_url',
        'latitude',
        'longitude',
        'created_by',
    ];

    protected $casts = [
        'latitude' => 'float',
        'longitude' => 'float',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $location) {
            if (! $location->id) {
                $location->id = (string) Str::uuid();
            }
        });
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
