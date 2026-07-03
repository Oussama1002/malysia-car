<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class CompanySetting extends Model
{
    use HasUuids;

    protected $table = 'company_settings';

    protected $fillable = [
        'company_id',
        'group',
        'key',
        'value',
    ];

    public static function getAll(string $group, ?string $companyId): array
    {
        return static::where('group', $group)
            ->where('company_id', $companyId)
            ->pluck('value', 'key')
            ->toArray();
    }

    public static function setAll(string $group, ?string $companyId, array $values): void
    {
        foreach ($values as $key => $value) {
            static::updateOrCreate(
                ['company_id' => $companyId, 'group' => $group, 'key' => $key],
                ['value' => $value === null ? null : (string) $value],
            );
        }
    }
}
