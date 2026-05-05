<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('entity_attachments') && ! Schema::hasColumn('entity_attachments', 'classification')) {
            Schema::table('entity_attachments', function (Blueprint $table) {
                $table->string('classification', 32)->nullable()->after('category')->index();
            });
        }

        if (Schema::hasTable('generated_documents') && ! Schema::hasColumn('generated_documents', 'classification')) {
            Schema::table('generated_documents', function (Blueprint $table) {
                $table->string('classification', 32)->nullable()->after('document_type')->index();
            });
        }

        if (Schema::hasTable('vehicle_documents') && ! Schema::hasColumn('vehicle_documents', 'classification')) {
            Schema::table('vehicle_documents', function (Blueprint $table) {
                $table->string('classification', 32)->nullable()->after('type')->index();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('entity_attachments') && Schema::hasColumn('entity_attachments', 'classification')) {
            Schema::table('entity_attachments', function (Blueprint $table) {
                $table->dropColumn('classification');
            });
        }
        if (Schema::hasTable('generated_documents') && Schema::hasColumn('generated_documents', 'classification')) {
            Schema::table('generated_documents', function (Blueprint $table) {
                $table->dropColumn('classification');
            });
        }
        if (Schema::hasTable('vehicle_documents') && Schema::hasColumn('vehicle_documents', 'classification')) {
            Schema::table('vehicle_documents', function (Blueprint $table) {
                $table->dropColumn('classification');
            });
        }
    }
};
