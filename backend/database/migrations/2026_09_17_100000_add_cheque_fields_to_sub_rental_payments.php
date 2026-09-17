<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Bring supplier payments in line with client payments: track the cheque
 * number, issuing bank and cheque date when the mode is "cheque". The
 * frontend also runs the /v1/cheque-ocr scanner on these payments.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('sub_rental_payments')) return;
        Schema::table('sub_rental_payments', function (Blueprint $table) {
            if (!Schema::hasColumn('sub_rental_payments', 'check_number')) $table->string('check_number', 60)->nullable()->after('reference');
            if (!Schema::hasColumn('sub_rental_payments', 'check_bank'))   $table->string('check_bank', 160)->nullable()->after('check_number');
            if (!Schema::hasColumn('sub_rental_payments', 'check_date'))   $table->date('check_date')->nullable()->after('check_bank');
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('sub_rental_payments')) return;
        Schema::table('sub_rental_payments', function (Blueprint $table) {
            foreach (['check_number', 'check_bank', 'check_date'] as $col) {
                if (Schema::hasColumn('sub_rental_payments', $col)) $table->dropColumn($col);
            }
        });
    }
};
