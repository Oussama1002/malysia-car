<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('notification_templates')) {
            Schema::create('notification_templates', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->string('code', 80)->unique();
                $table->string('title_template', 255);
                $table->text('body_template')->nullable();
                $table->string('module', 64)->nullable()->index();
                $table->string('priority', 16)->default('normal'); // low|normal|high|critical
                $table->json('channels')->nullable(); // in_app|email|sms
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        if (Schema::hasTable('app_notifications')) {
            Schema::table('app_notifications', function (Blueprint $table) {
                if (!Schema::hasColumn('app_notifications', 'priority')) {
                    $table->string('priority', 16)->default('normal')->after('category');
                }
                if (!Schema::hasColumn('app_notifications', 'module')) {
                    $table->string('module', 64)->nullable()->index()->after('priority');
                }
                if (!Schema::hasColumn('app_notifications', 'channels')) {
                    $table->json('channels')->nullable()->after('module');
                }
                if (!Schema::hasColumn('app_notifications', 'customer_id')) {
                    $table->uuid('customer_id')->nullable()->index()->after('company_id');
                }
                if (!Schema::hasColumn('app_notifications', 'entity_type')) {
                    $table->string('entity_type', 120)->nullable()->index()->after('customer_id');
                }
                if (!Schema::hasColumn('app_notifications', 'entity_id')) {
                    $table->uuid('entity_id')->nullable()->index()->after('entity_type');
                }
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('app_notifications')) {
            Schema::table('app_notifications', function (Blueprint $table) {
                foreach (['priority', 'module', 'channels', 'customer_id', 'entity_type', 'entity_id'] as $column) {
                    if (Schema::hasColumn('app_notifications', $column)) {
                        $table->dropColumn($column);
                    }
                }
            });
        }

        Schema::dropIfExists('notification_templates');
    }
};
