<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('used_car_sales')) {
            Schema::table('used_car_sales', function (Blueprint $table): void {
                if (! Schema::hasColumn('used_car_sales', 'vat_mode')) {
                    $table->string('vat_mode', 30)->default('standard')->after('discount_amount');
                }
                if (! Schema::hasColumn('used_car_sales', 'vat_rate')) {
                    $table->decimal('vat_rate', 6, 2)->default(20)->after('vat_mode');
                }
                if (! Schema::hasColumn('used_car_sales', 'taxable_base')) {
                    $table->decimal('taxable_base', 18, 2)->default(0)->after('tax_amount');
                }
                if (! Schema::hasColumn('used_car_sales', 'net_sale_amount')) {
                    $table->decimal('net_sale_amount', 18, 2)->default(0)->after('taxable_base');
                }
                if (! Schema::hasColumn('used_car_sales', 'accounting_entry_id')) {
                    $table->uuid('accounting_entry_id')->nullable()->index()->after('invoice_id');
                }
                if (! Schema::hasColumn('used_car_sales', 'accounting_status')) {
                    $table->string('accounting_status', 30)->default('pending')->after('accounting_entry_id');
                }
                if (! Schema::hasColumn('used_car_sales', 'transfer_status')) {
                    $table->string('transfer_status', 30)->default('initiated')->after('accounting_status');
                }
            });
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('used_car_sales')) {
            return;
        }
        Schema::table('used_car_sales', function (Blueprint $table): void {
            foreach ([
                'vat_mode',
                'vat_rate',
                'taxable_base',
                'net_sale_amount',
                'accounting_entry_id',
                'accounting_status',
                'transfer_status',
            ] as $column) {
                if (Schema::hasColumn('used_car_sales', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};

