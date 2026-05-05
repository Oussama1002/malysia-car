<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * MySQL installs that ran migrations without importing `driveflow_db.sql` can end up
 * with no `users` table (the initial migration intentionally skips MySQL `users`).
 * Recreate the ERP-shaped table so auth and FKs from other migrations remain valid.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('users')) {
            return;
        }

        $driver = Schema::getConnection()->getDriverName();
        if (! in_array($driver, ['mysql', 'mariadb'], true)) {
            return;
        }

        Schema::create('users', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('company_id');
            $table->uuid('branch_id')->nullable();
            $table->string('employee_code', 50)->nullable();
            $table->string('first_name', 120);
            $table->string('last_name', 120);
            $table->string('email', 255);
            $table->string('phone', 50)->nullable();
            $table->string('password_hash', 255);
            $table->string('locale', 10)->default('fr');
            $table->string('timezone', 100)->default('Africa/Casablanca');
            $table->string('avatar_path', 255)->nullable();
            $table->string('status', 30)->default('active');
            $table->timestamp('last_login_at')->nullable();
            $table->uuid('customer_id')->nullable()->index();
            $table->timestamps();
            $table->softDeletes();

            $table->unique('email');
        });

        if (Schema::hasTable('companies')) {
            Schema::table('users', function (Blueprint $table) {
                $table->foreign('company_id')->references('id')->on('companies');
            });
        }
        if (Schema::hasTable('branches')) {
            Schema::table('users', function (Blueprint $table) {
                $table->foreign('branch_id')->references('id')->on('branches');
            });
        }

        $this->seedBootstrapStaffIfPossible();
    }

    private function seedBootstrapStaffIfPossible(): void
    {
        if (! Schema::hasTable('companies') || ! Schema::hasTable('roles') || ! Schema::hasTable('user_roles')) {
            return;
        }

        if (DB::table('users')->where('email', 'admin@driveflow.ma')->exists()) {
            return;
        }

        $companyId = DB::table('companies')->value('id');
        $roleId = DB::table('roles')->where('code', 'DIRECTEUR')->value('id')
            ?? DB::table('roles')->orderBy('id')->value('id');

        if (! $companyId || ! $roleId) {
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
        // Forward-only: dropping `users` after this repair is unsafe for populated databases.
    }
};
