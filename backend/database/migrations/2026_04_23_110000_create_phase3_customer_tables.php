<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 3 — Customers & KYC.
 *
 * Creates the customer-related tables for SQLite dev (driveflow_db.sql already
 * ships these). Everything is guarded with hasTable() / hasColumn() so it works
 * on both drivers.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('customers')) {
            Schema::create('customers', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable()->index();
                $table->uuid('branch_id')->nullable()->index();
                $table->string('customer_code', 50)->index();
                $table->string('customer_type', 30); // PARTICULIER / ENTREPRISE
                $table->string('status', 30)->default('active'); // active / inactive / suspended
                $table->string('risk_level', 30)->default('normal'); // low / normal / elevated / high
                $table->boolean('is_blacklisted')->default(false);
                $table->string('preferred_language', 10)->default('fr');
                $table->string('source_channel', 100)->nullable();
                $table->uuid('assigned_to_user_id')->nullable()->index();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        if (! Schema::hasTable('customer_individual_profiles')) {
            Schema::create('customer_individual_profiles', function (Blueprint $table) {
                $table->uuid('customer_id')->primary();
                $table->string('first_name', 120);
                $table->string('last_name', 120);
                $table->string('gender', 20)->nullable();
                $table->date('date_of_birth')->nullable();
                $table->string('place_of_birth', 120)->nullable();
                $table->string('nationality', 100)->nullable();
                $table->string('marital_status', 50)->nullable();
                $table->string('national_id_number', 100)->nullable();
                $table->string('passport_number', 100)->nullable();
                $table->string('driving_license_number', 100)->nullable();
                $table->date('driving_license_expiry')->nullable();
                $table->string('profession', 120)->nullable();
                $table->string('employer_name', 255)->nullable();
                $table->decimal('monthly_income', 18, 2)->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('customer_company_profiles')) {
            Schema::create('customer_company_profiles', function (Blueprint $table) {
                $table->uuid('customer_id')->primary();
                $table->string('legal_name', 255);
                $table->string('trade_name', 255)->nullable();
                $table->string('registration_number', 100)->nullable();
                $table->string('ice', 100)->nullable();
                $table->string('tax_identifier', 100)->nullable();
                $table->string('cnss_number', 100)->nullable();
                $table->date('incorporation_date')->nullable();
                $table->string('business_activity', 255)->nullable();
                $table->decimal('annual_turnover', 18, 2)->nullable();
                $table->integer('employee_count')->nullable();
                $table->string('legal_representative_name', 255)->nullable();
                $table->string('legal_representative_id_number', 100)->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('customer_addresses')) {
            Schema::create('customer_addresses', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->uuid('customer_id')->index();
                $table->string('address_type', 50); // home / billing / shipping / work
                $table->string('address_line_1', 255);
                $table->string('address_line_2', 255)->nullable();
                $table->string('city', 120)->nullable();
                $table->string('region', 120)->nullable();
                $table->string('postal_code', 30)->nullable();
                $table->string('country_code', 2)->default('MA');
                $table->boolean('is_primary')->default(false);
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('customer_contacts')) {
            Schema::create('customer_contacts', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->uuid('customer_id')->index();
                $table->string('contact_type', 50); // phone / mobile / email / fax
                $table->string('value', 255);
                $table->boolean('is_primary')->default(false);
                $table->timestamp('verified_at')->nullable();
                $table->timestamp('created_at')->useCurrent();
            });
        }

        if (! Schema::hasTable('customer_bank_accounts')) {
            Schema::create('customer_bank_accounts', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('customer_id')->index();
                $table->string('bank_name', 255);
                $table->string('iban', 100)->nullable();
                $table->string('rib', 100)->nullable();
                $table->string('swift_code', 50)->nullable();
                $table->string('account_holder_name', 255)->nullable();
                $table->boolean('is_default')->default(false);
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('customer_kyc_cases')) {
            Schema::create('customer_kyc_cases', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('customer_id')->index();
                $table->string('kyc_status', 30)->default('pending'); // pending / in_review / approved / rejected / expired
                $table->decimal('risk_score', 8, 2)->nullable();
                $table->string('verification_level', 30)->default('basic'); // basic / enhanced
                $table->uuid('reviewed_by')->nullable();
                $table->timestamp('reviewed_at')->nullable();
                $table->text('rejection_reason')->nullable();
                $table->timestamp('expires_at')->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('customer_kyc_documents')) {
            Schema::create('customer_kyc_documents', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('kyc_case_id')->index();
                $table->string('document_type', 80); // cin / passport / driving_license / proof_of_address / payslip / rib / ice / ...
                $table->string('file_path', 500)->nullable();
                $table->string('file_name', 255)->nullable();
                $table->unsignedInteger('file_size')->nullable();
                $table->string('mime_type', 120)->nullable();
                $table->string('document_number', 120)->nullable();
                $table->date('issued_at')->nullable();
                $table->date('expires_at')->nullable();
                $table->string('verification_status', 30)->default('pending');
                $table->uuid('verified_by')->nullable();
                $table->timestamp('verified_at')->nullable();
                $table->string('notes', 500)->nullable();
                $table->timestamps();
            });
        }

        if (! Schema::hasTable('customer_blacklist_entries')) {
            Schema::create('customer_blacklist_entries', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('customer_id')->index();
                $table->string('reason', 255);
                $table->string('severity', 30)->default('high'); // low / medium / high / critical
                $table->string('source_module', 100)->nullable();
                $table->uuid('added_by')->nullable();
                $table->timestamp('added_at')->useCurrent();
                $table->timestamp('removed_at')->nullable();
                $table->uuid('removed_by')->nullable();
                $table->string('removal_reason', 255)->nullable();
                $table->timestamp('created_at')->useCurrent();
            });
        }

        if (! Schema::hasTable('customer_notes')) {
            Schema::create('customer_notes', function (Blueprint $table) {
                $table->bigIncrements('id');
                $table->uuid('customer_id')->index();
                $table->string('note_type', 50)->default('general');
                $table->text('note_text');
                $table->uuid('created_by')->nullable();
                $table->timestamp('created_at')->useCurrent();
            });
        }

        if (! Schema::hasTable('customer_employment_profiles')) {
            Schema::create('customer_employment_profiles', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('customer_id')->index();
                $table->string('employer_name', 255)->nullable();
                $table->string('employment_type', 80)->nullable(); // cdi / cdd / freelance / retired / self_employed
                $table->string('job_title', 120)->nullable();
                $table->string('contract_type', 80)->nullable();
                $table->date('employment_start_date')->nullable();
                $table->boolean('cnss_registered')->default(false);
                $table->string('cnss_number', 100)->nullable();
                $table->decimal('salary_net', 18, 2)->nullable();
                $table->decimal('salary_gross', 18, 2)->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        if (Schema::getConnection()->getDriverName() !== 'sqlite') {
            return; // don't touch MySQL driveflow_db
        }
        Schema::dropIfExists('customer_employment_profiles');
        Schema::dropIfExists('customer_notes');
        Schema::dropIfExists('customer_blacklist_entries');
        Schema::dropIfExists('customer_kyc_documents');
        Schema::dropIfExists('customer_kyc_cases');
        Schema::dropIfExists('customer_bank_accounts');
        Schema::dropIfExists('customer_contacts');
        Schema::dropIfExists('customer_addresses');
        Schema::dropIfExists('customer_company_profiles');
        Schema::dropIfExists('customer_individual_profiles');
        Schema::dropIfExists('customers');
    }
};
