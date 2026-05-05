<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class MissionChecklistItem extends Model
{
    use HasFactory;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $table = 'mission_checklist_items';

    protected $fillable = [
        'id',
        'mission_id',
        'checklist_phase',
        'item_label',
        'item_value',
        'item_status',
        'notes',
    ];
}

