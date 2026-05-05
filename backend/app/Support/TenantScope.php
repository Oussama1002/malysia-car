<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Schema;

trait TenantScope
{
    /** @var array<string,array<string,bool>> */
    private static array $tenantScopeColumns = [];

    public static function bootTenantScope(): void
    {
        static::addGlobalScope('tenant_scope', function (Builder $builder): void {
            if (app()->runningInConsole()) {
                return;
            }

            $user = Auth::user();
            if (! $user) {
                return;
            }

            $model = $builder->getModel();
            $table = $model->getTable();
            $role = strtoupper((string) ($user->primaryRoleCode() ?? ''));

            if (self::hasColumnCached($table, 'company_id') && ! empty($user->company_id)) {
                $builder->where($table.'.company_id', $user->company_id);
            }

            $isPrivileged = in_array($role, ['ADMIN', 'DIRECTEUR'], true);
            if (! $isPrivileged && self::hasColumnCached($table, 'branch_id') && ! empty($user->branch_id)) {
                $builder->where($table.'.branch_id', $user->branch_id);
            }

            if ($role === 'CLIENT_PORTAL' && self::hasColumnCached($table, 'customer_id')) {
                if (self::hasColumnCached('users', 'customer_id') && ! empty($user->customer_id)) {
                    $builder->where($table.'.customer_id', $user->customer_id);
                } else {
                    $builder->whereRaw('1 = 0');
                }
            }
        });
    }

    public function scopeForTenant(Builder $query, Model $user): Builder
    {
        $table = $this->getTable();
        $role = strtoupper((string) ($user->primaryRoleCode() ?? ''));
        if (self::hasColumnCached($table, 'company_id') && ! empty($user->company_id)) {
            $query->where($table.'.company_id', $user->company_id);
        }
        if (! in_array($role, ['ADMIN', 'DIRECTEUR'], true) && self::hasColumnCached($table, 'branch_id') && ! empty($user->branch_id)) {
            $query->where($table.'.branch_id', $user->branch_id);
        }
        if ($role === 'CLIENT_PORTAL' && self::hasColumnCached($table, 'customer_id')) {
            $query->where($table.'.customer_id', (string) ($user->customer_id ?? '__none__'));
        }

        return $query;
    }

    private static function hasColumnCached(string $table, string $column): bool
    {
        if (! isset(self::$tenantScopeColumns[$table][$column])) {
            self::$tenantScopeColumns[$table][$column] = Schema::hasTable($table) && Schema::hasColumn($table, $column);
        }

        return self::$tenantScopeColumns[$table][$column];
    }
}

