<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\Schema;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, HasUuids, Notifiable;

    public $incrementing = false;

    protected $keyType = 'string';

    /**
     * SQLite (dev) uses `name`, `password`, `role`.
     * `driveflow_db` uses `first_name`, `last_name`, `password_hash` + `user_roles`.
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'avatar',
        'company_id',
        'customer_id',
        'branch_id',
        'employee_code',
        'first_name',
        'last_name',
        'phone',
        'password_hash',
        'locale',
        'timezone',
        'avatar_path',
        'status',
        'last_login_at',
    ];

    protected $hidden = [
        'password',
        'password_hash',
        'remember_token',
    ];

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        $c = [
            'last_login_at' => 'datetime',
        ];
        if (self::userColumnExists('email_verified_at')) {
            $c['email_verified_at'] = 'datetime';
        }
        if (self::userColumnExists('deleted_at')) {
            $c['deleted_at'] = 'datetime';
        }
        if (self::userColumnExists('password') && ! self::userColumnExists('password_hash')) {
            $c['password'] = 'hashed';
        }

        return $c;
    }

    public function getNameAttribute(mixed $value): string
    {
        if ($value !== null && (string) $value !== '') {
            return (string) $value;
        }
        $f = (string) ($this->attributes['first_name'] ?? '');
        $l = (string) ($this->attributes['last_name'] ?? '');
        $n = trim($f.' '.$l);

        return $n !== '' ? $n : (string) ($this->attributes['email'] ?? '');
    }

    public function getAuthPassword(): string
    {
        return (string) ($this->attributes['password_hash'] ?? $this->attributes['password'] ?? '');
    }

    public function newFactory(): UserFactory
    {
        return UserFactory::new();
    }

    /**
     * @return BelongsToMany<Role, $this>
     */
    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'user_roles', 'user_id', 'role_id');
    }

    /**
     * @return BelongsToMany<Branch, $this>
     */
    public function branches(): BelongsToMany
    {
        return $this->belongsToMany(Branch::class, 'user_branches', 'user_id', 'branch_id')
            ->withPivot(['is_primary', 'assigned_at']);
    }

    /**
     * @return HasMany<LoginHistory, $this>
     */
    public function loginHistory(): HasMany
    {
        return $this->hasMany(LoginHistory::class, 'user_id');
    }

    /**
     * Tous les codes de rôle portés par l'utilisateur.
     *
     * @return array<int, string>
     */
    public function roleCodes(): array
    {
        if (! Schema::hasTable('user_roles') || ! Schema::hasTable('roles')) {
            return [];
        }
        $codes = $this->relationLoaded('roles')
            ? $this->roles->pluck('code')
            : $this->roles()->pluck('roles.code');

        return array_values(array_filter(array_map('strval', $codes->all())));
    }

    public function hasPermission(string $code): bool
    {
        if (($this->attributes['role'] ?? null) === 'ADMIN') {
            return true;
        }
        // ADMIN passe tout, qu'il vienne de la colonne ou des rôles liés.
        if (in_array('ADMIN', $this->roleCodes(), true)) {
            return true;
        }
        if (! Schema::hasTable('permissions')) {
            return false;
        }
        $roleIds = $this->roles()->pluck('roles.id');
        if ($roleIds->isEmpty()) {
            return false;
        }

        return \App\Models\Permission::query()
            ->whereHas('roles', fn ($q) => $q->whereIn('roles.id', $roleIds))
            ->where('code', $code)
            ->exists();
    }

    public function permissionCodes(): array
    {
        if (! Schema::hasTable('permissions')) {
            return [];
        }
        if (($this->attributes['role'] ?? null) === 'ADMIN') {
            return \App\Models\Permission::query()->pluck('code')->all();
        }
        $roleIds = $this->roles()->pluck('roles.id');
        if ($roleIds->isEmpty()) {
            return [];
        }

        return \App\Models\Permission::query()
            ->whereHas('roles', fn ($q) => $q->whereIn('roles.id', $roleIds))
            ->pluck('code')
            ->unique()
            ->values()
            ->all();
    }

    public function primaryRoleCode(): string
    {
        // Une colonne vide n'est pas un rôle : sans ça on renvoyait '' et le
        // contrôle de permission ne regardait jamais les rôles liés.
        if (! empty($this->attributes['role'])) {
            return (string) $this->attributes['role'];
        }
        if (Schema::hasTable('user_roles') && Schema::hasTable('roles')) {
            // Un utilisateur peut porter plusieurs rôles : prendre le premier
            // venu donnait un résultat au hasard, et un compte ADMIN pouvait se
            // retrouver jugé comme agent commercial. On garde le plus fort.
            $codes = $this->roleCodes();
            if ($codes !== []) {
                $hierarchy = (array) config('erp.app_roles', []);
                usort($codes, function (string $a, string $b) use ($hierarchy) {
                    $ra = array_search($a, $hierarchy, true);
                    $rb = array_search($b, $hierarchy, true);

                    return ($ra === false ? PHP_INT_MAX : $ra) <=> ($rb === false ? PHP_INT_MAX : $rb);
                });

                return (string) $codes[0];
            }
        }

        return 'AGENT_COMMERCIAL';
    }

    private static function userColumnExists(string $column): bool
    {
        if (! Schema::hasTable('users')) {
            return false;
        }

        return Schema::hasColumn('users', $column);
    }
}
