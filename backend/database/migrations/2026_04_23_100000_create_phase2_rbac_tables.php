<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 2 — Authentication / Users / Roles.
 *
 * Creates Laravel-side tables for the RBAC + session tracking + branches features
 * where the SQLite dev schema is missing them. On MySQL driveflow_db these tables
 * may already exist (branches, user_roles, roles, user_sessions). We check before creating.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Branches — may exist on MySQL (driveflow_db). SQLite dev needs it.
        if (! Schema::hasTable('branches')) {
            Schema::create('branches', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable()->index();
                $table->string('code', 50);
                $table->string('name', 255);
                $table->string('city', 120)->nullable();
                $table->string('country_code', 2)->default('MA');
                $table->string('phone', 50)->nullable();
                $table->string('email', 255)->nullable();
                $table->boolean('is_active')->default(true);
                $table->timestamps();
                $table->softDeletes();
                $table->unique(['company_id', 'code']);
            });
        }

        // Companies — ensure exists for SQLite
        if (! Schema::hasTable('companies')) {
            Schema::create('companies', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('legal_name', 255);
                $table->string('trade_name', 255)->nullable();
                $table->string('country_code', 2)->default('MA');
                $table->string('ice', 100)->nullable();
                $table->string('default_currency', 3)->default('MAD');
                $table->string('default_locale', 10)->default('fr');
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        // Roles — may already exist
        if (! Schema::hasTable('roles')) {
            Schema::create('roles', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->uuid('company_id')->nullable()->index();
                $table->string('code', 50)->unique();
                $table->string('name', 120);
                $table->string('description', 255)->nullable();
                $table->boolean('is_system_role')->default(false);
                $table->timestamps();
            });
        }

        // user_roles pivot — may already exist
        if (! Schema::hasTable('user_roles')) {
            Schema::create('user_roles', function (Blueprint $table) {
                $table->uuid('user_id');
                $table->unsignedBigInteger('role_id');
                $table->timestamp('assigned_at')->useCurrent();
                $table->primary(['user_id', 'role_id']);
                $table->index('role_id');
            });
        }

        // Permissions registry
        if (! Schema::hasTable('permissions')) {
            Schema::create('permissions', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->string('code', 100)->unique();
                $table->string('module_name', 80)->index();
                $table->string('action_name', 150);
                $table->string('description', 255)->nullable();
            });
        } else {
            Schema::table('permissions', function (Blueprint $table) {
                if (! Schema::hasColumn('permissions', 'module_name')) {
                    $table->string('module_name', 80)->nullable()->index();
                }
                if (! Schema::hasColumn('permissions', 'action_name')) {
                    $table->string('action_name', 150)->nullable();
                }
            });
        }

        // Role → permission pivot
        if (! Schema::hasTable('role_permissions')) {
            Schema::create('role_permissions', function (Blueprint $table) {
                $table->unsignedBigInteger('role_id');
                $table->unsignedBigInteger('permission_id');
                $table->primary(['role_id', 'permission_id']);
                $table->index('permission_id');
            });
        }

        // User → branch pivot (a user may serve multiple branches)
        if (! Schema::hasTable('user_branches')) {
            Schema::create('user_branches', function (Blueprint $table) {
                $table->uuid('user_id');
                $table->uuid('branch_id');
                $table->boolean('is_primary')->default(false);
                $table->timestamp('assigned_at')->useCurrent();
                $table->primary(['user_id', 'branch_id']);
                $table->index('branch_id');
            });
        }

        // Login history — audits every successful/failed login attempt
        if (! Schema::hasTable('login_history')) {
            Schema::create('login_history', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->uuid('user_id')->nullable()->index();
                $table->string('email', 255)->index();
                $table->boolean('success')->default(false);
                $table->string('ip_address', 45)->nullable();
                $table->string('user_agent', 500)->nullable();
                $table->string('device_name', 100)->nullable();
                $table->string('failure_reason', 255)->nullable();
                $table->timestamp('attempted_at')->useCurrent();
            });
        }

        // Ensure users table has status + last_login_at for activation/deactivation
        if (Schema::hasTable('users')) {
            if (! Schema::hasColumn('users', 'status')) {
                Schema::table('users', function (Blueprint $table) {
                    $table->string('status', 20)->default('active')->after('email');
                });
            }
            if (! Schema::hasColumn('users', 'last_login_at')) {
                Schema::table('users', function (Blueprint $table) {
                    $table->timestamp('last_login_at')->nullable();
                });
            }
            if (! Schema::hasColumn('users', 'branch_id')) {
                Schema::table('users', function (Blueprint $table) {
                    $table->uuid('branch_id')->nullable()->index();
                });
            }
            if (! Schema::hasColumn('users', 'company_id')) {
                Schema::table('users', function (Blueprint $table) {
                    $table->uuid('company_id')->nullable()->index();
                });
            }
            if (! Schema::hasColumn('users', 'phone')) {
                Schema::table('users', function (Blueprint $table) {
                    $table->string('phone', 50)->nullable();
                });
            }
            if (! Schema::hasColumn('users', 'locale')) {
                Schema::table('users', function (Blueprint $table) {
                    $table->string('locale', 10)->default('fr');
                });
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('login_history');
        Schema::dropIfExists('user_branches');
        Schema::dropIfExists('role_permissions');
        Schema::dropIfExists('permissions');
        if (Schema::getConnection()->getDriverName() === 'sqlite') {
            Schema::dropIfExists('user_roles');
            Schema::dropIfExists('roles');
            Schema::dropIfExists('branches');
            Schema::dropIfExists('companies');
        }
    }
};
