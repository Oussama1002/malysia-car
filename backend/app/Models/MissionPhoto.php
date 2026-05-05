<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MissionPhoto extends Model
{
    use HasFactory;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'mission_photos';

    protected $fillable = [
        'id',
        'mission_id',
        'phase',
        'label',
        'original_filename',
        'mime_type',
        'size_bytes',
        'storage_disk',
        'storage_path',
        'uploaded_by',
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
        return 'mph-'.$this->getKey();
    }
}

