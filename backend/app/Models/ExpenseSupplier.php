<?php

namespace App\Models;

use App\Support\TenantScope;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class ExpenseSupplier extends Model
{
    use TenantScope;

    public $incrementing = false;
    protected $keyType = 'string';
    protected $table = 'expense_suppliers';

    protected $fillable = [
        'id', 'company_id', 'name', 'category', 'phone', 'email', 'address', 'ice', 'status',
    ];

    protected static function boot(): void
    {
        parent::boot();
        static::creating(function (self $m) {
            if (empty($m->id)) $m->id = (string) Str::uuid();
        });
    }

    public function expenses(): HasMany
    {
        return $this->hasMany(Expense::class, 'supplier_id');
    }
}
