<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('entity_attachments')) {
            Schema::create('entity_attachments', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->string('entity_type', 80);
                $table->string('entity_id', 36);
                $table->uuid('file_id');
                $table->string('category', 80);
                $table->string('title', 255)->nullable();
                $table->string('notes', 500)->nullable();
                $table->string('visibility', 30)->default('internal');
                $table->uuid('uploaded_by')->nullable();
                $table->date('issue_date')->nullable();
                $table->date('expiry_date')->nullable();
                $table->string('document_number', 120)->nullable();
                $table->string('status', 32)->default('active');
                $table->timestamps();

                $table->index(['entity_type', 'entity_id']);
                $table->index(['category']);
                $table->index(['expiry_date']);
                $table->foreign('file_id')->references('id')->on('files')->cascadeOnDelete();
            });

            return;
        }

        Schema::table('entity_attachments', function (Blueprint $table): void {
            if (! Schema::hasColumn('entity_attachments', 'issue_date')) {
                $table->date('issue_date')->nullable()->after('notes');
            }
            if (! Schema::hasColumn('entity_attachments', 'expiry_date')) {
                $table->date('expiry_date')->nullable()->after('issue_date');
            }
            if (! Schema::hasColumn('entity_attachments', 'document_number')) {
                $table->string('document_number', 120)->nullable()->after('expiry_date');
            }
            if (! Schema::hasColumn('entity_attachments', 'status')) {
                $table->string('status', 32)->default('active')->after('document_number');
            }
            if (! Schema::hasColumn('entity_attachments', 'updated_at')) {
                $table->timestamp('updated_at')->nullable()->after('created_at');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('entity_attachments')) {
            return;
        }
        Schema::table('entity_attachments', function (Blueprint $table): void {
            foreach (['issue_date', 'expiry_date', 'document_number', 'status', 'updated_at'] as $col) {
                if (Schema::hasColumn('entity_attachments', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
