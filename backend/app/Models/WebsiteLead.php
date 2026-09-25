<?php

namespace App\Models;

use App\Support\TenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

/**
 * Une demande laissée sur le site public : un nom, un téléphone, des dates.
 * Tant qu'un agent ne l'a pas qualifiée, ce n'est pas encore un client.
 */
class WebsiteLead extends Model
{
    use TenantScope;

    public const STATUS_NEW = 'new';
    public const STATUS_CONTACTED = 'contacted';
    public const STATUS_CONVERTED = 'converted';
    public const STATUS_REJECTED = 'rejected';

    public $incrementing = false;
    protected $keyType = 'string';
    protected $table = 'website_leads';

    protected $fillable = [
        'id', 'company_id', 'full_name', 'phone', 'email', 'city',
        'vehicle_id', 'vehicle_label', 'pickup_at', 'return_at', 'message',
        'status', 'handled_by', 'handled_at', 'handling_notes',
        'ip_address', 'user_agent',
    ];

    protected $casts = [
        'pickup_at' => 'datetime',
        'return_at' => 'datetime',
        'handled_at' => 'datetime',
    ];

    protected static function boot(): void
    {
        parent::boot();
        static::creating(function (self $m) {
            if (empty($m->id)) {
                $m->id = (string) Str::uuid();
            }
        });
    }

    public function vehicle(): BelongsTo
    {
        return $this->belongsTo(Vehicle::class);
    }
}
