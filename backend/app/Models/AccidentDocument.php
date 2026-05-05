<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AccidentDocument extends Model
{
    protected $fillable = [
        'accident_id',
        'type',
        'filename',
        'disk',
        'path',
        'size_bytes',
        'mime_type',
        'uploaded_by',
    ];

    protected $casts = [
        'size_bytes' => 'integer',
    ];

    /** @var list<string> */
    protected $hidden = [
        'disk',
        'path',
    ];

    /** @var list<string> */
    protected $appends = [
        'document_ref',
    ];

    public function getDocumentRefAttribute(): string
    {
        return 'acd-'.$this->getKey();
    }

    public function accident(): BelongsTo
    {
        return $this->belongsTo(VehicleAccident::class, 'accident_id');
    }
}
