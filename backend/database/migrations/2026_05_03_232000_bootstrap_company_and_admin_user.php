<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * When `users` was recreated without importing `driveflow_db.sql`, `companies` can be empty
 * and no staff row exists. Insert a minimal company + admin for local API login.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('users') || ! Schema::hasTable('companies') || ! Schema::hasTable('roles') || ! Schema::hasTable('user_roles')) {
            return;
        }

        $companyId = DB::table('companies')->value('id');
        if (! $companyId) {
            $companyId = (string) Str::uuid();
            DB::table('companies')->insert([
                'id' => $companyId,
                'legal_name' => 'DriveFlow (local)',
                'trade_name' => null,
                'country_code' => 'MA',
                'ice' => null,
                'default_currency' => 'MAD',
                'default_locale' => 'fr',
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        if (DB::table('users')->where('email', 'admin@driveflow.ma')->exists()) {
            return;
        }

        $roleId = DB::table('roles')->where('code', 'DIRECTEUR')->value('id')
            ?? DB::table('roles')->orderBy('id')->value('id');

        if (! $roleId) {
            return;
        }

        $userId = (string) Str::uuid();
        DB::table('users')->insert([
            'id' => $userId,
            'company_id' => $companyId,
            'branch_id' => null,
            'employee_code' => null,
            'first_name' => 'Admin',
            'last_name' => 'DriveFlow',
            'email' => 'admin@driveflow.ma',
            'phone' => null,
            'password_hash' => Hash::make('password'),
            'locale' => 'fr',
            'timezone' => 'Africa/Casablanca',
            'avatar_path' => null,
            'status' => 'active',
            'last_login_at' => null,
            'customer_id' => null,
            'created_at' => now(),
            'updated_at' => now(),
            'deleted_at' => null,
        ]);

        DB::table('user_roles')->insert([
            'user_id' => $userId,
            'role_id' => $roleId,
            'assigned_at' => now(),
        ]);
    }

    public function down(): void
    {
        // Forward-only bootstrap for empty MySQL installs.
    }
};
