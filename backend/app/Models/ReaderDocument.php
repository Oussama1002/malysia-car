<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class ReaderDocument extends Model
{
    use HasUuids;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'reader_documents';

    public const TYPE_CIN = 'cin';
    public const TYPE_PASSPORT = 'passport';
    public const TYPE_DRIVING_LICENSE = 'driving_license';
    public const TYPE_VEHICLE_REGISTRATION = 'vehicle_registration';
    public const TYPE_RENTAL_CONTRACT = 'rental_contract';
    public const TYPE_CHEQUE = 'cheque';
    public const TYPE_OTHER = 'other';

    public const TYPES = [
        self::TYPE_CIN,
        self::TYPE_PASSPORT,
        self::TYPE_DRIVING_LICENSE,
        self::TYPE_VEHICLE_REGISTRATION,
        self::TYPE_RENTAL_CONTRACT,
        self::TYPE_CHEQUE,
        self::TYPE_OTHER,
    ];

    public const STATUS_PENDING = 'pending';
    public const STATUS_PROCESSING = 'processing';
    public const STATUS_EXTRACTED = 'extracted';
    public const STATUS_VALIDATED = 'validated';
    public const STATUS_FAILED = 'failed';

    protected $fillable = [
        'company_id',
        'file_id',
        'file_path',
        'file_name',
        'mime_type',
        'file_size',
        'document_type',
        'linked_entity_type',
        'linked_entity_id',
        'status',
        'error_message',
        'created_by',
    ];

    protected $casts = [
        'file_size' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /** @return HasMany<ReaderDocumentExtraction, $this> */
    public function extractions(): HasMany
    {
        return $this->hasMany(ReaderDocumentExtraction::class, 'document_id');
    }

    /** @return HasOne<ReaderDocumentExtraction, $this> */
    public function latestExtraction(): HasOne
    {
        return $this->hasOne(ReaderDocumentExtraction::class, 'document_id')->latestOfMany();
    }

    /** @return BelongsTo<File, $this> */
    public function file(): BelongsTo
    {
        return $this->belongsTo(File::class, 'file_id');
    }

    /** @return BelongsTo<User, $this> */
    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
