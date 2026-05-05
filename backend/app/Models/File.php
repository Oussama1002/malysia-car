<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class File extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'files';

    public $timestamps = false;

    protected static function booted(): void
    {
        static::creating(function (File $file): void {
            if (! $file->created_at) {
                $file->created_at = now();
            }
        });
    }

    protected $fillable = [
        'company_id',
        'branch_id',
        'original_name',
        'stored_name',
        'storage_disk',
        'storage_path',
        'mime_type',
        'extension',
        'file_size',
        'checksum_sha256',
        'uploaded_by',
        'is_public',
    ];

    protected $casts = [
        'is_public' => 'boolean',
        'file_size' => 'integer',
        'created_at' => 'datetime',
    ];

    /** @return HasMany<EntityAttachment, $this> */
    public function attachments(): HasMany
    {
        return $this->hasMany(EntityAttachment::class, 'file_id');
    }

    /** @return BelongsTo<User, $this> */
    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
