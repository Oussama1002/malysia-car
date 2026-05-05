<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── arrears cases ─────────────────────────────────────────────────────
        if (! Schema::hasTable('arrears_cases')) {
            Schema::create('arrears_cases', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable();
                $table->uuid('branch_id')->nullable();
                $table->string('case_number', 40)->unique();
                $table->uuid('customer_id')->index();
                $table->uuid('contract_id')->index()->nullable();
                // financial summary (denormalized for quick display)
                $table->decimal('total_overdue', 15, 2)->default(0);
                $table->decimal('total_recovered', 15, 2)->default(0);
                $table->unsignedInteger('overdue_installments_count')->default(0);
                $table->integer('days_overdue')->default(0);
                $table->enum('stage', [
                    'new',        // newly identified
                    'reminder_1', // 1st reminder sent
                    'reminder_2', // 2nd reminder sent
                    'formal_notice', // mise en demeure
                    'promise',    // promesse de paiement
                    'legal',      // transféré au juridique
                    'repossession', // saisie / récupération
                    'closed',     // resolved or written off
                ])->default('new');
                $table->enum('resolution', ['paid', 'written_off', 'settlement', 'legal_judgment', 'repossessed', 'pending'])->default('pending');
                $table->text('notes')->nullable();
                $table->date('next_action_date')->nullable();
                $table->uuid('assigned_to_user_id')->nullable();
                $table->timestamp('closed_at')->nullable();
                $table->uuid('created_by_user_id')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        // ── arrears actions / timeline ────────────────────────────────────────
        if (! Schema::hasTable('arrears_actions')) {
            Schema::create('arrears_actions', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('case_id')->index();
                $table->enum('action_type', [
                    'note',
                    'reminder_call',
                    'reminder_sms',
                    'reminder_email',
                    'formal_notice',      // mise en demeure
                    'payment_promise',    // promesse de paiement
                    'partial_payment',
                    'legal_transfer',
                    'repossession_order',
                    'repossession_done',
                    'settlement',
                    'write_off',
                    'stage_change',
                    'close',
                ]);
                $table->text('description');
                $table->date('action_date');
                $table->decimal('amount', 12, 2)->nullable(); // for payment_promise / partial_payment
                $table->date('promise_date')->nullable();
                $table->string('new_stage', 30)->nullable();
                $table->json('attachments')->nullable();
                $table->uuid('performed_by_user_id')->nullable();
                $table->timestamps();
            });
        }

        // ── legal cases ───────────────────────────────────────────────────────
        if (! Schema::hasTable('legal_cases')) {
            Schema::create('legal_cases', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('arrears_case_id')->index();
                $table->string('case_number', 40)->unique();
                $table->uuid('customer_id')->index();
                $table->uuid('contract_id')->nullable();
                $table->uuid('vehicle_id')->nullable();
                $table->enum('case_type', ['recovery', 'repossession', 'judgment', 'settlement'])->default('recovery');
                $table->enum('status', [
                    'open',
                    'in_progress',
                    'judgment_obtained',
                    'appeal',
                    'settled',
                    'closed',
                ])->default('open');
                $table->string('lawyer_name', 120)->nullable();
                $table->string('lawyer_contact', 120)->nullable();
                $table->string('court_reference', 120)->nullable();
                $table->string('court_name', 120)->nullable();
                $table->date('filing_date')->nullable();
                $table->date('hearing_date')->nullable();
                $table->date('judgment_date')->nullable();
                $table->decimal('claimed_amount', 15, 2)->default(0);
                $table->decimal('awarded_amount', 15, 2)->nullable();
                $table->text('judgment_summary')->nullable();
                $table->json('documents')->nullable();
                $table->text('notes')->nullable();
                $table->uuid('assigned_to_user_id')->nullable();
                $table->uuid('created_by_user_id')->nullable();
                $table->timestamp('closed_at')->nullable();
                $table->timestamps();
                $table->softDeletes();
            });
        }

        // ── repossession orders ───────────────────────────────────────────────
        if (! Schema::hasTable('repossession_orders')) {
            Schema::create('repossession_orders', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('legal_case_id')->index();
                $table->uuid('vehicle_id')->index();
                $table->uuid('customer_id');
                $table->string('order_number', 40)->unique();
                $table->enum('status', ['ordered', 'in_progress', 'completed', 'failed', 'cancelled'])->default('ordered');
                $table->date('ordered_at');
                $table->date('completed_at')->nullable();
                $table->string('recovery_agent', 120)->nullable();
                $table->string('recovery_location', 255)->nullable();
                $table->text('notes')->nullable();
                $table->json('photos')->nullable();
                $table->uuid('created_by_user_id')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('repossession_orders');
        Schema::dropIfExists('legal_cases');
        Schema::dropIfExists('arrears_actions');
        Schema::dropIfExists('arrears_cases');
    }
};
