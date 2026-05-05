<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class EntityAttachment extends Model
{
    public $timestamps = true;

    protected $table = 'entity_attachments';

    protected $fillable = [
        'entity_type',
        'entity_id',
        'file_id',
        'category',
        'title',
        'notes',
        'visibility',
        'uploaded_by',
        'issue_date',
        'expiry_date',
        'document_number',
        'status',
        'classification',
    ];

    protected $casts = [
        'issue_date' => 'date',
        'expiry_date' => 'date',
    ];

    /** @return BelongsTo<File, $this> */
    public function file(): BelongsTo
    {
        return $this->belongsTo(File::class, 'file_id');
    }

    /** @return BelongsTo<User, $this> */
    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function publicId(): string
    {
        return 'att-'.$this->id;
    }
}
