<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReaderDocumentExtraction extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'reader_document_extractions';

    public const STATUS_DRAFT = 'draft';
    public const STATUS_REVIEWED = 'reviewed';
    public const STATUS_VALIDATED = 'validated';
    public const STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'document_id',
        'provider',
        'raw_text',
        'extracted_data',
        'validated_data',
        'confidence_score',
        'status',
        'validated_by',
        'validated_at',
    ];

    protected $casts = [
        'extracted_data' => 'array',
        'validated_data' => 'array',
        'confidence_score' => 'float',
        'validated_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /** @return BelongsTo<ReaderDocument, $this> */
    public function document(): BelongsTo
    {
        return $this->belongsTo(ReaderDocument::class, 'document_id');
    }

    /** @return BelongsTo<User, $this> */
    public function validator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'validated_by');
    }
}
