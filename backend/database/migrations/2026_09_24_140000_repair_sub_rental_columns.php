<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Deux migrations créent les tables de sous-location : la première (schéma des
 * remarques client) en version réduite, la seconde en version complète — mais
 * celle-ci passe son tour quand la table existe déjà. Toute base construite
 * depuis zéro se retrouve donc sans contract_number ni payment_status, et le
 * module sous-location casse.
 *
 * Cette migration ajoute ce qui manque, sans rien toucher là où c'est déjà bon.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('supplier_agencies')) {
            Schema::table('supplier_agencies', function (Blueprint $table) {
                if (! Schema::hasColumn('supplier_agencies', 'branch_id')) {
                    $table->uuid('branch_id')->nullable()->index();
                }
                if (! Schema::hasColumn('supplier_agencies', 'contact_person')) {
                    $table->string('contact_person', 191)->nullable();
                }
                if (! Schema::hasColumn('supplier_agencies', 'ice')) {
                    $table->string('ice', 50)->nullable();
                }
                if (! Schema::hasColumn('supplier_agencies', 'rc')) {
                    $table->string('rc', 50)->nullable();
                }
            });
        }

        if (Schema::hasTable('sub_rental_contracts')) {
            Schema::table('sub_rental_contracts', function (Blueprint $table) {
                foreach ([
                    'branch_id' => fn () => $table->uuid('branch_id')->nullable()->index(),
                    'contract_number' => fn () => $table->string('contract_number', 100)->nullable(),
                    'payment_status' => fn () => $table->string('payment_status', 20)->default('unpaid')->index(),
                    'return_report_file_id' => fn () => $table->uuid('return_report_file_id')->nullable(),
                    'activated_by' => fn () => $table->uuid('activated_by')->nullable(),
                    'returned_by' => fn () => $table->uuid('returned_by')->nullable(),
                    'closed_by' => fn () => $table->uuid('closed_by')->nullable(),
                    'activated_at' => fn () => $table->timestamp('activated_at')->nullable(),
                    'returned_at' => fn () => $table->timestamp('returned_at')->nullable(),
                    'closed_at' => fn () => $table->timestamp('closed_at')->nullable(),
                    'deleted_at' => fn () => $table->softDeletes(),
                ] as $column => $add) {
                    if (! Schema::hasColumn('sub_rental_contracts', $column)) {
                        $add();
                    }
                }
            });

            // Un contrat sans numéro n'est identifiable nulle part.
            if (Schema::hasColumn('sub_rental_contracts', 'contract_number')) {
                DB::table('sub_rental_contracts')
                    ->whereNull('contract_number')
                    ->orderBy('id')
                    ->each(function ($row) {
                        DB::table('sub_rental_contracts')
                            ->where('id', $row->id)
                            ->update(['contract_number' => 'SL-'.strtoupper(substr(str_replace('-', '', (string) $row->id), 0, 8))]);
                    });
            }
        }

        if (Schema::hasTable('sub_rental_payments')) {
            Schema::table('sub_rental_payments', function (Blueprint $table) {
                if (! Schema::hasColumn('sub_rental_payments', 'reference')) {
                    $table->string('reference', 100)->nullable();
                }
                if (! Schema::hasColumn('sub_rental_payments', 'notes')) {
                    $table->text('notes')->nullable();
                }
                if (! Schema::hasColumn('sub_rental_payments', 'created_by')) {
                    $table->uuid('created_by')->nullable()->index();
                }
            });
        }
    }

    public function down(): void
    {
        // Rien : on ne retire pas des colonnes que le code utilise.
    }
};
