<?php

namespace App\Models;

use App\Support\TenantScope;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GeneratedDocument extends Model
{
    use HasUuids, TenantScope;

    protected $table = 'generated_documents';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'company_id',
        'generated_by_user_id',
        'document_type',
        'entity_type',
        'entity_id',
        'title',
        'disk',
        'storage_path',
        'mime_type',
        'size_bytes',
        'sha256',
        'metadata',
        'classification',
    ];

    protected $casts = [
        'metadata' => 'array',
        'size_bytes' => 'integer',
    ];

    /** @var list<string> */
    protected $hidden = [
        'disk',
        'storage_path',
    ];

    /** @var list<string> */
    protected $appends = [
        'document_ref',
    ];

    public function getDocumentRefAttribute(): string
    {
        return 'gen-'.$this->getKey();
    }

    /** @return BelongsTo<User, $this> */
    public function generatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'generated_by_user_id');
    }
}
