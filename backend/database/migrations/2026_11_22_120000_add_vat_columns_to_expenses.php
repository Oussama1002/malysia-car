<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('expenses', function (Blueprint $table): void {
            if (! Schema::hasColumn('expenses', 'subtotal_amount')) {
                $table->decimal('subtotal_amount', 14, 2)->nullable()->after('amount');
            }
            if (! Schema::hasColumn('expenses', 'tax_amount')) {
                $table->decimal('tax_amount', 14, 2)->nullable()->after('subtotal_amount');
            }
            if (! Schema::hasColumn('expenses', 'tax_rate')) {
                $table->decimal('tax_rate', 5, 2)->nullable()->after('tax_amount');
            }
        });
    }

    public function down(): void
    {
        Schema::table('expenses', function (Blueprint $table): void {
            foreach (['tax_rate', 'tax_amount', 'subtotal_amount'] as $col) {
                if (Schema::hasColumn('expenses', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
